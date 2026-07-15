-- Migration 030 — SECURITY DEFINER hardening: search_path fixo (#5 da auditoria)
-- Data: 2026-07-12 · Depende de: schema.sql (funções trigger originais)
--
-- As 3 funções trigger rodam como OWNER (SECURITY DEFINER, herdado do schema.sql)
-- SEM `set search_path`. Um objeto plantado num schema à frente no search_path
-- do sessão pode sequestrar chamadas não-qualificadas → execução de código como
-- owner. Correção padrão: fixar search_path (as RPCs do portal/sync já fazem).
-- Idempotente (create or replace mantém o trigger existente apontando p/ a função).

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $fn$
begin
  insert into public.users (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$fn$;

create or replace function public.increment_sessoes_usadas()
returns trigger language plpgsql security definer
set search_path = public
as $fn$
begin
  update public.users
  set sessoes_usadas = sessoes_usadas + 1
  where id = new.user_id;
  return new;
end;
$fn$;

-- set_updated_at não é SECURITY DEFINER (roda como o chamador), mas fixar o
-- search_path é boa prática barata e sem efeito colateral.
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- Validação: as 3 devem listar "search_path=public" em proconfig.
--   select proname, proconfig from pg_proc
--    where proname in ('handle_new_user','increment_sessoes_usadas','set_updated_at');

-- ── AINDA PENDENTES (exigem recriar funções grandes — sessão dedicada, com o
--    corpo COMPLETO em mãos e testes; ver [[teravia-auditoria-seguranca]]):
--  #3 portal_patient_sync: fallback `auth.uid()→patient_users` precisa de
--     `and pu.portal_active = true` + checar portalRevogado (revogado com sessão
--     Auth ainda sincroniza). Recriar a função inteira da 028 com essa condição.
--  #4 _portal_auth_patient: `p_hash <> v_stored` em tempo não-constante. Timing
--     via RPC é ruidoso (risco prático baixo); mitigação real = rate-limit na
--     RPC. Reavaliar se vira problema.
--  #6 _tf_merge_arr: clampar `_up` do lado paciente a now() para não vencer
--     tombstone do terapeuta. Toca o merge de todos (diary/exercises/metas) —
--     exige teste cuidadoso dos 4 caminhos.
