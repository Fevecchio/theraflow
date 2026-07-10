-- 024_users_settings.sql — configurações da agenda do terapeuta (bloqueios/horários)
-- Motivo: tf_bloqueios/tf_horarios eram local-only → férias e grade de horários
-- sumiam ao trocar de dispositivo (auditoria 09/07, TEMA 6 / item "sync de bloqueios").
-- Escritor único (só o terapeuta edita) → last-write-wins simples, sem merge.
-- O RLS existente "users: proprio perfil" (schema.sql) já cobre o update da própria linha.

alter table public.users
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.users.settings is
  'Configurações do terapeuta que sincronizam entre dispositivos: { bloqueios: [...], horarios: {dias,inicio,fim} }';
