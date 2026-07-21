-- Migration 034 — Contadores de monitoramento de marcos de crescimento
-- Data: 2026-07-21
-- Aplicar: colar este bloco no SQL Editor do Supabase (projeto hkryvbyoviejdjlzfehm)
-- Motivo: rotina automatizada (roda na nuvem 1x/dia) precisa saber (1) quantos
--         assinantes reais existem e (2) quantos pacientes reais já estão no banco,
--         para avisar ANTES de estourar os limites do plano grátis da Vercel/Supabase.
--         Retorna SÓ 2 números (nenhum nome/e-mail/dado clínico) — por isso pode ser
--         chamada com a chave pública (anon), que já é embutida no app e não é segredo.
-- Nota: exclui a própria conta do fundador (lealb5@hotmail.com, plano='pro' de uso/teste
--       próprio desde 14/04) para não contar como "assinante real" nº1 por engano.

create or replace function public.monitor_contadores()
returns table(assinantes_pro int, pacientes_reais int)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.users
       where plano = 'pro' and email <> 'lealb5@hotmail.com'),
    (select count(*)::int from public.patients p
       join public.users u on u.id = p.user_id
       where u.plano = 'pro' and u.email <> 'lealb5@hotmail.com');
$$;

revoke all on function public.monitor_contadores() from public;
grant execute on function public.monitor_contadores() to anon, authenticated;
