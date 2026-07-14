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
    // Sidebar é CLARA — verde-claro #8fb89c era ilegível (revisão 14/07)
    bar.style.color = 'var(--sage-dark)'; bar.style.background = 'rgba(74,122,99,.08)';
  }
}
// Recheck sob demanda (clique na barrinha): o estado 'noauth' ficava CONGELADO
// na tela mesmo após login online ok — nada reavaliava até a próxima gravação.
async function _syncRecheck() {
  _setSyncStatus('syncing');
  try {
    const { data } = await supa.auth.getUser();
    if (!data || !data.user) {
      _setSyncStatus('noauth');
      if (typeof showToast === 'function') showToast('⚠ Sem sessão online neste aparelho. Clique em Sair e entre com e-mail e senha (e o código de verificação).');
      return;
    }
    await _supaSync_patients(); // define o status final ('ok' ou erro real)
  } catch (e) { /* _supaSync_patients já sinalizou o status */ }
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
    // B6: mensagem NÃO LIDA da paciente acende o dot "novidade no Portal" também
    // quando a busca roda em segundo plano (antes só ações locais setavam a flag)
    try {
      if ((typeof _loggedPatientData === 'undefined' || !_loggedPatientData)
          && (data || []).some(function(m){ return m.sender_role === 'patient' && !m.read_at; })) {
        localStorage.setItem('tf_portal_new_data', '1');
        if (typeof _atualizarBadgePortal === 'function') _atualizarBadgePortal();
      }
    } catch(_) {}
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
      // Próxima sessão de cada paciente (p.next) recalculada agora, e identidade do
      // terapeuta lida do perfil — ambos vão ao metadata p/ o portal REMOTO mostrar
      // "próxima sessão" e o nome/WhatsApp reais (Lote 2 P1/P2/P7).
      if (typeof _recalcNextSessions === 'function') { try { _recalcNextSessions(); } catch(_){} }
      // _recalcNextSessions muta patients[] em memória (não o `pats` do localStorage) →
      // mapa id→next a partir do array vivo.
      var _nextById = {};
      if (typeof patients !== 'undefined' && Array.isArray(patients)) {
        patients.forEach(function(q){ if (q && q.id) _nextById[q.id] = q.next || null; });
      }
      var _accSync = {}; try { _accSync = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch(_){}
      var _terNome = _accSync.nome || (typeof tfUserData !== 'undefined' && tfUserData ? tfUserData.nome : '') || '';
      var _terWpp  = _accSync.whatsapp || '';
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
          // Portal remoto (Lote 2): próxima sessão + identidade do terapeuta + revogação.
          // Campos do TERAPEUTA (não do paciente) — a RPC 020 os devolve no login.
          next: (p.id && _nextById[p.id]) ? _nextById[p.id] : (p.next || null),
          _therapistNome: _terNome,
          _therapistWhatsapp: _terWpp,
          _therapistBio: _accSync.bio || null, // mini bio no portal (item 1 dos desligados)
          portalRevogado: p.portalRevogado ? true : false,
          // Lote 3 (TEMA 6): campos que morriam no restore por não estarem no metadata.
          planoEvolucao: p.planoEvolucao || null,
          planoEvolucaoDate: p.planoEvolucaoDate || null,
          planoEvolucaoUp: p.planoEvolucaoUp || null, // LWW honesto no servidor (027)
          nascimento: p.nascimento || null,
          // Declaração convênio/IR: CPF do paciente + responsável pagador (js/12).
          cpf: p.cpf || null,
          pagadorNome: p.pagadorNome || null,
          pagadorCpf: p.pagadorCpf || null,
          // P10: tombstones de exclusão (exercises/portalMetas/materials) — a RPC
          // 025 os une aos do servidor e o merge por elemento respeita.
          _tombs: p._tombs || {},
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
      // Cobranças excluídas (soft-delete local) NÃO sobem — e o delete-diff abaixo
      // as remove do servidor, para não ressuscitarem no próximo restore. F3.
      const ativos = chgs.filter(c => !c.deleted);
      const rows = ativos.map(c => ({
        local_id: String(c.id || ''),
        user_id: user.id,
        patient_id: (() => {
          const p = pats.find(x => x.name === c.patient || x.id === c.patient);
          return p?.id || null;
        })(),
        valor: parseFloat(c.value) || 0,
        // F4: o app grava method/desc (não metodo/descricao) — mapeados aqui; os
        // campos SEM coluna (session/billing/planLabel/initials/color) vão no metadata
        // para o restore reconstruir a cobrança inteira (antes: tudo "PIX"/"—"/undefined).
        metodo: c.method || c.metodo || 'PIX',
        status: c.status || 'pending',
        descricao: c.desc || c.descricao || null,
        due_date: c.date || null,
        paid_date: c.paidDate || null,
        metadata: {
          method: c.method || c.metodo || 'PIX',
          desc: c.desc || c.descricao || null,
          session: (c.session != null ? c.session : null),
          billing: c.billing || null,
          planLabel: c.planLabel || null,
          initials: c.initials || null,
          color: c.color || null,
          // Vínculo com o plano mensal (entidade em users.settings) — o restore
          // espalha o metadata de volta, preservando o dedup por plano+mês.
          planId: c.planId || null,
          planMes: c.planMes || null,
        },
      })).filter(r => r.patient_id);
      if (rows.length) {
        const { error: upErr } = await supa.from('charges').upsert(rows, { onConflict: 'local_id' });
        if (upErr) throw upErr;
      }
      // F3 delete-diff: remove do servidor as cobranças ausentes localmente (excluídas).
      // C5: SÓ sessão hidratada deleta — login offline com cópia velha apagava do
      // servidor cobranças criadas em outro device. Upserts seguem sempre.
      const localSet = new Set(rows.map(r => r.local_id));
      if (window._tfHydrated) {
        const { data: remote, error: fErr } = await supa.from('charges').select('local_id').eq('user_id', user.id);
        if (fErr) throw fErr;
        const toDel = (remote || []).map(r => r.local_id).filter(id => id && !localSet.has(id));
        for (let i = 0; i < toDel.length; i += 40) {
          const chunk = toDel.slice(i, i + 40);
          const { error: dErr } = await supa.from('charges').delete().eq('user_id', user.id).in('local_id', chunk);
          if (dErr) throw dErr;
        }
      }
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
      const pats = JSON.parse(localStorage.getItem('tf_patients') || '[]');
      const rows = tsks.map(t => ({
        local_id: String(t.id || ''),
        user_id: user.id,
        titulo: t.titulo || t.title || '',
        status: t.status || 'aberta',
        prioridade: t.prioridade || 'media',
        due_date: t.dueDate || null,
        // M16: a tarefa guarda patientName localmente → resolve o id p/ não perder o
        // vínculo no round-trip (antes subia patientId inexistente = sempre null).
        patient_id: t.patientId || (pats.find(p => p.name === t.patientName)?.id) || null,
      }));
      const { error: upErr } = await supa.from('tasks').upsert(rows, { onConflict: 'user_id,local_id' });
      if (upErr) throw upErr;
      // F3 delete-diff: tarefas excluídas localmente somem do servidor (não ressuscitam).
      // C5: só sessão hidratada deleta (ver comentário no sync de charges).
      const localSet = new Set(rows.map(r => r.local_id));
      if (window._tfHydrated) {
        const { data: remote, error: fErr } = await supa.from('tasks').select('local_id').eq('user_id', user.id);
        if (fErr) throw fErr;
        const toDel = (remote || []).map(r => r.local_id).filter(id => id && !localSet.has(id));
        for (let i = 0; i < toDel.length; i += 40) {
          const chunk = toDel.slice(i, i + 40);
          const { error: dErr } = await supa.from('tasks').delete().eq('user_id', user.id).in('local_id', chunk);
          if (dErr) throw dErr;
        }
      }
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
        // C3 (auditoria de confiança): IDENTIDADE antes de POSIÇÃO — pats[a.patientIdx]
        // vinculava a sessão ao paciente ERRADO quando uma exclusão em outra aba
        // deslocava os índices. Ordem: patientId gravado na criação → nome → índice.
        patient_id: (
          (a.patientId ? pats.find(p => p.id === a.patientId) : null) ||
          pats.find(p => p.name === a.patientName) ||
          pats[a.patientIdx]
        )?.id || null,
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
          resumoPendente: a.resumoPendente || null, // rascunho aguardando aprovação do terapeuta
          meuInsight: a.meuInsight || null,
        },
      }));
      // Caminho preferido: RPC merge-aware (022) — preserva metadata.meuInsight
      // escrito pela PACIENTE (o upsert legado sobrescrevia com a cópia stale). P6.
      var _apptRpcOk = false;
      try {
        const { error: eR } = await supa.rpc('therapist_appointments_sync', { p_rows: rows });
        if (eR) {
          if (eR.code === 'PGRST202') { console.warn('[TF] RPC therapist_appointments_sync ausente (migration 022) — upsert legado.'); }
          else throw eR;
        } else _apptRpcOk = true;
      } catch(eRpc) {
        if (!(eRpc && eRpc.code === 'PGRST202')) throw eRpc;
      }
      if (!_apptRpcOk) {
        // Legado (pré-022): upsert de linha inteira — sobrescreve o metadata todo.
        const { error } = await supa.from('appointments')
          .upsert(rows, { onConflict: 'user_id,local_id' });
        if (error) throw error;
      }
      // Remove linhas excluídas localmente: busca os IDs remotos e deleta os ausentes
      // com .in() em lotes. Evita a sintaxe .not(col,'in',array), que o supabase-js
      // serializa sem parênteses (local_id=not.in.a,b) e o PostgREST rejeita com 400.
      // C5: só sessão HIDRATADA deleta (login offline com cópia velha apagava do
      // servidor sessões criadas em outro device; upserts seguem sempre).
      const localSet = new Set(rows.map(r => r.local_id));
      if (window._tfHydrated) {
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
      }
    });
  } catch(e) {
    _syncErrorCount++;
    _setSyncStatus('error');
    console.warn('[Supa] Sync appointments:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de agenda falhou — dados preservados localmente.');
  }
}

/* Sync das configurações da agenda (tf_bloqueios/tf_horarios) → users.settings.
 * Eram local-only: férias e grade de horários sumiam em outro dispositivo (TEMA 6).
 * Escritor único (só o terapeuta edita) → last-write-wins, sem merge. Migration 024.
 * Sem a migration o update falha com "column not found" — só loga; nada quebra. */
var _settingsSyncTimer = null;
function _supaSync_settings() {
  if (window._tfDemo) return;
  // C12: settings é update de objeto INTEIRO (LWW) — sessão não-hidratada com
  // grade/bloqueios velhos sobrescreveria a versão nova do servidor. Fica local
  // e sobe na próxima sessão hidratada.
  if (!window._tfHydrated) return;
  if (_settingsSyncTimer) clearTimeout(_settingsSyncTimer);
  _settingsSyncTimer = setTimeout(async function() {
    _settingsSyncTimer = null;
    try {
      await _syncRace(async function() {
        const { data: { user } } = await supa.auth.getUser();
        if (!user) return; // sem sessão: fica local, sem alarde (config não é dado clínico)
        var settings = {};
        try { settings.bloqueios = JSON.parse(localStorage.getItem('tf_bloqueios') || '[]'); } catch(_) { settings.bloqueios = []; }
        try { settings.horarios  = JSON.parse(localStorage.getItem('tf_horarios')  || 'null'); } catch(_) { settings.horarios = null; }
        try { settings.plans     = JSON.parse(localStorage.getItem('tf_plans')     || '[]'); } catch(_) { settings.plans = []; }
        const { error } = await supa.from('users').update({ settings: settings }).eq('id', user.id);
        if (error) throw error;
      });
    } catch(e) {
      console.warn('[Supa] Sync settings falhou:', e.message);
    }
  }, 800);
}
