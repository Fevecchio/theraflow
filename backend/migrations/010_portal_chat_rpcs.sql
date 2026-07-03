-- Migration 010 — RPCs de chat para paciente sem sessão Auth (portal via RPC)
-- Data: 2026-07-02
-- Depende de: 001 (patients), tabela public.messages (criada ad-hoc no SQL Editor)
--
-- PROBLEMA: pacientes que logam via portal_patient_login (paciente.html, qualquer
-- dispositivo) NÃO têm sessão Supabase Auth, então auth.uid() é null e as RLS
-- policies de public.messages os bloqueiam (erro 42501). O chat falha
-- silenciosamente para o fluxo de login mais usado.
--
-- SOLUÇÃO: três RPCs SECURITY DEFINER autorizadas por (email + hash), no mesmo
-- padrão de portal_patient_login / portal_update_password. O hash é o mesmo que o
-- cliente calcula em _portalHash():  sha256_hex('tf-portal:' || senha).
-- Sem hash personalizado em metadata, a senha padrão é o primeiro nome minúsculo.
--
-- Idempotente: pode rodar mais de uma vez.
-- (numerada 010 porque 009 está reservada para o trabalho de email/Resend)
--
-- NOTA: NÃO usar `select ... into var` — o linter do SQL Editor do Supabase
-- confunde com `SELECT INTO <tabela>` e injeta ALTER TABLE ... ENABLE RLS no meio
-- da função, quebrando o dollar-quote. Usar `var := (select ...)`. Tags $fn$.

create extension if not exists pgcrypto;

-- Idempotência total (evita "cannot change return type" em re-execuções)
drop function if exists public.portal_fetch_messages(text, text);
drop function if exists public.portal_send_message(text, text, text);
drop function if exists public.portal_mark_read(text, text);
drop function if exists public._portal_auth_patient(text, text);

-- Autorização compartilhada: valida (email, hash) e devolve o patient_id (ou null).
-- Usa sha256() BUILT-IN do Postgres (pg_catalog, desde PG 11) — NÃO depende de
-- pgcrypto/digest, que no Supabase mora no schema `extensions` e causava
-- "function digest(text, unknown) does not exist" (42883) sob search_path=public.
create or replace function public._portal_auth_patient(p_email text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id       uuid;
  v_name     text;
  v_stored   text;
  v_expected text;
begin
  v_id := (select id from public.patients
           where lower(email) = lower(trim(p_email)) limit 1);
  if v_id is null then
    return null;
  end if;

  v_name   := (select name from public.patients where id = v_id);
  v_stored := (select metadata->>'portalPasswordHash' from public.patients where id = v_id);

  if v_stored is not null and v_stored <> '' then
    -- senha personalizada
    if p_hash = v_stored then return v_id; end if;
  else
    -- senha padrão = primeiro nome em minúsculas; sha256 hex dos bytes UTF-8
    -- (equivale a _portalHash() no cliente: sha256('tf-portal:' + senha))
    v_expected := encode(
      sha256(convert_to('tf-portal:' || lower(split_part(coalesce(v_name,''), ' ', 1)), 'UTF8')),
      'hex'
    );
    if p_hash = v_expected then return v_id; end if;
  end if;

  return null;
end;
$fn$;

-- Buscar mensagens da própria thread
create or replace function public.portal_fetch_messages(p_email text, p_hash text)
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;
  return query
    select * from public.messages
    where patient_id = v_id
    order by created_at asc
    limit 200;
end;
$fn$;

-- Enviar mensagem (sempre como 'patient')
create or replace function public.portal_send_message(p_email text, p_hash text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'mensagem vazia' using errcode = '22023';
  end if;
  insert into public.messages (patient_id, sender_role, body)
  values (v_id, 'patient', left(trim(p_body), 4000));
end;
$fn$;

-- Marcar como lidas as mensagens da terapeuta
create or replace function public.portal_mark_read(p_email text, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;
  update public.messages
     set read_at = now()
   where patient_id = v_id
     and sender_role = 'therapist'
     and read_at is null;
end;
$fn$;

-- Permissões: anon e authenticated podem chamar (a autorização é feita dentro da função)
grant execute on function public.portal_fetch_messages(text, text) to anon, authenticated;
grant execute on function public.portal_send_message(text, text, text) to anon, authenticated;
grant execute on function public.portal_mark_read(text, text) to anon, authenticated;
-- _portal_auth_patient é helper interno; não exposto ao anon
revoke all on function public._portal_auth_patient(text, text) from public, anon, authenticated;
