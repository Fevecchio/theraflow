-- Migration 021 — coluna metadata em charges + "as-built" do drift SQL
-- Data: 2026-07-09 (auditoria de caminhos inacabados — F4, disaster recovery)
--
-- PARTE A (NOVA — necessária p/ o F4): charges.metadata guarda os campos que o app
-- usa mas não têm coluna (session, billing, planLabel, initials, color, method/desc
-- reais). Sem ela, em outro dispositivo toda cobrança voltava "PIX"/"—"/undefined.
--
-- PARTE B (AS-BUILT — documenta o que foi criado ad-hoc no SQL Editor e NÃO estava
-- no repo; idempotente, seguro rodar mesmo já existindo): charges.local_id,
-- tasks.local_id e os uniques que os upserts usam (onConflict). Fecha o buraco de
-- disaster recovery (recriar o banco do repo dava 400 no sync financeiro/tarefas).
--
-- Idempotente.

-- ── PARTE A: metadata rica das cobranças ──
alter table if exists public.charges  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ── PARTE B: colunas/uniques criados ad-hoc (as-built) ──
alter table if exists public.charges  add column if not exists local_id text;
alter table if exists public.tasks    add column if not exists local_id text;

-- Uniques usados pelos upserts (onConflict). O do charges hoje em produção é por
-- local_id (global); mantido assim p/ casar com o cliente (onConflict:'local_id').
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'charges_local_id_key') then
    begin
      alter table public.charges add constraint charges_local_id_key unique (local_id);
    exception when others then null; -- já existe com outro nome
    end;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_user_local_id_key') then
    begin
      alter table public.tasks add constraint tasks_user_local_id_key unique (user_id, local_id);
    exception when others then null;
    end;
  end if;
end$$;
