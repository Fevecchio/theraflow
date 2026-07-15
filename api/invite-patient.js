/**
 * Teravia — Serverless Function: Criar conta de paciente no Supabase Auth
 * Deploy: Vercel → /api/invite-patient  (Node.js runtime)
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY (somente servidor — nunca exposta no cliente).
 * Vercel → Settings → Environment Variables → SUPABASE_SERVICE_ROLE_KEY = eyJ...
 */

const SUPA_URL = process.env.SUPABASE_URL || 'https://hkryvbyoviejdjlzfehm.supabase.co';

const ALLOWED_ORIGINS = [
  'https://theraflow-one.vercel.app',
  'https://teravia.com.br',
  'https://www.teravia.com.br',
  'https://app.teravia.com.br',
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

async function verifySupabaseJWT(req, serviceKey) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

/* LGPD: trilha de auditoria (audit_logs) — fire-and-forget; falha aqui NUNCA
 * derruba a request. Inserts só via service role (RLS sem policy de insert). */
function _audit(serviceKey, entry) {
  return fetch(`${SUPA_URL}/rest/v1/audit_logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'return=minimal' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SERVICE_KEY_EARLY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const caller = SERVICE_KEY_EARLY ? await verifySupabaseJWT(req, SERVICE_KEY_EARLY) : null;
  if (!caller) return res.status(401).json({ error: 'Autenticação necessária' });

  const { email, password, patientId, therapistId, patientName } = req.body || {};

  if (!email || !password || !patientId || !therapistId) {
    return res.status(400).json({ error: 'email, password, patientId e therapistId são obrigatórios' });
  }

  // Autorização: o terapeuta só pode criar acesso para si mesmo (mesma proteção
  // do create-checkout-session/C1). Impede criar vínculo usando o therapistId de
  // outro terapeuta. O frontend sempre envia therapistId = acc.supa_id (= caller.id).
  if (therapistId !== caller.id) {
    return res.status(403).json({ error: 'Forbidden: therapistId não corresponde ao usuário autenticado' });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    console.error('[invite-patient] SUPABASE_SERVICE_ROLE_KEY ausente');
    return res.status(500).json({ error: 'Service misconfigured: SUPABASE_SERVICE_ROLE_KEY ausente' });
  }

  const hdrs = supaHeaders(SERVICE_KEY);

  // SEGURANÇA (auditoria adversarial 12/07): o `patientId` PRECISA pertencer ao
  // chamador. Sem esta checagem, um terapeuta autenticado passava o UUID de um
  // paciente de OUTRO terapeuta e (a) resetava a senha do portal dele
  // [account-takeover] ou (b) criava vínculo cruzado. therapistId===caller.id
  // sozinho não bastava — patientId era confiado cegamente. Trava no servidor,
  // com service role (bypassa RLS), consultando o dono real do paciente.
  try {
    const ownRes = await fetch(
      `${SUPA_URL}/rest/v1/patients?id=eq.${encodeURIComponent(patientId)}&select=user_id&limit=1`,
      { headers: hdrs }
    );
    const owned = await ownRes.json();
    const ownerId = Array.isArray(owned) && owned[0] && owned[0].user_id;
    if (!ownerId || ownerId !== caller.id) {
      _audit(SERVICE_KEY, {
        user_id: caller.id, patient_id: patientId, acao: 'portal_access_denied',
        detalhes: { motivo: 'patientId nao pertence ao caller', via: 'invite-patient' },
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || null,
      });
      return res.status(403).json({ error: 'Forbidden: este paciente não pertence à sua conta.' });
    }
  } catch (e) {
    console.error('[invite-patient] Falha ao verificar posse do paciente:', e.message);
    return res.status(502).json({ error: 'Não foi possível verificar a posse do paciente.' });
  }

  // Verifica se já existe vínculo para este paciente — restrito ao vínculo DESTE
  // terapeuta (defesa em profundidade: além da posse acima, o reset de senha só
  // toca a conta ligada a este terapeuta).
  let existingAuthUserId = null;
  try {
    const checkRes = await fetch(
      `${SUPA_URL}/rest/v1/patient_users?patient_id=eq.${encodeURIComponent(patientId)}&therapist_id=eq.${encodeURIComponent(caller.id)}&select=auth_user_id&limit=1`,
      { headers: hdrs }
    );
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      existingAuthUserId = existing[0].auth_user_id;
    }
  } catch (e) {
    console.warn('[invite-patient] Erro ao verificar vínculo:', e.message);
  }

  let authUserId;

  if (existingAuthUserId) {
    // Atualiza senha do usuário existente
    const updateRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${existingAuthUserId}`, {
      method: 'PUT',
      headers: hdrs,
      body: JSON.stringify({ password }),
    });
    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '');
      console.error('[invite-patient] Falha ao atualizar senha:', updateRes.status, errText.substring(0, 200));
      return res.status(502).json({ error: `Falha ao atualizar senha: ${errText.substring(0, 100)}` });
    }
    authUserId = existingAuthUserId;
    console.log('[invite-patient] Senha atualizada para paciente', patientId);
  } else {
    // Cria novo usuário no Supabase Auth
    const createRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome: patientName || email, role: 'patient' },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      console.error('[invite-patient] Falha ao criar usuário:', createRes.status, errText.substring(0, 200));
      // Se email já existe mas sem vínculo, tenta recuperar o usuário existente
      if (createRes.status === 422 && errText.includes('already')) {
        return res.status(409).json({ error: 'Email já cadastrado. Use "Redefinir senha" para atualizar o acesso.' });
      }
      return res.status(502).json({ error: `Falha ao criar usuário: ${errText.substring(0, 100)}` });
    }

    const created = await createRes.json();
    authUserId = created.id;

    // Cria vínculo patient_users
    const linkRes = await fetch(`${SUPA_URL}/rest/v1/patient_users`, {
      method: 'POST',
      headers: { ...hdrs, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        auth_user_id: authUserId,
        patient_id: patientId,
        therapist_id: therapistId,
      }),
    });

    if (!linkRes.ok) {
      const errText = await linkRes.text().catch(() => '');
      console.error('[invite-patient] Falha ao criar vínculo:', linkRes.status, errText.substring(0, 200));
      // Usuário foi criado mas vínculo falhou — retorna erro mas não bloqueia
      return res.status(200).json({
        ok: true,
        warning: 'Usuário criado mas vínculo falhou — tente enviar o acesso novamente',
        authUserId,
      });
    }

    console.log('[invite-patient] Paciente criado:', patientId, '→', authUserId);
  }

  _audit(SERVICE_KEY, {
    user_id: caller.id, patient_id: patientId, acao: 'portal_access_granted',
    detalhes: { via: 'invite-patient' },
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0] || null,
  });
  return res.status(200).json({ ok: true, authUserId });
}
