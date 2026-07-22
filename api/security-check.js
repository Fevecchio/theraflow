/**
 * Teravia — Serverless: painel de anomalias de segurança (auditoria 22/07/2026).
 * Deploy: Vercel → /api/security-check (Node.js runtime)
 *
 * Chama a função monitor_seguranca() (migration 036) com a service role, compara
 * os 4 sinais com limiares e devolve { ok, sinais, alertas }. Usado por uma rotina
 * agendada (1x/dia) que avisa o fundador se algo estourar — e pelo próprio fundador
 * sob demanda.
 *
 * A função monitor_seguranca NÃO é pública (só service role); por isso a leitura
 * passa por este endpoint, gated. Não devolve NENHUM dado clínico — só 4 contadores.
 *
 * Auth: JWT do fundador (dono) OU header x-diag-secret == DIAG_SECRET.
 * Env: SUPABASE_SERVICE_ROLE_KEY (obrigatória), DIAG_SECRET (p/ a rotina),
 *      OWNER_EMAIL (opcional — restringe o acesso por JWT a essa conta; default: o fundador).
 */

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'lealb5@hotmail.com').toLowerCase();

// Limiares (espelham os comentários da migration 036; ajustar conforme cresce).
const LIMIARES = {
  logins_falhos_15min: 30,  // brute-force no portal
  acessos_negados_24h: 5,   // varredura de IDOR
  contas_novas_24h: 20,     // abuso de cadastro (hoje: 10 fundadores)
  resets_senha_24h: 5,      // account-takeover em massa
};

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

// Autoriza: DIAG_SECRET (para a rotina) OU JWT do dono (para o fundador logado).
async function isAuthorized(req, serviceKey) {
  const DIAG_SECRET = process.env.DIAG_SECRET || '';
  const secret = req.headers['x-diag-secret'] || (req.body || {}).secret || '';
  if (DIAG_SECRET && secret === DIAG_SECRET) return true;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !serviceKey) return false;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return String(u.email || '').toLowerCase() === OWNER_EMAIL; // só o dono
  } catch (_) { return false; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Service misconfigured' });

  if (!(await isAuthorized(req, SERVICE_KEY))) {
    return res.status(401).json({ error: 'Não autorizado (JWT do dono ou x-diag-secret).' });
  }

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/monitor_seguranca`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: '{}',
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(502).json({ error: 'monitor_seguranca falhou (migration 036 aplicada?)', detalhe: t.slice(0, 160) });
    }
    const rows = await r.json();
    const s = (Array.isArray(rows) ? rows[0] : rows) || {};
    const sinais = {
      logins_falhos_15min: s.logins_falhos_15min || 0,
      acessos_negados_24h: s.acessos_negados_24h || 0,
      contas_novas_24h: s.contas_novas_24h || 0,
      resets_senha_24h: s.resets_senha_24h || 0,
    };
    const alertas = [];
    for (const k of Object.keys(LIMIARES)) {
      if (sinais[k] > LIMIARES[k]) {
        alertas.push({ sinal: k, valor: sinais[k], limiar: LIMIARES[k] });
      }
    }
    return res.status(200).json({ ok: true, alerta: alertas.length > 0, sinais, alertas, verificado_em: new Date().toISOString() });
  } catch (e) {
    console.error('[security-check] erro:', e.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
