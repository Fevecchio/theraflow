-- Migration 031 — SEGURANÇA #3 (auditoria 12/07): sync do portal NEGA paciente revogado
-- Data: 2026-07-12 · Depende de: 028 (recria portal_patient_sync idêntica + o fix)
--
-- PROBLEMA: o fallback de autorização por sessão Auth (`auth.uid()` → patient_users)
-- não checava NEM patient_users.portal_active NEM metadata->>'portalRevogado'.
-- Paciente com acesso revogado pelo terapeuta, mas ainda logado com conta Auth,
-- continuava conseguindo SINCRONIZAR (escrever no metadata). O caminho por senha
-- (_portal_auth_patient) já negava desde a 020 — este era o único buraco restante.
--
-- FIX (2 trancas, paridade com _portal_auth_patient):
--   1. fallback só resolve se pu.portal_active = true;
--   2. depois de resolver, portalRevogado='true' no metadata também nega.
-- Todo o resto é CÓPIA EXATA da 028 (merges por elemento + união de humor).
-- Idempotente (create or replace).

create or replace function public.portal_patient_sync(
  p_email text, p_hash text, p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
  v_old jsonb;
  v_allow text[] := array[
    'moodHistory','moodNotes','diary','metas','portalMetas','exercises',
    'mood','_moodLastDate','checkInStreak','lastCheckInDate','readMaterials',
    'portalNota','portalNotifHour','anamnese','pwdTemp','portalPasswordHash'
  ];
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    -- 031 tranca 1: sessão Auth só autoriza com o portal ATIVO
    v_id := (select pu.patient_id from public.patient_users pu
             where pu.auth_user_id = auth.uid()
               and pu.portal_active = true
             limit 1);
    -- 031 tranca 2: revogação via metadata (a que o app do terapeuta grava)
    -- também nega — mesma regra que _portal_auth_patient aplica desde a 020.
    if v_id is not null and coalesce((select metadata->>'portalRevogado'
                                        from public.patients
                                       where id = v_id), 'false') = 'true' then
      v_id := null;
    end if;
  end if;
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  foreach k in array v_allow loop
    if p_patch ? k then
      v_clean := v_clean || jsonb_build_object(k, p_patch->k);
    end if;
  end loop;

  select coalesce(metadata, '{}'::jsonb) into v_old
    from public.patients where id = v_id
    for update;
  if v_clean ? 'diary' then
    v_clean := jsonb_set(v_clean, '{diary}',
      public._tf_merge_arr(v_old->'diary', v_clean->'diary',
                           coalesce(v_old->'_tombs'->'diary','{}'::jsonb), 'ts', true, 200));
  end if;
  if v_clean ? 'exercises' then
    v_clean := jsonb_set(v_clean, '{exercises}',
      public._tf_merge_arr(v_old->'exercises', v_clean->'exercises',
                           coalesce(v_old->'_tombs'->'exercises','{}'::jsonb), 'id', false, 500));
  end if;
  if v_clean ? 'portalMetas' then
    v_clean := jsonb_set(v_clean, '{portalMetas}',
      public._tf_merge_arr(v_old->'portalMetas', v_clean->'portalMetas',
                           coalesce(v_old->'_tombs'->'portalMetas','{}'::jsonb), 'id', false, 500));
  end if;

  -- 028: check-ins de humor unidos entre os aparelhos da paciente (com trava legado)
  if v_clean ? 'moodHistory' then
    v_clean := jsonb_set(v_clean, '{moodHistory}',
      public._tf_union_mood(v_old->'moodHistory', v_clean->'moodHistory', 60));
  end if;
  if v_clean ? 'moodNotes' then
    v_clean := jsonb_set(v_clean, '{moodNotes}',
      public._tf_union_mood(v_old->'moodNotes', v_clean->'moodNotes', 60));
  end if;

  update public.patients
     set metadata = v_old || v_clean
   where id = v_id;
end;
$fn$;

grant execute on function public.portal_patient_sync(text, text, jsonb) to anon, authenticated;

-- ═══ VALIDAÇÃO (rode junto) ═══
-- (1) esperado: as duas colunas 'true' — a função nova contém as duas trancas
select position('portal_active' in prosrc) > 0  as tranca_portal_active,
       position('portalRevogado' in prosrc) > 0 as tranca_portal_revogado
  from pg_proc
 where proname = 'portal_patient_sync';
-- (2) esperado: erro 'nao autorizado' (28000) — no SQL Editor não há sessão de
-- paciente nem hash válido, então a função deve NEGAR (fail-closed):
-- select public.portal_patient_sync('naoexiste@teste.com', 'hash-invalido', '{}'::jsonb);

-- ── AINDA PENDENTES (MÉDIO/BAIXO, deliberadamente adiados):
--  #4 _portal_auth_patient: comparação de hash em tempo não-constante; mitigação
--     real = rate-limit na RPC. Reavaliar se virar problema prático.
--  #6 _tf_merge_arr: clampar `_up` do lado paciente a now() para não vencer
--     tombstone do terapeuta. Toca o merge de todos — exige teste dos 4 caminhos.
