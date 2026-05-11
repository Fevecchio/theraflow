-- Migration 002 — Programa de referral
-- Data: 2026-04-18
-- Depende de: 001

alter table public.users add column if not exists referred_by       uuid references public.users(id) on delete set null;
alter table public.users add column if not exists referral_rewarded boolean not null default false;
alter table public.users add column if not exists referral_count    int not null default 0;
