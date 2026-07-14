// 19-captacao.js — Pipeline de captação: Kanban de leads para novos pacientes

var captacaoLeads = [];
var _captacaoEditId = null;

// Esteira enxuta (pedido do usuário 14/07, pensando na terapeuta real): as duas
// etapas de triagem ("agendada"/"realizada") viraram UMA — na prática a conversa
// inicial acontece e o próximo passo já é proposta ou perda; a coluna extra só
// dava trabalho de arrastar.
var CAPTACAO_COLS = [
  { label: 'Novo contato',      icon: '📥', color: '#8a9490' },
  { label: 'Conversa inicial',  icon: '💬', color: '#4a7c59' },
  { label: 'Proposta enviada',  icon: '📋', color: '#c97d2e' },
  { label: 'Em espera de vaga', icon: '⏳', color: '#6b7c8a' },
  { label: 'Perdido',           icon: '✗',  color: '#c0392b' },
];
var CAPTACAO_PERDIDO = CAPTACAO_COLS.length - 1;

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
  // Migração v2 (fusão das triagens): esquema antigo tinha 6 colunas —
  // 2 (realizada) funde na 1 (conversa); 3/4/5 deslocam uma casa. Idempotente
  // pela flag v:2 em cada lead.
  var mudou = false;
  var mapa = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
  captacaoLeads.forEach(function(l) {
    if (!l || l.v === 2) return;
    l.coluna = mapa[l.coluna] !== undefined ? mapa[l.coluna] : 0;
    l.v = 2;
    mudou = true;
  });
  if (mudou) { try { localStorage.setItem('tf_captacao', JSON.stringify(captacaoLeads)); } catch(e) {} }
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
  var ativos = captacaoLeads.filter(function(l){ return l.coluna < CAPTACAO_PERDIDO; }).length;
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
  var ativos = captacaoLeads.filter(function(l){ return l.coluna < CAPTACAO_PERDIDO; }).length;
  var perdidos = captacaoLeads.filter(function(l){ return l.coluna === CAPTACAO_PERDIDO; }).length;
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
  // Empty state GLOBAL: sem nenhum lead, 6 colunas com "Sem leads aqui" era um
  // deserto sem próxima ação (V4).
  if (captacaoLeads.length === 0) {
    board.innerHTML = '<div style="flex:1;padding:56px 24px;text-align:center;color:var(--muted)">'
      + '<div style="font-size:40px;margin-bottom:12px">📥</div>'
      + '<div style="font-weight:600;font-size:15px;color:var(--ink-soft);margin-bottom:6px">Seu pipeline está vazio</div>'
      + '<div style="font-size:13px;margin-bottom:20px;max-width:380px;margin-left:auto;margin-right:auto">Registre aqui cada pessoa que entra em contato — da primeira mensagem até virar paciente. Nada de perder lead no WhatsApp.</div>'
      + '<button class="btn btn-primary" onclick="abrirModalLead()">+ Registrar primeiro contato</button>'
      + '</div>';
    _captacaoSubtitle();
    return;
  }
  var html = '';
  CAPTACAO_COLS.forEach(function(col, colIdx) {
    var leads = captacaoLeads.filter(function(l){ return l.coluna === colIdx; });
    html += '<div class="kanban-col">';
    html += '<div class="kanban-col-header" style="border-top:3px solid ' + col.color + '">';
    html += '<span>' + col.icon + '</span><span>' + escHTML(col.label) + '</span>';
    html += '<span class="kanban-col-count">' + leads.length + '</span>';
    html += '</div>';
    // Corpo é alvo de drop: arrastar o card entre colunas (V4)
    html += '<div class="kanban-col-body" data-col="' + colIdx + '"'
      + ' ondragover="event.preventDefault();this.classList.add(\'drag-over\')"'
      + ' ondragleave="this.classList.remove(\'drag-over\')"'
      + ' ondrop="_capDrop(event,' + colIdx + ')">';
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

// ── Drag-and-drop entre colunas (V4) ─────────────────────────────────────────
function _capDragStart(ev, id) {
  ev.dataTransfer.setData('text/plain', id);
  ev.dataTransfer.effectAllowed = 'move';
}
function _capDrop(ev, colIdx) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-over');
  var id = ev.dataTransfer.getData('text/plain');
  var lead = captacaoLeads.find(function(l){ return l.id === id; });
  if (!lead || lead.coluna === colIdx) return;
  lead.coluna = colIdx;
  salvarCaptacao();
  renderKanban();
  showToast('Lead movido para "' + CAPTACAO_COLS[colIdx].label + '".');
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
  var isPerdido = (colIdx === CAPTACAO_PERDIDO);

  // _wppNumero normaliza o prefixo 55 (não duplica quando o número já vem com +55) e
  // rejeita 0800/0300. Antes: 'wa.me/55'+num gerava '5555...' p/ leads com +55. F4.5.
  var _wn = (typeof _wppNumero === 'function') ? _wppNumero(lead.whatsapp) : (lead.whatsapp || '').replace(/\D/g, '');
  var wppHref = _wn ? 'https://wa.me/' + _wn : '';

  var diasLabel = '';
  if (lead.criado) {
    var dias = Math.floor((Date.now() - new Date(lead.criado).getTime()) / 86400000);
    diasLabel = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : 'há ' + dias + 'd';
  }

  var html = '<div class="kanban-card" draggable="true" ondragstart="_capDragStart(event,\'' + lead.id + '\')">';

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

/* 🔗 Link para bio/campanhas (pedido do usuário 14/07): wa.me da terapeuta com
 * mensagem pronta — quem clica na bio do Instagram/anúncio cai direto no
 * WhatsApp dela já se apresentando. Honesto: o lead chega no WhatsApp; o
 * registro no pipeline continua manual (+ Novo lead). */
function abrirLinkCaptacao() {
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch (e) {}
  var n = (typeof _wppNumero === 'function') ? _wppNumero(acc.whatsapp) : null;
  var existente = document.getElementById('modal-link-captacao');
  if (existente) existente.remove();
  var modal = document.createElement('div');
  modal.id = 'modal-link-captacao';
  modal.className = 'modal-overlay';
  var corpo;
  if (!n) {
    corpo = '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">Para gerar o link, cadastre seu <strong>WhatsApp</strong> no Perfil (campo "WhatsApp" em Dados profissionais).</div>'
      + '<button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="closeModal(\'modal-link-captacao\');navigate(\'perfil\')">Abrir Perfil →</button>';
  } else {
    var msg = 'Olá! Vi seu perfil e gostaria de agendar uma conversa inicial.';
    var link = 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg);
    corpo = '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin-bottom:12px">Cole este link na <strong>bio do Instagram</strong>, em anúncios ou onde divulgar seu trabalho. Quem clicar cai direto no seu WhatsApp com a mensagem pronta:</div>'
      + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--muted);font-style:italic;margin-bottom:12px">“' + msg + '”</div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + '<input id="cap-link-input" readonly value="' + escHTML(link) + '" style="flex:1;font-size:11.5px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink);background:var(--white);outline:none"/>'
      + '<button class="btn btn-primary btn-sm" onclick="var i=document.getElementById(\'cap-link-input\');i.select();navigator.clipboard.writeText(i.value).then(function(){showToast(\'🔗 Link copiado — cole na sua bio!\')})">Copiar</button>'
      + '</div>'
      + '<div style="font-size:11.5px;color:var(--muted);margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2);line-height:1.5">Quando alguém chamar, registre aqui com <strong>+ Novo lead</strong> (origem: Instagram/anúncio) — assim nenhum contato se perde no WhatsApp.</div>';
  }
  modal.innerHTML = '<div class="modal" style="max-width:480px">'
    + '<div class="modal-header"><div class="modal-title">🔗 Link para bio e campanhas</div>'
    + '<button class="modal-close" onclick="closeModal(\'modal-link-captacao\')">✕</button></div>'
    + '<div class="modal-body">' + corpo + '</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.classList.remove('open'); });
  modal.classList.add('open');
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
  if (!confirm('Converter "' + lead.nome + '" para paciente?\nO lead sairá do pipeline ao confirmar a ficha.')) return;

  var nome   = lead.nome;
  var wpp    = lead.whatsapp || '';
  var queixa = lead.queixa  || '';

  // NÃO remove o lead aqui — só após a ficha do paciente ser criada de fato.
  // Caso contrário, se o usuário cancelar o modal (ou não marcar o consentimento
  // LGPD, que é obrigatório em criarPaciente), o lead seria perdido sem virar paciente.

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
    // Substitui o handler do botão "Criar ficha": só remove o lead se o paciente
    // for realmente criado. O handler original volta via limparModalPaciente —
    // no sucesso (criarPaciente a chama) e em toda abertura normal do modal
    // (abrirModalNovoPaciente), então a troca não vaza p/ cadastros comuns. V4.
    var criarBtn = document.getElementById('btn-criar-paciente');
    if (criarBtn) {
      criarBtn.onclick = function(){ _finalizarConversaoLead(id); };
    }
    showModal('modal-novo-paciente');
  }, 250);
}

// Cria o paciente via criarPaciente() e, em caso de sucesso, remove o lead do pipeline.
function _finalizarConversaoLead(leadId) {
  var before = (typeof patients !== 'undefined' && patients) ? patients.length : 0;
  if (typeof criarPaciente === 'function') criarPaciente();
  var after = (typeof patients !== 'undefined' && patients) ? patients.length : 0;
  if (after > before) {
    // Paciente criado com sucesso → agora sim remove o lead do pipeline.
    captacaoLeads = captacaoLeads.filter(function(l){ return l.id !== leadId; });
    salvarCaptacao();
    if (typeof atualizarBadgeCaptacao === 'function') atualizarBadgeCaptacao();
  }
  // Se não criou (validação bloqueou), o lead permanece no pipeline.
}
