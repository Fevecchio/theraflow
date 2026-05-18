/**
 * TheraFlow — Serverless Function: Envio de emails via Resend
 * Deploy: Vercel → /api/send-email  (Node.js runtime)
 *
 * Templates disponíveis:
 *   'invite'   — convite de sessão para o paciente (com link Whereby)
 *   'reminder' — lembrete 24h antes da sessão
 *   'portal'   — acesso ao portal do paciente (email + senha)
 *
 * Env vars necessárias (Vercel → Settings → Environment Variables):
 *   RESEND_API_KEY = re_xxxxxxxxxxxxxxxxx
 */

import { Resend } from 'resend';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://theraflow.com.br',
  'https://www.theraflow.com.br',
  'https://app.theraflow.com.br',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';
// Chave pública (anon/publishable) — já exposta no frontend, segura para usar aqui
const SUPA_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_ovqMsOm88TvulTD4eYTp0w_gCXoFDSl';

function setCors(res, origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function verifyCallerJWT(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_ANON_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

// ── Templates HTML ────────────────────────────────────────────────────────────

function tmplInvite({ terapeutaNome, terapeutaCrp, pacienteNome, data, hora, duracao, sessionLink }) {
  const linkHtml = sessionLink
    ? `<a href="${sessionLink}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">▶ Entrar na sessão</a>`
    : `<p style="color:#888;font-size:13px;margin-top:16px">O link da sala será enviado em breve.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">TheraFlow</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Confirmação de sessão</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong> 👋</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px">Sua sessão com <strong>${terapeutaNome}</strong>${terapeutaCrp ? ` (CRP ${terapeutaCrp})` : ''} foi agendada.</p>

      <div style="background:#f5f3ee;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:13px;color:#888;margin-bottom:4px">📅 Data e horário</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a">${data} às ${hora}</div>
        ${duracao ? `<div style="font-size:13px;color:#888;margin-top:4px">Duração: ${duracao} minutos</div>` : ''}
      </div>

      <div style="text-align:center">
        ${linkHtml}
      </div>

      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #f0f0f0;padding-top:16px">
        Em caso de dúvidas, responda este email ou contate seu terapeuta diretamente.<br>
        <em>Este email foi gerado automaticamente pelo TheraFlow.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function tmplReminder({ terapeutaNome, pacienteNome, data, hora, sessionLink }) {
  const linkHtml = sessionLink
    ? `<a href="${sessionLink}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">▶ Entrar na sessão</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#2c5f8a;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">TheraFlow</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Lembrete de sessão — amanhã</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong> 🕐</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px">Sua sessão com <strong>${terapeutaNome}</strong> é <strong>amanhã</strong>. Só passando para lembrar!</p>

      <div style="background:#f0f8ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:13px;color:#3b82f6;margin-bottom:4px">📅 Amanhã</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a">${data} às ${hora}</div>
      </div>

      ${linkHtml ? `<div style="text-align:center">${linkHtml}</div>` : ''}

      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #f0f0f0;padding-top:16px">
        <em>Lembrete automático gerado pelo TheraFlow.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function tmplPortal({ terapeutaNome, pacienteNome, email, senha, portalUrl }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">🌿 TheraFlow</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Seu portal está pronto</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong> 🌱</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px"><strong>${terapeutaNome}</strong> ativou o seu portal de acompanhamento no TheraFlow. Por lá você pode registrar seu humor, acompanhar exercícios e seu progresso entre as sessões.</p>

      <div style="background:#f5f3ee;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:12px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Seus dados de acesso</div>
        <div style="font-size:13px;color:#555;margin-bottom:6px">📧 Email: <strong style="color:#1a1a1a">${email}</strong></div>
        <div style="font-size:13px;color:#555">🔑 Senha: <strong style="color:#1a1a1a;background:#e8f0eb;padding:2px 8px;border-radius:6px;font-family:monospace">${senha}</strong></div>
      </div>

      <div style="text-align:center">
        <a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">🌿 Acessar meu portal</a>
      </div>

      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #f0f0f0;padding-top:16px">
        Recomendamos trocar sua senha após o primeiro acesso.<br>
        <em>Este email foi gerado automaticamente pelo TheraFlow.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('[send-email] RESEND_API_KEY ausente');
    return res.status(500).json({ error: 'Email service não configurado — adicione RESEND_API_KEY nas env vars do Vercel.' });
  }

  // Valida JWT do terapeuta
  const caller = await verifyCallerJWT(req);
  if (!caller) return res.status(401).json({ error: 'Autenticação necessária' });

  const { template, to, data } = req.body || {};

  if (!template || !to) {
    return res.status(400).json({ error: '`template` e `to` são obrigatórios' });
  }

  const resend = new Resend(RESEND_KEY);

  let subject, html;

  if (template === 'invite') {
    subject = `Sessão confirmada — ${data?.data || ''} às ${data?.hora || ''}`;
    html = tmplInvite(data || {});
  } else if (template === 'reminder') {
    subject = `Lembrete: sua sessão é amanhã às ${data?.hora || ''}`;
    html = tmplReminder(data || {});
  } else if (template === 'portal') {
    subject = `${data?.terapeutaNome || 'Seu terapeuta'} ativou seu portal TheraFlow`;
    html = tmplPortal(data || {});
  } else {
    return res.status(400).json({ error: `Template desconhecido: ${template}` });
  }

  try {
    // RESEND_FROM: use noreply@theraflow.com.br após verificar o domínio na Resend
    const fromAddr = process.env.RESEND_FROM || 'TheraFlow <onboarding@resend.dev>';
    const result = await resend.emails.send({
      from: fromAddr,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error('[send-email] Resend error:', result.error);
      return res.status(502).json({ error: result.error.message });
    }

    console.log('[send-email] Enviado:', template, '→', to, '| id:', result.data?.id);
    return res.status(200).json({ ok: true, id: result.data?.id });
  } catch(e) {
    console.error('[send-email] Exceção:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
