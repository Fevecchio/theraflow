// 19-captacao.js — Pipeline de captação: Kanban de leads para novos pacientes

var captacaoLeads = [];
var _captacaoEditId = null;

var CAPTACAO_COLS = [
  { label: 'Novo contato',      icon: '📥', color: '#8a9490' },
  { label: 'Triagem agendada',  icon: '📅', color: '#4a7c59' },
  { label: 'Triagem realizada', icon: '✓',  color: '#2a5238' },
  { label: 'Proposta enviada',  icon: '📋', color: '#c97d2e' },
  { label: 'Em espera de vaga', icon: '⏳', color: '#6b7c8a' },
  { label: 'Perdido',           icon: '✗',  color: '#c0392b' },
];

var CAPTACAO_ORIGENS = {
  indicacao:  'Indicação',
  instagram:  'Instagram',
  doctoralia: 'Doctoralia',
  site:       'Site / Google',
  outro:      'Outro',
};

var _CAP_CORES = ['#4a7c59','#2c5f8a','#c97d2e','#7b5ea7','#2a7c7c','#8a4a4a'];

function carregarCaptacao() {
  try { captacaoLeads = JSON.parse(localStorage.getItem('tf_captacao') || '[]'); }
  catch(e) { captacaoLeads = []; }
}

function salvarCaptacao() {
  try { localStorage.setItem('tf_captacao', JSON.stringify(captacaoLeads)); } catch(e) {}
  atualizarBadgeCaptacao();
}

function atualizarBadgeCaptacao() {
  // Lazy-load se captacaoLeads ainda não foi populado nesta sessão
  if (captacaoLeads.length === 0) {
    try { captacaoLeads = JSON.parse(localStorage.getItem('tf_captacao') || '[]'); } catch(e) {}
  }
  var ativos = captacaoLeads.filter(function(l){ return l.coluna < 5; }).length;
  var badge = document.getElementById('nav-captacao-badge');
  if (!badge) return;
  if (ativos > 0) { badge.textContent = ativos; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

function initCaptacao() {
  carregarCaptacao();
  renderKanban();
  atualizarBadgeCaptacao();
}

function _captacaoSubtitle() {
  var ativos = captacaoLeads.filter(function(l){ return l.coluna < 5; }).length;
  var perdidos = captacaoLeads.filter(function(l){ return l.coluna === 5; }).length;
  var txt = ativos === 0 ? 'Nenhum lead em aberto'
          : ativos === 1 ? '1 lead em aberto'
          : ativos + ' leads em aberto';
  if (perdidos > 0) txt += ' · ' + perdidos + ' perdido' + (perdidos !== 1 ? 's' : '');
  var el = document.getElementById('captacao-subtitle');
  if (el) el.textContent = txt;
}

function renderKanban() {
  var board = document.getElementById('kanban-board');
  if (!board) return;
  var html = '';
  CAPTACAO_COLS.forEach(function(col, colIdx) {
    var leads = captacaoLeads.filter(function(l){ return l.coluna === colIdx; });
    html += '<div class="kanban-col">';
    html += '<div class="kanban-col-header" style="border-top:3px solid ' + col.color + '">';
    html += '<span>' + col.icon + '</span><span>' + escHTML(col.label) + '</span>';
    html += '<span class="kanban-col-count">' + leads.length + '</span>';
    html += '</div>';
    html += '<div class="kanban-col-body">';
    if (leads.length === 0) {
      html += '<div class="kanban-empty">Sem leads aqui</div>';
    } else {
      leads.forEach(function(lead) { html += _renderCard(lead, colIdx); });
    }
    html += '</div></div>';
  });
  board.innerHTML = html;
  _captacaoSubtitle();
}

function _capIniciais(nome) {
  var partes = (nome || '').trim().split(/\s+/);
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function _capCor(id) {
  var h = 0;
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return _CAP_CORES[h % _CAP_CORES.length];
}

function _renderCard(lead, colIdx) {
  var ini = _capIniciais(lead.nome);
  var cor = _capCor(lead.id);
  var origemLabel = CAPTACAO_ORIGENS[lead.origem] || (lead.origem || '');
  var isPerdido = (colIdx === 5);

  var wppClean = (lead.whatsapp || '').replace(/\D/g, '');
  var wppHref = wppClean.length >= 8 ? 'https://wa.me/55' + wppClean : '';

  var diasLabel = '';
  if (lead.criado) {
    var dias = Math.floor((Date.now() - new Date(lead.criado).getTime()) / 86400000);
    diasLabel = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : 'há ' + dias + 'd';
  }

  var html = '<div class="kanban-card">';

  // Avatar + nome
  html += '<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px">';
  html += '<div class="kanban-avatar" style="background:' + cor + '">' + ini + '</div>';
  html += '<div style="min-width:0;flex:1">';
  html += '<div class="kanban-card-name">' + escHTML(lead.nome) + '</div>';
  if (origemLabel) html += '<div style="font-size:10.5px;color:var(--muted)">' + escHTML(origemLabel) + '</div>';
  html += '</div>';
  if (diasLabel) html += '<div style="font-size:10px;color:var(--muted);flex-shrink:0">' + diasLabel + '</div>';
  html += '</div>';

  // Queixa
  if (lead.queixa) {
    html += '<div class="kanban-card-queixa">' + escHTML(lead.queixa) + '</div>';
  } else if (lead.obs) {
    html += '<div class="kanban-card-queixa" style="font-style:italic">' + escHTML(lead.obs) + '</div>';
  }

  // Ações
  html += '<div class="kanban-card-actions">';

  if (colIdx > 0)
    html += '<button class="kanban-btn" title="Etapa anterior" onclick="event.stopPropagation();moverLead(\'' + lead.id + '\',-1)">←</button>';
  if (colIdx < CAPTACAO_COLS.length - 1)
    html += '<button class="kanban-btn" title="Avançar etapa" onclick="event.stopPropagation();moverLead(\'' + lead.id + '\',1)">→</button>';
  if (wppHref)
    html += '<a href="' + wppHref + '" target="_blank" class="kanban-btn" title="WhatsApp" onclick="event.stopPropagation()" style="text-decoration:none">💬</a>';
  html += '<button class="kanban-btn" title="Editar" onclick="event.stopPropagation();editarLead(\'' + lead.id + '\')">✎</button>';
  if (!isPerdido)
    html += '<button class="kanban-btn kanban-btn-convert" title="Converter para paciente" onclick="event.stopPropagation();converterParaPaciente(\'' + lead.id + '\')">✓ Paciente</button>';
  html += '<button class="kanban-btn kanban-btn-danger" title="Excluir" onclick="event.stopPropagation();excluirLead(\'' + lead.id + '\')">🗑</button>';

  html += '</div></div>';
  return html;
}

function abrirModalLead(id) {
  _captacaoEditId = id || null;
  var lead = id ? captacaoLeads.find(function(l){ return l.id === id; }) : null;
  document.getElementById('modal-lead-titulo').textContent = lead ? 'Editar lead' : 'Novo lead';
  document.getElementById('lead-nome-input').value   = lead ? lead.nome            : '';
  document.getElementById('lead-wpp-input').value    = lead ? (lead.whatsapp || '') : '';
  document.getElementById('lead-origem-select').value= lead ? (lead.origem || 'indicacao') : 'indicacao';
  document.getElementById('lead-queixa-input').value = lead ? (lead.queixa || '')  : '';
  document.getElementById('lead-obs-input').value    = lead ? (lead.obs || '')     : '';
  showModal('modal-captacao-lead');
  setTimeout(function(){ var el = document.getElementById('lead-nome-input'); if(el) el.focus(); }, 120);
}

function editarLead(id) { abrirModalLead(id); }

function salvarLead() {
  var nome  = (document.getElementById('lead-nome-input').value  || '').trim();
  var wpp   = (document.getElementById('lead-wpp-input').value   || '').trim();
  if (!nome) { showToast('Informe o nome do lead.', 'error'); document.getElementById('lead-nome-input').focus(); return; }
  if (!wpp)  { showToast('Informe o WhatsApp.', 'error');     document.getElementById('lead-wpp-input').focus();  return; }

  var origem = document.getElementById('lead-origem-select').value;
  var queixa = (document.getElementById('lead-queixa-input').value || '').trim();
  var obs    = (document.getElementById('lead-obs-input').value    || '').trim();

  if (_captacaoEditId) {
    var idx = captacaoLeads.findIndex(function(l){ return l.id === _captacaoEditId; });
    if (idx >= 0) Object.assign(captacaoLeads[idx], { nome: nome, whatsapp: wpp, origem: origem, queixa: queixa, obs: obs });
    showToast('Lead atualizado.');
  } else {
    captacaoLeads.push({ id: crypto.randomUUID(), nome: nome, whatsapp: wpp, origem: origem, queixa: queixa, obs: obs, coluna: 0, criado: new Date().toISOString() });
    showToast('Lead adicionado!');
  }

  salvarCaptacao();
  closeModal('modal-captacao-lead');
  renderKanban();
}

function moverLead(id, dir) {
  var lead = captacaoLeads.find(function(l){ return l.id === id; });
  if (!lead) return;
  var nova = lead.coluna + dir;
  if (nova < 0 || nova >= CAPTACAO_COLS.length) return;
  lead.coluna = nova;
  salvarCaptacao();
  renderKanban();
}

function excluirLead(id) {
  var lead = captacaoLeads.find(function(l){ return l.id === id; });
  if (!lead) return;
  if (!confirm('Excluir o lead "' + lead.nome + '"?')) return;
  captacaoLeads = captacaoLeads.filter(function(l){ return l.id !== id; });
  salvarCaptacao();
  renderKanban();
}

function converterParaPaciente(id) {
  var lead = captacaoLeads.find(function(l){ return l.id === id; });
  if (!lead) return;
  if (!confirm('Converter "' + lead.nome + '" para paciente?\nO lead será removido do pipeline.')) return;

  var nome   = lead.nome;
  var wpp    = lead.whatsapp || '';
  var queixa = lead.queixa  || '';

  captacaoLeads = captacaoLeads.filter(function(l){ return l.id !== id; });
  salvarCaptacao();

  // Navega para Pacientes e abre o modal de novo paciente pré-preenchido
  navigate('pacientes');
  setTimeout(function() {
    if (typeof limparModalPaciente === 'function') limparModalPaciente();
    var nomeEl   = document.getElementById('np-nome');
    var wppEl    = document.getElementById('np-whatsapp');
    var queixaEl = document.getElementById('np-queixa');
    if (nomeEl)   nomeEl.value   = nome;
    if (wppEl)    wppEl.value    = wpp;
    if (queixaEl && queixa) queixaEl.value = queixa;
    showModal('modal-novo-paciente');
  }, 250);
}
