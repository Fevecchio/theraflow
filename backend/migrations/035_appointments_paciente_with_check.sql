-- Migration 035 — SEGURANÇA B-2 (auditoria AppSec 22/07/2026)
-- Data: 2026-07-22 · Depende de: schema.sql (policy "appointments: paciente salva insight")
--
-- PROBLEMA: a policy de UPDATE do PACIENTE em appointments tinha USING (limita
-- QUAIS linhas ele toca) mas NÃO tinha WITH CHECK (não valida os VALORES após o
-- update). Um paciente COM conta Supabase Auth (recebeu convite) poderia, via
-- chamada direta ao PostgREST (fora do app), fazer UPDATE mudando patient_id da
-- própria sessão para o de OUTRO paciente — vinculando/sequestrando a linha. O
-- USING sozinho não barra isso: ele checa a linha ANTES do update, o WITH CHECK
-- checaria a linha DEPOIS.
--
-- Impacto real BAIXO (só afeta pacientes com sessão Auth — a maioria loga via RPC
-- e nem cai nesta policy; o app só escreve metadata via portal_save_insight), mas
-- é defesa-em-profundidade barata: a política passa a exigir que a linha
-- resultante continue pertencendo ao próprio paciente.
--
-- NOTA: restrição fina de COLUNA (impedir mudar date/status/presenca da própria
-- sessão) exigiria trigger — fica de fora por ser baixo impacto (só os dados dele,
-- e o terapeuta re-sincroniza). O WITH CHECK fecha o caso sério (cross-patient).
-- Idempotente (drop if exists + create).

drop policy if exists "appointments: paciente salva insight" on public.appointments;

create policy "appointments: paciente salva insight"
  on public.appointments for update
  using (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = appointments.patient_id
        and pu.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.patient_users pu
      where pu.patient_id = appointments.patient_id
        and pu.auth_user_id = auth.uid()
    )
  );

-- ═══ VALIDAÇÃO (rode junto) ═══
-- Esperado: qual_check = true (a policy agora tem cláusula WITH CHECK).
select polname,
       polqual is not null      as tem_using,
       polwithcheck is not null  as tem_with_check
  from pg_policy
 where polrelid = 'public.appointments'::regclass
   and polname = 'appointments: paciente salva insight';
