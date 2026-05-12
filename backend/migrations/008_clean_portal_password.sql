-- 008_clean_portal_password.sql
-- Remove portalPassword plaintext do campo metadata de todos os pacientes existentes.
-- A partir do fix C5 (commit c34dce9), novos syncs nunca incluem portalPassword —
-- esta migration limpa os registros históricos que já estavam no banco.
--
-- O operador JSONB "-" remove uma chave do objeto sem afetar as demais.
-- Execute no SQL Editor do Supabase antes do lançamento.

UPDATE patients
SET metadata = metadata - 'portalPassword'
WHERE metadata ? 'portalPassword';
