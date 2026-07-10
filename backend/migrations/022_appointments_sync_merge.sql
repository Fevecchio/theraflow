-- Migration 022 — sync de agenda do terapeuta merge-aware (protege meuInsight da paciente)
-- Data: 2026-07-09 (auditoria de caminhos inacabados — P6)
-- Depende de: appointments (schema base) + unique(user_id, local_id)
--
-- PROBLEMA (P6, o C2 dos appointments): a paciente grava `meuInsight` direto em
-- appointments.metadata (RPC 011 / update RLS). O terapeuta, com o app aberto desde
-- o boot, faz _supaSync_appointments a cada mudança de agenda — UPSERT da linha
-- inteira com metadata:{resumoParaPaciente, meuInsight: cópia local STALE} → o
-- insight que a paciente escreveu depois vira null. A 016 cobriu só `patients`.
--
-- SOLUÇÃO: RPC SECURITY INVOKER (RLS manda) — UPDATE vira MERGE do metadata e a
-- chave `meuInsight` (escrita pela PACIENTE) é DESCARTADA do patch do terapeuta.
-- INSERT para linhas novas com ON CONFLICT preservando o meuInsight existente.
--
-- Idempotente. NOTA (mesma da 010/016): tags $fn$.

create or replace function public.therapist_appointments_sync(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  r jsonb;
  v_meta jsonb;
begin
  if auth.uid() is null then
    raise exception 'nao autorizado' using errcode = '28000';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    -- meuInsight é escrito pela PACIENTE — nunca aceitar do patch do terapeuta.
    v_meta := coalesce(r->'metadata', '{}'::jsonb) - 'meuInsight';

    update public.appointments set
      patient_id  = nullif(r->>'patient_id','')::uuid,
      patient_name = r->>'patient_name',
      date        = nullif(r->>'date','')::date,
      time        = r->>'time',
      duration    = nullif(r->>'duration','')::int,
      abordagem   = r->>'abordagem',
      status      = coalesce(r->>'status', status),
      recorrencia = r->>'recorrencia',
      presenca    = r->>'presenca',
      color       = r->>'color',
      -- MERGE: preserva meuInsight (e qualquer chave que a paciente tenha gravado)
      metadata    = coalesce(metadata, '{}'::jsonb) || v_meta
    where user_id = auth.uid() and local_id = r->>'local_id';

    if found then continue; end if;

    insert into public.appointments
      (local_id, user_id, patient_id, patient_name, date, time, duration,
       abordagem, status, recorrencia, presenca, color, metadata)
    values (
      r->>'local_id', auth.uid(),
      nullif(r->>'patient_id','')::uuid, r->>'patient_name',
      nullif(r->>'date','')::date, r->>'time', nullif(r->>'duration','')::int,
      r->>'abordagem', coalesce(r->>'status','agendada'), r->>'recorrencia',
      r->>'presenca', r->>'color', v_meta
    )
    on conflict (user_id, local_id) do update
      set metadata = coalesce(public.appointments.metadata, '{}'::jsonb) || excluded.metadata - 'meuInsight';
  end loop;
end;
$fn$;

grant execute on function public.therapist_appointments_sync(jsonb) to authenticated;
