-- Migration 029 — Endurecimento de segurança (auditoria adversarial 12/07/2026)
-- Data: 2026-07-12 · Depende de: 004 (policies do portal), 020 (_portal_auth_patient), 021 (charges)
--
-- 3 revisores adversariais varreram APIs + RPCs + RLS. O crítico ("messages sem
-- RLS") foi VERIFICADO no banco e é FALSO-ALARME (service vê 6 linhas, anon vê 0
-- → RLS ativa). Os fixes de API (invite-patient IDOR, send-email fail-closed)
-- foram no código. Restam estes endurecimentos de banco:

-- ── #2 (ALTO) — UPDATE direto de patients pelo paciente ignora a allowlist ────
-- A policy da 004 permitia ao paciente autenticado (sessão Auth) fazer
-- patients.update({metadata}) direto, contornando a allowlist da
-- portal_patient_sync — podia escrever prontuarioNotes, injetar _tombs (apagar
-- dado do terapeuta), se auto-desrevogar. O portal SEMPRE grava via RPC
-- (_supaPatientSync → portal_patient_sync), então remover o UPDATE direto não
-- quebra o fluxo e fecha o buraco de vez.
drop policy if exists "patients: update pelo proprio paciente" on public.patients;
-- (SELECT do paciente continua — ele precisa LER o próprio registro; a escrita
--  agora é exclusivamente pela RPC com allowlist.)

-- ── #7 (BAIXO) — _portal_auth_patient exposto a anon/authenticated ────────────
-- A 020 reconcedeu execute (a 010 havia revogado): anon podia usar como oráculo
-- (email,hash) → patient_id. As RPCs de login/sync o chamam internamente como
-- SECURITY DEFINER, não precisam do grant público.
revoke execute on function public._portal_auth_patient(text, text) from anon, authenticated;

-- ── #8 (BAIXO) — unique(local_id) global em charges quebra entre terapeutas ───
-- onConflict:'local_id' de um terapeuta podia colidir com a linha de outro
-- (RLS barra o vazamento, mas o upsert falha). Tabela charges está VAZIA hoje
-- (verificado via service role) → recriar o índice agora é sem risco.
-- Detecta o nome real da constraint e troca por composto (user_id, local_id).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.charges'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(local_id)%'
     and pg_get_constraintdef(oid) not ilike '%user_id%'
   limit 1;
  if c is not null then
    execute format('alter table public.charges drop constraint %I', c);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.charges'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) ilike '%(user_id, local_id)%'
  ) then
    alter table public.charges add constraint charges_user_local_key unique (user_id, local_id);
  end if;
end $$;

-- ── VALIDAÇÃO (rode após aplicar) ─────────────────────────────────────────────
-- 1) A policy de update do paciente sumiu (deve retornar 0 linhas):
--    select policyname from pg_policies
--     where tablename='patients' and policyname ilike '%update pelo proprio%';
-- 2) O grant público sumiu (deve NÃO listar anon/authenticated):
--    select grantee from information_schema.routine_privileges
--     where routine_name='_portal_auth_patient';
-- 3) Constraint composta existe:
--    select conname from pg_constraint where conrelid='public.charges'::regclass and contype='u';

-- ── PENDENTES documentados (exigem recriar funções grandes; NÃO nesta migration
--    para não arriscar; ver memória "auditoria de confiança"/segurança):
--  #3 portal_patient_sync: fallback auth.uid() não checa portal_active
--     (revogado com sessão Auth ainda sincroniza) — MÉDIO.
--  #4 _portal_auth_patient: comparação de hash não-constante — MÉDIO.
--  #5 handle_new_user()/increment_sessoes_usadas(): SET search_path — MÉDIO.
--  #6 _tf_merge_arr: clampar _up do paciente a now() (não vencer tombstone
--     do terapeuta) — BAIXO.
