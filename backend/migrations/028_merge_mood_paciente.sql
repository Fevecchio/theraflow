-- Migration 028 — C8 (auditoria de confiança): moodHistory/moodNotes da
-- PACIENTE com união por elemento entre os aparelhos DELA.
-- Data: 2026-07-12 · Depende de: 025/027 (helpers; recria só portal_patient_sync).
--
-- PROBLEMA: portal_patient_sync faz overwrite de array inteiro nessas chaves —
-- paciente usando 2 aparelhos (PWA + navegador) perde check-ins do aparelho que
-- sincronizou por último.
--
-- SOLUÇÃO com TRAVA DE SEGURANÇA: moodHistory legado mistura NÚMEROS crus com
-- objetos {value,emoji,date}. Merge por identidade em escalares colapsaria
-- entradas iguais (corrupção de dado clínico). Regra: a união por elemento SÓ
-- roda quando TODOS os elementos (atual + entrante) são objetos com 'date';
-- qualquer escalar presente → comportamento atual (entrante vence), sem risco.
-- Identidade do check-in: date|value|nota (dois check-ins iguais no mesmo dia
-- deduplicam — aceitável). Ordem: cronológica por date (dd/mm/aaaa), empate
-- pela ordem do entrante. Cap 60 (mesmo do cliente).

create or replace function public._tf_all_dated_objects(v jsonb)
returns boolean
language sql immutable
as $fn$
  select coalesce(bool_and(jsonb_typeof(e) = 'object' and e ? 'date'),
                  true)
  from jsonb_array_elements(coalesce(v, '[]'::jsonb)) e
$fn$;

create or replace function public._tf_mood_key(e jsonb)
returns text
language sql immutable
as $fn$
  select coalesce(e->>'date','') || '|' || coalesce(e->>'value', e->>'val','') || '|' || coalesce(e->>'nota','')
$fn$;

-- date 'dd/mm/aaaa' (ou dd/mm) → chave ordenável aaaa-mm-dd
create or replace function public._tf_br_date_key(t text)
returns text
language sql immutable
as $fn$
  select case
    when t ~ '^\d{2}/\d{2}/\d{4}' then substr(t,7,4) || '-' || substr(t,4,2) || '-' || substr(t,1,2)
    when t ~ '^\d{2}/\d{2}'       then '0000-' || substr(t,4,2) || '-' || substr(t,1,2)
    else coalesce(t,'')
  end
$fn$;

create or replace function public._tf_union_mood(v_cur jsonb, v_inc jsonb, v_cap int default 60)
returns jsonb
language sql stable
as $fn$
  select case
    -- Trava: qualquer entrada legado (não-objeto/sem date) → sem merge (entrante vence)
    when not (public._tf_all_dated_objects(v_cur) and public._tf_all_dated_objects(v_inc))
      then coalesce(v_inc, v_cur, '[]'::jsonb)
    else coalesce((
      select jsonb_agg(u.e order by public._tf_br_date_key(u.e->>'date'), u.src, u.ord)
      from (
        select distinct on (public._tf_mood_key(t.e)) t.e, t.src, t.ord
        from (
          select e, 1 as src, ord from jsonb_array_elements(coalesce(v_inc,'[]'::jsonb)) with ordinality as a(e, ord)
          union all
          select e, 2 as src, ord from jsonb_array_elements(coalesce(v_cur,'[]'::jsonb)) with ordinality as b(e, ord)
        ) t
        order by public._tf_mood_key(t.e), t.src  -- duplicata: fica a versão do entrante
      ) u
    ), '[]'::jsonb)
  end
$fn$;

-- Recria portal_patient_sync (idêntica à 025) + união de moodHistory/moodNotes.
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
    v_id := (select pu.patient_id from public.patient_users pu
             where pu.auth_user_id = auth.uid() limit 1);
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

-- ═══ TESTE (rode junto; esperado: 3 entradas — a de 10/07 do aparelho A
-- preservada, as de 11/07 e 12/07 do aparelho B, em ordem cronológica) ═══
select public._tf_union_mood(
  '[{"value":7,"emoji":"x","date":"10/07/2026"},{"value":5,"emoji":"x","date":"11/07/2026"}]'::jsonb,
  '[{"value":5,"emoji":"x","date":"11/07/2026"},{"value":8,"emoji":"x","date":"12/07/2026"}]'::jsonb
) as teste_uniao;
-- ═══ TESTE DA TRAVA (esperado: devolve o ENTRANTE intacto [7,5] — sem merge) ═══
select public._tf_union_mood('[7,8]'::jsonb, '[7,5]'::jsonb) as teste_trava_legado;
