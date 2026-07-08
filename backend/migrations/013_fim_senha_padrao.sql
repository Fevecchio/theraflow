-- Migration 013 — fim da senha-padrão + senha temporária (F3.2 passo 2)
-- Data: 2026-07-08
-- Depende de: 010 (_portal_auth_patient), 012 (portal_patient_login enxuta)
--
-- Faz DUAS coisas:
--
-- (A) _portal_auth_patient para de aceitar a "senha-padrão" (primeiro nome).
--     Antes, paciente SEM portalPasswordHash entrava digitando o próprio primeiro
--     nome — sequestro trivial (o nome é público). Agora só autoriza contra o
--     hash. Sem hash → não loga; o terapeuta reenvia o acesso (senha forte).
--
-- (B) portal_patient_login passa a devolver a chave 'pwdTemp' no metadata (add à
--     allowlist da migration 012). É a flag que marca "senha ainda é a temporária
--     enviada pelo terapeuta" — o portal usa para OBRIGAR a troca no 1º acesso
--     (a senha temporária trafega em claro no WhatsApp/email, não pode ficar
--     permanente).
--
-- COMPATIBILIDADE: quem já tem hash não é afetado por (A). 'pwdTemp' ausente é
-- tratado como false no cliente.
--
-- Idempotente. NOTA (mesma da 010): usar `var := (select ...)`, tags $fn$.

-- (A) autorização: só hash, sem senha-padrão
create or replace function public._portal_auth_patient(p_email text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_stored text;
begin
  v_id := (select id from public.patients
           where lower(email) = lower(trim(p_email)) limit 1);
  if v_id is null then
    return null;
  end if;

  v_stored := (select metadata->>'portalPasswordHash' from public.patients where id = v_id);

  -- Sem hash = acesso ainda não configurado: NÃO aceita mais o primeiro nome.
  if v_stored is null or v_stored = '' then
    return null;
  end if;

  if p_hash = v_stored then
    return v_id;
  end if;

  return null;
end;
$fn$;

-- (B) login enxuto + pwdTemp na allowlist
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
    'portalDica','portalMensagem','anamnese','portalAnamneseAtiva','pwdTemp'
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

grant execute on function public.portal_patient_login(text, text) to anon, authenticated;
