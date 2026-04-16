-- ============================================================
-- THERAFLOW — SCHEMA SUPABASE
-- Versão 1.0 | Abril 2026
-- Rodar no SQL Editor do Supabase (dashboard → SQL Editor)
-- ============================================================

-- ── EXTENSÕES ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. CLINICS
-- Suporte a multi-terapeuta desde o início.
-- Um terapeuta autônomo tem sua própria clinic (tamanho = 1).
-- ============================================================
create table public.clinics (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 2. USERS (terapeutas)
-- Extende o auth.users do Supabase Auth.
-- ============================================================
create table public.users (
  id                uuid primary key references auth.users(id) on delete cascade,
  clinic_id         uuid references public.clinics(id) on delete set null,
  nome              text not null,
  crp               text,
  email             text not null,
  abordagem         text,                        -- 'tcc' | 'psicanalise' | 'sistemica' etc.
  tempo_sessao_min  int not null default 50,
  sessoes_usadas    int not null default 0,      -- contador do trial (max 20)
  plano             text not null default 'trial', -- 'trial' | 'pro' | 'clinic'
  stripe_customer_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Trigger: atualiza updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3. PATIENTS
-- ============================================================
create table public.patients (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  clinic_id     uuid references public.clinics(id) on delete set null,

  -- Dados pessoais
  name          text not null,
  email         text,
  phone         text,
  age           int,
  cidade        text,

  -- Clínicos
  abordagem     text,
  cid           text,
  notes         text,                   -- queixa principal
  status        text not null default 'Ativa', -- 'Ativa' | 'Nova' | 'Pausa' | 'Atenção' | 'Inativa'
  progress      int not null default 0, -- 0-100 (progresso terapêutico estimado)

  -- Sessões
  sessions_count      int not null default 0,
  last_session_date   date,
  next_session_date   date,
  session_link        text,             -- link Whereby/Meet da sala individual

  -- Financeiro
  valor_sessao        numeric(10,2),
  forma_pagamento     text,             -- 'PIX' | 'cartão' | 'dinheiro' | 'plano de saúde'
  billing_type        text default 'mensal', -- 'sessao' | 'mensal'

  -- Portal
  portal_mensagem     text,
  portal_dica         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger patients_updated_at
  before update on public.patients
  for each row execute procedure public.set_updated_at();

create index idx_patients_user_id on public.patients(user_id);

-- ============================================================
-- 4. SESSIONS (histórico de sessões)
-- ============================================================
create table public.sessions (
  id              uuid primary key default uuid_generate_v4(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  clinic_id       uuid references public.clinics(id) on delete set null,

  session_number  int not null,          -- número sequencial da sessão
  scheduled_at    timestamptz not null,  -- data/hora agendada
  started_at      timestamptz,           -- quando iniciou de fato
  ended_at        timestamptz,           -- quando terminou
  duration_min    int,                   -- duração real em minutos

  status          text not null default 'agendada',
  -- 'agendada' | 'realizada' | 'cancelada' | 'falta'

  recording_url   text,                  -- gravação (futuro: S3/Supabase Storage)
  transcript_text text,                  -- transcrição Whisper (futuro)
  session_link    text,                  -- link da videochamada usada

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.set_updated_at();

create index idx_sessions_patient_id on public.sessions(patient_id);
create index idx_sessions_user_id    on public.sessions(user_id);
create index idx_sessions_scheduled  on public.sessions(scheduled_at);

-- ============================================================
-- 5. NOTES (notas clínicas)
-- Uma note por sessão, mas pode haver notas avulsas.
-- ============================================================
create table public.notes (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references public.sessions(id) on delete set null,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,

  tipo          text not null default 'pos_sessao',
  -- 'pos_sessao' | 'evolucao' | 'avaliacao' | 'encaminhamento' | 'laudo'

  conteudo      text not null,
  gerada_por_ia boolean not null default false,
  abordagem     text,                    -- abordagem em vigor no momento da nota

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger notes_updated_at
  before update on public.notes
  for each row execute procedure public.set_updated_at();

create index idx_notes_patient_id on public.notes(patient_id);
create index idx_notes_session_id on public.notes(session_id);

-- ============================================================
-- 6. CHARGES (cobranças)
-- ============================================================
create table public.charges (
  id              uuid primary key default uuid_generate_v4(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  session_id      uuid references public.sessions(id) on delete set null,

  valor           numeric(10,2) not null,
  metodo          text not null default 'PIX',  -- 'PIX' | 'cartão' | 'dinheiro' | 'plano'
  status          text not null default 'pendente',
  -- 'pendente' | 'pago' | 'atrasado' | 'cancelado'

  descricao       text,                  -- ex: "Março · 4 sessões"
  due_date        date,
  paid_date       date,

  stripe_payment_id   text,             -- referência Stripe (futuro)
  pix_txid            text,             -- referência PIX (futuro: Pagar.me/Asaas)

  recibo_enviado  boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger charges_updated_at
  before update on public.charges
  for each row execute procedure public.set_updated_at();

create index idx_charges_patient_id on public.charges(patient_id);
create index idx_charges_user_id    on public.charges(user_id);
create index idx_charges_status     on public.charges(status);

-- ============================================================
-- 7. TASKS (tarefas CRM do terapeuta)
-- ============================================================
create table public.tasks (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  patient_id    uuid references public.patients(id) on delete set null,

  titulo        text not null,
  status        text not null default 'aberta',  -- 'aberta' | 'concluida' | 'arquivada'
  prioridade    text not null default 'media',   -- 'alta' | 'media' | 'baixa'
  due_date      date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

create index idx_tasks_user_id on public.tasks(user_id);

-- ============================================================
-- 8. EXERCISES (exercícios entre sessões)
-- ============================================================
create table public.exercises (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,

  titulo        text not null,
  descricao     text,
  tipo          text,                    -- 'respiracao' | 'diario' | 'exposicao' | 'leitura' etc.
  done          boolean not null default false,
  done_at       timestamptz,

  created_at    timestamptz not null default now()
);

create index idx_exercises_patient_id on public.exercises(patient_id);

-- ============================================================
-- 9. DIARY_ENTRIES (diário do paciente no portal)
-- ============================================================
create table public.diary_entries (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid not null references public.patients(id) on delete cascade,

  tipo          text not null default 'livre',   -- 'livre' | 'tcc' | 'narrativo' | 'sistemico'
  conteudo      jsonb not null,
  -- Para 'livre': { "text": "..." }
  -- Para 'tcc':   { "situacao": "", "pensamento": "", "alternativa": "", "emocao": "", "intensidade": 0 }

  created_at    timestamptz not null default now()
);

create index idx_diary_patient_id on public.diary_entries(patient_id);

-- ============================================================
-- 10. MOOD_CHECKINS (check-ins de humor do portal)
-- ============================================================
create table public.mood_checkins (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid not null references public.patients(id) on delete cascade,

  valor         int not null check (valor between 1 and 10),
  nota          text,
  checked_at    date not null default current_date,

  unique (patient_id, checked_at)           -- um check-in por dia por paciente
);

create index idx_mood_patient_id on public.mood_checkins(patient_id);

-- ============================================================
-- 11. MATERIALS (materiais enviados ao paciente)
-- ============================================================
create table public.materials (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,

  tipo          text not null,           -- 'link' | 'artigo' | 'video' | 'exercicio' | 'texto'
  titulo        text not null,
  url           text,
  descricao     text,

  created_at    timestamptz not null default now()
);

create index idx_materials_patient_id on public.materials(patient_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Regra central: terapeuta só acessa seus próprios dados.
-- ============================================================

alter table public.users          enable row level security;
alter table public.clinics        enable row level security;
alter table public.patients       enable row level security;
alter table public.sessions       enable row level security;
alter table public.notes          enable row level security;
alter table public.charges        enable row level security;
alter table public.tasks          enable row level security;
alter table public.exercises      enable row level security;
alter table public.diary_entries  enable row level security;
alter table public.mood_checkins  enable row level security;
alter table public.materials      enable row level security;

-- users: cada um vê só o próprio perfil
create policy "users: proprio perfil"
  on public.users for all
  using (auth.uid() = id);

-- patients: terapeuta vê só seus pacientes
create policy "patients: proprio terapeuta"
  on public.patients for all
  using (auth.uid() = user_id);

-- sessions
create policy "sessions: proprio terapeuta"
  on public.sessions for all
  using (auth.uid() = user_id);

-- notes
create policy "notes: proprio terapeuta"
  on public.notes for all
  using (auth.uid() = user_id);

-- charges
create policy "charges: proprio terapeuta"
  on public.charges for all
  using (auth.uid() = user_id);

-- tasks
create policy "tasks: proprio terapeuta"
  on public.tasks for all
  using (auth.uid() = user_id);

-- exercises: terapeuta vê os exercícios que criou
create policy "exercises: proprio terapeuta"
  on public.exercises for all
  using (auth.uid() = user_id);

-- diary_entries: terapeuta acessa os diários dos seus pacientes
create policy "diary: via paciente do terapeuta"
  on public.diary_entries for all
  using (
    exists (
      select 1 from public.patients p
      where p.id = diary_entries.patient_id
        and p.user_id = auth.uid()
    )
  );

-- mood_checkins: mesma lógica
create policy "mood: via paciente do terapeuta"
  on public.mood_checkins for all
  using (
    exists (
      select 1 from public.patients p
      where p.id = mood_checkins.patient_id
        and p.user_id = auth.uid()
    )
  );

-- materials
create policy "materials: proprio terapeuta"
  on public.materials for all
  using (auth.uid() = user_id);

-- clinics: membros da clínica veem a clínica
create policy "clinics: proprio membro"
  on public.clinics for all
  using (
    exists (
      select 1 from public.users u
      where u.clinic_id = clinics.id
        and u.id = auth.uid()
    )
  );

-- ============================================================
-- FUNÇÃO: criar perfil do usuário após signup
-- Dispara automaticamente quando um novo usuário cria conta
-- no Supabase Auth.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- FUNÇÃO: incrementar sessoes_usadas ao criar uma sessão
-- Controla o trial de 20 sessões no backend (não só no frontend).
-- ============================================================
create or replace function public.increment_sessoes_usadas()
returns trigger language plpgsql security definer as $$
begin
  update public.users
  set sessoes_usadas = sessoes_usadas + 1
  where id = new.user_id;
  return new;
end;
$$;

create trigger on_session_created
  after insert on public.sessions
  for each row execute procedure public.increment_sessoes_usadas();

-- ============================================================
-- 12. PATIENT_USERS (vínculo entre auth.users dos pacientes e patients)
-- Criado pelo endpoint /api/invite-patient ao convidar um paciente.
-- ============================================================
create table public.patient_users (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  therapist_id  uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (auth_user_id, patient_id)
);

alter table public.patient_users enable row level security;

-- Paciente pode ler o próprio vínculo (para login no portal)
create policy "patient_users: proprio paciente"
  on public.patient_users for select
  using (auth.uid() = auth_user_id);

-- Terapeuta pode ver e gerenciar vínculos dos seus pacientes
create policy "patient_users: proprio terapeuta"
  on public.patient_users for all
  using (auth.uid() = therapist_id);

create index idx_patient_users_auth_user_id on public.patient_users(auth_user_id);
create index idx_patient_users_patient_id   on public.patient_users(patient_id);
create index idx_patient_users_therapist_id on public.patient_users(therapist_id);

-- ============================================================
-- 13. CONSENT_LOGS (registro de aceite dos termos — LGPD)
-- Substitui o localStorage tf_terms_accepted quando houver backend.
-- ============================================================
create table public.consent_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references public.users(id) on delete cascade,
  patient_id    uuid references public.patients(id) on delete cascade, -- null = terapeuta aceitando termos da plataforma
  tipo          text not null,
  -- 'termos_plataforma'  → terapeuta aceitando termos de uso da TheraFlow
  -- 'gravacao_sessao'    → consentimento do paciente para gravação (CFP 04/2020)
  -- 'uso_ia'            → consentimento do paciente para uso de IA nos dados
  -- 'portal_paciente'   → paciente aceitando termos do portal
  versao        text not null,          -- ex: '1.0'
  ip            text,                   -- IP no momento do aceite
  user_agent    text,                   -- navegador/dispositivo
  accepted_at   timestamptz not null default now()
);

alter table public.consent_logs enable row level security;

create policy "consent_logs: proprio terapeuta"
  on public.consent_logs for all
  using (auth.uid() = user_id);

create index idx_consent_logs_user_id    on public.consent_logs(user_id);
create index idx_consent_logs_patient_id on public.consent_logs(patient_id);
create index idx_consent_logs_tipo       on public.consent_logs(tipo);

-- ============================================================
-- 14. AUDIT_LOGS (log de auditoria de ações sensíveis — LGPD)
-- Rastreia: criação/exclusão de dados, exports, acesso a prontuários.
-- ============================================================
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.users(id) on delete set null,
  patient_id  uuid references public.patients(id) on delete set null,
  acao        text not null,
  -- 'patient_created' | 'patient_deleted' | 'note_created' | 'note_deleted'
  -- 'prontuario_exported' | 'financeiro_exported' | 'session_started'
  -- 'account_data_exported' | 'account_deleted'
  detalhes    jsonb,                    -- contexto adicional da ação
  ip          text,
  created_at  timestamptz not null default now()
);

-- Audit logs: apenas inserção (nunca atualizar ou deletar um log de auditoria)
alter table public.audit_logs enable row level security;

create policy "audit_logs: proprio terapeuta pode ver"
  on public.audit_logs for select
  using (auth.uid() = user_id);

-- Inserts feitos via service_role no backend (Edge Functions) — não pelo cliente
-- (não criar policy de insert para o usuário direto)

create index idx_audit_logs_user_id    on public.audit_logs(user_id);
create index idx_audit_logs_patient_id on public.audit_logs(patient_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
