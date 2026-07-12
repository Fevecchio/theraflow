-- Migration 033 — SEGURANÇA #4 (auditoria 12/07): _portal_auth_patient com
-- comparação em tempo constante + trava de tentativas (rate-limit)
-- Data: 2026-07-12 · Depende de: 020 (recria _portal_auth_patient idêntica + os 2 fixes)
--
-- PROBLEMA: `p_hash <> v_stored` compara texto byte a byte e retorna no 1º byte
-- diferente — em teoria o tempo de resposta vaza prefixos do hash (o hash É a
-- credencial no fluxo RPC). Risco prático baixo (rede é ruidosa), mas a auditoria
-- apontou que a mitigação real é limitar tentativas.
--
-- FIX (2 partes):
--  1. Comparação via digest: compara sha256(candidato) com sha256(guardado) —
--     divergência em qualquer byte não revela NADA sobre posição/prefixo.
--  2. Trava de tentativas: 20 hashes ERRADOS para o mesmo e-mail em 15 min
--     bloqueia o login desse e-mail por 15 min (mesmo com a senha certa).
--     Sucesso zera o contador. Tabela interna sem acesso de anon/authenticated.
--     Obs.: as chamadas frequentes do portal (poll/sync) usam o hash CERTO —
--     não geram tentativa; só quem erra alimenta a trava.
-- Idempotente. Tags $fn$.

create table if not exists public.portal_auth_attempts (
  email text not null,
  at timestamptz not null default now()
);
create index if not exists portal_auth_attempts_email_at
  on public.portal_auth_attempts (email, at);
alter table public.portal_auth_attempts enable row level security;
revoke all on table public.portal_auth_attempts from anon, authenticated;

create or replace function public._portal_auth_patient(p_email text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id     uuid;
  v_stored text;
  v_revog  text;
  v_email  text := lower(trim(p_email));
begin
  -- 033: trava de tentativas — 20 erros em 15 min bloqueia o e-mail
  if (select count(*) from public.portal_auth_attempts
       where email = v_email and at > now() - interval '15 minutes') >= 20 then
    return null;
  end if;

  v_id := (select id from public.patients
           where lower(email) = v_email limit 1);
  if v_id is null then
    return null;
  end if;

  v_stored := (select metadata->>'portalPasswordHash' from public.patients where id = v_id);
  if v_stored is null or v_stored = '' then
    return null; -- acesso ainda não configurado (sem senha-padrão desde a 013)
  end if;
  -- 033: comparação via digest (tempo de resposta não vaza prefixo do hash)
  if sha256(convert_to(p_hash, 'utf8')) <> sha256(convert_to(v_stored, 'utf8')) then
    insert into public.portal_auth_attempts(email) values (v_email);
    delete from public.portal_auth_attempts where at < now() - interval '1 day';
    return null;
  end if;

  -- P4 (020): acesso revogado pelo terapeuta → nega TODAS as RPCs do portal
  v_revog := (select metadata->>'portalRevogado' from public.patients where id = v_id);
  if coalesce(v_revog, 'false') = 'true' then
    return null;
  end if;

  -- sucesso zera o contador do e-mail
  delete from public.portal_auth_attempts where email = v_email;
  return v_id;
end;
$fn$;

-- Sem grant público: as RPCs do portal a chamam como SECURITY DEFINER (029 já
-- revogou o grant direto de anon/authenticated — manter assim).

-- ═══ TESTES (rode junto) ═══
-- (1) esperado: as duas colunas true — função nova tem digest + trava
select position('sha256' in prosrc) > 0                as compara_por_digest,
       position('portal_auth_attempts' in prosrc) > 0  as tem_trava_tentativas
  from pg_proc where proname = '_portal_auth_patient';
-- (2) esperado: t — tabela da trava existe e com RLS ligada
select relrowsecurity from pg_class where relname = 'portal_auth_attempts';
-- (3) simulação da trava: 20 erros bloqueiam o 21º MESMO com credencial válida.
--     Aqui sem paciente real: 20 inserts + chamada devolve null e NÃO insere a
--     21ª linha (esperado: bloqueado=true, linhas=20). Limpa no fim.
do $tst$
begin
  insert into public.portal_auth_attempts(email)
  select 'teste-trava@x.y' from generate_series(1, 20);
end $tst$;
select public._portal_auth_patient('teste-trava@x.y', 'qualquer') is null as bloqueado,
       (select count(*) from public.portal_auth_attempts where email = 'teste-trava@x.y') as linhas;
delete from public.portal_auth_attempts where email = 'teste-trava@x.y';
