-- Migration 023 — Códigos de backup do 2FA (T-A8)
-- Data: 2026-07-10
--
-- PROBLEMA: 2FA (TOTP via Supabase MFA) sem recuperação — perder o celular = perder
-- a conta. Solução: 10 códigos de uso único gerados quando o 2FA é ativado; usar um
-- código no login desenrola o fator TOTP (via admin API no /api/2fa-recovery) e o
-- terapeuta reativa o 2FA com o dispositivo novo.
--
-- SEGURANÇA: apenas o hash SHA-256 de cada código é guardado, e a tabela tem RLS
-- SEM policies — só a service role (o endpoint /api/2fa-recovery) lê/escreve.
-- O cliente NUNCA acessa direto: se um atacante com só a senha (sessão aal1)
-- pudesse regravar os hashes, os códigos virariam um bypass do 2FA.
--   · gerar códigos → endpoint exige sessão aal2 (já passou pelo TOTP);
--   · resgatar código → endpoint exige sessão aal1 válida + código correto.
--
-- Idempotente.

create table if not exists public.mfa_backup_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);

alter table public.mfa_backup_codes enable row level security;
-- (sem policies de propósito: apenas a service role acessa)

create index if not exists mfa_backup_codes_user_idx on public.mfa_backup_codes (user_id);
