-- 009_patient_password_resets.sql
-- Auto-recuperação de senha do paciente (link de redefinição por email).
--
-- O paciente pode logar sem conta no Supabase Auth (via RPC portal_patient_login),
-- então o reset não passa pelo resetPasswordForEmail nativo. Este fluxo usa um
-- token de uso único, validado por um endpoint serverless que roda com
-- SUPABASE_SERVICE_ROLE_KEY (ignora RLS).
--
-- Segurança:
--   * Só o SHA-256 do token é persistido (token_hash) — o token cru nunca é gravado.
--   * Expiração de 1h (expires_at) e uso único (used_at).
--   * RLS habilitada SEM policies → nenhum cliente anon/auth acessa; apenas o
--     service_role (que ignora RLS) lê e escreve.

CREATE TABLE IF NOT EXISTS public.patient_password_resets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  token_hash  TEXT NOT NULL,        -- SHA-256 hex do token cru
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ DEFAULT NULL,
  ip          TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_pwreset_token_idx
  ON public.patient_password_resets(token_hash);

CREATE INDEX IF NOT EXISTS patient_pwreset_email_idx
  ON public.patient_password_resets(email, created_at DESC);

ALTER TABLE public.patient_password_resets ENABLE ROW LEVEL SECURITY;
-- (sem policies de propósito: apenas o service_role acessa esta tabela)
