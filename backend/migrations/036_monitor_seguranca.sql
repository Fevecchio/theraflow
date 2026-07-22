-- Migration 036 — Painel de anomalias de segurança (auditoria AppSec 22/07/2026)
-- Data: 2026-07-22 · Depende de: 033 (portal_auth_attempts), schema (audit_logs, users)
-- Aplicar: colar este bloco INTEIRO no SQL Editor do Supabase (hkryvbyoviejdjlzfehm).
--
-- Motivo: hoje não temos VISIBILIDADE de tentativa de invasão. Esta função retorna
-- só NÚMEROS (nenhum nome/e-mail/dado clínico) que uma rotina agendada consome 1x/dia
-- e avisa se algo estourar um limiar. Mesmo padrão da monitor_contadores (034):
-- SECURITY DEFINER, search_path fixo, sem conteúdo sensível na saída.
--
-- SINAIS (e por que cada um importa):
--  · logins_falhos_15min  — pico de senha errada no portal = brute-force em curso
--  · acessos_negados_24h  — audit_logs 'portal_access_denied' = tentativa de IDOR
--  · contas_novas_24h     — pico de signup = bot/abuso de cadastro
--  · resets_senha_24h     — pico de reset = tentativa de account-takeover em massa
-- Idempotente (create or replace).

create or replace function public.monitor_seguranca()
returns table(
  logins_falhos_15min int,
  acessos_negados_24h int,
  contas_novas_24h    int,
  resets_senha_24h    int
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.portal_auth_attempts
       where at > now() - interval '15 minutes'),
    (select count(*)::int from public.audit_logs
       where acao = 'portal_access_denied' and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.users
       where created_at > now() - interval '24 hours'),
    (select count(*)::int from public.audit_logs
       where acao = 'patient_password_reset' and created_at > now() - interval '24 hours');
$$;

-- Só a service role (usada pela rotina agendada) executa — NÃO liberar para anon
-- (diferente da monitor_contadores; estes números ajudam um atacante a calibrar).
revoke all on function public.monitor_seguranca() from public, anon, authenticated;

-- ═══ VALIDAÇÃO (rode junto) ═══
-- Esperado: 1 linha com 4 números (provavelmente todos 0 ou baixos hoje).
select * from public.monitor_seguranca();

-- ═══ LIMIARES SUGERIDOS para a rotina agendada avisar (ajustar com o tempo):
--   logins_falhos_15min > 30  → possível brute-force
--   acessos_negados_24h > 5   → possível varredura de IDOR
--   contas_novas_24h    > 20  → possível abuso de cadastro (hoje são 10 fundadores)
--   resets_senha_24h    > 5   → possível ataque de account-takeover
