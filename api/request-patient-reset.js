/**
 * TheraFlow — Serverless Function: Solicitar redefinição de senha do paciente
 * Deploy: Vercel → /api/request-patient-reset  (Node.js runtime)
 *
 * Fluxo de auto-recuperação do portal do paciente. Como o paciente pode logar
 * sem conta Supabase Auth (RPC portal_patient_login), não dá para usar o
 * resetPasswordForEmail nativo. Aqui geramos um token de uso único, guardamos
 * apenas o SHA-256 dele (patient_password_resets) e enviamos um email (Resend)
 * com o link /paciente?reset=TOKEN.
 *
 * Sempre responde { ok: true } — não revela se o email existe (anti-enumeração).
 *
 * Env vars (Vercel → Settings → Environment Variables):
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

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return fwd.split(',')[0].trim() || req.headers['x-real-ip'] || null;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Base do link de redefinição — usa o origin do request se confiável, senão produção
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
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá${pacienteNome ? `, <strong>${pacienteNome}</strong>` : ''} 🌱</p>
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
  // Retorna 500 para ficar visível em monitoramento; o frontend mostra a
  // mensagem neutra de qualquer forma (ignora o corpo da resposta).
  if (!SERVICE_KEY || !RESEND_KEY) {
    console.error('[reset-request] CONFIG: env ausente →', { SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY, RESEND_API_KEY: !!RESEND_KEY });
    return res.status(500).json({ error: 'reset_misconfigured', missing: { service: !SERVICE_KEY, resend: !RESEND_KEY } });
  }

  const email = (((req.body || {}).email) || '').trim().toLowerCase();
  // Validação simples de formato; resposta sempre neutra
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(200).json({ ok: true });
  }

  const hdrs = supaHeaders(SERVICE_KEY);

  try {
    // 1) Rate-limit leve: máx. 3 pedidos por email em 15 min
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const rlRes = await fetch(
      `${SUPA_URL}/rest/v1/patient_password_resets?email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(since)}&select=id`,
      { headers: hdrs }
    );
    // Tabela ausente é erro de CONFIG (independe do email → não vaza enumeração).
    // Esta query roda antes de sabermos se o email é um paciente, então é seguro
    // sinalizar 500 aqui. Causa clássica: migration 009 não rodada no Supabase.
    if (!rlRes.ok && rlRes.status === 404) {
      console.error('[reset-request] CONFIG: tabela patient_password_resets AUSENTE — rode backend/migrations/009 no Supabase SQL Editor.');
      return res.status(500).json({ error: 'reset_table_missing', hint: 'Rode a migration 009 no Supabase.' });
    }
    const recent = rlRes.ok ? await rlRes.json() : [];
    if (Array.isArray(recent) && recent.length >= 3) {
      console.log('[reset-request] Rate-limit atingido para', email);
      return res.status(200).json({ ok: true });
    }

    // 2) Procura paciente com esse email (qualquer terapeuta)
    const pr = await fetch(
      `${SUPA_URL}/rest/v1/patients?email=eq.${encodeURIComponent(email)}&select=id,name,email&limit=5`,
      { headers: hdrs }
    );
    const pacientes = pr.ok ? await pr.json() : [];
    if (!Array.isArray(pacientes) || pacientes.length === 0) {
      // Não existe — resposta neutra, sem enviar nada
      return res.status(200).json({ ok: true });
    }

    // 3) Gera token + grava só o hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const ins = await fetch(`${SUPA_URL}/rest/v1/patient_password_resets`, {
      method: 'POST',
      headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ email, token_hash: tokenHash, expires_at: expiresAt, ip: clientIp(req) }),
    });
    if (!ins.ok) {
      const t = await ins.text().catch(() => '');
      console.error('[reset-request] Falha ao gravar token:', ins.status, t.slice(0, 200));
      return res.status(200).json({ ok: true }); // neutro
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
      console.error('[reset-request] Resend error:', result.error);
    } else {
      console.log('[reset-request] Email enviado →', email, '| id:', result.data?.id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[reset-request] Erro:', e.message);
    return res.status(200).json({ ok: true }); // sempre neutro
  }
}
