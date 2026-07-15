/**
 * Teravia — Serverless: cria a sala de vídeo LiveKit e gera os tokens de acesso.
 * Deploy: Vercel → /api/create-session-room (Node.js runtime)
 *
 * Env necessárias (Vercel → Settings → Environment Variables):
 *   LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL (wss://<seu-projeto>.livekit.cloud)
 *   SUPABASE_SERVICE_ROLE_KEY (já existe)
 *
 * Retorna { url, roomName, hostToken, patientToken }. A sala é criada sob demanda pelo
 * LiveKit quando o primeiro participante entra com um token válido (não precisa RoomServiceClient).
 *
 * NOTA: usamos o SDK oficial `livekit-server-sdk` (AccessToken) para gerar o token — gerador
 * autoritativo, evita divergências de assinatura. Este arquivo é `.mjs` (ESM nativo) de propósito:
 * assim a Vercel NÃO o transpila para CommonJS e o import ESM-only do SDK funciona (o `.js` era
 * transpilado ESM→CJS e o require do SDK crashava: FUNCTION_INVOCATION_FAILED).
 */
import { AccessToken } from 'livekit-server-sdk';
import crypto from 'node:crypto';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://teravia.com.br',
  'https://www.teravia.com.br',
  'https://app.teravia.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

function setCors(res, origin) {
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

async function verifySupabaseJWT(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Rate-limit best-effort em memória p/ o exchange (o código É a credencial —
// corta força bruta óbvia; 10 chars base32 ≈ 50 bits, TTL 3h).
const _xrl = new Map();
function _exchangeAllowed(ip) {
  const now = Date.now();
  const arr = (_xrl.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 20) return false;
  arr.push(now);
  _xrl.set(ip, arr);
  if (_xrl.size > 5000) _xrl.clear();
  return true;
}

function _svcHeaders() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', 'apikey': k, 'Authorization': `Bearer ${k}` };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── EXCHANGE: /sala?c=<código> → { url, token, n } (sem JWT — o código autentica).
  // O token NUNCA aparece em URL (F3.3 opção b); o link curto cabe no WhatsApp.
  const exchange = req.body && req.body.exchange;
  if (exchange) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
    if (!_exchangeAllowed(ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' });
    if (!/^[a-z2-9]{8,16}$/i.test(String(exchange))) return res.status(400).json({ error: 'Código inválido' });
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/session_codes?code=eq.${encodeURIComponent(String(exchange).toLowerCase())}&select=url,patient_token,patient_name,expires_at&limit=1`,
        { headers: _svcHeaders() }
      );
      const rows = await r.json();
      const row = Array.isArray(rows) && rows[0];
      if (!row) return res.status(404).json({ error: 'Código não encontrado' });
      if (new Date(row.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'Código expirado' });
      return res.status(200).json({ url: row.url, token: row.patient_token, n: row.patient_name || '' });
    } catch (e) {
      console.error('[create-session-room] exchange falhou:', e.message);
      return res.status(502).json({ error: 'Falha ao resolver o código' });
    }
  }

  const user = await verifySupabaseJWT(req);
  if (!user) return res.status(401).json({ error: 'Autenticação necessária' });

  // .trim() defensivo: chaves coladas no painel podem vir com espaço/quebra de linha invisível,
  // o que quebraria a assinatura HMAC (o LiveKit rejeitaria com "invalid token").
  const KEY = (process.env.LIVEKIT_API_KEY || '').trim();
  const SECRET = (process.env.LIVEKIT_API_SECRET || '').trim();
  const URL = (process.env.LIVEKIT_URL || '').trim();
  if (!KEY || !SECRET || !URL) {
    return res.status(500).json({ error: 'LiveKit não configurado (LIVEKIT_API_KEY/SECRET/URL).' });
  }

  const { patientId, patientFirst } = req.body || {};
  const shortId = String(user.id || '').replace(/-/g, '').slice(0, 8);
  const roomName = `sess_${shortId}_${Date.now().toString(36)}`;
  const patIdentity = `paciente_${String(patientId || 'anon').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`;

  try {
    const mkToken = async (identity, name, metadata) => {
      const at = new AccessToken(KEY, SECRET, { identity, name, ttl: '3h', ...(metadata ? { metadata } : {}) });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
      return at.toJwt(); // async no SDK v2
    };
    // O token da paciente carrega o patientId COMPLETO no claim `metadata` (a identity
    // trunca o UUID em 24 chars). /api/consent verifica a assinatura deste JWT e usa
    // esse id para registrar o aceite REAL da paciente na sala (F3.5 lacuna 2).
    const [hostToken, patientToken] = await Promise.all([
      mkToken(`terapeuta_${shortId}`, 'Terapeuta'),
      mkToken(patIdentity, 'Paciente', patientId ? JSON.stringify({ patientId: String(patientId) }) : null),
    ]);

    // Código curto p/ o link compartilhado (/sala?c=…). Best-effort: se a tabela
    // session_codes não existir (migration 018 não aplicada), segue sem código e
    // o cliente cai no link longo tradicional — nada quebra.
    let patientCode = null;
    try {
      // 10 chars de alfabeto sem ambíguos (0/1/o/l/i) ≈ 49 bits — força bruta
      // inviável no TTL de 3h, e fácil de ditar por telefone se precisar.
      const _alf = 'abcdefghjkmnpqrstuvwxyz23456789';
      const code = Array.from(crypto.randomBytes(10)).map((b) => _alf[b % _alf.length]).join('');
      const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      // Limpa vencidos de passagem (mantém a tabela minúscula)
      await fetch(`${SUPA_URL}/rest/v1/session_codes?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
        { method: 'DELETE', headers: _svcHeaders() }).catch(() => {});
      const ins = await fetch(`${SUPA_URL}/rest/v1/session_codes`, {
        method: 'POST',
        headers: _svcHeaders(),
        body: JSON.stringify({
          code, url: URL, patient_token: patientToken,
          patient_name: (patientFirst ? String(patientFirst).slice(0, 40) : null),
          expires_at: expiresAt,
        }),
      });
      if (ins.ok) patientCode = code;
      else console.warn('[create-session-room] session_codes insert', ins.status, '(migration 018 aplicada?)');
    } catch (e) { console.warn('[create-session-room] código curto indisponível:', e.message); }

    return res.status(200).json({ url: URL, roomName, hostToken, patientToken, patientCode });
  } catch (err) {
    console.error('[create-session-room] geracao de token falhou:', err.message);
    return res.status(500).json({ error: 'Falha ao gerar token: ' + err.message });
  }
}
