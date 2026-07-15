/**
 * Teravia — Serverless Function: Envio de emails via Resend
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
  'https://teravia.com.br',
  'https://www.teravia.com.br',
  'https://app.teravia.com.br',
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

// Rate-limit in-memory (best-effort). Persiste na instância "quente" do Vercel;
// instâncias frias têm estado próprio — barreira anti-rajada barata, não limite
// distribuído. Para limite forte/global, usar Vercel KV/Upstash no futuro.
const _rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (_rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    return { allowed: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  _rlBuckets.set(key, arr);
  if (_rlBuckets.size > 5000) _rlBuckets.clear();
  return { allowed: true };
}

// Escapa valores controlados pelo caller antes de injetar no HTML do email
// (evita quebra de layout e phishing via conteúdo malicioso nos campos).
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// Só aceita URLs http(s) em atributos href (bloqueia javascript:, data:, etc.).
function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s.replace(/"/g, '%22') : '';
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

// TODOS os destinatários, normalizados (Resend aceita string ou array). O envio
// usava só normalizeTo(to)[0] na validação MAS mandava o array `to` INTEIRO para
// a Resend → dava para colar vítimas depois de um paciente legítimo. Agora a
// validação cobre a lista toda e o envio usa só o que foi aprovado.
function normalizeAll(to) {
  const arr = Array.isArray(to) ? to : [to];
  return arr.map((x) => String(x == null ? '' : x).trim().toLowerCase()).filter(Boolean);
}
function normalizeTo(to) { return normalizeAll(to)[0] || ''; }

// Anti-abuso: o terapeuta só pode enviar para o email de um PACIENTE SEU.
// Sem isso, qualquer terapeuta logado poderia disparar emails do Teravia (com
// dados controlados) para endereços arbitrários — vetor de spam/phishing.
//
// Retorna { ok: true } se autorizado; { ok: false } se o destinatário
// comprovadamente não é paciente do caller; { ok: true, soft: true } quando a
// verificação não pôde ser feita por erro técnico (config/rede) — nesse caso
// liberamos (fail-open) para não bloquear envios legítimos por instabilidade,
// apenas logando. É proteção anti-abuso, não barreira de dados sensíveis.
// Retorna { ok, allowed } — `allowed` é a lista de emails APROVADOS (só pacientes
// do caller). FAIL-CLOSED (auditoria adversarial 12/07): sem service key, erro de
// rede ou conta sem pacientes → NEGA. O fail-open anterior transformava conta
// nova (0 pacientes) num relay de phishing com a marca Teravia.
async function callerOwnsRecipient(callerId, to) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[send-email] SERVICE_ROLE ausente — negando (fail-closed).');
    return { ok: false };
  }
  const targets = normalizeAll(to);
  if (!targets.length) return { ok: false };
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/patients?user_id=eq.${encodeURIComponent(callerId)}&select=email`,
      { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('[send-email] Falha ao validar destinatário (fail-closed):', r.status, t.slice(0, 120));
      return { ok: false };
    }
    const rows = await r.json();
    const emails = new Set((Array.isArray(rows) ? rows : [])
      .map((x) => String(x.email || '').trim().toLowerCase()).filter(Boolean));
    // TODOS os destinatários precisam ser pacientes do caller (bloqueia o bypass
    // por array). Envio usa só os aprovados.
    const allowed = targets.filter((t) => emails.has(t));
    return { ok: allowed.length > 0 && allowed.length === targets.length, allowed };
  } catch (e) {
    console.error('[send-email] Exceção ao validar destinatário (fail-closed):', e.message);
    return { ok: false };
  }
}

// ── Templates HTML ────────────────────────────────────────────────────────────

function tmplInvite({ terapeutaNome, terapeutaCrp, pacienteNome, data, hora, duracao, sessionLink }) {
  const safeLink = safeUrl(sessionLink);
  const linkHtml = safeLink
    ? `<a href="${safeLink}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">▶ Entrar na sessão</a>`
    : `<p style="color:#888;font-size:13px;margin-top:16px">O link da sala será enviado em breve.</p>`;
  terapeutaNome = esc(terapeutaNome); terapeutaCrp = esc(terapeutaCrp);
  pacienteNome = esc(pacienteNome); data = esc(data); hora = esc(hora); duracao = esc(duracao);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">Teravia</div>
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
        <em>Este email foi gerado automaticamente pelo Teravia.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function tmplReminder({ terapeutaNome, pacienteNome, data, hora, sessionLink }) {
  const safeLink = safeUrl(sessionLink);
  const linkHtml = safeLink
    ? `<a href="${safeLink}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">▶ Entrar na sessão</a>`
    : '';
  terapeutaNome = esc(terapeutaNome); pacienteNome = esc(pacienteNome); data = esc(data); hora = esc(hora);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#2c5f8a;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">Teravia</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Lembrete de sessão — amanhã</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong> 🕐</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px">Sua sessão com <strong>${terapeutaNome}</strong> é <strong>amanhã</strong>. Só passando para lembrar! No horário da sessão, a sala de vídeo estará disponível no seu portal.</p>

      <div style="background:#f0f8ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:13px;color:#3b82f6;margin-bottom:4px">📅 Amanhã</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a">${data} às ${hora}</div>
      </div>

      ${linkHtml ? `<div style="text-align:center">${linkHtml}</div>` : ''}

      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #f0f0f0;padding-top:16px">
        <em>Lembrete automático gerado pelo Teravia.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function tmplReminder15({ terapeutaNome, pacienteNome, hora, sessionLink }) {
  const safeLink = safeUrl(sessionLink);
  const linkHtml = safeLink
    ? `<a href="${safeLink}" style="display:inline-block;margin-top:20px;padding:14px 28px;background:#4a7c59;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">▶ Entrar na sessão</a>`
    : '';
  terapeutaNome = esc(terapeutaNome); pacienteNome = esc(pacienteNome); hora = esc(hora);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">Teravia</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Sua sessão começa em instantes</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong></p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px">Sua sessão com <strong>${terapeutaNome}</strong> começa <strong>em 15 minutos</strong>, às <strong>${hora}</strong>. Encontre um lugar tranquilo e prepare fones de ouvido, se puder. A sala de vídeo já vai estar disponível no seu portal.</p>

      ${linkHtml ? `<div style="text-align:center">${linkHtml}</div>` : ''}

      <p style="font-size:12px;color:#aaa;margin-top:32px;border-top:1px solid #f0f0f0;padding-top:16px">
        <em>Lembrete automático gerado pelo Teravia.</em>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function tmplPortal({ terapeutaNome, pacienteNome, email, senha, portalUrl }) {
  const safePortal = safeUrl(portalUrl) || 'https://theraflow-one.vercel.app/paciente';
  terapeutaNome = esc(terapeutaNome); pacienteNome = esc(pacienteNome); email = esc(email); senha = esc(senha);
  portalUrl = safePortal;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#4a7c59;padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-.3px">🌿 Teravia</div>
      <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Seu portal está pronto</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px">Olá, <strong>${pacienteNome}</strong> 🌱</p>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 24px"><strong>${terapeutaNome}</strong> ativou o seu portal de acompanhamento no Teravia. Por lá você pode registrar seu humor, acompanhar exercícios e seu progresso entre as sessões.</p>

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
        <em>Este email foi gerado automaticamente pelo Teravia.</em>
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

  // Rate-limit por usuário: 30 emails/min cobre o pior caso legítimo (agendar várias
  // sessões de uma vez) e corta abuso de envio em massa.
  const rl = rateLimit(`send-email:${caller.id}`, 30, 60 * 1000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Muitos envios em sequência. Aguarde um instante.' });
  }

  const { template, to, data } = req.body || {};

  if (!template || !to) {
    return res.status(400).json({ error: '`template` e `to` são obrigatórios' });
  }

  // Anti-abuso: só permite enviar para paciente(s) do próprio terapeuta.
  const ownership = await callerOwnsRecipient(caller.id, to);
  if (!ownership.ok) {
    console.warn('[send-email] Bloqueado: destinatário não é paciente do caller', caller.id);
    return res.status(403).json({ error: 'Destinatário não é um paciente vinculado à sua conta.' });
  }
  // Envia SÓ para os destinatários aprovados (nunca o array cru do body).
  const toApproved = ownership.allowed && ownership.allowed.length ? ownership.allowed : normalizeAll(to);

  const resend = new Resend(RESEND_KEY);
  // RESEND_FROM: use noreply@<dominio> após verificar o domínio na Resend
  const fromAddr = process.env.RESEND_FROM || 'Teravia <onboarding@resend.dev>';

  // 'reminder' agenda DOIS emails via scheduledAt (Resend dispara sozinho, sem
  // cron): 24h antes ("é amanhã") e 15min antes ("começa em instantes", com o
  // link da sala quando houver). Cada um só entra se ainda couber no relógio.
  if (template === 'reminder') {
    if (!data?.sessionDateISO || !data?.hora) {
      return res.status(400).json({ error: 'reminder exige data.sessionDateISO e data.hora' });
    }
    const sessionDt = new Date(`${data.sessionDateISO}T${data.hora}:00`);
    if (isNaN(sessionDt.getTime())) return res.status(400).json({ error: 'Data/hora da sessão inválida' });
    const agora = new Date();
    const etapas = [
      { rotulo: '24h',   dt: new Date(sessionDt.getTime() - 24 * 60 * 60 * 1000),
        subject: `Lembrete: sua sessão é amanhã às ${data.hora}`, html: tmplReminder(data) },
      { rotulo: '15min', dt: new Date(sessionDt.getTime() - 15 * 60 * 1000),
        subject: `Sua sessão começa em 15 minutos (${data.hora})`, html: tmplReminder15(data) },
    ];
    const agendados = [], pulados = [];
    try {
      for (const e of etapas) {
        if (e.dt <= agora) { pulados.push(e.rotulo); continue; }
        const r = await resend.emails.send({
          from: fromAddr, to: toApproved, subject: e.subject, html: e.html,
          scheduledAt: e.dt.toISOString(),
        });
        if (r.error) {
          console.error('[send-email] Resend error (reminder ' + e.rotulo + '):', r.error);
          return res.status(502).json({ error: r.error.message, agendados });
        }
        agendados.push({ etapa: e.rotulo, id: r.data?.id, scheduledAt: e.dt.toISOString() });
      }
      console.log('[send-email] Reminders:', JSON.stringify({ agendados, pulados }));
      if (!agendados.length) return res.status(200).json({ ok: true, skipped: true, reason: 'session_too_soon', pulados });
      return res.status(200).json({ ok: true, agendados, pulados });
    } catch (e) {
      console.error('[send-email] Exceção (reminder):', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  let subject, html, scheduledAt = null;

  if (template === 'invite') {
    subject = `Sessão confirmada — ${data?.data || ''} às ${data?.hora || ''}`;
    html = tmplInvite(data || {});
  } else if (template === 'portal') {
    subject = `${data?.terapeutaNome || 'Seu terapeuta'} ativou seu portal Teravia`;
    html = tmplPortal(data || {});
  } else {
    return res.status(400).json({ error: `Template desconhecido: ${template}` });
  }

  try {
    // Envia SÓ para a lista aprovada (o comentário lá em cima prometia isso, mas
    // o payload usava o `to` cru do body — corrigido 14/07).
    const emailPayload = { from: fromAddr, to: toApproved, subject, html };
    if (scheduledAt) emailPayload.scheduledAt = scheduledAt;
    const result = await resend.emails.send(emailPayload);

    if (result.error) {
      console.error('[send-email] Resend error:', result.error);
      return res.status(502).json({ error: result.error.message });
    }

    const logSuffix = scheduledAt ? ` | agendado: ${scheduledAt}` : '';
    console.log('[send-email] Enviado:', template, '→', to, '| id:', result.data?.id, logSuffix);
    return res.status(200).json({ ok: true, id: result.data?.id, scheduledAt });
  } catch(e) {
    console.error('[send-email] Exceção:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
