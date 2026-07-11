-- Migration 027 — Auditoria de Confiança C2: prontuarioNotes com união por
-- elemento + planoEvolucao com LWW honesto (timestamp).
-- Data: 2026-07-11
-- Depende de: 025 (helpers _tf_* e a versão atual de therapist_patients_sync — recria só ela).
--
-- PROBLEMA (achado C2, auditoria 11/07): prontuarioNotes (NOTAS CLÍNICAS — o
-- dado mais valioso do app) e planoEvolucao ficaram FORA do merge por elemento
-- da 025: o patch do terapeuta faz `metadata = v_old || v_meta` (last-write-wins
-- de array inteiro). Uma aba/dispositivo com cópia velha (ex.: a nota nova só
-- existia na outra aba) sincroniza e ZERA/REVERTE as notas no servidor.
--
-- SOLUÇÃO:
--  * prontuarioNotes: UNIÃO preservando a ordem do array ENTRANTE e anexando no
--    fim os elementos que só existem no servidor. Identidade = date (uma nota
--    por data; legado sem date → hash de conteúdo, como na 025). Não há UI de
--    exclusão de nota → união pura é segura (nada some por cópia stale).
--    Edição da mesma nota: a versão ENTRANTE vence (o cliente grava _up, que
--    fica disponível para desempate futuro).
--  * planoEvolucao: o cliente agora grava planoEvolucaoUp (ms). Se o servidor
--    tem um planoEvolucaoUp MAIOR que o entrante, o trio planoEvolucao/
--    planoEvolucaoDate/planoEvolucaoUp sai do patch (cópia velha não reverte
--    o texto mais novo). Sem _up dos dois lados → comportamento antigo (LWW).
--
-- O cliente novo funciona com a RPC antiga (_up/planoEvolucaoUp pegam carona
-- no metadata) — o deploy do código pode vir antes desta migration.
-- Idempotente (create or replace). Tags $fn$ como nas 010/015/016/025.

-- União de notas clínicas preservando a ordem do entrante; elementos que só
-- existem no servidor (ex.: nota criada em outra aba) entram NO FIM — que é a
-- posição cronológica correta, já que prontuarioNotes é append-only (push).
create or replace function public._tf_union_notes(v_cur jsonb, v_inc jsonb)
returns jsonb
language sql stable
as $fn$
  with inc as (
    select t.e, t.ord, public._tf_elem_key(t.e, 'date') as key
    from jsonb_array_elements(coalesce(v_inc, '[]'::jsonb)) with ordinality as t(e, ord)
  ),
  cur_only as (
    select t.e, t.ord, public._tf_elem_key(t.e, 'date') as key
    from jsonb_array_elements(coalesce(v_cur, '[]'::jsonb)) with ordinality as t(e, ord)
    where public._tf_elem_key(t.e, 'date') not in (select i.key from inc i)
  )
  select coalesce((
    select jsonb_agg(u.e order by u.grp, u.ord)
    from (
      select e, 0 as grp, ord from inc
      union all
      select e, 1 as grp, ord from cur_only
    ) u
  ), '[]'::jsonb)
$fn$;

-- Recria therapist_patients_sync (idêntica à 025) com os dois acréscimos.
create or replace function public.therapist_patients_sync(
  p_rows jsonb, p_touch text[] default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  r jsonb;
  v_meta jsonb;
  v_old jsonb;
  v_tombs jsonb;
  v_id uuid;
  k text;
  v_protected text[] := array[
    'moodHistory','moodNotes','mood','_moodLastDate','checkInStreak',
    'lastCheckInDate','readMaterials','portalNota','portalNotifHour','meuInsight',
    'pwdTemp','portalPasswordHash','anamnese'
  ];
begin
  if auth.uid() is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_meta := coalesce(r->'metadata', '{}'::jsonb);

    v_id := null;
    begin
      if coalesce(r->>'id','') <> '' then v_id := (r->>'id')::uuid; end if;
    exception when others then v_id := null; end;

    if v_id is not null then
      foreach k in array v_protected loop
        if p_touch is null or not (k = any(p_touch)) then
          v_meta := v_meta - k;
        end if;
      end loop;

      select coalesce(metadata, '{}'::jsonb) into v_old
        from public.patients where id = v_id and user_id = auth.uid()
        for update;
      if found then
        v_tombs := public._tf_tombs_union(v_old->'_tombs', v_meta->'_tombs');
        if v_meta ? 'diary' then
          v_meta := jsonb_set(v_meta, '{diary}',
            public._tf_merge_arr(v_old->'diary', v_meta->'diary',
                                 coalesce(v_tombs->'diary','{}'::jsonb), 'ts', true, 200));
        end if;
        if v_meta ? 'exercises' then
          v_meta := jsonb_set(v_meta, '{exercises}',
            public._tf_merge_arr(v_old->'exercises', v_meta->'exercises',
                                 coalesce(v_tombs->'exercises','{}'::jsonb), 'id', false, 500));
        end if;
        if v_meta ? 'portalMetas' then
          v_meta := jsonb_set(v_meta, '{portalMetas}',
            public._tf_merge_arr(v_old->'portalMetas', v_meta->'portalMetas',
                                 coalesce(v_tombs->'portalMetas','{}'::jsonb), 'id', false, 500));
        end if;
        if v_meta ? 'materials' then
          v_meta := jsonb_set(v_meta, '{materials}',
            public._tf_merge_arr(v_old->'materials', v_meta->'materials',
                                 coalesce(v_tombs->'materials','{}'::jsonb), 'id', true, 500));
        end if;

        -- 027: NOTAS CLÍNICAS — união por elemento (cópia stale não zera nota).
        if v_meta ? 'prontuarioNotes' then
          v_meta := jsonb_set(v_meta, '{prontuarioNotes}',
            public._tf_union_notes(v_old->'prontuarioNotes', v_meta->'prontuarioNotes'));
        end if;

        -- 027: planoEvolucao — LWW por timestamp: cópia velha não reverte texto novo.
        if v_meta ? 'planoEvolucao'
           and coalesce(public._tf_num(v_old->>'planoEvolucaoUp'), 0) >
               coalesce(public._tf_num(v_meta->>'planoEvolucaoUp'), 0) then
          v_meta := v_meta - 'planoEvolucao' - 'planoEvolucaoDate' - 'planoEvolucaoUp';
        end if;

        v_meta := v_meta || jsonb_build_object('_tombs', v_tombs);

        update public.patients set
          name           = coalesce(r->>'name', name),
          email          = r->>'email',
          phone          = r->>'phone',
          age            = nullif(coalesce(r->>'age',''), '')::int,
          cidade         = r->>'cidade',
          abordagem      = r->>'abordagem',
          cid            = r->>'cid',
          notes          = r->>'notes',
          status         = coalesce(r->>'status', status),
          sessions_count = coalesce(nullif(coalesce(r->>'sessions_count',''), '')::int, sessions_count),
          valor_sessao   = nullif(coalesce(r->>'valor_sessao',''), '')::numeric,
          progress       = coalesce(nullif(coalesce(r->>'progress',''), '')::int, progress),
          metadata       = v_old || v_meta
        where id = v_id and user_id = auth.uid();
        continue;
      end if;
    end if;

    insert into public.patients
      (id, user_id, name, email, phone, age, cidade, abordagem, cid, notes,
       status, sessions_count, valor_sessao, progress, metadata)
    values (
      coalesce(v_id, gen_random_uuid()),
      auth.uid(),
      coalesce(r->>'name',''),
      r->>'email',
      r->>'phone',
      nullif(coalesce(r->>'age',''), '')::int,
      r->>'cidade',
      r->>'abordagem',
      r->>'cid',
      r->>'notes',
      coalesce(r->>'status','Ativa'),
      coalesce(nullif(coalesce(r->>'sessions_count',''), '')::int, 0),
      nullif(coalesce(r->>'valor_sessao',''), '')::numeric,
      coalesce(nullif(coalesce(r->>'progress',''), '')::int, 0),
      coalesce(r->'metadata', '{}'::jsonb)
    )
    on conflict (id) do nothing;
  end loop;
end;
$fn$;

grant execute on function public.therapist_patients_sync(jsonb, text[]) to authenticated;

-- Validação sugerida (SQL Editor, depois de aplicar):
--   select public._tf_union_notes(
--     '[{"date":"01/07","text":"antiga"},{"date":"02/07","text":"nova-so-no-servidor"}]'::jsonb,
--     '[{"date":"01/07","text":"antiga-editada","_up":123}]'::jsonb);
--   -- esperado: [{01/07 editada}, {02/07 preservada no fim}] — nada some.
