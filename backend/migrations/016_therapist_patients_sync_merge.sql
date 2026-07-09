-- Migration 016 — sync do TERAPEUTA por MERGE (C2 / staleness em edição concorrente)
-- Data: 2026-07-09
-- Depende de: 003/004 (patients + RLS). Complementa a 015 (lado do paciente).
--
-- PROBLEMA (C2, revisão adversarial 08/07 + auditoria):
-- _supaSync_patients (js/03) faz UPSERT da linha inteira com o metadata construído
-- do estado EM MEMÓRIA do app do terapeuta. Se o paciente escreveu algo entre o
-- load e o sync (humor, diário, TROCA DE SENHA), o terapeuta sobrescreve com a
-- cópia obsoleta — ex.: pwdTemp "ressuscita" e a senha nova do paciente morre.
--
-- SOLUÇÃO: RPC SECURITY INVOKER (RLS continua mandando — sem escalação):
--  * UPDATE vira MERGE (metadata || patch): chave ausente do patch é preservada.
--  * Chaves que o PACIENTE escreve (v_protected) são DESCARTADAS do patch do
--    terapeuta, a menos que venham explicitamente em p_touch — o único uso
--    legítimo hoje é "Reenviar acesso" (portalPasswordHash + pwdTemp).
--  * INSERT usa ON CONFLICT (id) DO NOTHING: um id de OUTRA conta no localStorage
--    não derruba mais o batch inteiro (era 403 do RLS e nada subia).
--  * user_id é SEMPRE auth.uid() — ignora o que o cliente mandar.
--
-- O cliente (js/03) tem fallback para o upsert legado enquanto esta migration
-- não é aplicada — pode rodar o SQL antes ou depois do deploy do código.
--
-- Idempotente. NOTA (mesma da 010/015): tags $fn$; `var := (select ...)`.

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
  v_id uuid;
  k text;
  -- Chaves escritas pelo PACIENTE (portal). O app do terapeuta não as edita pela
  -- UI — se vierem no patch é cópia obsoleta da memória, nunca uma edição real.
  -- pwdTemp/portalPasswordHash são a exceção controlada via p_touch.
  v_protected text[] := array[
    'moodHistory','moodNotes','mood','_moodLastDate','checkInStreak',
    'lastCheckInDate','readMaterials','portalNota','portalNotifHour','meuInsight',
    'pwdTemp','portalPasswordHash'
  ];
begin
  if auth.uid() is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_meta := coalesce(r->'metadata', '{}'::jsonb);

    -- id válido? (cliente já filtra, mas não confiamos)
    v_id := null;
    begin
      if coalesce(r->>'id','') <> '' then v_id := (r->>'id')::uuid; end if;
    exception when others then v_id := null; end;

    if v_id is not null then
      -- Patch do terapeuta não pode carregar chaves do paciente (staleness),
      -- exceto as explicitamente autorizadas em p_touch (ex.: reenviar acesso).
      foreach k in array v_protected loop
        if p_touch is null or not (k = any(p_touch)) then
          v_meta := v_meta - k;
        end if;
      end loop;

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
        metadata       = coalesce(metadata, '{}'::jsonb) || v_meta
      where id = v_id and user_id = auth.uid();

      if found then continue; end if;
      -- não achou (linha nova com id gerado no cliente, ou id de outra conta):
      -- cai no INSERT abaixo — o ON CONFLICT protege contra o segundo caso.
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
      coalesce(r->'metadata', '{}'::jsonb)  -- paciente NOVO: patch completo, nada a proteger
    )
    on conflict (id) do nothing;
  end loop;
end;
$fn$;

grant execute on function public.therapist_patients_sync(jsonb, text[]) to authenticated;
