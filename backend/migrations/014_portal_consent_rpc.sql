-- Migration 014 — RPC de consentimento do PACIENTE autenticada (F3.5)
-- Data: 2026-07-08
-- Depende de: 010 (_portal_auth_patient), 001 (consent_logs)
-- STATUS: NÃO APLICADA AINDA — rodar no SQL Editor quando for fechar o F3.5.
--
-- PROBLEMA (F3.5): o aceite de termos do paciente (tipo 'portal_paciente') hoje
-- vai pelo /api/consent aceitando SÓ um patientId, sem prova de identidade —
-- qualquer um com um UUID vazado forja o consentimento. O paciente do portal
-- loga via RPC (email+hash), sem sessão Supabase Auth, então não dá para exigir
-- JWT como fazemos com o terapeuta.
--
-- SOLUÇÃO: RPC SECURITY DEFINER que valida (email, hash) via _portal_auth_patient
-- (mesmo padrão das RPCs de chat da migration 010) e grava o consent com o
-- patient_id AUTENTICADO — não um UUID arbitrário do corpo. Aceita só os tipos
-- que o paciente pode dar por si (portal_paciente, uso_ia, gravacao_sessao).
--
-- Idempotente. NOTA (mesma da 010): usar `var := (select ...)`, tags $fn$.

create or replace function public.portal_log_consent(
  p_email text, p_hash text, p_tipo text, p_versao text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id    uuid;
  v_owner uuid;
  v_cid   uuid;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  -- Só tipos que a própria paciente consente. 'termos_plataforma' é do terapeuta.
  if p_tipo not in ('portal_paciente', 'uso_ia', 'gravacao_sessao') then
    raise exception 'tipo invalido' using errcode = '22023';
  end if;

  v_owner := (select user_id from public.patients where id = v_id);

  insert into public.consent_logs (user_id, patient_id, tipo, versao, user_agent)
  values (v_owner, v_id, p_tipo, coalesce(nullif(trim(p_versao), ''), '1.0'),
          'portal-rpc (paciente autenticada)')
  returning id into v_cid;

  return v_cid;
end;
$fn$;

grant execute on function public.portal_log_consent(text, text, text, text) to anon, authenticated;
