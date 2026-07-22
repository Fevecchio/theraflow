/**
 * Teravia — Serverless Function: Diagnóstico de email/infra
 * Deploy: Vercel → /api/email-health  (Node.js runtime)
 *
 * Objetivo: nunca mais debugar envio de email no escuro. Reporta (sem vazar
 * segredos nem dados de pacientes) o estado da config e do banco, e permite um
 * envio de TESTE controlado para ver o erro real do Resend.
 *
 * Uso:
 *   GET  /api/email-health
 *     → { env, checks }  (presença de chaves, from-address, tabelas existem?)
 *
 *   POST /api/email-health   { "test_to": "voce@exemplo.com", "secret": "<DIAG_SECRET>" }
 *     → faz um envio real via Resend e devolve o resultado/erro CRU.
 *     (gated por DIAG_SECRET — defina essa env var no Vercel para liberar)
 *
 *   POST /api/email-health   { "check_patient": "email@x.com", "secret": "<DIAG_SECRET>" }
 *     → diz se existe paciente com esse email e se ele tem email cadastrado.
 */

import { Resend } from 'resend';

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://teravia.com.br',
  'https://www.teravia.com.br',
  'https://app.teravia.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function setCors(res, origin) {
  const allowed = (!origin || ALLOWED_ORIGINS.includes(origin)) ? (origin || ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-diag-secret');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function supaHeaders(serviceKey) {
  return { 'Content-Type': 'application/json', 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` };
}

// Auditoria B-3: fecha o reconhecimento ANÔNIMO. O diagnóstico (env presentes,
// remetente, tabelas) só sai para quem prova ser terapeuta (JWT válido) ou tem o
// DIAG_SECRET. Sem isso, qualquer um mapeava a stack via GET público.
async function isAuthorizedDiag(req) {
  const DIAG_SECRET = process.env.DIAG_SECRET || '';
  const secret = req.headers['x-diag-secret'] || (req.body || {}).secret || '';
  if (DIAG_SECRET && secret === DIAG_SECRET) return true;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !serviceKey) return false;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    return r.ok; // JWT de terapeuta válido
  } catch (_) { return false; }
}

async function tableStatus(serviceKey, table) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*&limit=1`, { headers: supaHeaders(serviceKey) });
    if (r.ok) return 'existe';
    if (r.status === 404) return 'NÃO EXISTE (404)';
    return `status ${r.status}`;
  } catch (e) { return 'erro: ' + e.message; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // B-3: sem autorização, não vaza NADA de infra — resposta neutra.
  if (!(await isAuthorizedDiag(req))) {
    return res.status(401).json({ ok: false, error: 'Não autorizado. Envie um JWT de terapeuta (Authorization: Bearer) ou o DIAG_SECRET (header x-diag-secret).' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const DIAG_SECRET = process.env.DIAG_SECRET || '';
  const fromAddr = process.env.RESEND_FROM || 'Teravia <onboarding@resend.dev>';

  const out = {
    env: {
      RESEND_API_KEY: RESEND_KEY ? `presente (len ${RESEND_KEY.length}, prefixo ${RESEND_KEY.slice(0, 4)})` : 'AUSENTE',
      RESEND_FROM: process.env.RESEND_FROM ? process.env.RESEND_FROM : '(default) onboarding@resend.dev',
      from_efetivo: fromAddr,
      dominio_proprio: /@teravia\.com\.br/i.test(fromAddr) ? 'sim' : 'NÃO (usando resend.dev — entrega ruim em Hotmail/Outlook/Gmail)',
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY ? `presente (len ${SERVICE_KEY.length})` : 'AUSENTE',
      DIAG_SECRET: DIAG_SECRET ? 'configurado' : 'não configurado (envio de teste bloqueado)',
    },
    checks: {},
  };

  if (SERVICE_KEY) {
    out.checks.patients = await tableStatus(SERVICE_KEY, 'patients');
    out.checks.reset_token = 'guardado no patients.metadata (sem tabela/migration nova)';
  } else {
    out.checks.aviso = 'Sem SERVICE_KEY não dá para checar tabelas.';
  }

  // Ações sensíveis (envio de teste / lookup de paciente) — gated por DIAG_SECRET
  if (req.method === 'POST') {
    const body = req.body || {};
    const secret = req.headers['x-diag-secret'] || body.secret || '';
    const authorized = DIAG_SECRET && secret === DIAG_SECRET;

    if (body.test_to || body.check_patient) {
      if (!authorized) {
        out.acao = 'BLOQUEADA: defina DIAG_SECRET no Vercel e envie o mesmo valor em "secret" (ou header x-diag-secret).';
        return res.status(200).json(out);
      }
    }

    if (body.check_patient && authorized) {
      try {
        const email = String(body.check_patient).trim().toLowerCase();
        const r = await fetch(`${SUPA_URL}/rest/v1/patients?email=eq.${encodeURIComponent(email)}&select=id,name,email&limit=5`, { headers: supaHeaders(SERVICE_KEY) });
        const rows = r.ok ? await r.json() : [];
        out.check_patient = {
          email,
          encontrados: Array.isArray(rows) ? rows.length : 0,
          com_email: Array.isArray(rows) ? rows.filter(p => p.email).length : 0,
        };
      } catch (e) { out.check_patient = { erro: e.message }; }
    }

    if (body.test_to && authorized) {
      if (!RESEND_KEY) {
        out.test_send = { erro: 'RESEND_API_KEY ausente' };
      } else {
        try {
          const resend = new Resend(RESEND_KEY);
          const result = await resend.emails.send({
            from: fromAddr,
            to: body.test_to,
            subject: 'Teravia — teste de entrega de email',
            html: '<p>Este é um teste de entrega do Teravia. Se você recebeu, o envio está funcionando. 🌿</p>',
          });
          out.test_send = result.error
            ? { ok: false, from: fromAddr, to: body.test_to, error: result.error }
            : { ok: true, from: fromAddr, to: body.test_to, id: result.data?.id };
        } catch (e) {
          out.test_send = { ok: false, error: e.message };
        }
      }
    }
  }

  return res.status(200).json(out);
}
