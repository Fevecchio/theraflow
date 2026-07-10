-- Migration 019 — RLS em processed_webhooks (fecha envenenamento da idempotência Stripe)
-- Data: 2026-07-09 (auditoria de caminhos inacabados — B-A1)
--
-- PROBLEMA: a tabela de idempotência do webhook (migration 007) é a ÚNICA em public
-- sem RLS (fora session_codes, que é intencional e tem RLS ligada). No Supabase,
-- tabela em public sem RLS é gravável com a ANON KEY via PostgREST → qualquer um
-- insere stripe_event_ids arbitrários; se inserir o id de um evento REAL futuro,
-- api/stripe-webhook.js pula o processamento (acha que já tratou) e um pagamento
-- legítimo nunca vira plano 'pro'. O webhook usa a service role (bypassa RLS), então
-- ligar RLS sem policies NÃO quebra o fluxo — só barra anon/authenticated.
--
-- Idempotente.

alter table if exists public.processed_webhooks enable row level security;
-- (sem policies de propósito: apenas a service role acessa)
