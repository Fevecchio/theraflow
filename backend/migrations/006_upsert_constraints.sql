-- 006_upsert_constraints.sql
-- Adiciona constraints UNIQUE necessárias para o ON CONFLICT do upsert funcionar
-- Sem essas constraints, o sync de appointments e tasks retorna 400 Bad Request

-- appointments: upsert usa ON CONFLICT(user_id, local_id)
alter table public.appointments
  add constraint if not exists appointments_user_local_unique unique (user_id, local_id);

-- tasks: upsert usa ON CONFLICT(local_id) mas local_id deve ser único por user
alter table public.tasks
  add constraint if not exists tasks_user_local_unique unique (user_id, local_id);
