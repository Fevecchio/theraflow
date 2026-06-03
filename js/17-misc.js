// 17-misc.js — Marcos, tour, SHA-256, trial, termos legais, nota rápida, perfil, referral

var _MARCOS = [
  { key: 'first_patient',   check: function(){ return patients.length >= 1; },          msg: '🎉 Primeiro paciente cadastrado! O TheraFlow começa a tomar forma.', cor: '#4a7c59' },
  { key: 'five_patients',   check: function(){ return patients.length >= 5; },          msg: '🌱 5 pacientes! Sua carteira está crescendo.', cor: '#4a7c59' },
  { key: 'ten_sessions',    check: function(){ return getTrialCount() >= 10; },         msg: '🔥 10 sessões realizadas! Você está construindo algo real.', cor: '#3b6ea5' },
  { key: 'first_briefing',  check: function(){ return !!localStorage.getItem('tf_last_briefing'); }, msg: '✦ Primeiro Briefing IA gerado! A calibração por abordagem é o coração do TheraFlow.', cor: '#6d28d9' },
  { key: 'first_export',    check: function(){ return !!localStorage.getItem('tf_first_export'); },  msg: '📄 Primeiro prontuário exportado! Documentação clínica profissional.', cor: '#b45309' },
];

/* ── TOUR DE ONBOARDING ── */
var _tourStep = 0;
var _TOUR_STEPS = [
  { icon: '🌿', titulo: 'Bem-vindo ao TheraFlow!', desc: 'A plataforma de gestão clínica calibrada pela sua abordagem terapêutica. Vamos mostrar os principais recursos em 5 passos.' },
  { icon: '🧑‍⚕️', titulo: 'Cadastre seus pacientes', desc: 'Em <strong>Pacientes</strong> você cadastra fichas completas — queixa principal, histórico, CID, abordagem individual e muito mais.' },
  { icon: '🗓', titulo: 'Organize sua agenda', desc: 'Em <strong>Agenda</strong> você agenda sessões, visualiza a semana e o mês, e bloqueia períodos de folga ou férias.' },
  { icon: '✦', titulo: 'Briefing IA antes de cada sessão', desc: 'O <strong>Briefing IA</strong> analisa o histórico do paciente e gera perguntas e hipóteses calibradas pela sua abordagem — em segundos.' },
  { icon: '📋', titulo: 'Portal do paciente entre as sessões', desc: 'O <strong>Portal do Paciente</strong> permite exercícios, diário de humor e acompanhamento — tudo sincronizado com seu painel.' }
];

function iniciarTour() {
  if (localStorage.getItem('tf_tour_done')) return;
  _tourStep = 0;
  _renderTourStep();
  showModal('modal-tour');
}
function _renderTourStep() {
  var s = _TOUR_STEPS[_tourStep];
  var cont = document.getElementById('tour-step-content');
  var dots = document.getElementById('tour-dots');
  var btnNext = document.getElementById('tour-btn-next');
  var btnSkip = document.getElementById('tour-btn-skip');
  if (!cont) return;
  cont.innerHTML = '<div style="font-size:52px;margin-bottom:12px">' + s.icon + '</div>' +
    '<div style="font-family:\'Instrument Serif\',serif;font-size:22px;margin-bottom:8px;color:var(--ink)">' + s.titulo + '</div>' +
    '<div style="font-size:14px;color:var(--ink-soft);line-height:1.7">' + s.desc + '</div>';
  if (dots) dots.innerHTML = _TOUR_STEPS.map(function(_,i){
    return '<div style="width:7px;height:7px;border-radius:50%;background:' + (i===_tourStep?'var(--sage)':'var(--border)') + ';transition:background .2s"></div>';
  }).join('');
  if (btnNext) btnNext.textContent = _tourStep === _TOUR_STEPS.length - 1 ? 'Começar! 🌱' : 'Próximo →';
  if (btnSkip) btnSkip.style.display = _tourStep === _TOUR_STEPS.length - 1 ? 'none' : '';
}
function avancarTour() {
  _tourStep++;
  if (_tourStep >= _TOUR_STEPS.length) { encerrarTour(); return; }
  _renderTourStep();
}
function encerrarTour() {
  localStorage.setItem('tf_tour_done', '1');
  closeModal('modal-tour');
}

function verificarMarcos() {
  try {
    var vistos = JSON.parse(localStorage.getItem('tf_marcos_vistos') || '[]');
    _MARCOS.forEach(function(m) {
      if (vistos.indexOf(m.key) === -1 && m.check()) {
        vistos.push(m.key);
        localStorage.setItem('tf_marcos_vistos', JSON.stringify(vistos));
        _mostrarMarco(m);
      }
    });
  } catch(e) {}
}

function _mostrarMarco(m) {
  var existing = document.getElementById('marco-toast');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'marco-toast';
  el.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%) translateY(30px);z-index:10001;'
    + 'background:#fff;border:2px solid '+m.cor+';border-radius:14px;padding:16px 24px;'
    + 'box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:inherit;max-width:480px;width:90%;'
    + 'display:flex;align-items:center;gap:14px;opacity:0;transition:all .4s cubic-bezier(.16,1,.3,1)';
  el.innerHTML = '<div style="font-size:28px;flex-shrink:0">🏆</div>'
    + '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:'+m.cor+';margin-bottom:2px">Marco atingido!</div>'
    + '<div style="font-size:13px;color:#1a1a1a;line-height:1.5">'+m.msg+'</div></div>'
    + '<button onclick="this.closest(\'#marco-toast\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;flex-shrink:0">✕</button>';
  document.body.appendChild(el);
  setTimeout(function(){ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; }, 50);
  setTimeout(function(){ el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(30px)'; setTimeout(function(){ el.remove(); }, 400); }, 6000);
}

/* ── SHA-256 para senha do portal do paciente ── */
async function _portalHash(senha) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tf-portal:' + senha));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch(e) {
    return tfHashSenha('portal:' + senha);
  }
}

/* ── Hash de senha (evita plain text no localStorage) ── */
function tfHashSenha(s) {
  // djb2 com salt — não criptograficamente forte, mas protege plain text no DevTools
  var h = 5381;
  var salted = s + ':tf2026:' + s.split('').reverse().join('');
  for (var i = 0; i < salted.length; i++) {
    h = Math.imul(h, 33) ^ salted.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36) + s.length.toString(16);
}

function tfVerificaSenha(input, stored) {
  // Suporta contas antigas com senha plain text (migração gradual)
  if (!stored) return false;
  if (stored === input) return true; // legacy plain text
  return tfHashSenha(input) === stored;
}

/* ── Proteção contra bypass de trial via localStorage ── */
function tfTrialToken(n) {
  return tfHashSenha('trial:' + n + ':theraflow');
}

function getTrialCount() {
  if (_tfPlanPro) return 0;
  try {
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    if (acc.plano === 'pro' || acc.plano === 'clinic') { _tfPlanPro = true; return 0; }
    const n = parseInt(acc.sessoes_usadas || 0, 10);
    // Verifica token de integridade — se adulterado, retorna 20 (bloqueado)
    if (acc.trial_token && acc.trial_token !== tfTrialToken(n)) return 20;
    return n;
  } catch(e) { return 0; }
}

function incrementarSessaoTrial() {
  try {
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    acc.sessoes_usadas = (parseInt(acc.sessoes_usadas || 0, 10)) + 1;
    acc.trial_token = tfTrialToken(acc.sessoes_usadas); // assina o contador
    localStorage.setItem('tf_account', JSON.stringify(acc));
    atualizarTrialUI(acc.sessoes_usadas);
    if (acc.sessoes_usadas >= 20 && !_tfTrialDismissed) {
      setTimeout(() => showModal('modal-trial-esgotado'), 600);
    }
  } catch(e) { console.warn('[TF] Erro ao incrementar sessão trial:', e.message); }
}

function atualizarTrialUI(count) {
  const bar = document.getElementById('trial-counter-bar');
  // Plano Pro: substitui barra de trial por badge verde
  if (_tfPlanPro) {
    if (bar) {
      bar.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px">✦</span><div><div style="font-size:12px;font-weight:700;color:#7fcf97">Plano Pro</div><div style="font-size:10.5px;color:#5a9a6d;margin-top:1px">Sessões ilimitadas</div></div></div>';
      bar.style.background = 'rgba(74,124,89,.2)';
      bar.style.borderColor = 'rgba(74,124,89,.4)';
    }
    return;
  }
  count = count !== undefined ? count : getTrialCount();
  const el = document.getElementById('trial-sessoes-usadas');
  const fill = document.getElementById('trial-progress-fill');
  if (el) el.textContent = count;
  if (fill) fill.style.width = Math.min(100, (count / 20) * 100) + '%';
  if (bar && count >= 20) {
    bar.style.background = 'rgba(192,57,43,.1)';
    bar.style.borderColor = 'rgba(192,57,43,.25)';
    bar.querySelectorAll('span').forEach(s => s.style.color = '#c0392b');
    if (fill) fill.style.background = '#c0392b';
    if (!bar.querySelector('#trial-assinar-btn')) {
      const btn = document.createElement('button');
      btn.id = 'trial-assinar-btn';
      btn.textContent = 'Assinar Pro — R$89/mês →';
      btn.onclick = function() { assinarPro(btn); };
      btn.style.cssText = 'margin-top:8px;width:100%;padding:6px;background:#c0392b;color:#fff;border:none;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit';
      bar.appendChild(btn);
    }
  }
}

// ── /WHEREBY INTEGRATION ─────────────────────────────────────────────────────


function showSessionLink() {
  const _slp = patients[currentSessionPatientIdx] || patients[0];
  const _slNome = _slp ? _slp.name : 'o paciente';
  const _slSlug = _slNome.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const hoje = new Date();
  const fakeLink = `theraflow.app/s/${_slSlug}-${hoje.getDate()}${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][hoje.getMonth()]}`;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '400';
  overlay.innerHTML = `
    <div class="modal fade-in" style="max-width:420px">
      <div class="modal-title" style="margin-bottom:6px">Link da sessão</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:20px">Envie para ${escHTML(_slNome)} entrar na videochamada.</div>
      <div style="display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <span style="font-size:13px;color:var(--ink-soft);flex:1;font-family:monospace">${fakeLink}</span>
        <button class="btn btn-secondary btn-sm" onclick="copySessionLink('${fakeLink}', this)">📋 Copiar</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;background:#f0f7f3;border:1px solid rgba(74,143,110,.2);border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:12px;color:var(--sage)">
        <span>🔗</span>
        <span>Ao enviar ou copiar, o link é salvo automaticamente no portal do paciente</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="flex:1;justify-content:center;background:#e8faf0;border-color:rgba(37,211,102,.3);color:#075E54" onclick="sendLinkWhatsApp('${fakeLink}')">
          📲 Enviar pelo WhatsApp
        </button>
        <button class="btn btn-secondary" style="flex:1;justify-content:center" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _salvarLinkNoPortal(link) {
  var p = patients[currentSessionPatientIdx] || patients[0];
  if (!p) return;
  p.sessionLink = link.startsWith('http') ? link : ('https://' + link);
  salvarPacientes();
}

function copySessionLink(link, btn) {
  _salvarLinkNoPortal(link);
  const fullLink = link.startsWith('http') ? link : ('https://' + link);
  navigator.clipboard?.writeText(fullLink).catch(() => {});
  btn.textContent = '✓ Copiado';
  btn.style.background = 'var(--sage-light)';
  btn.style.color = 'var(--sage)';
  setTimeout(() => { btn.textContent = '📋 Copiar'; btn.style.background = ''; btn.style.color = ''; }, 2000);
  showToast('🔗 Link salvo no portal do paciente');
}

function sendLinkWhatsApp(link) {
  const _wsp = patients[currentSessionPatientIdx] || patients[0];
  const _wsNome = _wsp ? _firstName(_wsp.name) : 'paciente';
  const _wsNum = _wsp?.whatsapp ? _wsp.whatsapp.replace(/\D/g,'') : '';
  const fullLink = link ? (link.startsWith('http') ? link : 'https://' + link) : 'https://theraflow.app/s/sessao';
  _salvarLinkNoPortal(fullLink);
  const msg = encodeURIComponent(`Olá ${_wsNome}! Aqui está o link para nossa sessão de hoje: ${fullLink}\n\nAcesse também pelo seu portal TheraFlow.`);
  const url = _wsNum ? `https://wa.me/${_wsNum.startsWith('55')?_wsNum:'55'+_wsNum}?text=${msg}` : `https://wa.me/?text=${msg}`;
  window.open(url, '_blank');
  document.querySelector('.modal-overlay')?.remove();
  showToast('📲 Link enviado e salvo no portal de ' + _wsNome);
}

/* ── EMAIL via Resend (/api/send-email) ── */
async function _sendEmail(template, to, data) {
  try {
    const authH = await _apiAuthHeader();
    const r = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ template, to, data }),
    });
    const result = await r.json();
    if (!r.ok) {
      console.warn('[send-email]', template, '→', to, '|', result.error);
    } else {
      console.log('[send-email] ok:', template, '→', to);
    }
    return result;
  } catch(e) {
    console.warn('[send-email] fetch error:', e.message);
    return null;
  }
}


// ── AGENDA ───────────────────────────────────────────────────────────────────

let agendaCurrentView = 'dia';
let agendaCurrentDate = new Date();

const _DIAS_LONGO = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const _MESES_AG   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function agendaFormatSubtitle() {
  const d = agendaCurrentDate;
  if (agendaCurrentView === 'dia') {
    return `${_DIAS_LONGO[d.getDay()]}, ${d.getDate()} de ${_MESES_AG[d.getMonth()]} de ${d.getFullYear()}`;
  } else if (agendaCurrentView === 'semana') {
    const start = new Date(d);
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    start.setDate(d.getDate() + diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    if (start.getMonth() === end.getMonth()) {
      return `Semana de ${start.getDate()} a ${end.getDate()} de ${_MESES_AG[start.getMonth()]} de ${start.getFullYear()}`;
    }
    return `Semana de ${start.getDate()} ${_MESES_AG[start.getMonth()].slice(0,3)} a ${end.getDate()} ${_MESES_AG[end.getMonth()].slice(0,3)} de ${end.getFullYear()}`;
  } else {
    const m = _MESES_AG[d.getMonth()];
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${d.getFullYear()}`;
  }
}

function agendaSetView(view) {
  agendaCurrentView = view;
  ['dia','semana','mes'].forEach(v => {
    const el = document.getElementById('agenda-view-' + v);
    const btn = document.getElementById('agenda-btn-' + v);
    if (el) el.style.display = v === view ? 'block' : 'none';
    if (btn) {
      btn.style.background = v === view ? 'var(--sage)' : '#fff';
      btn.style.color = v === view ? '#fff' : 'var(--ink-soft)';
      btn.style.fontWeight = v === view ? '600' : '400';
    }
  });
  const sub = document.getElementById('agenda-subtitle');
  if (sub) sub.textContent = agendaFormatSubtitle();
  if (view === 'mes') renderMonthView();
  else if (view === 'dia') renderDayView();
  else if (view === 'semana') renderWeekView();
}

function agendaNav(dir) {
  if (dir === 0) {
    agendaCurrentDate = new Date();
  } else if (agendaCurrentView === 'dia') {
    agendaCurrentDate = new Date(agendaCurrentDate);
    agendaCurrentDate.setDate(agendaCurrentDate.getDate() + dir);
  } else if (agendaCurrentView === 'semana') {
    agendaCurrentDate = new Date(agendaCurrentDate);
    agendaCurrentDate.setDate(agendaCurrentDate.getDate() + dir * 7);
  } else {
    agendaCurrentDate = new Date(agendaCurrentDate);
    agendaCurrentDate.setMonth(agendaCurrentDate.getMonth() + dir);
  }
  const sub = document.getElementById('agenda-subtitle');
  if (sub) sub.textContent = agendaFormatSubtitle();
  if (agendaCurrentView === 'mes') renderMonthView();
  else if (agendaCurrentView === 'dia') renderDayView();
  else if (agendaCurrentView === 'semana') renderWeekView();
}

function renderMonthView() {
  const grid = document.getElementById('agenda-mes-grid');
  if (!grid) return;

  const d = agendaCurrentDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  const today = new Date();

  // Monta mapa dia → [appointments] usando array real de agendamentos
  const sessoesPorDia = {};
  var mesStr = year + '-' + String(month+1).padStart(2,'0');
  appointments.forEach(function(a) {
    if (a.status === 'cancelada') return;
    if (!a.date || !a.date.startsWith(mesStr)) return;
    var pDay = parseInt(a.date.split('-')[2]);
    if (!sessoesPorDia[pDay]) sessoesPorDia[pDay] = [];
    sessoesPorDia[pDay].push(a);
  });

  // Cabeçalho de dias
  var dias = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr)">';
  dias.forEach(function(d) {
    html += '<div style="padding:10px 8px;text-align:center;font-size:11px;font-weight:700;color:var(--muted);border-bottom:2px solid var(--border)">' + d + '</div>';
  });

  // Primeiro dia do mês e total de dias
  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  // Células vazias antes do dia 1
  for (var i = 0; i < firstDay; i++) {
    html += '<div style="border:1px solid var(--border);min-height:72px;background:#fafafa"></div>';
  }

  // Dias do mês
  for (var day = 1; day <= daysInMonth; day++) {
    var isToday = (day === today.getDate() && month === today.getMonth() && year === today.getFullYear());
    var sessoes = sessoesPorDia[day] || [];
    var hasSessoes = sessoes.length > 0;

    var bg = isToday ? 'var(--sage-light)' : '#fff';
    var numColor = isToday ? 'var(--sage)' : 'var(--ink)';
    var numWeight = isToday ? '700' : '400';
    var border = isToday ? '1px solid var(--sage)' : '1px solid var(--border)';

    var isoDay = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    var isBloqueado = isDiaBlockeado(isoDay);
    if (isBloqueado) { bg = 'var(--bg)'; border = '1px solid var(--border)'; }
    var clickAttr = isBloqueado
      ? 'onclick="showToast(\'⛔ Dia bloqueado — ' + escHTML(_motivoBloqueio(isoDay)) + '\')"'
      : hasSessoes
        ? 'onclick="agendaMesDetalhe(' + day + ',' + month + ',' + year + ')"'
        : 'onclick="showAgendarModal(\'' + isoDay + '\')"';

    html += '<div class="mes-cell" style="border:' + border + ';min-height:72px;padding:6px 8px;background:' + bg + ';cursor:' + (isBloqueado ? 'default' : 'pointer') + ';transition:background .15s;position:relative" '
      + clickAttr
      + (isBloqueado ? '' : ' onmouseenter="this.style.background=\'var(--sage-light)\'" onmouseleave="this.style.background=\'' + bg + '\'"') + '>' +
      '<div style="font-size:12px;font-weight:' + numWeight + ';color:' + (isBloqueado ? 'var(--muted)' : numColor) + ';margin-bottom:4px">' + day + (isToday ? ' <span style="font-size:9px;background:var(--sage);color:#fff;border-radius:4px;padding:1px 4px">hoje</span>' : '') + '</div>';

    if (isBloqueado) {
      html += '<div style="font-size:10px;color:var(--muted);background:var(--border);border-radius:4px;padding:2px 6px;display:inline-block">⛔ bloqueado</div>';
    } else if (hasSessoes) {
      // Mostra até 2 nomes e badge com total (sessoes = appointments agora)
      sessoes.slice(0, 2).forEach(function(a) {
        html += '<div class="' + escHTML(a.color||'appt-green') + '" style="font-size:10px;border-radius:4px;padding:2px 6px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
          + escHTML(_firstName(a.patientName)) + ' ' + (a.time||'') + '</div>';
      });
      if (sessoes.length > 2) {
        html += '<div style="font-size:10px;color:var(--muted);padding:1px 0">+' + (sessoes.length - 2) + ' mais</div>';
      }
    } else {
      // Dia vazio: mostra ícone de adicionar no hover
      html += '<div class="mes-cell-add-hint">+ sessão</div>';
    }

    html += '</div>';
  }


  // Células vazias após o último dia
  var lastDay = new Date(year, month, daysInMonth).getDay();
  for (var j = lastDay + 1; j < 7; j++) {
    html += '<div style="border:1px solid var(--border);min-height:72px;background:#fafafa"></div>';
  }

  html += '</div>';

  // Legenda
  if (Object.keys(sessoesPorDia).length === 0) {
    html += '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Nenhuma sessão agendada neste mês. Agende uma sessão para vê-la aqui.</div>';
  }

  grid.innerHTML = html;
}

function agendaMesDetalhe(day, month, year) {
  var isoDay = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
  var sessoes = appointments.filter(function(a){ return a.date === isoDay && a.status !== 'cancelada'; });
  // Se clicou num dia sem sessões, abre modal de agendamento
  if (!sessoes.length) { showAgendarModal(isoDay); return; }

  var meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var titulo = String(day).padStart(2,'0') + '/' + meses[month];

  var existing = document.getElementById('modal-mes-detalhe');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'modal-mes-detalhe';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
  overlay.innerHTML = '<div style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.2);overflow:hidden">' +
    '<div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-family:\'Instrument Serif\',serif;font-size:18px">Sessões — ' + titulo + '</div>' +
      '<button onclick="document.getElementById(\'modal-mes-detalhe\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)">✕</button>' +
    '</div>' +
    '<div style="padding:16px 24px;display:flex;flex-direction:column;gap:10px">' +
    sessoes.map(function(a) {
      var inits = (a.patientName||'--').slice(0,2).toUpperCase();
      var colorMap = {'appt-green':'#4a7c59','appt-blue':'#3b6ea5','appt-amber':'#b45309','appt-purple':'#6d28d9'};
      var bg = colorMap[a.color] || 'var(--sage)';
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;border:1px solid var(--border)">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">'+escHTML(inits)+'</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:14px;font-weight:500;color:var(--ink)">'+escHTML(a.patientName||'—')+'</div>' +
          '<div style="font-size:12px;color:var(--muted)">'+escHTML(a.abordagem||'—')+' · '+a.time+' · '+a.duration+'min</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">' +
          (a.presenca ? '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:' + (a.presenca==='compareceu'?'var(--sage-light)':a.presenca==='faltou'?'var(--red-light)':'var(--amber-light)') + ';color:' + (a.presenca==='compareceu'?'var(--sage)':a.presenca==='faltou'?'var(--red)':'var(--amber)') + ';font-weight:600">' + (a.presenca==='compareceu'?'✓ Compareceu':a.presenca==='faltou'?'✗ Faltou':'~ Atrasou') + '</span>' : '<button onclick="marcarPresenca(\''+a.id+'\',\'compareceu\')" style="padding:3px 7px;background:var(--sage-light);color:var(--sage);border:1px solid var(--sage);border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit" title="Compareceu">✓</button><button onclick="marcarPresenca(\''+a.id+'\',\'faltou\')" style="padding:3px 7px;background:var(--red-light);color:var(--red);border:1px solid var(--red);border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit" title="Faltou">✗</button><button onclick="marcarPresenca(\''+a.id+'\',\'atrasou\')" style="padding:3px 7px;background:var(--amber-light);color:var(--amber);border:1px solid var(--amber);border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit" title="Atrasou">~</button>') +
          '<button onclick="currentBriefingPatientIdx='+a.patientIdx+';navigate(\'briefing\');document.getElementById(\'modal-mes-detalhe\').remove()" style="padding:5px 8px;background:#f3f0ff;color:#6d28d9;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">✦</button>' +
          '<button onclick="currentSessionPatientIdx='+a.patientIdx+';navigate(\'sessao\');document.getElementById(\'modal-mes-detalhe\').remove()" style="padding:5px 10px;background:var(--sage);color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">▶</button>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>' +
    '<div style="padding:12px 24px 20px;display:flex;justify-content:space-between;align-items:center">' +
      '<button onclick="showAgendarModal(\''+isoDay+'\');document.getElementById(\'modal-mes-detalhe\').remove()" style="padding:8px 14px;background:var(--sage);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">+ Agendar neste dia</button>' +
      '<button onclick="document.getElementById(\'modal-mes-detalhe\').remove()" style="padding:8px 18px;border:1px solid var(--border);background:#fff;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--ink-soft)">Fechar</button>' +
    '</div>' +
  '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Perfil do terapeuta ──
function initPerfil() {
  loadApiKeyToForm();
  showApiKeyStatus(!!getApiKey());
  const ativos = patients.filter(p => p.status === 'Ativa' || p.status === 'Nova').length;
  const heroCount = document.getElementById('perfil-hero-pacientes');
  if (heroCount) heroCount.textContent = ativos;
  // Preenche campos salvos de especialidade/cidade se existirem
  try {
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    const fEsp = document.getElementById('perfil-especialidade');
    const fCid = document.getElementById('perfil-cidade');
    const fDur = document.getElementById('perfil-duracao');
    if (fEsp && acc.especialidade) fEsp.value = acc.especialidade;
    if (fCid && acc.cidade) fCid.value = acc.cidade;
    if (fDur && acc.duracao_sessao) {
      // Seleciona opção correspondente
      Array.from(fDur.options).forEach(function(opt){ opt.selected = (parseInt(opt.value)||parseInt(opt.text)) === parseInt(acc.duracao_sessao); });
    }
    var fValor = document.getElementById('perfil-valor-sessao');
    if (fValor && acc.valor_sessao) fValor.value = acc.valor_sessao;
  } catch(e) { console.warn('[TF] Erro ao carregar perfil:', e.message); }
  initHorariosGrid();
  renderBloqueiosList();
}

function showApiKeyStatus(connected) {
  const el = document.getElementById('api-key-status');
  if (!el) return;
  el.style.display = 'block';
  if (connected) {
    el.style.color = 'var(--sage)';
    el.textContent = '✓ Chave configurada — Briefing IA e Supervisão IA ativos';
  } else {
    el.style.color = 'var(--muted)';
    el.textContent = 'Nenhuma chave configurada — usando dados de demonstração';
  }
}

function selectPerfilAbordagem(el, key) {
  // Seleciona visualmente o card
  document.querySelectorAll('#abordagem-list .abordagem-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  profileAbordagem = key;

  // Atualiza preview de calibração da IA em tempo real
  const cal = abordagemCalibration[key];
  if (!cal) return;
  const notas = document.getElementById('calib-notas');
  const briefing = document.getElementById('calib-briefing');
  const supervisao = document.getElementById('calib-supervisao');
  const plano = document.getElementById('calib-plano');
  if (notas) notas.textContent = cal.notas;
  if (briefing) briefing.textContent = cal.briefing;
  if (supervisao) supervisao.textContent = cal.supervisao;
  if (plano) plano.textContent = cal.plano;
}

function exportarBackupLGPD() {
  try {
    var dados = { _meta: { gerado_em: new Date().toISOString(), versao: '1.0', app: 'TheraFlow' } };
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || !k.startsWith('tf_')) continue;
      try { dados[k] = JSON.parse(localStorage.getItem(k)); }
      catch(e) { dados[k] = localStorage.getItem(k); }
    }
    var json = JSON.stringify(dados, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    var dt   = new Date().toISOString().slice(0,10);
    a.href = url; a.download = 'theraflow-backup-' + dt + '.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('⬇ Backup exportado com sucesso.');
  } catch(e) {
    console.warn('[TF] Erro ao exportar backup LGPD:', e.message);
    showToast('⚠ Erro ao exportar dados.');
  }
}

function saveProfile() {
  const nome        = document.getElementById('perfil-nome')?.value.trim() || '';
  const crp         = document.getElementById('perfil-crp')?.value.trim() || '';
  const especialidade = document.getElementById('perfil-especialidade')?.value.trim() || '';
  const cidade      = document.getElementById('perfil-cidade')?.value.trim() || '';

  if (!nome) { showToast('⚠ Informe seu nome.'); return; }

  // Calcula iniciais (até 2 letras)
  const initials = nome.trim().split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase())
    .slice(0, 2).join('');

  const firstName = nome.split(' ')[0];
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  // ── Atualiza hero do perfil ──
  const heroNome = document.getElementById('perfil-hero-nome');
  const heroAvatar = document.getElementById('perfil-hero-avatar');
  const heroCrp = document.getElementById('perfil-hero-crp');
  const heroEsp = document.getElementById('perfil-hero-especialidade');
  const heroCidade = document.getElementById('perfil-hero-cidade');
  if (heroNome) heroNome.textContent = nome;
  if (heroAvatar) heroAvatar.textContent = initials;
  if (heroCrp) heroCrp.textContent = '🪪 CRP ' + crp + ' — ativo';
  if (heroEsp) heroEsp.textContent = especialidade;
  if (heroCidade) heroCidade.textContent = cidade;

  // ── Atualiza sidebar ──
  document.querySelectorAll('.therapist-name').forEach(el => el.textContent = nome);
  document.querySelectorAll('.therapist-role').forEach(el => el.textContent = (especialidade || 'Psicólogo(a)') + ' · CRP ' + crp);
  document.querySelectorAll('#tf-app-layer .avatar').forEach(el => el.textContent = initials);
  document.querySelectorAll('#tf-app-layer .perfil-avatar-lg').forEach(el => el.textContent = initials);
  document.querySelectorAll('#tf-app-layer .perfil-name').forEach(el => el.textContent = nome);

  // ── Atualiza saudação no dashboard ──
  const dashTitle = document.querySelector('#page-dashboard .page-title');
  if (dashTitle) dashTitle.textContent = saud + ', ' + firstName;

  // ── Sincroniza tfUserData ──
  tfUserData.nome        = nome;
  tfUserData.crp         = crp;
  tfUserData.abordagemKey = profileAbordagem;
  // Converte chave → nome display
  var keyToLabel = {tcc:'TCC', psicanalise:'Psicanálise', sistemica:'Sistêmica', humanista:'Humanista', act:'ACT'};
  tfUserData.abordagem = keyToLabel[profileAbordagem] || profileAbordagem;

  // ── Salva dados no localStorage ──
  const apiKeyInput = document.getElementById('perfil-api-key');
  const apiKeyVal = apiKeyInput ? apiKeyInput.value.trim() : '';
  // Valida formato da chave Claude antes de salvar
  if (apiKeyVal && !apiKeyVal.startsWith('sk-ant-')) {
    showToast('⚠ Chave inválida. A chave Claude começa com "sk-ant-".');
    return;
  }
  try {
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    acc.nome = nome;
    acc.especialidade = especialidade;
    acc.cidade = cidade;
    var emailSup = document.getElementById('perfil-email-suporte');
    if (emailSup) acc.email_suporte = emailSup.value.trim();
    var wppEl = document.getElementById('perfil-whatsapp');
    if (wppEl) acc.whatsapp = wppEl.value.trim();
    var wppTplEl = document.getElementById('perfil-wpp-template');
    if (wppTplEl) acc.wpp_template = wppTplEl.value.trim();
    var pixEl = document.getElementById('perfil-pix-key');
    if (pixEl) acc.pix_key = pixEl.value.trim();
    if (apiKeyVal) acc.claude_api_key = apiKeyVal;
    else delete acc.claude_api_key;
    localStorage.setItem('tf_account', JSON.stringify(acc));
    showApiKeyStatus(!!apiKeyVal);
  } catch(e) { console.warn('[TF] Erro ao salvar perfil:', e.message); }

  // ── Reaplica em todo o app ──
  aplicarDadosNoApp();

  // ── Toast com abordagem ──
  const labels = {tcc:'TCC', psicanalise:'Psicanálise', sistemica:'Sistêmica', humanista:'Humanista/Gestalt', act:'ACT/DBT'};
  const abordLabel = labels[profileAbordagem] || profileAbordagem;
  const apiMsg = apiKeyVal ? ' · API Claude conectada.' : '';
  // Sincroniza duração e valor padrão de sessão
  var duracaoEl = document.getElementById('perfil-duracao');
  var valorEl   = document.getElementById('perfil-valor-sessao');
  if (duracaoEl || valorEl) {
    try {
      var acc2 = JSON.parse(localStorage.getItem('tf_account')||'{}');
      if (duracaoEl) acc2.duracao_sessao = parseInt(duracaoEl.value) || 50;
      if (valorEl)   acc2.valor_sessao   = parseFloat(valorEl.value) || 0;
      localStorage.setItem('tf_account', JSON.stringify(acc2));
    } catch(e2){}
  }
  salvarHorarios();
  showToast('✓ Perfil salvo. IA recalibrada para ' + abordLabel + apiMsg);
}

/* ── Alterar senha do terapeuta ── */
async function atualizarSenha() {
  var senhaAtual    = document.getElementById('perfil-senha-atual')?.value || '';
  var senhaNova     = document.getElementById('perfil-senha-nova')?.value || '';
  var senhaConfirma = document.getElementById('perfil-senha-confirmar')?.value || '';

  if (!senhaAtual)    { showToast('⚠ Informe a senha atual.'); return; }
  if (!senhaNova)     { showToast('⚠ Informe a nova senha.'); return; }
  if (senhaNova.length < 8) { showToast('⚠ A nova senha deve ter pelo menos 8 caracteres.'); return; }
  if (senhaNova !== senhaConfirma) { showToast('⚠ As senhas não coincidem.'); return; }

  try {
    // Re-autentica com a senha atual para confirmar identidade
    var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
    var email = acc.email || (typeof tfUserData !== 'undefined' ? tfUserData.email : '');
    if (email) {
      var { error: signInErr } = await supa.auth.signInWithPassword({ email, password: senhaAtual });
      if (signInErr) { showToast('⚠ Senha atual incorreta.'); return; }
    }
    var { error } = await supa.auth.updateUser({ password: senhaNova });
    if (error) { showToast('⚠ Erro ao atualizar senha: ' + error.message); return; }
    // Limpa campos
    document.getElementById('perfil-senha-atual').value = '';
    document.getElementById('perfil-senha-nova').value = '';
    document.getElementById('perfil-senha-confirmar').value = '';
    showToast('✓ Senha atualizada com sucesso!');
  } catch(e) {
    showToast('⚠ Erro inesperado. Tente novamente.');
    console.warn('[TF] atualizarSenha:', e.message);
  }
}

/* ══════════════════════════════════════════════════════════

// ── Nota rápida flutuante ──
/* ── NOTA RÁPIDA FLUTUANTE ── */
function abrirNotaRapida() {
  var sel = document.getElementById('nr-paciente');
  if (sel) {
    sel.innerHTML = patients.map(function(p,i){ return '<option value="'+i+'">'+escHTML(p.name)+'</option>'; }).join('');
    if (currentPatientIdx >= 0 && currentPatientIdx < patients.length) sel.value = currentPatientIdx;
  }
  var ta = document.getElementById('nr-texto');
  if (ta) ta.value = '';
  showModal('modal-nota-rapida');
  setTimeout(function(){ if(ta) ta.focus(); }, 100);
}
function salvarNotaRapida() {
  var sel = document.getElementById('nr-paciente');
  var ta = document.getElementById('nr-texto');
  var idx = sel ? parseInt(sel.value) : 0;
  var texto = ta ? ta.value.trim() : '';
  if (!texto) { showToast('⚠ Escreva a nota antes de salvar.'); return; }
  var p = patients[idx];
  if (!p) return;
  if (!p.prontuarioNotes) p.prontuarioNotes = [];
  var hoje = new Date();
  var data = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0');
  p.prontuarioNotes.push({ date: data, text: texto });
  salvarPacientes();
  closeModal('modal-nota-rapida');
  showToast('✓ Nota salva no prontuário de ' + _firstName(p.name) + '.');
}
