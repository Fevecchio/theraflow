/**
 * TheraFlow — Serverless: cria a sala de vídeo LiveKit e gera os tokens de acesso.
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

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'https://app.theraflow.com.br',
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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const { patientId } = req.body || {};
  const shortId = String(user.id || '').replace(/-/g, '').slice(0, 8);
  const roomName = `sess_${shortId}_${Date.now().toString(36)}`;
  const patIdentity = `paciente_${String(patientId || 'anon').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`;

  try {
    const mkToken = async (identity, name) => {
      const at = new AccessToken(KEY, SECRET, { identity, name, ttl: '3h' });
      at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
      return at.toJwt(); // async no SDK v2
    };
    const [hostToken, patientToken] = await Promise.all([
      mkToken(`terapeuta_${shortId}`, 'Terapeuta'),
      mkToken(patIdentity, 'Paciente'),
    ]);
    return res.status(200).json({ url: URL, roomName, hostToken, patientToken });
  } catch (err) {
    console.error('[create-session-room] geracao de token falhou:', err.message);
    return res.status(500).json({ error: 'Falha ao gerar token: ' + err.message });
  }
}
