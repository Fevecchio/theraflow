// 03-sync.js — Sync status UI, Supabase sync functions, storage local helpers

/* ── SYNC STATUS UI ── */
var _syncErrorCount = 0;
var _sessionAlreadySaved = false;
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
  } else {
    icon.textContent = '✓'; text.textContent = 'Sincronizado';
    bar.style.color = '#8fb89c'; bar.style.background = 'rgba(74,124,89,.06)';
  }
}
window.addEventListener('offline', function() { _setSyncStatus('error'); });
window.addEventListener('online',  function() { _setSyncStatus('ok'); });

/* Sync completo de pacientes para o Supabase (inclui metadata com dados ricos) */
async function _supaSync_patients() {
  _setSyncStatus('syncing');
  try {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) { _setSyncStatus('ok'); return; }
    const pats = JSON.parse(localStorage.getItem('tf_patients') || '[]');
    if (!pats.length) { _setSyncStatus('ok'); return; }
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
      // Dados ricos preservados em metadata
      metadata: {
        moodHistory: p.moodHistory || [],
        prontuarioNotes: p.prontuarioNotes || [],
        exercises: p.exercises || [],
        materials: p.materials || [],
        diary: p.diary || [],
        metas: p.metas || [],
        appointments: p.appointments || [],
        sessionLink: p.sessionLink || null,
        _moodLastDate: p._moodLastDate || null,
        mood: p.mood || null,
        fin: p.fin || null,
        forma_pagamento: p.forma_pagamento || null,
        portalPassword: p.portalPassword || null,
        portalPasswordHash: p.portalPasswordHash || null,
        anamnese: p.anamnese || null,
        portalAnamneseAtiva: p.portalAnamneseAtiva || false,
      },
    }));
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const withId = rows.filter(r => r.id && UUID_RE.test(r.id));
    const withoutId = rows.filter(r => !r.id || !UUID_RE.test(r.id)).map(r => { const {id, ...rest} = r; return rest; });
    if (withId.length) { const { error: e1 } = await supa.from('patients').upsert(withId, { onConflict: 'id' }); if (e1) throw e1; }
    if (withoutId.length) { const { error: e2 } = await supa.from('patients').insert(withoutId); if (e2) throw e2; }
    _syncErrorCount = 0;
    _setSyncStatus('ok');
  } catch(e) {
    _syncErrorCount++;
    console.warn('[Supa] Sync patients falhou:', e.message);
    if (_syncErrorCount >= 2) {
      _setSyncStatus('error');
      if (typeof showToast === 'function') showToast('⚠ Sincronização com nuvem falhou — dados salvos localmente. Verifique sua conexão.');
    }
  }
}

/* Sync de cobranças */
async function _supaSync_charges() {
  try {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;
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
  } catch(e) {
    _syncErrorCount++;
    console.warn('[Supa] Sync charges falhou:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de cobranças falhou — dados preservados localmente.');
  }
}

/* Sync de tarefas */
async function _supaSync_tasks() {
  try {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;
    const tsks = JSON.parse(localStorage.getItem('tf_tasks') || '[]');
    if (!tsks.length) return;
    const rows = tsks.map(t => ({
      local_id: String(t.id || ''),
      user_id: user.id,
      titulo: t.titulo || '',
      status: t.status || 'aberta',
      prioridade: t.prioridade || 'media',
      due_date: t.dueDate || null,
      patient_id: t.patientId || null,
    }));
    await supa.from('tasks').upsert(rows, { onConflict: 'local_id' });
  } catch(e) {
    _syncErrorCount++;
    console.warn('[Supa] Sync tasks falhou:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de tarefas falhou — dados preservados localmente.');
  }
}

async function _supaSync_appointments() {
  try {
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return;
    const appts = JSON.parse(localStorage.getItem('tf_appointments') || '[]');
    const pats = JSON.parse(localStorage.getItem('tf_patients') || '[]');
    if (!appts.length) {
      await supa.from('appointments').delete().eq('user_id', user.id);
      return;
    }
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
      metadata: {},
    }));
    // Upsert: nenhuma janela de perda — dados existentes são preservados até confirmação
    const { error } = await supa.from('appointments')
      .upsert(rows, { onConflict: 'user_id,local_id' });
    if (error) throw error;
    // Remove linhas que foram excluídas localmente mas ainda estão no Supabase
    const localIds = rows.map(r => r.local_id);
    const { error: delError } = await supa.from('appointments')
      .delete()
      .eq('user_id', user.id)
      .not('local_id', 'in', `(${localIds.map(id => `"${id}"`).join(',')})`);
    if (delError) throw delError;
  } catch(e) {
    _syncErrorCount++;
    console.warn('[Supa] Sync appointments:', e.message);
    if (_syncErrorCount >= 2 && typeof showToast === 'function') showToast('⚠ Sync de agenda falhou — dados preservados localmente.');
  }
}
