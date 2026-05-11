-- 006_upsert_constraints.sql
-- Adiciona constraints UNIQUE necessárias para o ON CONFLICT do upsert funcionar
-- Sem essas constraints, o sync de appointments e tasks retorna 400 Bad Request

-- appointments: upsert usa ON CONFLICT(user_id, local_id)
alter table public.appointments
  add constraint appointments_user_local_unique unique (user_id, local_id);

-- tasks: upsert usa ON CONFLICT(user_id, local_id)
alter table public.tasks
  add constraint tasks_user_local_unique unique (user_id, local_id);
