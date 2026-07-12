-- Migration 032 — SEGURANÇA #6 (auditoria 12/07): _up do paciente nivelado a now()
-- Data: 2026-07-12 · Depende de: 031 (recria portal_patient_sync idêntica + clamp)
--
-- PROBLEMA: no merge por elemento (025), vence quem tem `_up` maior — e `_up`
-- vem do relógio do CLIENTE. Um aparelho de paciente com relógio no futuro
-- (errado ou adulterado) produz elementos que VENCEM o tombstone de exclusão do
-- terapeuta indefinidamente: o item excluído ressuscita a cada sync.
--
-- FIX: no sync do PACIENTE, todo elemento entrante com `_up` (ou identidade
-- ts/id usada como fallback de _up) NO FUTURO é nivelado a now() ANTES do merge.
-- Efeito: relógio futuro deixa de ser imortal — comporta-se como edição de
-- agora, e a próxima exclusão do terapeuta vence. Edições legítimas (passado)
-- passam intactas. O lado do TERAPEUTA não muda (é o dono do dado).
-- Idempotente. Tags $fn$.

-- Helper: nivela _up futuro dos elementos de um array (só objetos; escalares
-- legados passam intactos — o fallback deles é 0, nunca > cap).
create or replace function public._tf_clamp_up(v_arr jsonb, k_id text, v_cap numeric)
returns jsonb
language sql immutable
as $fn$
  select coalesce(jsonb_agg(
    case
      when coalesce(public._tf_num(t.e->>'_up'), public._tf_num(t.e->>k_id), 0) > v_cap
        then jsonb_set(t.e, '{_up}', to_jsonb(v_cap))
      else t.e
    end
    order by t.ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(v_arr, '[]'::jsonb)) with ordinality as t(e, ord)
$fn$;

-- Recria portal_patient_sync (idêntica à 031) + clamp nos 3 arrays mergeados.
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
  v_now_ms numeric := floor(extract(epoch from clock_timestamp()) * 1000);
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
    -- 031 tranca 2: revogação via metadata também nega
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
      public._tf_merge_arr(v_old->'diary',
                           public._tf_clamp_up(v_clean->'diary', 'ts', v_now_ms), -- 032
                           coalesce(v_old->'_tombs'->'diary','{}'::jsonb), 'ts', true, 200));
  end if;
  if v_clean ? 'exercises' then
    v_clean := jsonb_set(v_clean, '{exercises}',
      public._tf_merge_arr(v_old->'exercises',
                           public._tf_clamp_up(v_clean->'exercises', 'id', v_now_ms), -- 032
                           coalesce(v_old->'_tombs'->'exercises','{}'::jsonb), 'id', false, 500));
  end if;
  if v_clean ? 'portalMetas' then
    v_clean := jsonb_set(v_clean, '{portalMetas}',
      public._tf_merge_arr(v_old->'portalMetas',
                           public._tf_clamp_up(v_clean->'portalMetas', 'id', v_now_ms), -- 032
                           coalesce(v_old->'_tombs'->'portalMetas','{}'::jsonb), 'id', false, 500));
  end if;

  -- 028: check-ins de humor unidos entre os aparelhos da paciente (sem _up — sem clamp)
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

-- ═══ TESTES (rode junto) ═══
-- (1) clamp: _up futuro vira o teto (esperado: [{"id":"a","_up":1000}])
select public._tf_clamp_up('[{"id":"a","_up":999999}]'::jsonb, 'id', 1000) as teste_clamp;
-- (2) relógio futuro NÃO ressuscita exclusão (esperado: [])
select public._tf_merge_arr('[]'::jsonb,
  public._tf_clamp_up('[{"id":"a","texto":"x","_up":999999}]'::jsonb, 'id', 1000),
  '{"a": 2000}'::jsonb, 'id', false, 500) as teste_tombstone_vence;
-- (3) edição legítima DEPOIS da exclusão segue vencendo (esperado: 1 elemento)
select public._tf_merge_arr('[]'::jsonb,
  public._tf_clamp_up('[{"id":"a","texto":"x","_up":3000}]'::jsonb, 'id', 5000),
  '{"a": 2000}'::jsonb, 'id', false, 500) as teste_edicao_vence;
-- (4) a função nova contém o clamp (esperado: true)
select position('_tf_clamp_up' in prosrc) > 0 as tem_clamp
  from pg_proc where proname = 'portal_patient_sync';
