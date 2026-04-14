/**
 * TheraFlow — Edge Function: Proxy da Google Gemini API
 * Deploy: Vercel → /api/briefing
 *
 * Substitui a chamada direta do cliente para a IA.
 * A chave gemini_key fica apenas no servidor (variável de ambiente).
 *
 * Como configurar no Vercel:
 *   Settings → Environment Variables → gemini_key = AIza...
 *
 * Como obter a chave (grátis):
 *   aistudio.google.com → Get API Key → Create API key
 *
 * Modelo: gemini-1.5-flash (grátis: 1.500 req/dia, 15 RPM)
 */

export const config = { runtime: 'edge' };

const ALLOWED_ORIGINS = [
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'https://app.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'null',
];

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // permite qualquer subdomínio *.vercel.app (previews e deploys do projeto)
  if (origin && origin.endsWith('.vercel.app')) return true;
  return false;
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405, origin);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400, origin);
  }

  const { systemPrompt, userPrompt, patientData } = body;

  if (!userPrompt || typeof userPrompt !== 'string') {
    return jsonError('userPrompt is required', 400, origin);
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.gemini_key;
  if (!GEMINI_KEY) {
    console.error('[briefing] gemini_key não configurada');
    return jsonError('Service misconfigured', 500, origin);
  }

  const system = systemPrompt || buildDefaultSystem(patientData);
  const fullPrompt = system + '\n\n' + userPrompt;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

  let geminiRes;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });
  } catch (err) {
    console.error('[briefing] Erro ao chamar Gemini:', err);
    return jsonError('Upstream error', 502, origin);
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    console.error('[briefing] Gemini retornou erro:', geminiRes.status, errText);
    return jsonError('Gemini API error', 502, origin);
  }

  const data = await geminiRes.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return new Response(JSON.stringify({ content }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function corsHeaders(origin) {
  const allowed = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(message, status, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
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
