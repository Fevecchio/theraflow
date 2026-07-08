-- Migration 012 — RPC de login do portal ENXUTA + RPC mínima p/ poll (F3.1 da auditoria 07/07)
-- Data: 2026-07-08
-- Depende de: 010 (_portal_auth_patient)
--
-- PROBLEMA (crítico #7 da auditoria): portal_patient_login devolvia o registro
-- INTEIRO do paciente ao navegador — incluindo prontuarioNotes (notas clínicas!),
-- notes (queixa principal), cid (diagnóstico) e portalPasswordHash — no login E
-- a cada tick do poll de 20s que verifica se a sessão de vídeo começou.
--
-- SOLUÇÃO:
--  1. portal_patient_login passa a devolver JSON apenas com o que o portal do
--     paciente realmente usa (metadata filtrado por ALLOWLIST — o que não está
--     na lista não sai do banco).
--  2. Nova portal_session_meta devolve SÓ sessionLink/sessionLinkAt — é o que o
--     poll de 20s precisa (antes ele re-chamava o login completo).
--
-- COMPATIBILIDADE: o cliente já deployado continua funcionando após esta
-- migration (campos clínicos viram undefined; o poll lê .metadata que segue
-- existindo). O cliente novo (que usa portal_session_meta) só pode ser
-- deployado DEPOIS desta migration.
--
-- Idempotente: pode rodar mais de uma vez.
-- NOTA (mesma da 010): NÃO usar `select ... into var` — o linter do SQL Editor
-- confunde com SELECT INTO <tabela> e quebra o dollar-quote. Usar
-- `var := (select ...)`. Tags $fn$.

-- Idempotência total (o retorno muda de setof/record para json)
drop function if exists public.portal_patient_login(text, text);
drop function if exists public.portal_session_meta(text, text);

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
  -- ALLOWLIST: só o que o app do paciente usa. Fora da lista (ou seja, NUNCA
  -- saem do banco por aqui): prontuarioNotes, portalPassword, portalPasswordHash,
  -- fin, forma_pagamento — e qualquer campo novo até ser adicionado aqui.
  v_keys text[] := array[
    'moodHistory','moodNotes','exercises','materials','diary','metas','portalMetas',
    'appointments','sessionLink','sessionLinkAt','_moodLastDate','mood',
    'checkInStreak','lastCheckInDate','readMaterials','portalNota','portalNotifHour',
    'portalDica','portalMensagem','anamnese','portalAnamneseAtiva'
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

  -- Top-level: sem cid e sem notes (queixa) — dados clínicos não vão ao navegador
  -- do paciente.
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

-- Poll leve (a cada 20s no portal): só o necessário p/ saber se a sessão começou.
create or replace function public.portal_session_meta(p_email text, p_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  v_id := public._portal_auth_patient(p_email, p_hash);
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;
  return (
    select json_build_object(
      'sessionLink',   metadata->>'sessionLink',
      'sessionLinkAt', metadata->>'sessionLinkAt'
    )
    from public.patients where id = v_id
  );
end;
$fn$;

-- Permissões: anon e authenticated podem chamar (autorização dentro da função)
grant execute on function public.portal_patient_login(text, text) to anon, authenticated;
grant execute on function public.portal_session_meta(text, text) to anon, authenticated;
