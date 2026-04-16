/**
 * TheraFlow — Serverless Function: Proxy da Google Gemini API
 * Deploy: Vercel → /api/briefing  (Node.js runtime)
 *
 * A chave gemini_key fica apenas no servidor (variável de ambiente).
 * Settings → Environment Variables → gemini_key = AIza...
 */

const ALLOWED_ORIGINS = [
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'https://app.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

// Cache em memória: evita chamar Gemini repetidamente para o mesmo paciente
const briefingCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}

function setCors(res, origin) {
  const allowed = isAllowedOrigin(origin) ? (origin || ALLOWED_ORIGINS[0]) : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function callGemini(url, payload) {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
  let r = await fetch(url, opts);
  // Retry único após 429 (rate limit temporário)
  if (r.status === 429) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    r = await fetch(url, opts);
  }
  return r;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { systemPrompt, userPrompt, patientData } = req.body || {};

  if (!userPrompt || typeof userPrompt !== 'string') {
    return res.status(400).json({ error: 'userPrompt is required' });
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.gemini_key;
  if (!GEMINI_KEY) {
    console.error('[briefing] Nenhuma chave Gemini configurada');
    return res.status(500).json({ error: 'Service misconfigured: gemini_key ausente' });
  }

  // Verificar cache
  const cacheKey = (patientData?.name || '') + '|' + userPrompt.substring(0, 60);
  const cached = briefingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[briefing] cache hit para', patientData?.name);
    return res.status(200).json({ content: cached.content, cached: true });
  }

  const system = systemPrompt || buildDefaultSystem(patientData);
  const fullPrompt = system + '\n\n' + userPrompt;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  let geminiRes;
  try {
    geminiRes = await callGemini(url, payload);
  } catch (err) {
    console.error('[briefing] Fetch para Gemini falhou:', err.message);
    return res.status(502).json({ error: 'Upstream fetch error: ' + err.message });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    console.error('[briefing] Gemini HTTP', geminiRes.status, errText.substring(0, 300));
    return res.status(502).json({ error: `Gemini ${geminiRes.status}: ${errText.substring(0, 120)}` });
  }

  const data = await geminiRes.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (content) {
    // Limita cache a 100 entries — remove a entrada mais antiga se necessário
    if (briefingCache.size >= 100) {
      briefingCache.delete(briefingCache.keys().next().value);
    }
    briefingCache.set(cacheKey, { content, ts: Date.now() });
  }

  return res.status(200).json({ content });
}

function buildDefaultSystem(p) {
  if (!p) return 'Você é um assistente clínico para psicólogos brasileiros. Responda em português, de forma objetiva e clinicamente fundamentada.';
  return `Você é um assistente de supervisão clínica para psicólogos brasileiros.
Abordagem do terapeuta: ${p.abordagem || 'não especificada'}.
Paciente: ${p.name || 'não identificado'}, ${p.sessions || 0} sessões realizadas.
Queixa principal: ${p.notes || 'não informada'}.
Humor recente: ${p.mood ?? 'não registrado'}/10.
CID: ${p.cid || 'não informado'}.

Responda sempre em português brasileiro, com linguagem clínica adequada à abordagem informada.
Seja objetivo, fundamentado e ético. Não faça diagnósticos, apenas apoie a reflexão clínica.`;
}
