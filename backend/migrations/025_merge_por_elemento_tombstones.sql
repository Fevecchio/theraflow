-- Migration 025 — P10: merge POR ELEMENTO com tombstones (diary/exercises/portalMetas)
-- Data: 2026-07-10
-- Depende de: 015 (portal_patient_sync) e 017 (therapist_patients_sync) — recria as duas.
--
-- PROBLEMA (P10, auditoria 09/07): diary/exercises/portalMetas/materials são
-- escritos pelos DOIS lados (app do terapeuta + portal do paciente). Os merges
-- das 015/016/017 são RASOS (`||` por chave): quem sincroniza por último com uma
-- cópia velha SOBRESCREVE o array inteiro — o app do terapeuta aberto o dia todo
-- apaga o diário que a paciente escreveu à tarde; o celular velho da paciente
-- apaga a resposta do terapeuta e ressuscita exercício excluído.
--
-- SOLUÇÃO:
--  * `materials` sai da allowlist do paciente (ele nunca o escreve — só marca
--    leitura em readMaterials) → vira chave de escritor único do terapeuta.
--  * diary/exercises/portalMetas: UNIÃO POR ELEMENTO no servidor. Identidade:
--    `id` (exercises/portalMetas) ou `ts` (diary; legado sem ts → hash do
--    conteúdo, determinístico nos dois lados). Para cada identidade vence a
--    versão com `_up` (última edição, ms) maior; sem `_up`, vale a criação.
--  * TOMBSTONES: exclusões do terapeuta gravam metadata._tombs[array][id]=ts.
--    Elemento com tombstone >= _up não volta. Tombstones > 90 dias são podados.
--  * Diário limitado às 200 entradas mais novas no servidor (poda local de 50
--    continua no cliente; a união não deixa o array crescer sem teto).
--
-- O cliente novo funciona com as RPCs antigas (campos _up/_tombs só pegam
-- carona) — o deploy do código pode vir antes ou depois desta migration.
-- Idempotente. NOTA (mesma da 010/015/016): tags $fn$; `var := (select ...)`.

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Cast numérico seguro (jsonb->>x pode trazer lixo; um elemento ruim não pode
-- derrubar o sync inteiro).
create or replace function public._tf_num(t text)
returns numeric
language sql immutable
as $fn$
  select case when t ~ '^[0-9]+(\.[0-9]+)?$' then t::numeric else null end
$fn$;

-- Identidade de um elemento: campo k_id (id/ts); legado sem ele → hash do
-- conteúdo (mesmo elemento nos dois devices → mesma identidade).
create or replace function public._tf_elem_key(e jsonb, k_id text)
returns text
language sql immutable
as $fn$
  select coalesce(
    e->>k_id,
    md5(coalesce(e->>'texto','') || coalesce(e->>'text','') ||
        coalesce((e->'campos')::text,'') || coalesce(e->>'date','') ||
        coalesce(e->>'hora','') || coalesce(e->>'title','') || coalesce(e->>'titulo',''))
  )
$fn$;

-- União por elemento de dois arrays jsonb. Para cada identidade vence o maior
-- `_up` (empate: fica o ENTRANTE — é a edição que acabou de chegar). Identidades
-- com tombstone >= _up morrem. Saída ordenada por criação (v_desc: mais novo
-- primeiro — diary/materials usam unshift; asc — exercises/portalMetas usam push).
create or replace function public._tf_merge_arr(
  v_cur jsonb, v_inc jsonb, v_tombs jsonb, k_id text,
  v_desc boolean default true, v_cap int default 200
)
returns jsonb
language sql stable
as $fn$
  with united as (
    select public._tf_elem_key(t.e, k_id) as key, t.e, t.src,
           coalesce(public._tf_num(t.e->>'_up'), public._tf_num(t.e->>k_id), 0) as up,
           public._tf_num(t.e->>k_id) as created
    from (
      select e, 0 as src from jsonb_array_elements(coalesce(v_cur, '[]'::jsonb)) e
      union all
      select e, 1 as src from jsonb_array_elements(coalesce(v_inc, '[]'::jsonb)) e
    ) t
  ),
  winners as (
    select distinct on (key) key, e, up, created
    from united
    order by key, up desc, src desc
  ),
  alive as (
    select e, up, created
    from winners
    where coalesce(public._tf_num(coalesce(v_tombs, '{}'::jsonb)->>key), -1) < up
  ),
  capped as (
    select e, created
    from alive
    order by created desc nulls last, up desc
    limit v_cap
  )
  select coalesce(
    case when v_desc
      then (select jsonb_agg(e order by created desc nulls last) from capped)
      else (select jsonb_agg(e order by created asc nulls first)  from capped)
    end,
    '[]'::jsonb)
$fn$;

-- União de dois mapas de tombstones {id: ts} (máximo por id; poda > 90 dias).
create or replace function public._tf_merge_tombs(a jsonb, b jsonb)
returns jsonb
language sql stable
as $fn$
  select coalesce(jsonb_object_agg(m.key, to_jsonb(m.maxts)), '{}'::jsonb)
  from (
    select t.key, max(public._tf_num(t.value)) as maxts
    from (
      select * from jsonb_each_text(coalesce(a, '{}'::jsonb))
      union all
      select * from jsonb_each_text(coalesce(b, '{}'::jsonb))
    ) t
    group by t.key
  ) m
  where m.maxts is not null
    and m.maxts > extract(epoch from now()) * 1000 - 90 * 86400000
$fn$;

-- União do objeto _tombs inteiro ({diary:{...}, exercises:{...}, ...}).
create or replace function public._tf_tombs_union(a jsonb, b jsonb)
returns jsonb
language sql stable
as $fn$
  select coalesce(jsonb_object_agg(ks.k,
           public._tf_merge_tombs(coalesce(a, '{}'::jsonb)->ks.k,
                                  coalesce(b, '{}'::jsonb)->ks.k)), '{}'::jsonb)
  from (
    select distinct k from (
      select jsonb_object_keys(coalesce(a, '{}'::jsonb)) k
      union all
      select jsonb_object_keys(coalesce(b, '{}'::jsonb)) k
    ) t
  ) ks
$fn$;

-- ── Sync do TERAPEUTA (recria a 017 com merge por elemento) ─────────────────

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
  -- Chaves escritas pelo PACIENTE (portal) — iguais à 017.
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

      -- P10: merge POR ELEMENTO das chaves de escrita dupla. Lê o metadata
      -- atual com lock (as duas versões se encontram AQUI) e substitui cada
      -- array do patch pela união elemento a elemento.
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
        -- materials continua chave inteira do terapeuta (escritor único), mas o
        -- tombstone registrado na exclusão protege contra ressurreição entre
        -- os próprios dispositivos do terapeuta:
        if v_meta ? 'materials' then
          v_meta := jsonb_set(v_meta, '{materials}',
            public._tf_merge_arr(v_old->'materials', v_meta->'materials',
                                 coalesce(v_tombs->'materials','{}'::jsonb), 'id', true, 500));
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
      -- não achou: cai no INSERT (ON CONFLICT protege contra id de outra conta).
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

-- ── Sync do PACIENTE (recria a 015 com merge por elemento) ──────────────────

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
  -- P10: 'materials' SAIU da allowlist (o paciente nunca o escreve — só marca
  -- leitura em readMaterials); o patch antigo o devolvia inteiro e stale.
  -- '_tombs' NUNCA entra: paciente não pode excluir dados do terapeuta.
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

  -- P10: merge por elemento das chaves de escrita dupla, respeitando os
  -- tombstones do servidor (o celular velho não ressuscita exercício excluído
  -- nem apaga a resposta do terapeuta no diário).
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

  update public.patients
     set metadata = v_old || v_clean
   where id = v_id;
end;
$fn$;

grant execute on function public.portal_patient_sync(text, text, jsonb) to anon, authenticated;
