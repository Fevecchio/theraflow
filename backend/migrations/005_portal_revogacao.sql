-- Migration 005 — Revogação de acesso ao portal do paciente (R5)
-- Data: 2026-05-11
-- Depende de: 001, 004
-- Adiciona flag portal_active em patient_users para revogar acesso sem excluir o usuário.
-- Após aplicar, atualizar as RLS policies de patients para incluir o check portal_active.

-- 1. Adiciona coluna de controle
alter table public.patient_users
  add column if not exists portal_active boolean not null default true;

-- 2. Atualiza RLS: paciente só lê seus dados se portal estiver ativo
drop policy if exists "patients: leitura pelo proprio paciente" on public.patients;
create policy "patients: leitura pelo proprio paciente"
  on public.patients for select
  using (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = patients.id
        and pu.auth_user_id = auth.uid()
        and pu.portal_active = true
    )
  );

drop policy if exists "patients: update pelo proprio paciente" on public.patients;
create policy "patients: update pelo proprio paciente"
  on public.patients for update
  using (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = patients.id
        and pu.auth_user_id = auth.uid()
        and pu.portal_active = true
    )
  );

-- Para desativar o portal de um paciente:
--   UPDATE patient_users SET portal_active = false WHERE patient_id = '<uuid>';
-- Para reativar (ao re-compartilhar o acesso):
--   UPDATE patient_users SET portal_active = true WHERE patient_id = '<uuid>';
