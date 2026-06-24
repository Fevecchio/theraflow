/**
 * TheraFlow — Serverless Function: Confirmar redefinição de senha do paciente
 * Deploy: Vercel → /api/confirm-patient-reset  (Node.js runtime)
 *
 * Recebe { token, newPassword } da tela /paciente?reset=TOKEN. Valida o token
 * (uso único, não expirado), grava a nova senha como hash no metadata do
 * paciente (mesmo formato do _portalHash do frontend, para o login por RPC
 * aceitar) e — se o paciente tiver conta Supabase Auth — atualiza a senha lá
 * também, mantendo os dois caminhos de login em sincronia.
 *
 * Roda com SUPABASE_SERVICE_ROLE_KEY (ignora RLS). newPassword trafega em texto
 * sobre HTTPS, consistente com invite-patient.js e o email de acesso ao portal.
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
  const nowIso = new Date().toISOString();
  const tokenHash = sha256(token);

  try {
    // 1) Valida o token (não usado, não expirado)
    const tr = await fetch(
      `${SUPA_URL}/rest/v1/patient_password_resets?token_hash=eq.${encodeURIComponent(tokenHash)}&used_at=is.null&expires_at=gt.${encodeURIComponent(nowIso)}&select=id,email&limit=1`,
      { headers: hdrs }
    );
    const rows = tr.ok ? await tr.json() : [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
    }
    const resetRow = rows[0];
    const email = (resetRow.email || '').toLowerCase();
    const newHash = portalHash(senha);

    // 2) Atualiza o hash no metadata de cada paciente com esse email
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/patients?email=eq.${encodeURIComponent(email)}&select=id,metadata`,
      { headers: hdrs }
    );
    const pacientes = pr.ok ? await pr.json() : [];
    if (!Array.isArray(pacientes) || pacientes.length === 0) {
      // Token válido mas paciente sumiu — marca usado e responde erro suave
      await fetch(`${SUPA_URL}/rest/v1/patient_password_resets?id=eq.${resetRow.id}`, {
        method: 'PATCH', headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ used_at: nowIso }),
      }).catch(() => {});
      return res.status(400).json({ error: 'Conta não encontrada. Fale com seu terapeuta.' });
    }

    for (const p of pacientes) {
      const merged = Object.assign({}, (p.metadata || {}), {
        portalPasswordHash: newHash,
        portalPassword: null,
      });
      await fetch(`${SUPA_URL}/rest/v1/patients?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ metadata: merged }),
      });

      // 3) Se houver conta Auth vinculada, atualiza a senha lá também (best-effort)
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

    // 4) Marca o token como usado (uso único)
    await fetch(`${SUPA_URL}/rest/v1/patient_password_resets?id=eq.${resetRow.id}`, {
      method: 'PATCH',
      headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ used_at: nowIso }),
    });

    console.log('[reset-confirm] Senha redefinida para', email, '(', pacientes.length, 'registro(s) )');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[reset-confirm] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
}
