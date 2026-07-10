/**
 * TheraFlow — Serverless Function: Códigos de backup do 2FA (T-A8)
 * Deploy: Vercel → /api/2fa-recovery  (Node.js runtime)
 *
 * Recuperação de conta quando o terapeuta perde o app autenticador. Ações:
 *   { action: 'generate' } → gera 10 códigos de uso único (exige sessão AAL2,
 *       ou seja, quem JÁ passou pelo TOTP nesta sessão). Substitui os anteriores.
 *       Devolve os códigos em claro UMA única vez; só o SHA-256 é guardado.
 *   { action: 'status' }   → { remaining } códigos não usados (qualquer sessão).
 *   { action: 'redeem', code } → valida o código (sessão AAL1 basta — é
 *       exatamente o caso "tenho a senha mas perdi o celular"), marca como usado
 *       e DESENROLA o fator TOTP via admin API. O login então conclui sem 2FA e
 *       o terapeuta reativa o 2FA no Perfil com o dispositivo novo.
 *
 * SEGURANÇA:
 *   · gerar exige AAL2 — senão um atacante com só a senha trocaria os códigos
 *     pelos dele e furaria o 2FA;
 *   · a tabela mfa_backup_codes (migration 023) tem RLS sem policies — só a
 *     service role acessa; o cliente nunca lê/escreve direto;
 *   · resgate com rate-limit agressivo (5 tentativas/15min por conta) — com
 *     códigos de ~40 bits, força bruta é inviável.
 *
 * Env vars (Vercel): SUPABASE_SERVICE_ROLE_KEY (obrigatória).
 */

import crypto from 'crypto';

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'https://app.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

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

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Normaliza o que o usuário digitou: maiúsculas, sem hífen/espaços.
function normCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function codeHash(normalized) {
  return sha256('tf-backup:' + normalized);
}

// Alfabeto sem ambíguos (I/L/O/0/1). 8 chars ≈ 40 bits de entropia.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  const bytes = crypto.randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i++) raw += ALPHABET[bytes[i] % ALPHABET.length];
  return raw.slice(0, 4) + '-' + raw.slice(4); // XXXX-XXXX (exibição)
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return fwd.split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
}

const _rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (_rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  _rlBuckets.set(key, arr);
  if (_rlBuckets.size > 5000) _rlBuckets.clear();
  return true;
}

// Valida o JWT no Auth do Supabase e devolve { user, aal }. O aal vem do payload
// do próprio token — seguro decodificar sem verificar assinatura AQUI porque o
// GET /auth/v1/user já validou o token inteiro no servidor de auth.
async function verifyUser(req, serviceKey) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const user = await r.json();
    let aal = 'aal1';
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.aal) aal = payload.aal;
    } catch (_) {}
    return { user, aal };
  } catch (_) { return null; }
}

/* ── generate (AAL2) ── */
async function handleGenerate(res, uid, aal, hdrs) {
  if (aal !== 'aal2') {
    return res.status(403).json({ error: 'Confirme o código do app autenticador antes de gerar códigos de backup (sessão sem 2FA verificado).' });
  }

  const codes = [];
  for (let i = 0; i < 10; i++) codes.push(genCode());
  const rows = codes.map((c) => ({ user_id: uid, code_hash: codeHash(normCode(c)) }));

  // Substitui o lote anterior (códigos antigos deixam de valer)
  const del = await fetch(`${SUPA_URL}/rest/v1/mfa_backup_codes?user_id=eq.${uid}`, {
    method: 'DELETE', headers: hdrs,
  });
  if (!del.ok) {
    const t = await del.text().catch(() => '');
    console.error('[2fa-recovery] generate: delete falhou:', del.status, t.slice(0, 200));
    return res.status(500).json({ error: 'Não foi possível gerar os códigos. Tente novamente.' });
  }
  const ins = await fetch(`${SUPA_URL}/rest/v1/mfa_backup_codes`, {
    method: 'POST',
    headers: { ...hdrs, 'Prefer': 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!ins.ok) {
    const t = await ins.text().catch(() => '');
    console.error('[2fa-recovery] generate: insert falhou:', ins.status, t.slice(0, 200));
    return res.status(500).json({ error: 'Não foi possível gerar os códigos. Tente novamente.' });
  }
  console.log('[2fa-recovery] 10 códigos gerados para', uid);
  return res.status(200).json({ ok: true, codes });
}

/* ── status ── */
async function handleStatus(res, uid, hdrs) {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/mfa_backup_codes?user_id=eq.${uid}&used_at=is.null&select=code_hash`,
    { headers: hdrs }
  );
  const rows = r.ok ? await r.json() : [];
  return res.status(200).json({ ok: true, remaining: Array.isArray(rows) ? rows.length : 0 });
}

/* ── redeem (AAL1 basta) ── */
async function handleRedeem(req, res, uid, hdrs) {
  // Força bruta: 5 tentativas/15min por conta + 20/min por IP
  if (!rateLimit(`redeem:${uid}`, 5, 15 * 60 * 1000) || !rateLimit(`redeemip:${clientIp(req)}`, 20, 60 * 1000)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }

  const norm = normCode((req.body || {}).code);
  if (norm.length !== 8) {
    return res.status(400).json({ error: 'Código inválido. Digite os 8 caracteres (com ou sem o hífen).' });
  }
  const hash = codeHash(norm);

  const r = await fetch(
    `${SUPA_URL}/rest/v1/mfa_backup_codes?user_id=eq.${uid}&code_hash=eq.${encodeURIComponent(hash)}&used_at=is.null&select=code_hash`,
    { headers: hdrs }
  );
  const rows = r.ok ? await r.json() : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Código inválido ou já usado.' });
  }

  // Desenrola o(s) fator(es) TOTP verificado(s) ANTES de queimar o código — se a
  // remoção falhar, o código continua válido para nova tentativa.
  const fr = await fetch(`${SUPA_URL}/auth/v1/admin/users/${uid}/factors`, { headers: hdrs });
  const factors = fr.ok ? await fr.json() : [];
  const totp = (Array.isArray(factors) ? factors : []).filter(
    (f) => f.factor_type === 'totp' && f.status === 'verified'
  );
  for (const f of totp) {
    const dr = await fetch(`${SUPA_URL}/auth/v1/admin/users/${uid}/factors/${f.id}`, {
      method: 'DELETE', headers: hdrs,
    });
    if (!dr.ok) {
      const t = await dr.text().catch(() => '');
      console.error('[2fa-recovery] redeem: unenroll falhou:', dr.status, t.slice(0, 200));
      return res.status(500).json({ error: 'Não foi possível desativar o 2FA. Tente novamente.' });
    }
  }

  const up = await fetch(
    `${SUPA_URL}/rest/v1/mfa_backup_codes?user_id=eq.${uid}&code_hash=eq.${encodeURIComponent(hash)}`,
    {
      method: 'PATCH',
      headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ used_at: new Date().toISOString() }),
    }
  );
  if (!up.ok) console.error('[2fa-recovery] redeem: marcar usado falhou (2FA já removido):', up.status);

  console.log('[2fa-recovery] Código de backup usado; TOTP desenrolado para', uid);
  return res.status(200).json({ ok: true, factorsRemoved: totp.length });
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[2fa-recovery] SUPABASE_SERVICE_ROLE_KEY ausente');
    return res.status(500).json({ error: 'Service misconfigured' });
  }

  const auth = await verifyUser(req, SERVICE_KEY);
  if (!auth || !auth.user || !auth.user.id) {
    return res.status(401).json({ error: 'Autenticação necessária' });
  }

  const hdrs = supaHeaders(SERVICE_KEY);
  const action = ((req.body || {}).action || '').trim();
  if (action === 'generate') return handleGenerate(res, auth.user.id, auth.aal, hdrs);
  if (action === 'status') return handleStatus(res, auth.user.id, hdrs);
  if (action === 'redeem') return handleRedeem(req, res, auth.user.id, hdrs);
  return res.status(400).json({ error: 'action inválida (use generate|status|redeem)' });
}
