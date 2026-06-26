/**
 * TheraFlow — Serverless Function: Solicitar redefinição de senha do paciente
 * Deploy: Vercel → /api/request-patient-reset  (Node.js runtime)
 *
 * Fluxo de auto-recuperação do portal do paciente. O paciente pode logar sem
 * conta Supabase Auth (RPC portal_patient_login), então não usamos o
 * resetPasswordForEmail nativo. Geramos um token de uso único e guardamos
 * apenas o SHA-256 dele DENTRO do metadata do próprio paciente (tabela
 * `patients`, que já existe) — sem precisar de tabela/migration nova.
 *
 * Sempre responde { ok: true } — não revela se o email existe (anti-enumeração).
 *
 * Env vars (Vercel):
 *   SUPABASE_SERVICE_ROLE_KEY  (obrigatória — ignora RLS)
 *   RESEND_API_KEY             (obrigatória — envio do email)
 *   RESEND_FROM                (opcional — default onboarding@resend.dev)
 */

import { Resend } from 'resend';
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

// Escapa o nome (controlado pelo terapeuta) antes de injetar no HTML do email.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return fwd.split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
}

// Rate-limit in-memory por IP (best-effort; ver nota nos demais endpoints). Como
// este endpoint é público e envia email (custo), limita rajadas de um mesmo IP.
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

function resolveBaseUrl(origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin) && /^https:\/\//.test(origin)) return origin;
  return 'https://theraflow-one.vercel.app';
}

function tmplReset({ pacienteNome, resetUrl }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">🌿 TheraFlow</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Redefinição de senha</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá${pacienteNome ? `, <strong>${esc(pacienteNome)}</strong>` : ''} 🌱</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px">Recebemos um pedido para redefinir a senha do seu portal. Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>

      <div style="text-align:center;margin-bottom:24px">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">🔑 Redefinir minha senha</a>
      </div>

      <p style="font-size:12px;color:#888;line-height:1.6;margin:0 0 8px">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
      <p style="font-size:12px;color:#4a7c59;word-break:break-all;margin:0 0 24px">${resetUrl}</p>

      <p style="font-size:12px;color:#aaa;margin-top:24px;border-top:1px solid #f0f0f0;padding-top:16px">
        Se você não pediu isso, pode ignorar este email — sua senha continua a mesma.<br>
        <em>Este email foi gerado automaticamente pelo TheraFlow.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  // Erro de CONFIGURAÇÃO (independe do email existir → não vaza enumeração).
  if (!SERVICE_KEY || !RESEND_KEY) {
    console.error('[reset-request] CONFIG: env ausente →', { SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY, RESEND_API_KEY: !!RESEND_KEY });
    return res.status(500).json({ error: 'reset_misconfigured', missing: { service: !SERVICE_KEY, resend: !RESEND_KEY } });
  }

  const email = (((req.body || {}).email) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(200).json({ ok: true });
  }

  // Rate-limit por IP (10/min). Resposta neutra (200 {ok:true}) p/ preservar a
  // anti-enumeração — o limite corta custo de email sem revelar nada ao chamador.
  if (!rateLimit(`reset:${clientIp(req)}`, 10, 60 * 1000)) {
    console.log('[reset-request] Rate-limit por IP atingido (resposta neutra).');
    return res.status(200).json({ ok: true });
  }

  const hdrs = supaHeaders(SERVICE_KEY);

  try {
    // 1) Procura paciente(s) com esse email (a tabela patients já existe)
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/patients?email=eq.${encodeURIComponent(email)}&select=id,name,email,metadata&limit=5`,
      { headers: hdrs }
    );
    if (!pr.ok) {
      const t = await pr.text().catch(() => '');
      console.error('[reset-request] CONFIG: falha ao consultar patients:', pr.status, t.slice(0, 200));
      return res.status(500).json({ error: 'patients_query_failed' });
    }
    const pacientes = await pr.json();
    if (!Array.isArray(pacientes) || pacientes.length === 0) {
      // Email não é paciente — resposta neutra, sem enviar nada
      console.log('[reset-request] Email sem paciente correspondente (resposta neutra).');
      return res.status(200).json({ ok: true });
    }

    // 2) Rate-limit leve: se houve pedido nos últimos 30s, não reenvia
    const agora = Date.now();
    const ultimo = Number((pacientes[0].metadata || {}).resetRequestedAt || 0);
    if (ultimo && (agora - ultimo) < 30 * 1000) {
      console.log('[reset-request] Throttle (<30s) para', email);
      return res.status(200).json({ ok: true });
    }

    // 3) Gera token e grava só o hash no metadata de cada paciente desse email
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const exp = agora + 60 * 60 * 1000; // 1h

    for (const p of pacientes) {
      const merged = Object.assign({}, (p.metadata || {}), {
        resetTokenHash: tokenHash,
        resetTokenExp: exp,
        resetRequestedAt: agora,
      });
      const up = await fetch(`${SUPA_URL}/rest/v1/patients?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: { ...hdrs, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ metadata: merged }),
      });
      if (!up.ok) {
        const t = await up.text().catch(() => '');
        console.error('[reset-request] Falha ao gravar token no metadata:', up.status, t.slice(0, 200));
      }
    }

    // 4) Envia o email com o link
    const baseUrl = resolveBaseUrl(origin);
    const resetUrl = `${baseUrl}/paciente?reset=${rawToken}`;
    const pacienteNome = (pacientes[0].name || '').split(' ')[0] || '';

    const resend = new Resend(RESEND_KEY);
    const fromAddr = process.env.RESEND_FROM || 'TheraFlow <onboarding@resend.dev>';
    const result = await resend.emails.send({
      from: fromAddr,
      to: email,
      subject: 'Redefinir a senha do seu portal TheraFlow',
      html: tmplReset({ pacienteNome, resetUrl }),
    });
    if (result.error) {
      console.error('[reset-request] Resend error:', JSON.stringify(result.error));
    } else {
      console.log('[reset-request] Email enviado →', email, '| id:', result.data?.id, '| from:', fromAddr);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[reset-request] Erro:', e.message);
    return res.status(200).json({ ok: true }); // sempre neutro
  }
}
