// 02-ui.js — Navegação, sidebar, modais, toggleDarkMode, _hideDemoBanner

/* ── SIDEBAR MOBILE ── */
function toggleSidebar() {
  const sb = document.getElementById('main-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('sidebar-open');
  if (isOpen) { closeSidebar(); } else { openSidebar(); }
}
function openSidebar() {
  const sb = document.getElementById('main-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const hb = document.getElementById('sidebar-hamburger');
  if (sb) sb.classList.add('sidebar-open');
  if (ov) ov.classList.add('visible');
  if (hb) hb.innerHTML = _tfIcon('x', 18);
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  const sb = document.getElementById('main-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const hb = document.getElementById('sidebar-hamburger');
  if (sb) sb.classList.remove('sidebar-open');
  if (ov) ov.classList.remove('visible');
  if (hb) hb.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  document.body.style.overflow = '';
}

function navigate(page) {
  // C1: outra aba alterou dados enquanto um modal/sessão estava ativo aqui —
  // recarrega agora que o usuário navegou (a flag zera antes p/ não recursar).
  if (typeof _tfStorageStale !== 'undefined' && _tfStorageStale && !document.querySelector('.modal-overlay.open')) {
    _tfStorageStale = false;
    try {
      if (typeof carregarPacientes === 'function') carregarPacientes();
      if (typeof carregarAppointments === 'function') carregarAppointments();
      if (typeof carregarCharges === 'function') charges = carregarCharges();
      if (typeof carregarTarefas === 'function') carregarTarefas();
    } catch (_) {}
  }
  // Redirect fragmented pages into unified patient panel
  if (page === 'prontuarios') {
    navigate('pacientes');
    setTimeout(function(){ if (typeof selectPatientTab === 'function') selectPatientTab('notas'); }, 120);
    return;
  }
  if (page === 'briefing') {
    navigate('pacientes');
    setTimeout(function(){
      // Os chamadores (agenda, dashboard, atalhos) pedem o briefing de um paciente
      // ESPECÍFICO via currentBriefingPatientIdx — sem selecioná-lo aqui, abria o
      // briefing do último paciente aberto em Pacientes (risco clínico). Lote 1.
      if (typeof currentBriefingPatientIdx !== 'undefined' && currentBriefingPatientIdx != null
          && typeof patients !== 'undefined' && patients[currentBriefingPatientIdx]
          && typeof selectPatient === 'function') {
        selectPatient(currentBriefingPatientIdx);
      }
      if (typeof selectPatientTab === 'function') selectPatientTab('briefing');
    }, 120);
    return;
  }

  if (typeof stopTranscriptSimulation === 'function') stopTranscriptSimulation();
  // Sessão LiveKit ATIVA: o timer é da consulta em andamento — navegar para outra
  // página não pode matá-lo (a gravação continua rodando). Lote 1.
  var _sessaoAtiva = (typeof _lkRoom !== 'undefined' && _lkRoom);
  if (typeof timerInterval !== 'undefined' && timerInterval !== null && page !== 'sessao' && !_sessaoAtiva) {
    clearInterval(timerInterval); timerInterval = null; if (typeof _setSessionLiveUI === 'function') _setSessionLiveUI(false);
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const _pageEl = document.getElementById('page-' + page);
  if (!_pageEl) return;
  _pageEl.classList.add('active');
  // Fecha sidebar no mobile ao navegar
  if (window.innerWidth <= 768) closeSidebar();
  // Ativa item correto na sidebar
  document.querySelectorAll('.nav-item').forEach(n => {
    const oc = n.getAttribute('onclick') || '';
    if (oc.includes("'"+page+"'")) n.classList.add('active');
  });
  // Persiste página atual
  try { localStorage.setItem('tf_current_page', page); } catch(e) {}
  // Mostra/oculta nota rápida FAB
  var fab = document.getElementById('quick-note-fab');
  if (fab) fab.style.display = ['dashboard','pacientes','supervisao','tarefas'].includes(page) ? 'flex' : 'none';
  if (page === 'dashboard') { checkFirstPatientBanner(); atualizarDashboard(); setTimeout(iniciarTour, 500); setTimeout(function(){ if (localStorage.getItem('tf_tour_done')) verificarMarcos(); }, 1200); _startDashAutoRefresh(); if (typeof _lkCheckDraftOnBoot === 'function') setTimeout(_lkCheckDraftOnBoot, 1500); }
  else { _stopDashAutoRefresh(); }
  // Atualiza badges de nav
  _atualizarBadgeSupervisao();
  _atualizarBadgePortal();
  if (typeof _atualizarBadgeAgenda === 'function') _atualizarBadgeAgenda();
  if (typeof atualizarBadgeCaptacao === 'function') atualizarBadgeCaptacao();
  if (page === 'captacao') initCaptacao();
  if (page === 'tarefas') initTarefas();
  // Com sessão LiveKit ativa, voltar à página NÃO re-roda startSession — o reset
  // apagava a nota em edição, zerava o timer e recriava o pré-estado por cima da
  // chamada em andamento. Lote 1.
  if (page === 'sessao' && !_sessaoAtiva) startSession();
  if (page === 'pacientes') renderPatients();
  if (page === 'agenda') initAgenda();
  if (page === 'briefing') initBriefing();
  if (page === 'portal') { initPortal(); _limparBadgePortal(); }
  if (page === 'financeiro') initFinanceiro();
  if (page === 'supervisao') initSupervisao();
  if (page === 'perfil') {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.therapist-card')?.classList.add('active');
    initPerfil();
    if (typeof _init2FACard === 'function') _init2FACard();
  }
}

// ── MODAIS ──
function showModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.style.animation = '';
  const modal = overlay.querySelector('.modal');
  if (modal) modal.style.animation = '';
  overlay.classList.add('open');
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  if (modal) modal.style.animation = 'modalOut .22s ease forwards';
  overlay.style.animation = 'overlayOut .22s ease forwards';
  setTimeout(() => {
    overlay.classList.remove('open');
    overlay.style.animation = '';
    if (modal) modal.style.animation = '';
  }, 220);
}
// Click fora do modal já está no DOMContentLoaded principal acima

// ── PACIENTES ──

// ── Dark mode ──
function toggleDarkMode(on) {
  if (on) {
    document.documentElement.setAttribute('data-theme','dark');
    localStorage.setItem('tf_dark_mode','1');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('tf_dark_mode');
  }
}

// ── Coordenação entre ABAS (auditoria de confiança C1) ──────────────────────
// Outra aba gravou tf_* → a memória DESTA aba ficou velha; sem recarregar, o
// próximo salvar daqui sobrescrevia o localStorage inteiro com dados antigos
// (e, via sync, o servidor). O evento 'storage' só dispara nas OUTRAS abas —
// exatamente as que precisam se atualizar.
var _tfStorageStale = false;
function _tfRecarregarDeOutraAba() {
  _tfStorageStale = false;
  try {
    if (typeof carregarPacientes === 'function') carregarPacientes();
    if (typeof carregarAppointments === 'function') carregarAppointments();
    if (typeof carregarCharges === 'function') charges = carregarCharges();
    if (typeof carregarTarefas === 'function') carregarTarefas();
    var pg = document.querySelector('.page.active');
    if (pg && typeof navigate === 'function') navigate(pg.id.replace('page-', ''));
    if (typeof showToast === 'function') showToast('Dados atualizados a partir de outra aba.');
  } catch (err) { console.warn('[TF] recarga multi-aba:', err.message); }
}
window.addEventListener('storage', function(e) {
  if (!e || ['tf_patients', 'tf_appointments', 'tf_charges', 'tf_tasks'].indexOf(e.key) === -1) return;
  // Modal aberto ou sessão rodando: não puxa o tapete do usuário — marca stale
  // e a recarga acontece na próxima navegação (gancho no navigate()).
  var _modalAberto = document.querySelector('.modal-overlay.open');
  var _emSessao = (typeof _lkRoom !== 'undefined' && _lkRoom) || (typeof timerInterval !== 'undefined' && timerInterval !== null);
  if (_modalAberto || _emSessao) { _tfStorageStale = true; return; }
  _tfRecarregarDeOutraAba();
});

