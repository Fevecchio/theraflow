// 00-globals.js — Constantes, clientes Supabase, variáveis de estado globais

/* ── STRIPE ── */
// O checkout é criado no servidor (/api/create-checkout) — nenhuma chave Stripe no cliente.
let _tfPlanPro = false;
let _tfTrialDismissed = false;
let _loadingUserData = false;
var profileAbordagem = 'tcc';
// IDs gerados localmente nesta sessão (ainda não confirmados no Supabase)
var _newLocalPatientIds = new Set();

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

/* Abre o Stripe Billing Portal (gerenciar/cancelar assinatura). Decisão #5 (B-A4). */
async function gerenciarAssinatura(btn) {
  try {
    if (btn) { btn.disabled = true; var _t = btn.textContent; btn.textContent = 'Abrindo…'; }
    const res = await fetchWithTimeout('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ portal: true }),
    }, 20000);
    const data = await res.json();
    if (data.url) { window.location.href = data.url; return; }
    showToast(data.error || 'Não foi possível abrir o gerenciamento da assinatura.');
    if (btn) { btn.disabled = false; btn.textContent = _t; }
  } catch(e) {
    showToast('Erro ao abrir o gerenciamento. Tente novamente.');
    if (btn) { btn.disabled = false; }
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
  // Guard de TROCA DE CONTA no mesmo navegador: os dados locais pertencem ao dono
  // anterior (tf_owner_uid). Mesclá-los seria (a) vazamento de dados clínicos entre
  // contas e (b) sync quebrado — o upsert em batch leva 403 do RLS (linhas de outro
  // uid) e NADA sobe, com o status ainda "Sincronizado". Achado no teste de 09/07.
  try {
    var _prevOwner = localStorage.getItem('tf_owner_uid');
    if (_prevOwner && _prevOwner !== userId) {
      // O que não sincroniza (local-only: captação, reflexões, check-ins, sequência
      // de recibos) e pacientes offline pendentes NÃO podem ser deletados — seriam
      // perda PERMANENTE (não estão no Supabase do dono). Vão para um stash por uid
      // e são devolvidos quando o dono anterior voltar. Bloqueios/horários passaram
      // a sincronizar (users.settings, 10/07), mas ficam no stash mesmo assim —
      // protege edições feitas offline que ainda não subiram.
      try {
        var _stash = {};
        ['tf_captacao','tf_bloqueios','tf_horarios','tf_plans','tf_reflections','tf_checkin_terapeuta','tf_recibo_seq']
          .forEach(function(k){ var v = localStorage.getItem(k); if (v !== null) _stash[k] = v; });
        var _pend = JSON.parse(localStorage.getItem('tf_patients') || '[]')
          .filter(function(q){ return q && q._pendingSync && !q._isDemo; });
        if (_pend.length) _stash.__pendingPatients = _pend;
        if (Object.keys(_stash).length) localStorage.setItem('tf_switch_stash_' + _prevOwner, JSON.stringify(_stash));
      } catch(_) {}
      ['tf_patients','tf_charges','tf_tasks','tf_appointments','tf_captacao',
       'tf_reflections','tf_checkin_terapeuta','tf_bloqueios','tf_horarios','tf_plans','tf_recibo_seq',
       'tf_last_briefing','tf_lk_draft','tf_marcos_vistos','tf_portal_new_data','tf_account']
        .forEach(function(k){ localStorage.removeItem(k); });
      Object.keys(localStorage).forEach(function(k){ if (k.indexOf('tf_bc_') === 0) localStorage.removeItem(k); });
      try { if (typeof patients !== 'undefined') patients.splice(0, patients.length); } catch(_) {}
      try { if (typeof charges  !== 'undefined') charges.splice(0, charges.length); } catch(_) {}
      try { if (typeof tasks    !== 'undefined') tasks.splice(0, tasks.length); } catch(_) {}
      try { if (typeof appointments !== 'undefined') appointments.splice(0, appointments.length); } catch(_) {}
      // Globais que só carregam no parse — sem o reset, a conta nova herdaria
      // bloqueios/planos/leads da anterior em memória (e re-persistiria no 1º save).
      try { if (typeof bloqueios !== 'undefined') bloqueios.splice(0, bloqueios.length); } catch(_) {}
      try { if (typeof plans !== 'undefined') plans.splice(0, plans.length); } catch(_) {}
      try { if (typeof captacaoLeads !== 'undefined') captacaoLeads.splice(0, captacaoLeads.length); } catch(_) {}
      console.warn('[TF] Conta diferente neste navegador — dados locais da conta anterior guardados em stash e removidos.');
    }
    localStorage.setItem('tf_owner_uid', userId);
    // Dono voltou? Devolve o stash dele (local-only + pacientes offline pendentes).
    var _meuStashRaw = localStorage.getItem('tf_switch_stash_' + userId);
    if (_meuStashRaw) {
      var _meu = JSON.parse(_meuStashRaw);
      Object.keys(_meu).forEach(function(k) {
        if (k === '__pendingPatients') {
          var _cur = JSON.parse(localStorage.getItem('tf_patients') || '[]');
          var _ids = new Set(_cur.map(function(q){ return q.id; }));
          _meu.__pendingPatients.forEach(function(q){ if (!_ids.has(q.id)) _cur.push(q); });
          localStorage.setItem('tf_patients', JSON.stringify(_cur));
        } else localStorage.setItem(k, _meu[k]);
      });
      localStorage.removeItem('tf_switch_stash_' + userId);
      try {
        if (typeof bloqueios !== 'undefined') {
          var _b = JSON.parse(localStorage.getItem('tf_bloqueios') || '[]');
          bloqueios.splice(0, bloqueios.length);
          Array.prototype.push.apply(bloqueios, _b);
        }
      } catch(_) {}
      try {
        if (typeof plans !== 'undefined') {
          var _pl = JSON.parse(localStorage.getItem('tf_plans') || '[]');
          plans.splice(0, plans.length);
          Array.prototype.push.apply(plans, _pl);
        }
      } catch(_) {}
      try { if (typeof carregarCaptacao === 'function') carregarCaptacao(); } catch(_) {}
      console.warn('[TF] Stash da conta devolvido (dados local-only restaurados).');
    }
  } catch(_) {}
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
      if (plano === 'pro' || plano === 'clinic') {
        _tfPlanPro = true;
        if (typeof atualizarTrialUI === 'function') atualizarTrialUI();
      }
      const nomeFromDB = profile.nome && !profile.nome.includes('@') ? profile.nome : null;
      const mergedAcc = {
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
      };
      localStorage.setItem('tf_account', JSON.stringify(mergedAcc));
      // Atualiza tfUserData e re-aplica UI com dados reais do Supabase
      if (typeof tfUserData !== 'undefined') {
        tfUserData.nome        = mergedAcc.nome;
        tfUserData.crp         = mergedAcc.crp;
        tfUserData.email       = mergedAcc.email;
        tfUserData.abordagem   = mergedAcc.abordagem;
      }
      if (typeof aplicarDadosNoApp === 'function') aplicarDadosNoApp();
      // Configurações da agenda (bloqueios/horários) — users.settings (migration 024).
      // No login o servidor é a fonte (LWW, escritor único). Se o servidor ainda não
      // tem nada e o local tem (dados pré-feature ou salvos offline), semeia o upload.
      try {
        var _st = profile.settings || {};
        if (Array.isArray(_st.bloqueios)) {
          localStorage.setItem('tf_bloqueios', JSON.stringify(_st.bloqueios));
          if (typeof bloqueios !== 'undefined') {
            bloqueios.splice(0, bloqueios.length);
            Array.prototype.push.apply(bloqueios, _st.bloqueios);
          }
        }
        if (_st.horarios) localStorage.setItem('tf_horarios', JSON.stringify(_st.horarios));
        if (Array.isArray(_st.plans)) {
          localStorage.setItem('tf_plans', JSON.stringify(_st.plans));
          if (typeof plans !== 'undefined') {
            plans.splice(0, plans.length);
            Array.prototype.push.apply(plans, _st.plans);
          }
        }
        if (!Array.isArray(_st.bloqueios) && !_st.horarios && !Array.isArray(_st.plans)) {
          var _temLocal = (localStorage.getItem('tf_bloqueios') || '[]') !== '[]'
            || !!localStorage.getItem('tf_horarios')
            || (localStorage.getItem('tf_plans') || '[]') !== '[]';
          if (_temLocal && typeof _supaSync_settings === 'function') _supaSync_settings();
        }
      } catch(_) {}
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
      // Garante campos visuais computados (initials, color, colorGrad)
      const _colorPairs = [['#4a7c59','#6a9c79'],['#2c5f8a','#4a7fa8'],['#c97d2e','#e09d4e'],['#6a3d7a','#8a5d9a'],['#8b2252','#ab4272'],['#8b4513','#ab6533']];
      restored.forEach(function(p, i) {
        if (!p.initials && p.name) p.initials = p.name.trim().split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase();
        if (!p.color) { var cp = _colorPairs[i % _colorPairs.length]; p.color = cp[0]; p.colorGrad = 'linear-gradient(135deg,'+cp[0]+','+cp[1]+')'; }
      });
      // Preserva pacientes criados localmente que ainda não foram confirmados no Supabase.
      // Usa a flag PERSISTENTE _pendingSync (sobrevive a reload) OU o Set da sessão atual —
      // sem a flag, um paciente criado offline sumia após fechar/reabrir a aba (Set zerava).
      // O _pendingSync só existe em paciente NÃO sincronizado (limpo no sucesso do sync), então
      // não ressuscita paciente deletado do Supabase (esse não tem a flag). Auditoria 07/07.
      const offlinePats = localPats.filter(p => !p._isDemo && (p._pendingSync || _newLocalPatientIds.has(p.id)) && !supaPatIds.has(p.id));
      const mergedPats = [...restored, ...offlinePats];
      localStorage.setItem('tf_patients', JSON.stringify(mergedPats));
      try { if (typeof patients !== 'undefined') patients.splice(0, patients.length, ...mergedPats); } catch(_) {}
      if (offlinePats.length) _supaSync_patients().catch(() => {});
    }
    if (chgs && chgs.length > 0) {
      const localChgs = JSON.parse(localStorage.getItem('tf_charges') || '[]');
      const supaChgIds = new Set(chgs.map(c => String(c.local_id || c.id)));
      const restoredChgs = chgs.map(c => {
        var _m = c.metadata || {};
        return {
          ...(_m),
          id: c.local_id || c.id,
          // Mapeia patient_id (UUID) de volta para o nome do paciente
          patient: (pats && pats.find(p => p.id === c.patient_id)?.name) || c.patient_id,
          value: parseFloat(c.valor) || 0,
          // F4: a UI lê method/desc — reconstrói do metadata (com fallback às colunas).
          method: _m.method || c.metodo || 'PIX',
          desc: _m.desc || c.descricao || null,
          session: (_m.session != null ? _m.session : null),
          billing: _m.billing || null,
          planLabel: _m.planLabel || null,
          status: c.status,
          date: c.due_date || null,
          paidDate: c.paid_date || null,
          deleted: false,
        };
      });
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
        title: t.titulo, // a UI lê `title`
        status: t.status,
        prioridade: t.prioridade,
        dueDate: t.due_date,
        patientId: t.patient_id,
        // M16: reconstrói o vínculo com o paciente (a UI mostra patientName) — antes
        // toda tarefa virava "geral" em outro dispositivo.
        patientName: (pats && pats.find(p => p.id === t.patient_id)?.name) || '',
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
        ...(a.metadata || {}),
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
    // Planos mensais: com planos (settings) e cobranças já restaurados, gera a
    // cobrança do mês corrente que ainda não existe — é o gancho "sem cron" do login.
    try { if (typeof _gerarCobrancasDosPlanos === 'function') _gerarCobrancasDosPlanos(); } catch(_) {}
  } catch(e) {
    console.warn('[Supa] Erro ao carregar dados:', e.message);
  } finally {
    _loadingUserData = false;
  }
}
