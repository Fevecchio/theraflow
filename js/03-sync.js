// 03-sync.js — Sync status UI, Supabase sync functions, storage local helpers

/* ── SYNC STATUS UI ── */
var _syncErrorCount = 0;
var _sessionAlreadySaved = false;
var _pendingResumoApptId = null;
var _syncPatientsTimer = null;
function _setSyncStatus(state) {
  var icon = document.getElementById('sync-status-icon');
  var text = document.getElementById('sync-status-text');
  var bar  = document.getElementById('sync-status-bar');
  if (!icon || !text || !bar) return;
  if (state === 'syncing') {
    icon.textContent = '↺'; text.textContent = 'Salvando…';
    bar.style.color = '#d4a017'; bar.style.background = 'rgba(212,160,23,.08)';
  } else if (state === 'error') {
    icon.textContent = '⚠'; text.textContent = 'Offline';
    bar.style.color = '#c0392b'; bar.style.background = 'rgba(192,57,43,.08)';
  } else if (state === 'noauth') {
    // Sessão Supabase expirada: os dados ficam SÓ locais — não fingir "Sincronizado".
    icon.textContent = '⚠'; text.textContent = 'Não sincronizado — refaça login';
    bar.style.color = '#c97d2e'; bar.style.background = 'rgba(201,125,46,.08)';
  } else {
    icon.textContent = '✓'; text.textContent = 'Sincronizado';
    bar.style.color = '#8fb89c'; bar.style.background = 'rgba(74,124,89,.06)';
  }
}
window.addEventListener('offline', function() { _setSyncStatus('error'); });
// Voltou a conexão: sincroniza de verdade (o próprio sync define o status final) —
// antes só marcava "Sincronizado" sem subir nada.
window.addEventListener('online',  function() {
  if (typeof _supaSync_patients === 'function') _supaSync_patients();
});

/* ── MENSAGENS ── */
var _msgPollTimer = null;
var _msgCache = {};      // { [patientId]: Message[] }
var _unreadCount = {};   // { [patientId]: number }

// Paciente logado SEM sessão Supabase Auth (login via RPC portal_patient_login ou
// fallback local). Nesse modo, auth.uid() é null e as RLS de `messages` bloqueiam
// (erro 42501), então o chat roteia pelas RPCs SECURITY DEFINER (migration 010),
// autorizadas por email+hash. Fica null para paciente com sessão Auth (usa RLS direto).
var _pacPortalAuth = null;  // { email, hash }
function _pacSetPortalAuth(email, hash) { if (email && hash) _pacPortalAuth = { email: String(email).trim(), hash: String(hash) }; }
function _pacClearPortalAuth() { _pacPortalAuth = null; }

async function _supaFetchMessages(patientId, client) {
  if (!patientId) return [];
  try {
    var { data, error } = await client
      .from('messages')
      .select('id,sender_role,body,read_at,created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true })
      .limit(60);
    if (error) throw error;
    _msgCache[patientId] = data || [];
    return _msgCache[patientId];
  } catch(e) {
    console.warn('[msg] fetch falhou:', e.message);
    return _msgCache[patientId] || [];
  }
}

async function _supaSendMessage(patientId, senderRole, body, client) {
  if (!patientId || !body) return false;
  try {
    var { error } = await client
      .from('messages')
      .insert({ patient_id: patientId, sender_role: senderRole, body: body.trim() });
    if (error) throw error;
    var msgs = await _supaFetchMessages(patientId, client);
    return msgs;
  } catch(e) {
    console.warn('[msg] send falhou:', e.message);
    return false;
  }
}

async function _supaMarkRead(patientId, otherSenderRole, client) {
  if (!patientId) return;
  try {
    await client
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('patient_id', patientId)
      .eq('sender_role', otherSenderRole)
      .is('read_at', null);
    // Atualiza cache local
    var cached = _msgCache[patientId] || [];
    cached.forEach(function(m) {
      if (m.sender_role === otherSenderRole && !m.read_at) {
        m.read_at = new Date().toISOString();
      }
    });
    _unreadCount[patientId] = 0;
  } catch(e) {
    console.warn('[msg] markRead falhou:', e.message);
  }
}

function _countUnread(patientId, myRole) {
  var msgs = _msgCache[patientId] || [];
  return msgs.filter(function(m) { return m.sender_role !== myRole && !m.read_at; }).length;
}

// ── Operações de chat do LADO PACIENTE ──
// Roteiam pelas RPCs quando o paciente não tem sessão Auth (_pacPortalAuth setado);
// caso contrário caem no acesso direto à tabela (paciente com conta Auth → RLS ok).
async function _pacFetchMessages(patientId) {
  if (_pacPortalAuth) {
    try {
      var { data, error } = await supaPatient.rpc('portal_fetch_messages', {
        p_email: _pacPortalAuth.email, p_hash: _pacPortalAuth.hash
      });
      if (error) throw error;
      _msgCache[patientId] = data || [];
      return _msgCache[patientId];
    } catch(e) {
      console.warn('[msg] rpc fetch falhou:', e.message);
      return _msgCache[patientId] || [];
    }
  }
  return _supaFetchMessages(patientId, supaPatient);
}

async function _pacSendMessage(patientId, body) {
  if (!body || !body.trim()) return false;
  if (_pacPortalAuth) {
    try {
      var { error } = await supaPatient.rpc('portal_send_message', {
        p_email: _pacPortalAuth.email, p_hash: _pacPortalAuth.hash, p_body: body.trim()
      });
      if (error) throw error;
      return await _pacFetchMessages(patientId);
    } catch(e) {
      console.warn('[msg] rpc send falhou:', e.message);
      return false;
    }
  }
  return _supaSendMessage(patientId, 'patient', body, supaPatient);
}

async function _pacMarkRead(patientId) {
  if (_pacPortalAuth) {
    try {
      await supaPatient.rpc('portal_mark_read', {
        p_email: _pacPortalAuth.email, p_hash: _pacPortalAuth.hash
      });
      var cached = _msgCache[patientId] || [];
      cached.forEach(function(m) { if (m.sender_role === 'therapist' && !m.read_at) m.read_at = new Date().toISOString(); });
      _unreadCount[patientId] = 0;
      return;
    } catch(e) { console.warn('[msg] rpc markRead falhou:', e.message); return; }
  }
  return _supaMarkRead(patientId, 'therapist', supaPatient);
}

function _startMsgPoll(patientId, callbackFn, intervalMs) {
  _stopMsgPoll();
  if (!patientId) return;
  var ms = intervalMs || 30000;
  _msgPollTimer = setInterval(function() {
    var fetchP = _pacPortalAuth
      ? _pacFetchMessages(patientId)
      : _supaFetchMessages(patientId, _loggedPatientData ? supaPatient : supa);
    fetchP.then(function(msgs) {
      if (typeof callbackFn === 'function') callbackFn(msgs);
    });
  }, ms);
}

function _stopMsgPoll() {
  if (_msgPollTimer) { clearInterval(_msgPollTimer); _msgPollTimer = null; }
}

/* Timeout de 12 s para qualquer operação de sync — evita congelamento da UI */
const _SYNC_TIMEOUT_MS = 12000;
function _syncRace(fn) {
  return Promise.race([
    fn(),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, _SYNC_TIMEOUT_MS);
    }),
  ]);
}

/* Sync completo de pacientes para o Supabase (inclui metadata com dados ricos).
 * Retorna true (confirmado no servidor) / false (falhou ou sem sessão).
 * opts.touch: chaves protegidas (escritas pelo paciente) que ESTA chamada pode
 *   gravar (ex.: hash/pwdTemp no "Reenviar acesso", anamnese no salvar da ficha).
 * opts.onlyId: restringe o batch a UM paciente. OBRIGATÓRIO junto com touch —
 *   a RPC 016 aplica o touch ao batch INTEIRO; sem o filtro, um reenvio de acesso
 *   do paciente A subiria hash/pwdTemp OBSOLETOS de todos os outros (revisão 09/07). */
async function _supaSync_patients(opts) {
  if (window._tfDemo) return false; // demo não sobe nada (nem tem sessão p/ subir)
  _setSyncStatus('syncing');
  var _syncedIds = []; // ids confirmados neste batch → limpar _pendingSync no sucesso (F2.2)
  try {
    await _syncRace(async function() {
      const { data: { user } } = await supa.auth.getUser();
      // Sem sessão nada sobe — sinaliza e aborta ANTES do _setSyncStatus('ok') lá embaixo.
      if (!user) { _setSyncStatus('noauth'); throw new Error('_noauth'); }
      let pats = JSON.parse(localStorage.getItem('tf_patients') || '[]').filter(p => !p._isDemo);
      if (opts && opts.onlyId) pats = pats.filter(p => p.id === opts.onlyId);
      if (!pats.length) return;
      _syncedIds = pats.map(p => p.id).filter(Boolean);
      const rows = pats.map(p => ({
        id: p.id || undefined,
        user_id: user.id,
        name: p.name || '',
        email: p.email || null,
        phone: p.whatsapp || p.phone || null,
        age: p.age ? parseInt(p.age) : null,
        cidade: p.cidade || null,
        abordagem: p.abordagem || null,
        cid: p.cid || null,
        notes: p.notes || null,
        status: p.status || 'Ativa',
        sessions_count: p.sessions || 0,
        valor_sessao: p.valorSessao ? parseFloat(p.valorSessao) : null,
        progress: p.progress || 0,
        // Dados ricos preservados em metadata.
        // ⚠️ Esta lista sobrescreve o metadata INTEIRO no Supabase — precisa conter TODOS os
        // campos, inclusive os escritos pelo PACIENTE (moodNotes, portalMetas, checkInStreak,
        // lastCheckInDate, readMaterials, portalNota, portalNotifHour), senão o save do terapeuta
        // os APAGA. Deve permanecer a UNIÃO com a lista de _supaPatientSync (06-patients.js).
        // Auditoria 07/07 (crítico: sync do terapeuta apagava dados do paciente).
        metadata: {
          moodHistory: p.moodHistory || [],
          moodNotes: p.moodNotes || [],
          prontuarioNotes: p.prontuarioNotes || [],
          exercises: p.exercises || [],
          materials: p.materials || [],
          diary: p.diary || [],
          metas: p.metas || [],
          portalMetas: p.portalMetas || [],
          appointments: p.appointments || [],
          sessionLink: p.sessionLink || null,
          sessionLinkAt: p.sessionLinkAt || null,
          _moodLastDate: p._moodLastDate || null,
          mood: p.mood || null,
          fin: p.fin || null,
          forma_pagamento: p.forma_pagamento || null,
          portalPasswordHash: p.portalPasswordHash || null,
          // portalPassword (plaintext) NÃO sobe ao banco (F3.2 / migration 008) — só o hash.
          // A senha em claro vive no máximo em memória durante o envio do convite.
          pwdTemp: p.pwdTemp || false, // senha temporária → força troca no 1º acesso (F3.2)
          checkInStreak: p.checkInStreak || 0,
          lastCheckInDate: p.lastCheckInDate || null,
          readMaterials: p.readMaterials || [],
          portalNota: p.portalNota || null,
          portalNotifHour: p.portalNotifHour || null,
          portalDica: p.portalDica || null,
          portalMensagem: p.portalMensagem || null,
          anamnese: p.anamnese || null,
          portalAnamneseAtiva: p.portalAnamneseAtiva || false,
        },
      }));
      // Caminho preferido: RPC merge-aware (migration 016) — UPDATE vira MERGE do
      // metadata e chaves do paciente saem do patch (C2/staleness: o terapeuta não
      // sobrescreve mais humor/diário/senha com cópia obsoleta da memória).
      var _rpcOk = false;
      try {
        const { error: eR } = await supa.rpc('therapist_patients_sync', {
          p_rows: rows, p_touch: (opts && opts.touch) || null,
        });
        if (eR) {
          // SÓ PGRST202 (função não existe = migration 016 não aplicada) cai no
          // legado. Casar por mensagem pegava erros REAIS que citam o nome da
          // função (ex.: 42501 permission denied) → fallback silencioso com o
          // clobber do C2 de volta (revisão 09/07). Qualquer outro erro propaga.
          if (eR.code === 'PGRST202') {
            console.warn('[TF] RPC therapist_patients_sync ausente (migration 016) — usando upsert legado.');
            _rpcOk = false;
          } else throw eR;
        } else _rpcOk = true;
      } catch(eRpc) {
        if (!(eRpc && eRpc.code === 'PGRST202')) throw eRpc;
        console.warn('[TF] RPC therapist_patients_sync ausente (migration 016) — usando upsert legado.');
      }
      if (!_rpcOk) {
        // Legado (pré-016): upsert de linha inteira — sobrescreve o metadata TODO.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const withId    = rows.filter(r => r.id && UUID_RE.test(r.id));
        const withoutId = rows.filter(r => !r.id || !UUID_RE.test(r.id)).map(r => { const {id, ...rest} = r; return rest; });
        if (withId.length)    { const { error: e1 } = await supa.from('patients').upsert(withId, { onConflict: 'id' }); if (e1) throw e1; }
        if (withoutId.length) { const { error: e2 } = await supa.from('patients').insert(withoutId); if (e2) throw e2; }
      }
    });
    _syncErrorCount = 0;
    _setSyncStatus('ok');
    // Sync confirmado: limpa _pendingSync nos pacientes deste batch (só nesses — um paciente
    // criado DURANTE o sync mantém a flag até o próximo sync). Sem isto o boot os trataria como
    // offline e duplicaria (restored + offlinePats). F2.2.
    if (_syncedIds.length) {
      try {
        var _syncedSet = new Set(_syncedIds);
        var _changed = false;
        if (typeof patients !== 'undefined') patients.forEach(function(p){ if (p && p._pendingSync && _syncedSet.has(p.id)) { delete p._pendingSync; _changed = true; } });
        var _ls = JSON.parse(localStorage.getItem('tf_patients') || '[]');
        _ls.forEach(function(p){ if (p && p._pendingSync && _syncedSet.has(p.id)) { delete p._pendingSync; _changed = true; } });
        if (_changed) localStorage.setItem('tf_patients', JSON.stringify(_ls));
      } catch(_) {}
    }
    return true;
  } catch(e) {
    if (e && e.message === '_noauth') return false; // status 'noauth' já definido; não é erro de rede
    _syncErrorCount++;
    _setSyncStatus('error');
    console.warn('[Supa] Sync patients falhou:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sincronização com nuvem falhou — dados salvos localmente. Verifique sua conexão.');
    return false;
  }
}

/* Sync de cobranças */
async function _supaSync_charges() {
  if (window._tfDemo) return;
  try {
    await _syncRace(async function() {
      const { data: { user } } = await supa.auth.getUser();
      if (!user) { _setSyncStatus('noauth'); return; }
      const chgs = JSON.parse(localStorage.getItem('tf_charges') || '[]');
      if (!chgs.length) return;
      // Busca mapeamento de nome→id dos pacientes
      const pats = JSON.parse(localStorage.getItem('tf_patients') || '[]');
      const rows = chgs.map(c => ({
        local_id: String(c.id || ''),
        user_id: user.id,
        patient_id: (() => {
          const p = pats.find(x => x.name === c.patient || x.id === c.patient);
          return p?.id || null;
        })(),
        valor: parseFloat(c.value) || 0,
        metodo: c.metodo || 'PIX',
        status: c.status || 'pendente',
        descricao: c.descricao || null,
        due_date: c.date || null,
        paid_date: c.paidDate || null,
      })).filter(r => r.patient_id);
      if (rows.length) await supa.from('charges').upsert(rows, { onConflict: 'local_id' });
    });
  } catch(e) {
    _syncErrorCount++;
    _setSyncStatus('error');
    console.warn('[Supa] Sync charges falhou:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de cobranças falhou — dados preservados localmente.');
  }
}

/* Sync de tarefas */
async function _supaSync_tasks() {
  if (window._tfDemo) return;
  try {
    await _syncRace(async function() {
      const { data: { user } } = await supa.auth.getUser();
      if (!user) { _setSyncStatus('noauth'); return; }
      const tsks = JSON.parse(localStorage.getItem('tf_tasks') || '[]');
      if (!tsks.length) return;
      const rows = tsks.map(t => ({
        local_id: String(t.id || ''),
        user_id: user.id,
        titulo: t.titulo || t.title || '',
        status: t.status || 'aberta',
        prioridade: t.prioridade || 'media',
        due_date: t.dueDate || null,
        patient_id: t.patientId || null,
      }));
      await supa.from('tasks').upsert(rows, { onConflict: 'user_id,local_id' });
    });
  } catch(e) {
    _syncErrorCount++;
    _setSyncStatus('error');
    console.warn('[Supa] Sync tasks falhou:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de tarefas falhou — dados preservados localmente.');
  }
}

async function _supaSync_appointments() {
  if (window._tfDemo) return;
  try {
    await _syncRace(async function() {
      const { data: { user } } = await supa.auth.getUser();
      if (!user) { _setSyncStatus('noauth'); return; }
      const appts = JSON.parse(localStorage.getItem('tf_appointments') || '[]');
      const pats  = JSON.parse(localStorage.getItem('tf_patients') || '[]');
      // Se lista local vazia, não deleta no Supabase — pode ser race condition na inicialização
      if (!appts.length) return;
      const rows = appts.map(a => ({
        local_id: String(a.id),
        user_id: user.id,
        patient_id: (pats[a.patientIdx] || pats.find(p => p.name === a.patientName))?.id || null,
        patient_name: a.patientName || '',
        date: a.date,
        time: a.time || null,
        duration: a.duration || null,
        abordagem: a.abordagem || null,
        status: a.status || 'agendada',
        recorrencia: a.recorrencia || null,
        presenca: a.presenca || null,
        color: a.color || null,
        metadata: {
          resumoParaPaciente: a.resumoParaPaciente || null,
          meuInsight: a.meuInsight || null,
        },
      }));
      // Upsert: nenhuma janela de perda — dados existentes são preservados até confirmação
      const { error } = await supa.from('appointments')
        .upsert(rows, { onConflict: 'user_id,local_id' });
      if (error) throw error;
      // Remove linhas excluídas localmente: busca os IDs remotos e deleta os ausentes
      // com .in() em lotes. Evita a sintaxe .not(col,'in',array), que o supabase-js
      // serializa sem parênteses (local_id=not.in.a,b) e o PostgREST rejeita com 400.
      const localSet = new Set(rows.map(r => r.local_id));
      const { data: remote, error: fetchErr } = await supa.from('appointments')
        .select('local_id').eq('user_id', user.id);
      if (fetchErr) throw fetchErr;
      const toDelete = (remote || []).map(r => r.local_id).filter(id => !localSet.has(id));
      const BATCH = 40;
      for (let i = 0; i < toDelete.length; i += BATCH) {
        const chunk = toDelete.slice(i, i + BATCH);
        const { error: delErr } = await supa.from('appointments')
          .delete().eq('user_id', user.id).in('local_id', chunk);
        if (delErr) throw delErr;
      }
    });
  } catch(e) {
    _syncErrorCount++;
    _setSyncStatus('error');
    console.warn('[Supa] Sync appointments:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de agenda falhou — dados preservados localmente.');
  }
}
