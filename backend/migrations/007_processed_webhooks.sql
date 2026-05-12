-- 007_processed_webhooks.sql
-- Tabela de idempotência para webhooks do Stripe.
-- Garante que cada event.id seja processado no máximo uma vez,
-- prevenindo double-charge em referrals e upgrades de plano em replays.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  stripe_event_id TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Limpa eventos com mais de 90 dias (janela de replay do Stripe é 72h)
-- Executar como job periódico se necessário:
-- DELETE FROM processed_webhooks WHERE created_at < NOW() - INTERVAL '90 days';
