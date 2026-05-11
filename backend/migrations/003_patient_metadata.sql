-- Migration 003 — Coluna metadata em patients
-- Data: 2026-04-18
-- Depende de: 001
-- Armazena dados do portal do paciente (moodHistory, diary, exercises, metas, etc.)

alter table public.patients add column if not exists metadata jsonb default '{}'::jsonb;
