-- Migration 011 — RPC para paciente sem sessão Auth salvar "meu insight" no appointment
-- Data: 2026-07-02
-- Depende de: 010 (_portal_auth_patient), tabela public.appointments
--
-- Mesmo root cause da migration 010: paciente logado via portal_patient_login
-- (sem sessão Auth) era bloqueado pela RLS ao fazer supaPatient.from('appointments')
-- .update(...) em pacSalvarInsight (js/13-portal.js), falhando em silêncio.
--
-- Autoriza por (email+hash) via _portal_auth_patient e faz MERGE em metadata
-- (preserva resumoParaPaciente e demais chaves — o client antigo clobberava).
--
-- Idempotente. NÃO usar `select ... into` (linter do SQL Editor confunde com
-- SELECT INTO tabela). Editor limpo antes de colar.

create or replace function public.portal_save_insight(p_email text, p_hash text, p_local_id text, p_texto text)
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
  update public.appointments
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('meuInsight', coalesce(p_texto, ''))
   where patient_id = v_id
     and local_id = p_local_id;
end;
$fn$;

grant execute on function public.portal_save_insight(text, text, text, text) to anon, authenticated;
