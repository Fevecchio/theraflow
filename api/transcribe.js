/**
 * Teravia — Serverless: transcreve o áudio da sessão via Groq Whisper (fallback de nuvem, v1).
 * Deploy: Vercel → /api/transcribe (Node.js runtime)
 *
 * Recebe o áudio (binário) no CORPO da requisição (Content-Type = audio/webm etc.),
 * encaminha ao Groq e devolve { text }. O áudio NÃO é armazenado — é processado e descartado.
 *
 * NOTA de arquitetura: no desktop (v2) a transcrição roda ON-DEVICE no navegador e este
 * endpoint deixa de ser chamado; ele fica como fallback para celular/hardware fraco.
 *
 * Env: GROQ_API_KEY, SUPABASE_SERVICE_ROLE_KEY (já existe)
 */
export const config = { api: { bodyParser: false }, maxDuration: 60 };

// Rate-limit in-memory por instância (best-effort; padrão do api/briefing.js).
const _rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (_rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return { allowed: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  arr.push(now);
  _rlBuckets.set(key, arr);
  if (_rlBuckets.size > 5000) _rlBuckets.clear();
  return { allowed: true };
}

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

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Gate de plano (F14): trial esgotado não consome mais transcrição (Groq).
async function planBlocksAI(userId) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${userId}&select=plano,sessoes_usadas`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    });
    if (!r.ok) return false;
    const rows = await r.json();
    const u = Array.isArray(rows) && rows[0];
    return !!u && u.plano === 'trial' && (u.sessoes_usadas || 0) >= 20;
  } catch (_) { return false; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifySupabaseJWT(req);
  if (!user) return res.status(401).json({ error: 'Autenticação necessária' });
  if (await planBlocksAI(user.id)) {
    return res.status(402).json({ error: 'Trial esgotado. Assine o Pro para continuar usando a IA.' });
  }

  // Rate-limit: transcrição é cara (Groq). 45/min/usuário: com a segmentação (~4min
  // por segmento, 2 faixas), uma sessão de 80min gera ~40 segmentos processados em
  // rajada no encerrar — 20/min derrubava sessões longas legítimas.
  const rl = rateLimit(`transcribe:${user.id}`, 45, 60 * 1000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Muitas transcrições em pouco tempo. Aguarde um instante.' });
  }

  const GROQ = process.env.GROQ_API_KEY;
  if (!GROQ) return res.status(500).json({ error: 'Groq não configurado (GROQ_API_KEY).' });

  let audio;
  try {
    audio = await readRawBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Falha ao ler o áudio: ' + e.message });
  }
  if (!audio || !audio.length) return res.status(400).json({ error: 'Áudio vazio.' });
  // Groq: 25 MB (free) / 100 MB (dev). Guard defensivo.
  if (audio.length > 24 * 1024 * 1024) {
    return res.status(413).json({ error: 'Áudio excede 24 MB — comprima ou fatie a sessão.' });
  }

  const mime = req.headers['content-type'] || 'audio/webm';
  // ?segments=1 → verbose_json (timestamps por trecho). Usado pela transcrição com separação
  // de falantes: o cliente grava terapeuta e paciente em FAIXAS separadas, transcreve cada uma
  // e intercala os segmentos por tempo — rótulo de falante "de graça", sem modelo de diarização.
  const wantSegments = /[?&]segments=1\b/.test(req.url || '');

  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), 'sessao.webm');
  // large-v3 COMPLETO (não turbo): o turbo trocava palavras em pt-BR no co-teste
  // ("feriado"→"criado"); custo/sessão segue centavos e a transcrição é pós-sessão,
  // então a latência extra não aparece para o usuário. Prompt curto dá contexto de
  // vocabulário ao Whisper — reduz confusões acústicas sem induzir conteúdo.
  form.append('model', 'whisper-large-v3');
  form.append('language', 'pt');
  form.append('prompt', 'Transcrição de uma sessão de psicoterapia em português do Brasil, conversa entre psicóloga e paciente.');
  form.append('response_format', wantSegments ? 'verbose_json' : 'text');

  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ}` },
      body: form,
    });
    if (!r.ok) {
      const errTxt = await r.text().catch(() => '');
      console.error('[transcribe] Groq HTTP', r.status, errTxt.slice(0, 200));
      return res.status(502).json({ error: `Groq ${r.status}: ${errTxt.slice(0, 200)}` });
    }
    // LGPD: trilha de auditoria do ato mais sensível (processamento de áudio de
    // sessão) — fire-and-forget, nunca derruba a transcrição. Só metadados: o
    // conteúdo não entra no log.
    try {
      const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
      fetch(`${SUPA_URL}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: svc, Authorization: `Bearer ${svc}`, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, acao: 'session_transcribed', detalhes: { segments: !!wantSegments } }),
      }).catch(() => {});
    } catch (_) {}
    if (wantSegments) {
      const j = await r.json(); // verbose_json → { text, segments: [{start,end,text,no_speech_prob,...}] }
      const segments = Array.isArray(j.segments)
        ? j.segments.map(s => ({ start: s.start, end: s.end, text: s.text, no_speech_prob: s.no_speech_prob }))
        : [];
      return res.status(200).json({ text: j.text || '', segments });
    }
    const text = await r.text(); // response_format=text → texto puro
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[transcribe] fetch Groq falhou:', err.message);
    return res.status(502).json({ error: 'Upstream error: ' + err.message });
  }
}
