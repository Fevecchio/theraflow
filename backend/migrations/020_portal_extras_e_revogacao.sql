-- Migration 020 — portal remoto: próxima sessão + nome/WhatsApp do terapeuta + revogação real
-- Data: 2026-07-09 (auditoria de caminhos inacabados — P1, P2/P7, P4)
-- Depende de: 010 (_portal_auth_patient), 012+013 (portal_patient_login enxuta, hash-only)
-- Substitui as versões da 013 acrescentando: (P4) checagem de revogação em
-- _portal_auth_patient e (P1, P2/P7) 4 chaves no allowlist do login.
--
--  P1  — card "próxima sessão" nunca mostrava a sessão real (`next` fora do allowlist).
--  P2/P7 — terapeuta virava "Ana" e botões "Solicitar sessão"/"Preciso de apoio"
--        ficavam mortos no celular da paciente (liam o tf_account do terapeuta,
--        ausente lá). O client passa a injetar `_therapistNome`/`_therapistWhatsapp`
--        no metadata de cada paciente; o allowlist os devolve.
--  P4  — "Revogar acesso" era inócuo no login RPC (todas as RPCs ignoravam a
--        revogação). Agora _portal_auth_patient NEGA quando o terapeuta marcou
--        metadata->>'portalRevogado' = 'true' (sincronizado pelo client) — vale
--        para login, chat, sync, poll, consent e insight de uma vez.
--
-- Idempotente. NOTA (mesma da 010/012/013): `var := (select ...)`, tags $fn$.

-- (A) autorização hash-only (013) + P4 revogação
create or replace function public._portal_auth_patient(p_email text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_stored text;
  v_revog  text;
begin
  v_id := (select id from public.patients
           where lower(email) = lower(trim(p_email)) limit 1);
  if v_id is null then
    return null;
  end if;

  v_stored := (select metadata->>'portalPasswordHash' from public.patients where id = v_id);
  if v_stored is null or v_stored = '' then
    return null; -- acesso ainda não configurado (sem senha-padrão desde a 013)
  end if;
  if p_hash <> v_stored then
    return null;
  end if;

  -- P4: acesso revogado pelo terapeuta → nega TODAS as RPCs do portal
  v_revog := (select metadata->>'portalRevogado' from public.patients where id = v_id);
  if coalesce(v_revog, 'false') = 'true' then
    return null;
  end if;

  return v_id;
end;
$fn$;

-- (B) login enxuto (013) + P1/P2/P7 no allowlist
create or replace function public.portal_patient_login(p_email text, p_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id   uuid;
  v_meta jsonb;
  v_lean jsonb := '{}'::jsonb;
  k      text;
  v_keys text[] := array[
    'moodHistory','moodNotes','exercises','materials','diary','metas','portalMetas',
    'appointments','sessionLink','sessionLinkAt','_moodLastDate','mood',
    'checkInStreak','lastCheckInDate','readMaterials','portalNota','portalNotifHour',
    'portalDica','portalMensagem','anamnese','portalAnamneseAtiva','pwdTemp',
    -- novos (020): próxima sessão + identidade do terapeuta p/ o portal remoto
    'next','nextTime','_therapistNome','_therapistWhatsapp'
  ];
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    return null;
  end if;

  v_meta := (select coalesce(metadata, '{}'::jsonb) from public.patients where id = v_id);
  foreach k in array v_keys loop
    if v_meta ? k then
      v_lean := v_lean || jsonb_build_object(k, v_meta->k);
    end if;
  end loop;

  return (
    select json_build_object(
      'id', id, 'name', name, 'email', email, 'phone', phone,
      'age', age, 'cidade', cidade, 'abordagem', abordagem,
      'status', status, 'sessions_count', sessions_count,
      'valor_sessao', valor_sessao, 'progress', progress,
      'metadata', v_lean
    )
    from public.patients where id = v_id
  );
end;
$fn$;

grant execute on function public._portal_auth_patient(text, text) to anon, authenticated;
grant execute on function public.portal_patient_login(text, text) to anon, authenticated;
