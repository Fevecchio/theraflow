// 00-globals.js — Constantes, clientes Supabase, variáveis de estado globais

/* ── STRIPE ── */
const _STRIPE_PK = 'pk_test_51TNCbIFY0RoCsYEc3dHRoo3rpeHRP6ucbwzq5NhYLJL3QyGgFvwj88XLvamEd02rdgWX09UlESaSz83K64AGdL2m00gzfh3Tca';
let _tfPlanPro = false;
let _tfTrialDismissed = false;
let _loadingUserData = false;
var profileAbordagem = 'tcc';

async function assinarPro(btn) {
  tfTrack('upgrade_clicked');
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    const res = await fetchWithTimeout('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ email: acc.email || '', supaId: acc.supa_id || '' }),
    }, 20000);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      showToast('Erro ao iniciar pagamento. Tente novamente.');
      if (btn) { btn.disabled = false; btn.textContent = 'Assinar agora — R$89/mês →'; }
    }
  } catch(e) {
    showToast('Erro ao iniciar pagamento. Tente novamente.');
    if (btn) { btn.disabled = false; btn.textContent = 'Assinar agora — R$89/mês →'; }
  }
}

/* ── SUPABASE CLIENT ── */
const _SUPA_URL = 'https://hkryvbyoviejdjlzfehm.supabase.co';
const _SUPA_KEY = 'sb_publishable_ovqMsOm88TvulTD4eYTp0w_gCXoFDSl';
const supa = supabase.createClient(_SUPA_URL, _SUPA_KEY);

/* Cliente separado para o portal do paciente — sessão isolada da do terapeuta */
const supaPatient = supabase.createClient(_SUPA_URL, _SUPA_KEY, {
  auth: { storageKey: 'tf_patient_session' }
});

/* ── DADOS DO USUÁRIO TERAPEUTA ── */
var tfUserData = {
  nome: '',
  crp: '',
  email: '',
  abordagem: '',
  secundarias: [],
  abordagemKey: 'tcc'
};

// Mapa nome display → chave interna de calibração da IA
var ABORDAGEM_KEY_MAP = {
  'TCC': 'tcc', 'Psicanálise': 'psicanalise', 'Humanista': 'humanista',
  'Sistêmica': 'sistemica', 'ACT': 'act', 'EMDR': 'emdr'
};

/* Carrega dados do Supabase e popula localStorage */
async function _supaLoadUserData(userId) {
  if (_loadingUserData) return;
  _loadingUserData = true;
  try {
    const [{ data: profile }, { data: pats }, { data: chgs }, { data: tsks }, { data: appts }] = await Promise.all([
      supa.from('users').select('*').eq('id', userId).single(),
      supa.from('patients').select('*').eq('user_id', userId),
      supa.from('charges').select('*').eq('user_id', userId),
      supa.from('tasks').select('*').eq('user_id', userId),
      supa.from('appointments').select('*').eq('user_id', userId),
    ]);
    if (profile) {
      const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
      const plano = profile.plano || 'trial';
      if (plano === 'pro' || plano === 'clinic') _tfPlanPro = true;
      const nomeFromDB = profile.nome && !profile.nome.includes('@') ? profile.nome : null;
      localStorage.setItem('tf_account', JSON.stringify({
        ...acc,
        nome: nomeFromDB || acc.nome || '',
        crp: profile.crp || acc.crp || '',
        email: profile.email,
        abordagem: profile.abordagem || '',
        sessoes_usadas: profile.sessoes_usadas || 0,
        plano,
        supa_id: userId,
        referral_count: profile.referral_count || 0,
        referral_rewarded: profile.referral_rewarded || false,
      }));
    }
    if (pats && pats.length > 0) {
      const localPats = JSON.parse(localStorage.getItem('tf_patients') || '[]');
      const supaPatIds = new Set(pats.map(p => p.id));
      // Restaura dados completos mesclando campos DB com metadata
      const restored = pats.map(p => ({
        ...(p.metadata || {}),
        id: p.id,
        name: p.name,
        email: p.email,
        whatsapp: p.phone,
        age: p.age,
        cidade: p.cidade,
        abordagem: p.abordagem,
        cid: p.cid,
        notes: p.notes,
        status: p.status,
        sessions: p.sessions_count,
        valorSessao: p.valor_sessao,
        progress: p.progress,
        portalPassword: (p.metadata && p.metadata.portalPassword) || null,
        portalPasswordHash: (p.metadata && p.metadata.portalPasswordHash) || null,
      }));
      // Preserva pacientes criados offline (UUID local não existe no Supabase ainda)
      const offlinePats = localPats.filter(p => p.id && !supaPatIds.has(p.id));
      const mergedPats = [...restored, ...offlinePats];
      localStorage.setItem('tf_patients', JSON.stringify(mergedPats));
      try { if (typeof patients !== 'undefined') patients.splice(0, patients.length, ...mergedPats); } catch(_) {}
      if (offlinePats.length) _supaSync_patients().catch(() => {});
    }
    if (chgs && chgs.length > 0) {
      const localChgs = JSON.parse(localStorage.getItem('tf_charges') || '[]');
      const supaChgIds = new Set(chgs.map(c => String(c.local_id || c.id)));
      const restoredChgs = chgs.map(c => ({
        ...(c.metadata || {}),
        id: c.local_id || c.id,
        // Mapeia patient_id (UUID) de volta para o nome do paciente
        patient: (pats && pats.find(p => p.id === c.patient_id)?.name) || c.patient_id,
        value: parseFloat(c.valor) || 0,
        metodo: c.metodo,
        status: c.status,
        descricao: c.descricao,
        date: c.due_date || null,
        paidDate: c.paid_date || null,
      }));
      // Preserva cobranças criadas offline
      const offlineChgs = localChgs.filter(c => c.id && !supaChgIds.has(String(c.id)));
      const mergedChgs = [...restoredChgs, ...offlineChgs];
      localStorage.setItem('tf_charges', JSON.stringify(mergedChgs));
      try { if (typeof charges !== 'undefined') charges.splice(0, charges.length, ...mergedChgs); } catch(_) {}
      if (offlineChgs.length) _supaSync_charges().catch(() => {});
    }
    if (tsks && tsks.length > 0) {
      const localTsks = JSON.parse(localStorage.getItem('tf_tasks') || '[]');
      const supaTskIds = new Set(tsks.map(t => String(t.local_id || t.id)));
      const restoredTasks = tsks.map(t => ({
        id: t.local_id || t.id,
        titulo: t.titulo,
        status: t.status,
        prioridade: t.prioridade,
        dueDate: t.due_date,
        patientId: t.patient_id,
      }));
      // Preserva tarefas criadas offline
      const offlineTsks = localTsks.filter(t => t.id && !supaTskIds.has(String(t.id)));
      localStorage.setItem('tf_tasks', JSON.stringify([...restoredTasks, ...offlineTsks]));
      if (offlineTsks.length) _supaSync_tasks().catch(() => {});
    }
    if (appts && appts.length > 0) {
      const localAppts = JSON.parse(localStorage.getItem('tf_appointments') || '[]');
      const supaApptIds = new Set(appts.map(a => String(a.local_id)));
      const patsArr = JSON.parse(localStorage.getItem('tf_patients') || '[]');
      const restoredAppts = appts.map(a => ({
        id: a.local_id,
        patientIdx: patsArr.findIndex(p => p.id === a.patient_id),
        patientName: a.patient_name,
        date: a.date,
        time: a.time,
        duration: a.duration,
        abordagem: a.abordagem,
        status: a.status,
        recorrencia: a.recorrencia,
        presenca: a.presenca,
        color: a.color,
      }));
      // Preserva agendamentos criados offline; re-resolve patientIdx pelo nome
      const offlineAppts = localAppts
        .filter(a => a.id && !supaApptIds.has(String(a.id)))
        .map(a => ({ ...a, patientIdx: patsArr.findIndex(p => p.name === a.patientName) }));
      const mergedAppts = [...restoredAppts, ...offlineAppts];
      localStorage.setItem('tf_appointments', JSON.stringify(mergedAppts));
      try { if (typeof appointments !== 'undefined') appointments.splice(0, appointments.length, ...mergedAppts); } catch(_) {}
      if (offlineAppts.length) _supaSync_appointments().catch(() => {});
    } else {
      const localAppts = JSON.parse(localStorage.getItem('tf_appointments') || '[]');
      if (localAppts.length > 0) _supaSync_appointments().catch(() => {});
    }
  } catch(e) {
    console.warn('[Supa] Erro ao carregar dados:', e.message);
  } finally {
    _loadingUserData = false;
  }
}
