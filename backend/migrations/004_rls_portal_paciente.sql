-- Migration 004 — RLS do portal do paciente (C1 auditoria 2026-05-04)
-- Data: 2026-05-04
-- Depende de: 001
-- Permite que o paciente autenticado leia e atualize seu próprio registro em patients.

create policy if not exists "patients: leitura pelo proprio paciente"
  on public.patients for select
  using (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = patients.id
        and pu.auth_user_id = auth.uid()
    )
  );

create policy if not exists "patients: update pelo proprio paciente"
  on public.patients for update
  using (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = patients.id
        and pu.auth_user_id = auth.uid()
    )
  );
