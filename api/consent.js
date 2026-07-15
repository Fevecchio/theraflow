/**
 * Teravia — Serverless Function: Registro de consentimento (LGPD)
 * Deploy: Vercel → /api/consent  (Node.js runtime)
 *
 * Grava em public.consent_logs o aceite de termos do terapeuta e do paciente.
 * Captura IP e user-agent no servidor (impossível de forjar pelo cliente) e
 * usa SUPABASE_SERVICE_ROLE_KEY para contornar a RLS (o paciente pode estar
 * logado via RPC, sem sessão Supabase Auth).
 *
 * Tipos aceitos (coluna consent_logs.tipo):
 *   'termos_plataforma' → terapeuta aceita os termos da Teravia (exige JWT)
 *   'portal_paciente'   → paciente aceita os termos do portal (exige patientId)
 *   'gravacao_sessao'   → consentimento de gravação (CFP 04/2020)
 *   'uso_ia'            → consentimento para uso de IA nos dados
 *
 * Autenticações aceitas para gravacao_sessao/uso_ia:
 *   - JWT Supabase do TERAPEUTA (header Authorization) + posse do paciente; ou
 *   - `lkToken` no body = JWT LiveKit da PACIENTE (emitido por create-session-room
 *     com patientId no metadata) → registra o aceite REAL dela na sala (F3.5).
 */

import crypto from 'node:crypto';

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://teravia.com.br',
  'https://www.teravia.com.br',
  'https://app.teravia.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

const VALID_TIPOS = ['termos_plataforma', 'portal_paciente', 'gravacao_sessao', 'uso_ia'];

// Tipos que vêm de contexto AUTENTICADO do terapeuta (o cliente já envia o JWT):
// exigem sessão válida + posse do paciente. Fecha a forja de consentimento por
// quem só conhece um UUID de paciente (F3.5). 'portal_paciente' NÃO está aqui —
// vem do paciente logado via RPC (sem sessão Auth); sua blindagem precisa de uma
// RPC SECURITY DEFINER (email+hash) e será feita numa próxima etapa (com SQL).
const TIPOS_TERAPEUTA = ['termos_plataforma', 'gravacao_sessao', 'uso_ia'];

// Rate-limit best-effort em memória (por instância serverless): corta flood óbvio
// e poluição da trilha de auditoria. Não é garantia entre instâncias.
const _rl = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const e = _rl.get(key);
  if (!e || now > e.reset) { _rl.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++; return true;
}

function setCors(res, origin) {
  const allowed = (!origin || ALLOWED_ORIGINS.includes(origin))
    ? (origin || ALLOWED_ORIGINS[0])
    : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function supaHeaders(serviceKey) {
  return {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  };
}

async function verifySupabaseJWT(req, serviceKey) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return fwd.split(',')[0].trim() || req.headers['x-real-ip'] || null;
}

/**
 * Verifica o JWT LiveKit da PACIENTE (HS256, assinado com LIVEKIT_API_SECRET pelo
 * nosso create-session-room). Verificação manual via node:crypto de propósito: o
 * SDK livekit-server-sdk é ESM-only e crasharia aqui (este arquivo é transpilado
 * p/ CJS — mesmo motivo do create-session-room ser .mjs).
 * Retorna { patientId } se válido, senão null.
 */
function verifyLkPatientToken(lkToken) {
  const KEY = (process.env.LIVEKIT_API_KEY || '').trim();
  const SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();
  if (!KEY || !SECRET || !lkToken) return null;
  try {
    const parts = String(lkToken).split('.');
    if (parts.length !== 3) return null;
    const expected = crypto.createHmac('sha256', SECRET)
      .update(parts[0] + '.' + parts[1]).digest();
    const got = Buffer.from(parts[2], 'base64url');
    if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.iss !== KEY) return null;                                  // não é nosso emissor
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;       // expirado
    if (!/^paciente_/.test(payload.sub || '')) return null;                // só o token da PACIENTE
    let meta = null;
    try { meta = JSON.parse(payload.metadata || 'null'); } catch (_) {}
    if (!meta || !meta.patientId) return null;                             // token antigo, sem id
    return { patientId: String(meta.patientId) };
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[consent] SUPABASE_SERVICE_ROLE_KEY ausente');
    return res.status(500).json({ error: 'Service misconfigured' });
  }

  // Rate-limit por IP (30/min): registro de consentimento é esporádico no uso real.
  const ip = clientIp(req);
  if (!rateLimit(`consent:${ip || 'anon'}`, 30, 60 * 1000)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
  }

  const { tipo, patientId, versao, lkToken } = req.body || {};

  if (!tipo || !VALID_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'tipo inválido' });
  }
  if (!versao) {
    return res.status(400).json({ error: 'versao é obrigatória' });
  }

  const hdrs = supaHeaders(SERVICE_KEY);
  let userId = null;
  let patient = null;

  const lkAuth = (lkToken && (tipo === 'gravacao_sessao' || tipo === 'uso_ia'))
    ? verifyLkPatientToken(lkToken) : null;

  if (lkAuth) {
    // Aceite REAL da PACIENTE na sala (F3.5 lacuna 2): autenticado pelo token
    // LiveKit dela (assinado por nós em create-session-room, com o patientId no
    // claim metadata). Ignora patientId do body — o do token é o que vale.
    patient = lkAuth.patientId;
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/patients?id=eq.${encodeURIComponent(patient)}&select=user_id&limit=1`,
        { headers: hdrs }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) userId = rows[0].user_id;
      else return res.status(403).json({ error: 'Paciente do token não encontrado' });
    } catch (e) {
      console.warn('[consent] Falha ao resolver user_id (lkToken):', e.message);
      return res.status(502).json({ error: 'Falha ao registrar consentimento' });
    }
  } else if (TIPOS_TERAPEUTA.includes(tipo)) {
    // Aceite do terapeuta (termos) ou registrado por ele (gravação/IA): exige sessão
    // autenticada. Para os vinculados a paciente, confere que o terapeuta é DONO do
    // paciente — impede forjar consentimento de gravação/IA com um UUID vazado (F3.5).
    const caller = await verifySupabaseJWT(req, SERVICE_KEY);
    if (!caller) return res.status(401).json({ error: 'Autenticação necessária' });
    userId = caller.id;

    if (tipo !== 'termos_plataforma') {
      if (!patientId) return res.status(400).json({ error: 'patientId é obrigatório' });
      patient = patientId;
      let ownerId = null;
      try {
        const r = await fetch(
          `${SUPA_URL}/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}&select=user_id&limit=1`,
          { headers: hdrs }
        );
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length > 0) ownerId = rows[0].user_id;
      } catch (e) {
        console.warn('[consent] Falha ao resolver dono do paciente:', e.message);
      }
      if (!ownerId || ownerId !== caller.id) {
        return res.status(403).json({ error: 'Paciente não pertence ao solicitante' });
      }
    }
  } else {
    // 'portal_paciente' — paciente logado via RPC (sem sessão Auth). LACUNA CONHECIDA
    // (F3.5): ainda aceita só com patientId; será blindado com RPC SECURITY DEFINER
    // (email+hash) numa próxima etapa. Mantido para não quebrar o aceite de termos.
    if (!patientId) return res.status(400).json({ error: 'patientId é obrigatório' });
    patient = patientId;
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}&select=user_id&limit=1`,
        { headers: hdrs }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) userId = rows[0].user_id;
    } catch (e) {
      console.warn('[consent] Falha ao resolver user_id do paciente:', e.message);
    }
  }

  const payload = {
    user_id: userId,
    patient_id: patient,
    tipo,
    versao: String(versao),
    ip: clientIp(req),
    user_agent: (req.headers['user-agent'] || '').slice(0, 500),
  };

  try {
    const insRes = await fetch(`${SUPA_URL}/rest/v1/consent_logs`, {
      method: 'POST',
      headers: { ...hdrs, 'Prefer': 'return=representation' },
      body: JSON.stringify(payload),
    });
    if (!insRes.ok) {
      const errText = await insRes.text().catch(() => '');
      console.error('[consent] Falha ao gravar:', insRes.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'Falha ao registrar consentimento' });
    }
    const saved = await insRes.json();
    console.log('[consent] Registrado:', tipo, patient || userId);
    return res.status(200).json({ ok: true, id: Array.isArray(saved) ? saved[0]?.id : null });
  } catch (e) {
    console.error('[consent] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
