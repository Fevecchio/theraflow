-- Migration 015 — sync do PACIENTE por MERGE (corrige data-loss do F3.1) 🔴 URGENTE
-- Data: 2026-07-08
-- Depende de: 010 (_portal_auth_patient), 003/004 (patients.metadata + RLS)
-- STATUS: NÃO APLICADA — rodar assim que possível (corrige perda de prontuário).
--
-- PROBLEMA (regressão do F3.1, achado em revisão adversarial):
-- O paciente sincroniza suas ações (humor/diário/metas/senha) via
-- _supaPatientSync, que faz UPDATE do metadata INTEIRO. Após o F3.1, o paciente
-- carrega um metadata ENXUTO (sem prontuarioNotes/fin/forma_pagamento/hash — dados
-- do terapeuta). Ao regravar o metadata inteiro, esses campos que ele não tem viram
-- [] / null → APAGA o prontuário clínico no banco (caminho de conta Auth, onde a
-- RLS permite o UPDATE). Data-loss real no 1º acesso do paciente.
--
-- SOLUÇÃO: RPC SECURITY DEFINER que recebe SÓ o que o paciente edita e faz MERGE
-- (metadata || patch) no servidor — preserva as chaves do terapeuta que não vêm no
-- patch. Autorizada por email+hash (paciente RPC) OU pela posse via auth.uid()
-- quando houver sessão Auth. O cliente passa a chamar esta RPC em vez do UPDATE
-- direto do metadata inteiro.
--
-- Idempotente. NOTA (mesma da 010): usar `var := (select ...)`, tags $fn$.

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
  -- Chaves que SÓ o paciente edita — as únicas que o patch pode alterar. Qualquer
  -- outra chave enviada no patch é ignorada (não deixa o paciente tocar prontuário).
  v_allow text[] := array[
    'moodHistory','moodNotes','diary','metas','portalMetas','exercises','materials',
    'mood','_moodLastDate','checkInStreak','lastCheckInDate','readMaterials',
    'portalNota','portalNotifHour','anamnese','pwdTemp','portalPasswordHash'
  ];
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  -- Autorização por email+hash (paciente logado via RPC, sem sessão Auth)...
  v_id := public._portal_auth_patient(p_email, p_hash);
  -- ...ou pela sessão Supabase Auth do próprio paciente (caminho onde o data-loss
  -- ocorre). auth.uid() lê o JWT da requisição mesmo sob SECURITY DEFINER.
  if v_id is null then
    v_id := (select pu.patient_id from public.patient_users pu
             where pu.auth_user_id = auth.uid() limit 1);
  end if;
  if v_id is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  -- Filtra o patch pela allowlist
  foreach k in array v_allow loop
    if p_patch ? k then
      v_clean := v_clean || jsonb_build_object(k, p_patch->k);
    end if;
  end loop;

  -- MERGE: preserva todo o resto do metadata (prontuarioNotes, fin, portalDica…)
  update public.patients
     set metadata = coalesce(metadata, '{}'::jsonb) || v_clean
   where id = v_id;
end;
$fn$;

grant execute on function public.portal_patient_sync(text, text, jsonb) to anon, authenticated;
