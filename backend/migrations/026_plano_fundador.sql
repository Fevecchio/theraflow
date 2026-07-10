-- Migration 026 — Plano Fundador (GTM 09-10/07/2026)
-- A landing promete: "10 psicólogos fundadores · preço travado para sempre".
-- O travamento de preço em si o Stripe garante (assinatura mantém o preço da
-- época); esta migration cria o REGISTRO auditável de quem é fundador e o
-- selo que a UI exibe.
--
--  * users.founder_number: 1..10, atribuído ao confirmar a 1ª assinatura paga.
--  * assign_founder(): atribuição ATÔMICA numa única instrução (sem corrida:
--    dois webhooks simultâneos não geram 11 fundadores — o UNIQUE segura).
--    Idempotente: quem já tem número, mantém. Retorna o número ou NULL (vagas
--    esgotadas / usuário inexistente).
--  * Chamada pelo webhook do Stripe com service role; nenhum grant a anon —
--    cliente não consegue se autonomear fundador.
--
-- Idempotente. NOTA (mesma das anteriores): tags $fn$.

alter table public.users
  add column if not exists founder_number int;

create unique index if not exists users_founder_number_uniq
  on public.users (founder_number) where founder_number is not null;

create or replace function public.assign_founder(p_user uuid)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_n int;
begin
  -- já é fundador? devolve o número (idempotência p/ reenvio de webhook)
  select founder_number into v_n from public.users where id = p_user;
  if v_n is not null then return v_n; end if;

  -- tenta a próxima vaga; o índice UNIQUE parcial mata a corrida — se dois
  -- webhooks disputarem o mesmo número, um falha e re-tenta na exceção.
  for v_n in
    select coalesce(max(founder_number), 0) + 1 from public.users
  loop
    exit;
  end loop;
  if v_n > 10 then return null; end if;

  begin
    update public.users set founder_number = v_n
     where id = p_user and founder_number is null;
    if not found then return null; end if;
    return v_n;
  exception when unique_violation then
    -- outro assinante levou o número neste instante: tenta o seguinte
    update public.users u set founder_number = sub.n
      from (select coalesce(max(founder_number),0)+1 as n from public.users) sub
     where u.id = p_user and u.founder_number is null and sub.n <= 10;
    select founder_number into v_n from public.users where id = p_user;
    return v_n;
  end;
end;
$fn$;

revoke all on function public.assign_founder(uuid) from public, anon, authenticated;
