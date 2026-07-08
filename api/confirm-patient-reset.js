/**
 * TheraFlow — Serverless Function: Confirmar redefinição de senha do paciente
 * Deploy: Vercel → /api/confirm-patient-reset  (Node.js runtime)
 *
 * Recebe { token, newPassword } da tela /paciente?reset=TOKEN. Acha o paciente
 * cujo metadata.resetTokenHash bate com o SHA-256 do token (não usado, não
 * expirado), grava a nova senha como hash (mesmo formato do _portalHash do
 * frontend) e limpa o token (uso único). Se o paciente tiver conta Supabase
 * Auth, atualiza a senha lá também.
 *
 * Sem tabela/migration nova — tudo no metadata da tabela `patients`, que já existe.
 * Roda com SUPABASE_SERVICE_ROLE_KEY (ignora RLS).
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

// Mesmo algoritmo do _portalHash (js/17-misc.js): SHA-256 de 'tf-portal:'+senha, hex
function portalHash(senha) {
  return sha256('tf-portal:' + senha);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[reset-confirm] SUPABASE_SERVICE_ROLE_KEY ausente');
    return res.status(500).json({ error: 'Service misconfigured' });
  }

  const { token, newPassword } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token ausente' });
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }
  const senha = newPassword.trim();

  const hdrs = supaHeaders(SERVICE_KEY);
  const tokenHash = sha256(token);

  try {
    // 1) Acha paciente(s) cujo metadata.resetTokenHash bate com o token
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/patients?metadata->>resetTokenHash=eq.${encodeURIComponent(tokenHash)}&select=id,email,metadata&limit=5`,
      { headers: hdrs }
    );
    const pacientes = pr.ok ? await pr.json() : [];
    if (!Array.isArray(pacientes) || pacientes.length === 0) {
      return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
    }

    // 2) Valida expiração (1h)
    const exp = Number((pacientes[0].metadata || {}).resetTokenExp || 0);
    if (!exp || Date.now() > exp) {
      return res.status(400).json({ error: 'Link expirado. Solicite uma nova redefinição.' });
    }

    const newHash = portalHash(senha);

    // 3) Grava a nova senha e LIMPA o token (uso único) em cada paciente
    for (const p of pacientes) {
      const merged = Object.assign({}, (p.metadata || {}), {
        portalPasswordHash: newHash,
        portalPassword: null,
        pwdTemp: false, // senha definida pelo próprio paciente no reset (F3.2)
        resetTokenHash: null,
        resetTokenExp: null,
        resetRequestedAt: null,
      });
      await fetch(`${SUPA_URL}/rest/v1/patients?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ metadata: merged }),
      });

      // 4) Se houver conta Auth vinculada, atualiza a senha lá também (best-effort)
      try {
        const lr = await fetch(
          `${SUPA_URL}/rest/v1/patient_users?patient_id=eq.${p.id}&select=auth_user_id&limit=1`,
          { headers: hdrs }
        );
        const links = lr.ok ? await lr.json() : [];
        if (Array.isArray(links) && links.length > 0 && links[0].auth_user_id) {
          await fetch(`${SUPA_URL}/auth/v1/admin/users/${links[0].auth_user_id}`, {
            method: 'PUT',
            headers: hdrs,
            body: JSON.stringify({ password: senha }),
          });
        }
      } catch (e) {
        console.warn('[reset-confirm] Auth update best-effort falhou:', e.message);
      }
    }

    console.log('[reset-confirm] Senha redefinida (', pacientes.length, 'registro(s) ).');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[reset-confirm] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
}
