-- Migration 018 — códigos curtos de sessão (F3.3 opção b, completa)
-- Data: 2026-07-09
--
-- O link da paciente era /sala?u=<wss>&t=<JWT ~450 chars>&n=<nome> (~600 chars):
-- feio no WhatsApp e com o token exposto na URL (histórico do navegador; e o
-- formato # quebrava no linkificador do mensageiro). Agora o link compartilhado
-- é /sala?c=<código de 10 chars>; sala.html troca o código pelo token via POST
-- ao /api/create-session-room (branch exchange) — o token NUNCA aparece em URL.
--
-- Acesso: SOMENTE a service role (o endpoint) lê/escreve — RLS ligada sem
-- policies nega tudo para anon/authenticated. O código expira junto com o
-- token (3h) e a limpeza é feita no INSERT seguinte (delete dos vencidos).

create table if not exists public.session_codes (
  code text primary key,
  url text not null,
  patient_token text not null,
  patient_name text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.session_codes enable row level security;
-- (sem policies de propósito: só a service role, que bypassa RLS, toca a tabela)
