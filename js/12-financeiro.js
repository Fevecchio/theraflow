// 12-financeiro.js — Financeiro, cobranças, planos mensais, recibos, relatórios

function abrirModalNovoPlano() {
  // Popula o select com os pacientes reais (antes tinha nomes DEMO fixos no HTML).
  var sel = document.getElementById('plan-paciente-select');
  if (sel) {
    var lista = (typeof patients !== 'undefined' ? patients : []).filter(function(p){ return p && p.name; });
    sel.innerHTML = '<option value="">Selecionar paciente…</option>' + lista.map(function(p){
      return '<option value="' + escHTML(p.name) + '">' + escHTML(p.name) + '</option>';
    }).join('');
  }
  const el = document.getElementById('fin-plano-data');
  if (el) el.value = new Date().toLocaleDateString('pt-BR');
  showModal('modal-novo-plano');
}

/* Converte texto de valor BR ("R$ 1.200,00") para número. */
function _parseValorBR(s) {
  s = String(s || '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

/* ── NOVA COBRANÇA AVULSA (F4.1) ── */
function abrirModalNovaCobranca() {
  var sel = document.getElementById('nc-paciente');
  if (sel) {
    var lista = (typeof patients !== 'undefined' ? patients : []).filter(function(p){ return p && p.name; });
    sel.innerHTML = '<option value="">Selecionar paciente…</option>' + lista.map(function(p){
      return '<option value="' + escHTML(p.name) + '">' + escHTML(p.name) + '</option>';
    }).join('');
  }
  var dt = document.getElementById('nc-data');
  if (dt) dt.value = hojeISO();
  var val = document.getElementById('nc-valor');
  if (val && !val.value) {
    // Pré-preenche com o valor de sessão configurado no perfil, se houver
    try {
      var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
      var vs = parseFloat(acc.valor_sessao);
      if (vs > 0) val.value = vs;
    } catch(e) {}
  }
  showModal('modal-nova-cobranca');
}

function criarNovaCobranca() {
  var nome = (document.getElementById('nc-paciente') || {}).value || '';
  var valor = parseFloat((document.getElementById('nc-valor') || {}).value);
  var dataIso = (document.getElementById('nc-data') || {}).value || hojeISO();
  var metodo = (document.getElementById('nc-metodo') || {}).value || 'PIX';
  if (!nome) { showToast('Selecione o paciente.', 'warning'); return; }
  if (isNaN(valor) || valor <= 0 || valor >= 100000) { showToast('Informe um valor válido (maior que zero).', 'warning'); return; }
  var p = (typeof patients !== 'undefined' ? patients : []).find(function(x){ return x.name === nome; });
  var diaFmt = fmtDataBR(dataIso);
  charges.push({
    id: Date.now(),
    patient: nome,
    initials: p ? p.initials : nome.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase(),
    color: p ? p.color : '#4a7c59',
    desc: 'Sessão ' + diaFmt,
    value: valor,
    date: dataIso,
    status: 'pending',
    deleted: false,
    billing: 'avulso',
    session: diaFmt,
    method: metodo,
  });
  salvarCharges();
  if (typeof _recalcFinStatus === 'function') { _recalcFinStatus(); if (typeof salvarPacientes === 'function') salvarPacientes(); }
  var valEl = document.getElementById('nc-valor');
  if (valEl) valEl.value = '';
  closeModal('modal-nova-cobranca');
  renderCharges();
  if (typeof atualizarStatsFinanceiro === 'function') atualizarStatsFinanceiro();
  showToast('💳 Cobrança criada para ' + _firstName(nome) + ' — ' + fmtMoedaInt(valor));
}

/* ── FINANCEIRO & COBRANÇAS ── */
let charges = [];
let currentFinMode = 'pos'; // sobrescrito por _finModeInit() com o valor real salvo

// Popula o select de mês com os meses REAIS das cobranças (value YYYY-MM).
// Antes as opções eram fixas ("Março 2026") sem value válido → o filtro por mês
// não casava com _chargeMonthKey (YYYY-MM) e não funcionava.
function _popularMesSelect() {
  var sel = document.getElementById('fin-month-select');
  if (!sel) return;
  var atual = sel.value;
  var meses = {};
  (typeof charges !== 'undefined' ? charges : []).forEach(function(c){
    if (c.deleted) return;
    var k = (typeof _chargeMonthKey === 'function') ? _chargeMonthKey(c) : '';
    if (k) meses[k] = true;
  });
  var keys = Object.keys(meses).sort().reverse();
  var nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  sel.innerHTML = '<option value="">Todos os meses</option>' + keys.map(function(k){
    var p = k.split('-');
    return '<option value="' + k + '">' + (nomesMes[parseInt(p[1])-1]||'') + ' de ' + p[0] + '</option>';
  }).join('');
  if (atual && /^\d{4}-\d{2}$/.test(atual) && meses[atual]) sel.value = atual;
}

function renderCharges(mesFilter) {
  const list = document.getElementById('charge-list');
  if (!list) return;
  _popularMesSelect();
  var mes = mesFilter;
  if (!mes) {
    var sel = document.getElementById('fin-month-select');
    mes = sel ? sel.value : null;
  }
  const visible = charges.filter(function(c){
    if (c.deleted) return false;
    if (mes && c.date) { return _chargeInMonth(c, mes); }
    return true;
  });
  if (!visible.length) {
    list.innerHTML = `<div style="padding:56px 32px;text-align:center;color:var(--muted)">
      <div style="margin-bottom:12px">${_tfIcon('card', 32)}</div>
      <div style="font-weight:600;font-size:15px;color:var(--ink-soft);margin-bottom:6px">Nenhuma cobrança ainda</div>
      <div style="font-size:13px;margin-bottom:20px">Registre cobranças avulsas ou crie planos mensais para seus pacientes.</div>
      <button class="btn-primary" onclick="abrirModalNovaCobranca()">+ Nova cobrança</button>
    </div>`;
    return;
  }
  list.innerHTML = visible.map(c => {
    const _dOpen = _calcDaysOpen(c);
    const statusTag = c.status === 'paid'
      ? `<span class="tag tag-green tag-dot">Pago${c.paidDate?' · '+_cobrDataBR(_cobrIso({date:c.paidDate})):''}</span>`
      : c.status === 'overdue'
        ? `<span class="tag tag-red tag-dot">${_dOpen}d atraso</span>`
        : `<span class="tag tag-amber tag-dot">Pendente${_dOpen?' · '+_dOpen+'d':''}</span>`;

    // ids SEMPRE entre aspas nos onclick: cobranças antigas têm id string com hífen
    // (interpolado cru virava SyntaxError e o botão morria em silêncio). Lote 1.
    const paidActions = c.status === 'paid'
      ? `<button class="charge-btn" onclick="event.stopPropagation();gerarReciboPDF(this)">${_tfIcon('doc')} Recibo</button>
         <button class="charge-btn" onclick="event.stopPropagation();undoPayment('${c.id}')" style="color:var(--muted);font-size:11px" title="Desfazer pagamento">↩ Desfazer</button>`
      : `<button class="charge-btn charge-btn-wpp" onclick="event.stopPropagation();sendWppCharge('${c.id}')">${_tfIcon('wpp')} WhatsApp</button>
         <button class="charge-btn charge-btn-check" onclick="event.stopPropagation();confirmPayment(this,'${c.id}')">✓ Pago</button>`;

    const deleteBtn = `<button class="charge-btn-delete" onclick="event.stopPropagation();deleteCharge('${c.id}',this)" title="Excluir cobrança"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

    const billingBadge = c.billing === 'mensal'
      ? `<span class="plan-badge plan-badge-mensal" style="margin-left:6px">Mensal</span>`
      : `<span class="plan-badge plan-badge-avulso" style="margin-left:6px">Avulso</span>`;

    const sessionLabel = c.billing === 'mensal'
      ? c.planLabel || ''
      : `Sessão ${c.session}`;

    // Selo por cobrança individual (não pelo padrão global atual — c.timing é
    // gravado no momento da criação, então reflete a REALIDADE daquela cobrança
    // mesmo que o padrão da clínica mude depois. Cobrança sem timing = criada
    // manualmente (+ Nova cobrança) ou de antes desta feature — não se aplica.
    // Mostra também em cobrança já paga (pedido 22/07 — sumia depois de marcar
    // "Pago", que é justamente quando o terapeuta mais quer conferir o padrão).
    const timingLabel = c.timing === 'pre' && c.billing !== 'mensal'
      ? `<span style="font-size:10px;background:var(--sage-light);color:var(--sage);padding:1px 6px;border-radius:4px;margin-left:6px">pré-sessão</span>`
      : c.timing === 'pos' && c.billing !== 'mensal'
        ? `<span style="font-size:10px;background:var(--amber-light);color:var(--amber);padding:1px 6px;border-radius:4px;margin-left:6px">pós-sessão</span>`
        : '';

    return `<div class="charge-row" data-charge-id="${c.id}">
      <div class="patient-info">
        <div class="patient-avatar" style="background:${c.color};color:#fff;width:30px;height:30px;font-size:10px">${c.initials}</div>
        <div><span class="patient-name" style="font-size:13.5px">${escHTML(c.patient||'')}</span><span class="patient-meta"> · ${escHTML(sessionLabel)}</span>${billingBadge}${timingLabel}</div>
      </div>
      <span class="fin-editable" onclick="editField(this,'${c.id}','date')" title="Clique para editar">${escHTML(c.date ? _cobrDataBR(_cobrIso(c)) : '')}</span>
      <span class="fin-editable" onclick="editField(this,'${c.id}','value')" title="Clique para editar" style="font-weight:500">R$${escHTML(String(c.value))}</span>
      <span style="font-size:12px;display:flex;align-items:center;gap:4px"><span style="color:#00BDAE">◉</span> ${escHTML(c.method||'PIX')}</span>
      ${statusTag}
      <div class="charge-actions">${paidActions}${deleteBtn}</div>
    </div>`;
  }).join('');
}

// Aplica o modo (pre/pos) na UI da barra de config — usada tanto pelo clique
// do terapeuta quanto pelo _finModeInit() ao entrar na página.
function _finModeApplyUI(mode) {
  document.querySelectorAll('.fin-mode-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  const desc = document.getElementById('fin-mode-desc');
  const badge = document.getElementById('fin-mode-badge');
  if (!desc || !badge) return;
  if (mode === 'pre') {
    desc.textContent = 'Cobrança enviada antes da sessão. Novos pacientes nascem com este padrão (dá p/ fazer exceção na ficha de cada um).';
    badge.className = 'fin-mode-badge fin-mode-badge-pre';
    badge.innerHTML = '⚡ Pré-sessão ativo';
  } else {
    desc.textContent = 'Cobrança enviada depois da sessão. O paciente paga após ser atendido — padrão para novos pacientes.';
    badge.className = 'fin-mode-badge fin-mode-badge-post';
    badge.innerHTML = _tfIcon('clock', 12) + ' Pós-sessão ativo';
  }
}

// Lê o padrão salvo (tf_account.pagamentoModoPadrao) ao entrar no Financeiro —
// sem isto a barra sempre mostrava 'pre' fixo no HTML, mesmo sem ter sido
// escolhido por ninguém (a real "carcaça de feature" que gerou esta função).
function _finModeInit() {
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch(e){}
  currentFinMode = acc.pagamentoModoPadrao === 'pre' ? 'pre' : 'pos';
  _finModeApplyUI(currentFinMode);
}

function setFinMode(mode, el) {
  currentFinMode = mode === 'pre' ? 'pre' : 'pos';
  _finModeApplyUI(currentFinMode);
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    acc.pagamentoModoPadrao = currentFinMode;
    localStorage.setItem('tf_account', JSON.stringify(acc));
  } catch(e) {}
  if (typeof _supaSync_settings === 'function') _supaSync_settings();
  renderCharges();
}

function switchFinTab(el, tabId) {
  document.querySelectorAll('.fin-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['fin-cobr','fin-planos','fin-inad','fin-recibos','fin-fluxo'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = id === tabId ? '' : 'none';
  });
  if (tabId === 'fin-planos') renderFinPlanos();
  if (tabId === 'fin-inad') { renderFinInadimplencia(); _renderWppPreviewReal(); }
  if (tabId === 'fin-recibos') renderFinRecibos();
  if (tabId === 'fin-fluxo') renderFinFluxo();
}

/* V1 (revisão 10/07): aba Recibos era 100% fabricada (Camila/Marcos/Rafael fixos)
 * e sem renderer — o PDF gerava recibo vazio. Agora: cobranças PAGAS reais,
 * respeitando o mês selecionado, com data-charge-id para o gerarReciboPDF. */
function renderFinRecibos() {
  var tbody = document.getElementById('fin-recibos-tbody');
  if (!tbody) return;
  var sel = document.getElementById('fin-month-select');
  var mes = (sel && sel.value && /^\d{4}-\d{2}$/.test(sel.value)) ? sel.value : null;
  var pagos = charges.filter(function(c) {
    return !c.deleted && c.status === 'paid' && (!mes || _chargeInMonth(c, mes));
  }).sort(function(a, b) { return String(b.paidDate || b.date || '').localeCompare(String(a.paidDate || a.date || '')); });
  if (!pagos.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Nenhum pagamento' + (mes ? ' neste mês' : '') + ' ainda — os recibos aparecem aqui quando uma cobrança for marcada como paga.</td></tr>';
  } else {
    var nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    tbody.innerHTML = pagos.map(function(c) {
      var mk = _chargeMonthKey(c);
      var periodo = mk ? (nomesMes[parseInt(mk.split('-')[1]) - 1] + '/' + mk.split('-')[0]) : '—';
      var ini = c.initials || (c.patient || '?').split(' ').map(function(w){ return w[0]; }).join('').slice(0, 2).toUpperCase();
      return '<tr data-charge-id="' + c.id + '">'
        + '<td><div class="patient-info"><div class="patient-avatar" style="background:' + (c.color || 'var(--sage)') + ';color:#fff;font-size:11px">' + escHTML(ini) + '</div><span>' + escHTML(c.patient || '—') + '</span></div></td>'
        + '<td style="font-size:13px">' + periodo + '</td>'
        + '<td style="font-weight:500">' + fmtMoedaInt(c.value) + '</td>'
        + '<td><span class="tag tag-green">Pago</span></td>'
        + '<td><button class="charge-btn" onclick="gerarReciboPDF(this)">PDF</button></td>'
      + '</tr>';
    }).join('');
  }
  // Prévia do recibo: do pagamento mais recente real (era Camila+CPFs falsos)
  var prev = document.getElementById('fin-receipt-preview');
  if (prev && pagos.length) {
    var c0 = pagos[0];
    var t = _reciboTerapeuta();
    prev.innerHTML = '<div class="fin-receipt-header">Teravia — Recibo de Pagamento</div>'
      + '<div class="fin-receipt-row"><span class="fin-receipt-row-label">Profissional</span><span class="fin-receipt-row-value">' + escHTML((t && t.nome) || '—') + (t && t.crp ? ' · CRP ' + escHTML(t.crp) : '') + '</span></div>'
      + '<div class="fin-receipt-divider"></div>'
      + '<div class="fin-receipt-row"><span class="fin-receipt-row-label">Paciente</span><span class="fin-receipt-row-value">' + escHTML(c0.patient || '—') + '</span></div>'
      + '<div class="fin-receipt-row"><span class="fin-receipt-row-label">Referente a</span><span class="fin-receipt-row-value">' + escHTML(c0.billing === 'mensal' ? (c0.planLabel || 'Plano mensal') : 'Sessão de psicoterapia') + '</span></div>'
      + '<div class="fin-receipt-divider"></div>'
      + '<div class="fin-receipt-row"><span class="fin-receipt-row-label fin-receipt-total">Total pago</span><span class="fin-receipt-row-value fin-receipt-total" style="color:var(--sage)">' + fmtMoedaInt(c0.value) + '</span></div>'
      + '<div style="margin-top:12px;font-size:11px;color:var(--muted);line-height:1.5">Documento válido para declaração de Imposto de Renda.<br/>Serviço: Consulta psicológica · Código CNAE: 8650-0/01</div>';
  }
}

/* V1: prévia do WhatsApp era fabricada ("Camila / 24/03 / R$200" + link
 * inexistente) — agora nasce do 1º inadimplente real, com estado vazio honesto. */
function _renderWppPreviewReal() {
  var el = document.getElementById('fin-wpp-preview-body');
  if (!el) return;
  var venc = charges.filter(function(c) { return !c.deleted && _chargeVencida(c); });
  if (!venc.length) {
    el.innerHTML = 'Ninguém em atraso — quando houver cobrança vencida, a prévia da mensagem aparece aqui.';
    return;
  }
  var c = venc[0];
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch (_) {}
  var dataBR = c.date ? fmtDataBR(c.date) : '—';
  el.innerHTML = 'Oi <strong>' + escHTML(_firstName(c.patient || '')) + '</strong>!<br/><br/>'
    + 'Segue o lembrete do pagamento da sua sessão de <strong>' + escHTML(dataBR) + '</strong>.<br/><br/>'
    + 'Valor: <strong>' + fmtMoedaInt(c.value) + '</strong><br/>'
    + (acc.pix_key ? 'PIX: <strong>' + escHTML(acc.pix_key) + '</strong><br/><br/>' : '<br/>')
    + 'Qualquer dúvida, estou aqui!';
}

function renderFinPlanos() {
  var el = document.getElementById('fin-planos-content');
  if (!el) return;

  // ── Bloco "Planos mensais" (entidades geríveis: pausar/retomar/cancelar) ──
  var planosHtml = '';
  if (Array.isArray(plans) && plans.length) {
    var statusCfg = {
      ativo:     { label: 'Ativo',     cor: 'var(--sage)',  bg: 'var(--sage-light)' },
      pausado:   { label: 'Pausado',   cor: '#c97d2e',      bg: '#fdf3e7' },
      cancelado: { label: 'Cancelado', cor: 'var(--muted)', bg: '#f0f0f0' },
    };
    planosHtml += '<div style="margin-bottom:20px">'
      + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Planos mensais</div>'
      + '<div style="display:grid;gap:10px">';
    plans.forEach(function(pl) {
      if (!pl) return;
      var st = statusCfg[pl.status] || statusCfg.ativo;
      var acoes = '';
      if (pl.status === 'ativo') {
        acoes = '<button class="btn btn-secondary btn-sm" onclick="pausarPlano(\'' + pl.id + '\')">⏸ Pausar</button>'
          + '<button class="btn btn-secondary btn-sm" onclick="cancelarPlano(\'' + pl.id + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M18 6L6 18M6 6l12 12"/></svg> Cancelar</button>';
      } else if (pl.status === 'pausado') {
        acoes = '<button class="btn btn-secondary btn-sm" onclick="retomarPlano(\'' + pl.id + '\')">▶ Retomar</button>'
          + '<button class="btn btn-secondary btn-sm" onclick="cancelarPlano(\'' + pl.id + '\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M18 6L6 18M6 6l12 12"/></svg> Cancelar</button>';
      } else {
        acoes = '<button class="btn btn-secondary btn-sm" onclick="removerPlano(\'' + pl.id + '\')">🗑 Remover</button>';
      }
      planosHtml += '<div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap' + (pl.status === 'cancelado' ? ';opacity:.6' : '') + '">'
        + '<div style="flex:1;min-width:160px">'
          + '<div style="font-weight:600;font-size:14px">' + escHTML(pl.patient) + '</div>'
          + '<div style="font-size:12px;color:var(--muted)">' + pl.sessoesMes + ' sessões/mês · ' + fmtMoedaInt(pl.valor) + '/mês · vence dia ' + pl.diaVenc + '</div>'
        + '</div>'
        + '<span style="font-size:11px;font-weight:700;color:' + st.cor + ';background:' + st.bg + ';border-radius:6px;padding:3px 9px">' + st.label + '</span>'
        + '<div style="display:flex;gap:6px">' + acoes + '</div>'
        + '</div>';
    });
    planosHtml += '</div></div>';
  }

  var ativos = charges.filter(function(c){ return !c.deleted; });
  if (!ativos.length) {
    el.innerHTML = planosHtml + '<div style="text-align:center;padding:40px;color:var(--muted)">Nenhuma cobrança cadastrada ainda.</div>';
    return;
  }
  // agrupar por paciente
  var grupos = {};
  ativos.forEach(function(c) {
    var nome = c.patient || 'Desconhecido';
    if (!grupos[nome]) grupos[nome] = { paid:0, pending:0, overdue:0, total:0, mensal:0, avulso:0, charges:[] };
    var g = grupos[nome];
    g.charges.push(c);
    var val = parseFloat(c.value)||0;
    g.total += val;
    if (c.status==='paid') g.paid += val;
    else if (_chargeVencida(c)) g.overdue += val;
    else g.pending += val;
    if (c.billing==='mensal') g.mensal++; else g.avulso++;
  });
  var html = '<div style="display:grid;gap:12px">';
  Object.keys(grupos).forEach(function(nome) {
    var g = grupos[nome];
    var initials = nome.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
    var p = patients.find(function(pt){ return pt.name === nome; });
    var wpp = p && p.whatsapp;
    var temPendente = g.pending > 0 || g.overdue > 0;
    var valorPend = g.pending + g.overdue;
    html += '<div class="card" style="padding:14px 16px">';
    html += '<div style="display:flex;align-items:center;gap:12px">';
    html += '<div class="patient-avatar" style="width:36px;height:36px;font-size:12px">' + initials + '</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-weight:600;font-size:15px">' + escHTML(nome) + '</div>';
    html += '<div style="font-size:12px;color:var(--muted)">' + g.mensal + ' mensais · ' + g.avulso + ' avulsas</div>';
    html += '</div>';
    html += '<div style="text-align:right">';
    html += '<div style="font-weight:700;font-size:16px;color:var(--sage-dark)">' + fmtMoedaInt(g.paid) + ' <span style="font-size:11px;font-weight:400;color:var(--muted)">recebido</span></div>';
    if (temPendente) html += '<div style="font-size:12px;color:var(--red)">' + fmtMoedaInt(valorPend) + ' pendente</div>';
    html += '</div>';
    if (temPendente && wpp) {
      html += '</div>';
      html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">';
      html += '<button class="charge-btn charge-btn-wpp" onclick="sendWppReminder(\'' + escHTML(nome) + '\')">' + _tfIcon('wpp') + ' Cobrar via WhatsApp</button>';
      html += '</div>';
    } else {
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = planosHtml + html;
}

function renderFinFluxo() {
  var barsEl = document.getElementById('fin-fluxo-bars');
  var resumoEl = document.getElementById('fin-fluxo-resumo');
  var mediaEl = document.getElementById('fin-fluxo-media');
  var projEl = document.getElementById('fin-fluxo-projecao');
  var ticketEl = document.getElementById('fin-fluxo-ticket');
  var melhorEl = document.getElementById('fin-fluxo-melhor');
  if (!barsEl) return;

  var hoje = new Date();
  // Gera últimos 6 meses
  var meses = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ year: d.getFullYear(), month: d.getMonth(), key: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') });
  }
  var nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Calcula receita por mês
  var receitaMes = meses.map(function(m) {
    var total = charges.filter(function(c){ return !c.deleted && c.status === 'paid' && _chargeInMonth(c, m.key); })
      .reduce(function(s,c){ return s + (parseFloat(c.value)||0); }, 0);
    return { label: nomesMes[m.month], key: m.key, total: total, isAtual: m.key === meses[5].key };
  });

  var maxVal = Math.max.apply(null, receitaMes.map(function(m){ return m.total; })) || 1;
  var html = '';
  receitaMes.forEach(function(m) {
    var pct = Math.round(m.total / maxVal * 100);
    var cor = m.isAtual ? 'var(--sage)' : 'var(--sage-mid)';
    var labelStyle = m.isAtual ? 'font-size:12px;color:var(--sage);font-weight:700;min-width:28px;text-align:right' : 'font-size:12px;color:var(--muted);min-width:28px;text-align:right';
    var valStyle = m.isAtual ? 'font-size:13px;font-weight:700;color:var(--sage);min-width:64px' : 'font-size:13px;font-weight:500;min-width:64px';
    html += '<div style="display:flex;align-items:center;gap:12px">' +
      '<span style="' + labelStyle + '">' + m.label + '</span>' +
      '<div style="flex:1;height:24px;background:var(--bg);border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + (pct||2) + '%;background:' + cor + ';border-radius:4px;transition:width .5s"></div>' +
      '</div>' +
      '<span style="' + valStyle + '">' + (m.total > 0 ? fmtMoedaCompact(m.total) : '—') + '</span>' +
    '</div>';
  });
  barsEl.innerHTML = html || '<div style="text-align:center;padding:24px;color:var(--muted)">Nenhuma receita registrada ainda.</div>';

  // Média e projeção
  var totaisNaoZero = receitaMes.filter(function(m){ return m.total > 0; });
  var media = totaisNaoZero.length ? totaisNaoZero.reduce(function(s,m){ return s+m.total; },0) / totaisNaoZero.length : 0;
  if (mediaEl) mediaEl.textContent = media > 0 ? fmtMoedaCompact(media) : '—';
  if (projEl) projEl.textContent = media > 0 ? fmtMoedaCompact(media*12) : '—';

  // Ticket médio: total pago / nº de pacientes distintos com pagamento
  if (ticketEl) {
    var pacsPagos = new Set(charges.filter(function(c){ return !c.deleted && c.status==='paid'; }).map(function(c){ return c.patient; }));
    var totalPago = charges.filter(function(c){ return !c.deleted && c.status==='paid'; }).reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
    var ticket = pacsPagos.size > 0 ? totalPago / pacsPagos.size : 0;
    ticketEl.textContent = ticket > 0 ? fmtMoedaInt(ticket) : '—';
  }

  // Melhor mês do ano atual
  if (melhorEl) {
    var anoAtual = hoje.getFullYear();
    var receitaAnual = [];
    for (var mi = 0; mi < 12; mi++) {
      var key = anoAtual + '-' + String(mi+1).padStart(2,'0');
      var tot = charges.filter(function(c){ return !c.deleted && c.status==='paid' && _chargeInMonth(c, key); }).reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
      if (tot > 0) receitaAnual.push({ label: nomesMes[mi], tot: tot });
    }
    if (receitaAnual.length) {
      var melhor = receitaAnual.reduce(function(a,b){ return b.tot>a.tot?b:a; });
      melhorEl.textContent = melhor.label + ' · ' + fmtMoedaCompact(melhor.tot);
    } else {
      melhorEl.textContent = '—';
    }
  }

  // Resumo do mês atual + donut chart
  if (resumoEl) {
    var mesAtualKey = meses[5].key;
    var recebido = charges.filter(function(c){ return !c.deleted && c.status==='paid' && _chargeInMonth(c, mesAtualKey); }).reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
    var pendente = charges.filter(function(c){ return !c.deleted && c.status==='pending' && !_chargeVencida(c) && _chargeInMonth(c, mesAtualKey); }).reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
    var atrasado = charges.filter(function(c){ return _chargeVencida(c) && _chargeInMonth(c, mesAtualKey); }).reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
    var totalMes = recebido + pendente + atrasado || 1;
    var pPago = Math.round(recebido / totalMes * 100);
    var pPend = Math.round(pendente / totalMes * 100);
    var pAtras = 100 - pPago - pPend;
    var donut = pPago + '% #4a7c59, #4a7c59 ' + pPago + '%, #c97d2e ' + pPago + '%, #c97d2e ' + (pPago+pPend) + '%, #c0392b ' + (pPago+pPend) + '%';
    resumoEl.innerHTML =
      // Donut
      '<div style="display:flex;align-items:center;gap:20px;margin-bottom:16px;padding:16px;background:var(--bg);border-radius:12px">'
      + '<div style="width:80px;height:80px;border-radius:50%;background:conic-gradient('+donut+');flex-shrink:0;box-shadow:inset 0 0 0 22px #f7f8f6"></div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;flex:1">'
        + '<div style="display:flex;align-items:center;gap:7px"><div style="width:10px;height:10px;border-radius:3px;background:#4a7c59;flex-shrink:0"></div><span style="font-size:13px">Recebido <strong>' + pPago + '%</strong></span></div>'
        + '<div style="display:flex;align-items:center;gap:7px"><div style="width:10px;height:10px;border-radius:3px;background:#c97d2e;flex-shrink:0"></div><span style="font-size:13px">Pendente <strong>' + pPend + '%</strong></span></div>'
        + (atrasado > 0 ? '<div style="display:flex;align-items:center;gap:7px"><div style="width:10px;height:10px;border-radius:3px;background:#c0392b;flex-shrink:0"></div><span style="font-size:13px">Em atraso <strong>' + pAtras + '%</strong></span></div>' : '')
      + '</div>'
      + '</div>'
      // Valores
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--sage-light);border-radius:8px"><span style="font-size:13px;color:var(--sage);font-weight:500">Recebido</span><span style="font-family:\'Instrument Serif\',serif;font-size:22px;color:var(--sage)">' + fmtMoedaInt(recebido) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--amber-light);border-radius:8px"><span style="font-size:13px;color:var(--amber);font-weight:500">Pendente</span><span style="font-family:\'Instrument Serif\',serif;font-size:22px;color:var(--amber)">' + fmtMoedaInt(pendente) + '</span></div>'
      + (atrasado > 0 ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--red-light);border-radius:8px"><span style="font-size:13px;color:var(--red);font-weight:500">Em atraso</span><span style="font-family:\'Instrument Serif\',serif;font-size:22px;color:var(--red)">' + fmtMoedaInt(atrasado) + '</span></div>' : '');
  }
}

function renderFinInadimplencia() {
  var el = document.getElementById('fin-inad-dynamic');
  var countEl = document.getElementById('fin-inad-count');
  if (!el) return;
  var hoje = new Date();
  var hojeIso = hojeISO();
  var vencidas = charges.filter(function(c) {
    return !c.deleted && (c.status === 'overdue' || (c.status === 'pending' && c.date && c.date < hojeIso));
  });
  if (countEl) countEl.textContent = vencidas.length + ' paciente' + (vencidas.length !== 1 ? 's':'');
  if (!vencidas.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">' + _tfIcon('checkCircle', 15) + ' Nenhum paciente em atraso.</div>';
    return;
  }
  var html = '';
  vencidas.forEach(function(c) {
    var dias = 0;
    if (c.date) {
      var d = new Date(c.date + 'T12:00:00');
      dias = Math.floor((hoje - d) / 86400000);
    }
    var corDias = dias >= 14 ? 'var(--red)' : dias >= 7 ? 'var(--amber)' : 'var(--ink-soft)';
    var initials = (c.patient||'?').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
    var p = patients.find(function(pt){ return pt.name === c.patient; });
    var wpp = p && p.whatsapp;
    html += '<div class="fin-overdue-item">';
    html += '<div class="fin-overdue-days" style="color:' + corDias + '">' + dias + 'd</div>';
    html += '<div style="flex:1">';
    html += '<div style="display:flex;align-items:center;gap:8px">';
    html += '<div class="patient-avatar" style="width:30px;height:30px;font-size:10px">' + initials + '</div>';
    html += '<div><div style="font-weight:500;font-size:14px">' + escHTML(c.patient||'') + '</div>';
    html += '<div style="font-size:12px;color:var(--muted)">' + fmtMoedaInt(parseFloat(c.value)||0) + ' em aberto · ' + fmtDataBR(c.date) + '</div></div>';
    html += '</div></div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px">';
    if (wpp) {
      // Passa o ID da cobrança (a assinatura antiga nome+valor virou chargeId no
      // F4.4 e este chamador ficou para trás — o botão de cobrar quem deve estava
      // MORTO, com return silencioso). Lote 1.
      html += '<button class="charge-btn charge-btn-wpp" onclick="sendWppCharge(\'' + c.id + '\')">' + _tfIcon('wpp') + ' Cobrar</button>';
    } else if (p && p.email) {
      html += '<a class="charge-btn charge-btn-wpp" href="mailto:' + escHTML(p.email) + '?subject=' + encodeURIComponent('Lembrete de pagamento') + '&body=' + encodeURIComponent('Olá ' + _firstName(c.patient||'') + ', tudo bem?\n\nPassando o lembrete do pagamento da sessão: ' + fmtMoedaInt(parseFloat(c.value)||0) + '.\n\nQualquer dúvida, é só me responder por aqui.\n\nUm abraço,\n' + _wppNomeTerapeuta()) + '" style="text-decoration:none">📧 Email</a>';
    } else {
      html += '<span style="font-size:11px;color:var(--muted);padding:4px 0">Sem contato</span>';
    }
    html += '<button class="charge-btn charge-btn-check" onclick="marcarPagoInad(\'' + c.id + '\')">✓ Pago</button>';
    html += '</div></div>';
  });
  el.innerHTML = html;
}

function confirmPayment(btn, chargeId) {
  const charge = charges.find(c => String(c.id) === String(chargeId));
  if (charge) {
    charge._prevStatus = charge.status;
    charge.status = 'paid';
    charge.paidDate = hojeISO();
    salvarCharges();
    const row = btn.closest('.charge-row');
    row.style.background = '#e8f5ec';
    row.style.transition = 'background .3s';
    showUndoBar(`Pagamento de R$${charge.value} de ${charge.patient} confirmado.`, () => {
      charge.status = charge._prevStatus;
      delete charge.paidDate;
      salvarCharges();
      renderCharges();
      atualizarStatsFinanceiro();
    });
    setTimeout(() => { renderCharges(); atualizarStatsFinanceiro(); }, 600);
  }
}

function undoPayment(chargeId) {
  const charge = charges.find(c => String(c.id) === String(chargeId));
  if (!charge) return;
  const prevStatus = charge._prevStatus || 'pending';
  const prevDays = charge._prevDaysOpen || 0;
  charge.status = prevStatus;
  charge.daysOpen = prevDays;
  delete charge.paidDate;
  salvarCharges();
  showToast(`Pagamento de ${charge.patient} revertido para "${prevStatus === 'overdue' ? 'em atraso' : 'pendente'}".`);
  renderCharges();
  atualizarStatsFinanceiro();
}

function deleteCharge(chargeId, btn) {
  const charge = charges.find(c => String(c.id) === String(chargeId));
  if (!charge) return;
  const row = btn.closest('.charge-row');
  row.classList.add('charge-row-deleting');
  charge.deleted = true;
  salvarCharges();
  showUndoBar(`Cobrança de R$${charge.value} (${charge.patient}) excluída.`, () => {
    charge.deleted = false;
    salvarCharges();
    renderCharges();
    atualizarStatsFinanceiro();
  });
  setTimeout(() => { renderCharges(); atualizarStatsFinanceiro(); }, 400);
}

function editField(el, chargeId, field) {
  const charge = charges.find(c => String(c.id) === String(chargeId));
  if (!charge) return;
  const currentVal = field === 'value' ? charge.value : charge.date;
  const displayVal = field === 'value' ? currentVal : currentVal;
  const input = document.createElement('input');
  input.className = 'fin-editable-input';
  input.value = displayVal;
  input.type = field === 'value' ? 'number' : 'text';
  if (field === 'value') { input.min = '0'; input.step = '10'; input.style.width = '85px'; }
  else { input.placeholder = 'dd/mm'; input.style.width = '75px'; }
  el.replaceWith(input);
  input.focus();
  input.select();

  const save = () => {
    const newVal = input.value.trim();
    if (field === 'value') {
      const num = parseFloat(newVal);
      if (!isNaN(num) && num > 0 && num < 100000) {
        charge.value = num;
        salvarCharges();
        showToast(`Valor de ${charge.patient} alterado para R$${num}.`);
      } else if (!isNaN(num) && num <= 0) {
        showToast('⚠ O valor da sessão deve ser maior que zero.');
      }
    } else {
      if (newVal.length >= 4) {
        charge.date = newVal;
        salvarCharges();
        showToast(`Data de ${charge.patient} alterada para ${newVal}.`);
      }
    }
    renderCharges();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') renderCharges(); });
}

let undoTimeout = null;
function showUndoBar(msg, undoFn) {
  clearTimeout(undoTimeout);
  let bar = document.getElementById('fin-undo-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'fin-undo-bar';
    bar.className = 'fin-undo-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>${msg}</span><button class="fin-undo-btn" id="fin-undo-action">Desfazer</button>`;
  bar.style.opacity = '1';
  bar.style.transform = 'translateX(-50%) translateY(0)';
  document.getElementById('fin-undo-action').onclick = () => {
    undoFn();
    bar.style.opacity = '0';
    bar.style.transform = 'translateX(-50%) translateY(10px)';
  };
  undoTimeout = setTimeout(() => {
    bar.style.opacity = '0';
    bar.style.transform = 'translateX(-50%) translateY(10px)';
  }, 6000);
}

function marcarPagoInad(chargeId) {
  var charge = charges.find(function(c){ return String(c.id) === String(chargeId); });
  if (!charge) return;
  charge._prevStatus = charge.status;
  charge.status = 'paid';
  charge.paidDate = hojeISO();
  salvarCharges();
  renderFinInadimplencia();
  atualizarStatsFinanceiro();
  showToast('✓ Pagamento de ' + _firstName(charge.patient) + ' confirmado.');
}

function sendWppCharge(chargeId) {
  // Recebe o ID da cobrança (não o nome) — evita interpolar o nome do paciente no onclick,
  // que quebrava com apóstrofo (D'Ávila) e era vetor de injeção. F4.4.
  var c = (typeof charges !== 'undefined' ? charges : []).find(function(x){ return String(x.id) === String(chargeId); });
  if (!c) return;
  var name = c.patient, value = c.value;
  var pidx = patients.findIndex(function(p){ return p.name === name; });
  var p = pidx >= 0 ? patients[pidx] : null;
  if (!p || !p.whatsapp) { showToast('📲 Cobrança de R$' + value + ' anotada para ' + name + '.'); return; }
  var n = _wppNumero(p.whatsapp);
  if (!n) { showToast('📲 Cobrança anotada — número WhatsApp inválido.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var pixKey = acc.pix_key || '';
  var msg = 'Olá ' + _firstName(p.name) + '! Tudo bem? 🌿\n\nPassando o lembrete do pagamento da sessão: ' + fmtMoedaInt(parseFloat(value) || 0)
    + (c.date ? ' (vencimento ' + _cobrDataBR(_cobrIso(c)) + ')' : '') + '.'
    + (pixKey ? '\n\nChave PIX: ' + pixKey : '')
    + '\n\nQualquer dúvida, é só me chamar por aqui! 💚\n— ' + _wppNomeTerapeuta();
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank');
  showToast('📲 Cobrança enviada para ' + _firstName(p.name) + '!');
}

function sendWppReminder(name) {
  var pidx = patients.findIndex(function(p){ return p.name === name; });
  if (pidx < 0) { showToast('Lembrete anotado para ' + name + '.'); return; }
  enviarWhatsappLembrete(pidx);
}

function exportarRelatorioAnual() {
  var anoAtual = new Date().getFullYear();
  var rows = charges.filter(function(c){ return !c.deleted && c.status==='paid' && _chargeMonthKey(c).startsWith(String(anoAtual)); });
  if (!rows.length) { showToast('Nenhum pagamento confirmado em ' + anoAtual + ' para gerar relatório.'); return; }
  var terapeuta = tfUserData || {};
  var fmt = fmtMoeda;

  // Agrupa por mês
  var porMes = {};
  rows.forEach(function(c){
    var mes = _chargeMonthKey(c); // YYYY-MM
    if (!porMes[mes]) porMes[mes] = { total:0, count:0, rows:[] };
    porMes[mes].total += c.value;
    porMes[mes].count++;
    porMes[mes].rows.push(c);
  });

  var total = rows.reduce(function(s,c){ return s+c.value; }, 0);
  var nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  var resumoHtml = Object.keys(porMes).sort().map(function(m){
    var p = porMes[m]; var idx = parseInt(m.split('-')[1])-1;
    return '<tr><td>'+nomesMes[idx]+'</td><td style="text-align:right">'+p.count+' sessões</td><td style="text-align:right;font-weight:600">'+fmt(p.total)+'</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório Anual '+anoAtual+'</title>'
  + '<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;color:#1a1a1a;padding:0 24px;font-size:13px}'
  + 'h1{font-size:22px;color:#2d5a3d;margin-bottom:4px}p.sub{color:#888;margin-bottom:28px}'
  + 'h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666;border-left:4px solid #4a7c59;padding-left:10px;margin:24px 0 12px}'
  + 'table{width:100%;border-collapse:collapse}th{background:#f9fafb;text-align:left;padding:8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:2px solid #e5e7eb}'
  + 'td{padding:8px 10px;border-bottom:1px solid var(--line-2)}.total-row{font-weight:700;background:#f0fdf4}'
  + '.disclaimer{margin-top:32px;padding:16px;background:#fef9c3;border-radius:8px;font-size:12px;color:#713f12}'
  + '.footer{margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#999;font-size:11px;text-align:center}'
  + '@media print{body{margin:20px}}</style></head><body>'
  + '<h1>Relatório de Rendimentos '+anoAtual+'</h1>'
  + '<p class="sub">'+escHTML(terapeuta.nome||'Terapeuta')+' · CRP '+escHTML(terapeuta.crp||'—')+' · Ano-base: '+anoAtual+'</p>'
  + '<h2>Resumo por mês</h2>'
  + '<table><thead><tr><th>Mês</th><th style="text-align:right">Sessões</th><th style="text-align:right">Receita</th></tr></thead>'
  + '<tbody>'+resumoHtml+'<tr class="total-row"><td>Total '+anoAtual+'</td><td style="text-align:right">'+rows.length+' sessões</td><td style="text-align:right">'+fmt(total)+'</td></tr></tbody>'
  + '</table>'
  + '<div class="disclaimer">⚠ <strong>Aviso:</strong> Este relatório é gerado automaticamente a partir dos registros do Teravia. Para fins de declaração de Imposto de Renda, consulte seu contador. Mantenha todos os recibos e comprovantes originais.</div>'
  + '<div class="footer">Teravia · Relatório gerado em '+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})+' · Documento auxiliar — não tem valor fiscal</div>'
  + '</body></html>';

  var win = window.open('', '_blank');
  if (!win) { showToast('Permita pop-ups para este site.','error'); return; }
  win.document.write(html); win.document.close();
  setTimeout(function(){ win.print(); }, 500);
  showToast('📊 Relatório anual ' + anoAtual + ' gerado!');
}

function abrirWppLote() {
  var pendentes = charges.filter(function(c){ return !c.deleted && (c.status==='pending'||c.status==='overdue'); });
  var body = document.getElementById('wpp-lote-body');
  var btn = document.getElementById('wpp-lote-send-btn');
  if (body) {
    if (!pendentes.length) {
      body.innerHTML = '<div style="color:var(--sage);font-size:14px">✓ Nenhuma cobrança pendente no momento.</div>';
    } else {
      var fmt = fmtMoeda;
      body.innerHTML = 'Serão enviadas <strong>'+pendentes.length+' cobranças</strong> para pacientes com pagamento pendente ou em atraso.<br><br>'
        + '<div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto">'
        + pendentes.map(function(c){
          var p = patients.find(function(pt){ return pt.name===c.patient; });
          var temWpp = p && p.whatsapp;
          return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:4px 0;border-bottom:1px solid var(--border)">'
            + '<span>'+(temWpp?'':_tfIcon('alert',11)+' ')+escHTML(c.patient)+'</span>'
            + '<span style="font-weight:600">'+(c.status==='overdue'?'<span style="color:var(--red)">Em atraso</span>':'Pendente')+' · '+fmt(c.value)+'</span>'
            + '</div>';
        }).join('')
        + '</div>';
    }
    if (btn) btn.innerHTML = _tfIcon('wpp') + ' Enviar ' + pendentes.length + ' cobrança' + (pendentes.length!==1?'s':'');
  }
  showModal('modal-wpp-lote');
}

function sendWppBatch() {
  closeModal('modal-wpp-lote');
  var pendentes = charges.filter(function(c){ return !c.deleted && (c.status==='pending'||c.status==='overdue'); });
  if (!pendentes.length) { showToast('Nenhuma cobrança pendente no momento.'); return; }
  var enviados = 0;
  var _accB = {}; try { _accB = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var _pixB = _accB.pix_key || '';
  var _nomeTB = _wppNomeTerapeuta();
  pendentes.forEach(function(c){
    var p = patients.find(function(pt){ return pt.name === c.patient; });
    if (!p || !p.whatsapp) return;
    var n = p.whatsapp.replace(/\D/g,'');
    n = n.startsWith('55') ? n : '55' + n;
    var msg = 'Olá ' + _firstName(p.name) + '! Tudo bem? 🌿\n\nPassando o lembrete do pagamento da sessão: ' + fmtMoedaInt(parseFloat(c.value) || 0)
      + (c.date ? ' (vencimento ' + _cobrDataBR(_cobrIso(c)) + ')' : '') + '.'
      + (_pixB ? '\n\nChave PIX: ' + _pixB : '')
      + '\n\nQualquer dúvida, é só me chamar por aqui! 💚\n— ' + _nomeTB;
    setTimeout(function(){ window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank'); }, enviados * 500);
    enviados++;
  });
  if (enviados > 0) {
    showToast('📲 ' + enviados + ' cobrança' + (enviados>1?'s':'') + ' enviada' + (enviados>1?'s':'') + ' via WhatsApp!');
  } else {
    showToast('Pacientes sem WhatsApp cadastrado. Cadastre em Pacientes → Editar.');
  }
}

function lembreteInadimplentes() {
  var vencidas = charges.filter(function(c){ return !c.deleted && c.status === 'overdue'; });
  if (!vencidas.length) { showToast('Nenhuma cobrança em atraso.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var nomeT = acc.nome ? acc.nome.split(' ')[0] : 'sua terapeuta';
  var pixKey = acc.pix_key || '';

  var itens = vencidas.map(function(c) {
    var p = patients.find(function(x){ return x.name === c.patient; });
    var wpp = p && p.whatsapp ? p.whatsapp.replace(/\D/g,'') : '';
    if (wpp && !wpp.startsWith('55')) wpp = '55' + wpp;
    var dataPt = fmtDataBR(c.date);
    // Texto de wa.me NÃO leva escHTML (não é HTML — nomes com & saíam "&amp;").
    var msg = 'Olá ' + _firstName(c.patient) + '! Tudo bem? 🌿\n\nPassando o lembrete do pagamento da sessão de ' + dataPt + ': ' + fmtMoedaInt(parseFloat(c.value) || 0) + '.'
      + (pixKey ? '\n\nChave PIX: ' + pixKey : '')
      + '\n\nQualquer dúvida, é só me chamar por aqui! 💚\n— ' + nomeT;
    var link = wpp ? 'https://wa.me/' + wpp + '?text=' + encodeURIComponent(msg) : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<div>'
        + '<div style="font-size:13.5px;font-weight:500;color:var(--ink)">' + escHTML(c.patient) + '</div>'
        + '<div style="font-size:12px;color:var(--muted)">Sessão ' + escHTML(dataPt) + ' · R$' + c.value + ' · ' + (_calcDaysOpen(c)||'?') + 'd em atraso</div>'
      + '</div>'
      + (link
        ? '<a href="' + link + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:#25d366;color:#fff;border-radius:8px;font-size:12.5px;font-weight:600;text-decoration:none;flex-shrink:0">' + _tfIcon('wpp') + ' Cobrar</a>'
        : '<span style="font-size:12px;color:var(--muted)">⚠ Sem WhatsApp</span>')
      + '</div>';
  }).join('');

  var modal = document.getElementById('modal-inadimplentes');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'modal-inadimplentes';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal" style="max-width:460px">'
    + '<div class="modal-header"><div class="modal-title"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg> Cobranças em atraso (' + vencidas.length + ')</div>'
    + '<button class="modal-close" onclick="closeModal(\'modal-inadimplentes\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>'
    + '<div class="modal-body">' + itens + '</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.classList.remove('open'); });
  modal.classList.add('open');
}

// ── Escalação de cobrança (v2 — revisão 14/07: config real + uma etapa por vez) ──
// A régua vira TAREFA automática por cobrança vencida, mas SÓ A ETAPA ATUAL fica
// aberta (a v1 empilhava D+3/D+7/D+14 da mesma cobrança como 3 tarefas). Prazos e
// mensagens agora são CONFIGURÁVEIS (tf_account.cobr_regua — local, nível da chave
// PIX; a promessa "configuráveis nas preferências" do guia era falsa). Nada é
// enviado sem o terapeuta: a tarefa lembra a ação e o 📲 abre o WhatsApp com a
// mensagem da etapa pronta. Pagou/excluiu a cobrança → as tarefas dela se fecham.
var _COBR_REGUA_DEF = [
  { dias: 3,  rotulo: 'lembrete gentil',  msg: 'Olá {nome}! Tudo bem? Passando para lembrar do pagamento da sessão ({valor}, venceu {vencimento}).{pix}\n\nQualquer coisa me avisa! 💚\n— {terapeuta}' },
  { dias: 7,  rotulo: 'segundo lembrete', msg: 'Oi {nome}! O pagamento da sessão ({valor}, venceu {vencimento}) ainda está em aberto.{pix}\n\nSe algo estiver dificultando, me conta que a gente encontra um caminho.\n— {terapeuta}' },
  { dias: 14, rotulo: 'conversa sobre o pagamento', msg: 'Oi {nome}. O pagamento da sessão ({valor}) está em aberto desde {vencimento}.{pix}\n\nPodemos conversar sobre isso na nossa próxima sessão? Um abraço,\n— {terapeuta}' }
];

function _cobrRegua() {
  try {
    var cfg = window._tfDemo
      ? window._tfDemoRegua // demo hermético: config demo vive só em memória
      : JSON.parse(localStorage.getItem('tf_account') || '{}').cobr_regua;
    if (cfg && Array.isArray(cfg) && cfg.length === 3) {
      var out = cfg.map(function(e, i) {
        return { dias: Math.max(1, parseInt(e && e.dias, 10) || _COBR_REGUA_DEF[i].dias),
                 rotulo: _COBR_REGUA_DEF[i].rotulo,
                 msg: (e && typeof e.msg === 'string' && e.msg.trim()) ? e.msg.trim() : _COBR_REGUA_DEF[i].msg };
      });
      // Dias precisam crescer entre etapas — corrige na leitura, sem drama.
      if (out[1].dias <= out[0].dias) out[1].dias = out[0].dias + 1;
      if (out[2].dias <= out[1].dias) out[2].dias = out[1].dias + 1;
      return out;
    }
  } catch (e) {}
  return _COBR_REGUA_DEF.map(function(e) { return { dias: e.dias, rotulo: e.rotulo, msg: e.msg }; });
}

// Data da cobrança → ISO (aceita YYYY-MM-DD, DD/MM/AAAA e DD/MM)
function _cobrIso(c) {
  var d = ((c && c.date) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  var pp = d.split('/');
  if (pp.length >= 2 && pp[0] && pp[1]) return (pp[2] || new Date().getFullYear()) + '-' + String(pp[1]).padStart(2, '0') + '-' + String(pp[0]).padStart(2, '0');
  return null;
}
function _cobrDataBR(iso) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '—';
  var p = iso.slice(0, 10).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

// Etapa (0/1/2) de uma marca _cobr — aceita o formato novo (id:e1) e o legado (id:7)
function _cobrEtapaDaMarca(marca) {
  var suf = String(marca || '').split(':')[1] || '';
  if (suf.charAt(0) === 'e') { var n = parseInt(suf.slice(1), 10); return isNaN(n) ? null : n; }
  return ({ '3': 0, '7': 1, '14': 2 })[suf] != null ? ({ '3': 0, '7': 1, '14': 2 })[suf] : null;
}

function _gerarTarefasCobranca() {
  try {
    if (typeof tasks === 'undefined' || typeof charges === 'undefined') return;
    if (typeof carregarTarefas === 'function' && !tasks.length) carregarTarefas();
    var regua = _cobrRegua();
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var novas = 0, mudou = false;

    // 1) Autolimpeza: cobrança paga/excluída/sumida fecha as tarefas abertas dela.
    var vencidas = {};
    charges.forEach(function(c) { if (c && !c.deleted && _chargeVencida(c)) vencidas[String(c.id)] = c; });
    tasks.forEach(function(t) {
      if (!t || !t._cobr || t.status !== 'aberta') return;
      if (!vencidas[String(t._cobr).split(':')[0]]) { t.status = 'concluida'; t._cobrAuto = 'resolvida'; mudou = true; }
    });

    // 2) Por cobrança vencida: só a etapa MAIS AVANÇADA aplicável fica aberta.
    Object.keys(vencidas).forEach(function(cid) {
      var c = vencidas[cid];
      var iso = _cobrIso(c);
      if (!iso) return;
      var dias = Math.floor((hoje - new Date(iso + 'T00:00:00')) / 86400000);
      var etapaIdx = -1;
      for (var i = regua.length - 1; i >= 0; i--) { if (dias >= regua[i].dias) { etapaIdx = i; break; } }
      if (etapaIdx < 0) return;

      // Etapas anteriores ainda abertas foram superadas — fecham sozinhas.
      tasks.forEach(function(t) {
        if (!t || t.status !== 'aberta' || !t._cobr) return;
        if (String(t._cobr).split(':')[0] !== cid) return;
        var tIdx = _cobrEtapaDaMarca(t._cobr);
        if (tIdx != null && tIdx < etapaIdx) { t.status = 'concluida'; t._cobrAuto = 'superada'; mudou = true; }
      });

      var marca = cid + ':e' + etapaIdx;
      var legada = cid + ':' + [3, 7, 14][etapaIdx]; // marca da v1 (dias fixos)
      var et = regua[etapaIdx];
      var titulo = 'Cobrança D+' + et.dias + ': ' + et.rotulo + ' — ' + (c.patient || 'paciente')
        + ' (R$ ' + (parseFloat(c.value) || 0) + ', venceu ' + _cobrDataBR(iso) + ')';
      // O sync de tarefas NÃO leva o campo _cobr (round-trip Supabase o perde) —
      // readota pela assinatura do título, senão a régua duplicaria a tarefa a
      // cada login em outro aparelho (bug real 14/07).
      tasks.forEach(function(t) { if (t && !t._cobr && t.title === titulo) t._cobr = marca; });
      if (tasks.some(function(t) { return t._cobr === marca || t._cobr === legada || t.title === titulo; })) return;
      tasks.push({ id: Date.now() + novas, title: titulo, titulo: titulo, patientName: c.patient || '',
                   dueDate: (typeof hojeISO === 'function' ? hojeISO() : ''), status: 'aberta',
                   createdAt: (typeof hojeISO === 'function' ? hojeISO() : ''), _cobr: marca });
      novas++;
    });

    if (novas > 0 || mudou) {
      if (typeof salvarTarefas === 'function') salvarTarefas();
      if (typeof atualizarBadgeTarefas === 'function') atualizarBadgeTarefas();
      if (novas > 0 && typeof showToast === 'function') showToast('📋 Régua de cobrança: ' + novas + (novas === 1 ? ' tarefa criada' : ' tarefas criadas') + ' para cobranças vencidas.');
    }
  } catch (e) { console.warn('[TF] escalação de cobrança:', e.message); }
}

// Mensagem da etapa com os dados reais (placeholders documentados no modal de config)
function _cobrMsg(c, etapa) {
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch (e) {}
  return etapa.msg
    .replace(/\{nome\}/g, _firstName(c.patient || ''))
    .replace(/\{valor\}/g, 'R$ ' + (parseFloat(c.value) || 0))
    .replace(/\{vencimento\}/g, _cobrDataBR(_cobrIso(c)))
    .replace(/\{pix\}/g, acc.pix_key ? '\n\nChave PIX: ' + acc.pix_key : '')
    .replace(/\{terapeuta\}/g, acc.nome ? acc.nome.split(' ')[0] : 'sua terapeuta');
}

// 📲 da tarefa de cobrança: abre o WhatsApp com a mensagem da etapa pronta.
function _cobrWppTarefa(taskId) {
  var t = (typeof tasks !== 'undefined' ? tasks : []).find(function(x) { return String(x.id) === String(taskId); });
  if (!t || !t._cobr) return;
  var cid = String(t._cobr).split(':')[0];
  var c = charges.find(function(x) { return String(x.id) === cid && !x.deleted; });
  if (!c || !_chargeVencida(c)) { showToast('Esta cobrança já foi resolvida — pode concluir a tarefa.'); return; }
  var regua = _cobrRegua();
  var idx = _cobrEtapaDaMarca(t._cobr);
  var etapa = regua[Math.min(Math.max(idx == null ? 0 : idx, 0), regua.length - 1)];
  var p = patients.find(function(x) { return x.name === c.patient; });
  if (!p || !p.whatsapp) { showToast('⚠ ' + _firstName(c.patient || 'Paciente') + ' está sem WhatsApp cadastrado — adicione em Pacientes → Editar.'); return; }
  var n = _wppNumero(p.whatsapp);
  if (!n) { showToast('⚠ Número de WhatsApp inválido — confira em Pacientes → Editar.'); return; }
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(_cobrMsg(c, etapa)), '_blank');
  showToast('📲 Mensagem da etapa D+' + etapa.dias + ' pronta no WhatsApp — revise e envie.');
}

// Guia do Financeiro: linhas da régua desenhadas da CONFIG real (o guia era estático)
function _renderReguaGuia() {
  var el = document.getElementById('fin-regua-lista');
  var regua = _cobrRegua();
  if (el) {
    var cores = ['var(--amber)', 'var(--amber)', 'var(--red)'];
    el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:var(--sage);flex-shrink:0"></div><div><strong>Dia da sessão</strong> — Envie o link PIX via WhatsApp</div></div>'
      + regua.map(function(et, i) {
        var rot = et.rotulo.charAt(0).toUpperCase() + et.rotulo.slice(1);
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + cores[i] + ';flex-shrink:0"></div><div><strong>Dia ' + et.dias + '</strong> — ' + escHTML(rot) + ' via WhatsApp</div></div>';
      }).join('');
  }
  var sub = document.getElementById('fin-regua-sub');
  if (sub) sub.textContent = 'Cobrança vencida gera a tarefa da etapa atual (D+' + regua[0].dias + ' → D+' + regua[1].dias + ' → D+' + regua[2].dias + ') em Tarefas. Cada envio você dispara pelo botão de WhatsApp da tarefa ou da cobrança — nada é enviado sem você.';
}

function abrirConfigRegua() {
  var regua = _cobrRegua();
  var blocos = regua.map(function(et, i) {
    var rot = et.rotulo.charAt(0).toUpperCase() + et.rotulo.slice(1);
    return '<div style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg)">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<span style="font-size:13px;font-weight:600;color:var(--ink)">' + (i + 1) + 'ª etapa — ' + escHTML(rot) + '</span>'
        + '<span style="margin-left:auto;font-size:12px;color:var(--muted)">D+</span>'
        + '<input type="number" min="1" max="90" id="regua-dias-' + i + '" value="' + et.dias + '" style="width:58px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--white);color:var(--ink)"/>'
        + '<span style="font-size:12px;color:var(--muted)">dias após o vencimento</span>'
      + '</div>'
      + '<textarea id="regua-msg-' + i + '" style="width:100%;min-height:88px;border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit;resize:vertical;outline:none;background:var(--white);color:var(--ink);line-height:1.5;box-sizing:border-box">' + escHTML(et.msg) + '</textarea>'
      + '</div>';
  }).join('');
  var modal = document.getElementById('modal-cobr-regua');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'modal-cobr-regua';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal" style="max-width:560px">'
    + '<div class="modal-header"><div class="modal-title">Régua de cobrança — prazos e mensagens</div>'
    + '<button class="modal-close" onclick="closeModal(\'modal-cobr-regua\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>'
    + '<div class="modal-body">'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;line-height:1.6">Use <strong>{nome}</strong> (paciente), <strong>{valor}</strong>, <strong>{vencimento}</strong>, <strong>{pix}</strong> (sua chave, se cadastrada no Perfil) e <strong>{terapeuta}</strong> — eles são trocados pelos dados reais na hora do envio.</div>'
      + blocos
      + '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:4px">'
        + '<button class="btn btn-secondary btn-sm" onclick="_restaurarConfigRegua()">Restaurar padrão</button>'
        + '<button class="btn btn-primary" onclick="_salvarConfigRegua()">Salvar régua</button>'
      + '</div>'
    + '</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); });
  modal.classList.add('open');
}

function _restaurarConfigRegua() {
  _COBR_REGUA_DEF.forEach(function(et, i) {
    var d = document.getElementById('regua-dias-' + i);
    var m = document.getElementById('regua-msg-' + i);
    if (d) d.value = et.dias;
    if (m) m.value = et.msg;
  });
}

function _salvarConfigRegua() {
  var arr = [0, 1, 2].map(function(i) {
    var d = document.getElementById('regua-dias-' + i);
    var m = document.getElementById('regua-msg-' + i);
    return { dias: Math.max(1, Math.min(90, parseInt(d && d.value, 10) || _COBR_REGUA_DEF[i].dias)),
             msg: ((m && m.value) || '').trim() || _COBR_REGUA_DEF[i].msg };
  });
  if (window._tfDemo) {
    window._tfDemoRegua = arr; // hermético: não contamina tf_account de conta real
  } else {
    try {
      var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
      acc.cobr_regua = arr;
      localStorage.setItem('tf_account', JSON.stringify(acc));
    } catch (e) { showToast('⚠ Não consegui salvar a régua neste aparelho (armazenamento cheio?).'); return; }
  }
  closeModal('modal-cobr-regua');
  _renderReguaGuia();
  _gerarTarefasCobranca();
  showToast('✓ Régua de cobrança salva — as próximas tarefas usam os novos prazos.');
}

function initFinanceiro() {
  _finModeInit();
  _gerarTarefasCobranca();
  _renderReguaGuia();
  _gerarCobrancasDosPlanos(); // planos mensais: gera a cobrança do mês se ainda não existe
  _popularMesesFinanceiro();
  var sel = document.getElementById('fin-month-select');
  var mesAtual = sel ? sel.value : null;
  if (mesAtual) {
    filterFinMonth(mesAtual);
  } else {
    renderCharges();
    atualizarStatsFinanceiro();
  }
  // Atualiza label do botão de cobranças
  var pendentes = charges.filter(function(c){ return !c.deleted && (c.status==='pending'||c.status==='overdue'); }).length;
  var btnCobrar = document.getElementById('fin-btn-cobrar');
  if (btnCobrar) btnCobrar.innerHTML = _tfIcon('wpp') + ' Cobrar ' + (pendentes||'') + ' pendente' + (pendentes!==1?'s':'') + ' via WhatsApp';
}

function _popularMesesFinanceiro() {
  var sel = document.getElementById('fin-month-select');
  if (!sel) return;
  // Coleta meses únicos das cobranças
  var mesesSet = {};
  charges.filter(function(c){ return !c.deleted && c.date; }).forEach(function(c){
    var key = _chargeMonthKey(c);
    if (key) mesesSet[key] = true;
  });
  // Adiciona meses próximos (atual + 2 anteriores)
  var hoje = new Date();
  for (var i = 0; i < 3; i++) {
    var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    var k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    mesesSet[k] = true;
  }
  var meses = Object.keys(mesesSet).sort().reverse();
  var nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var currentVal = sel.value;
  sel.innerHTML = meses.map(function(m){
    var parts = m.split('-');
    var label = nomesMes[parseInt(parts[1])-1] + ' ' + parts[0];
    return '<option value="'+m+'">'+label+'</option>';
  }).join('');
  // Restaura seleção se ainda válida, senão seleciona mês atual
  var hojeKey = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
  sel.value = meses.includes(hojeKey) ? hojeKey : (meses[0] || hojeKey);
}

function atualizarStatsFinanceiro(mesFilter) {
  var mes = mesFilter;
  if (!mes) { var sel = document.getElementById('fin-month-select'); mes = sel ? sel.value : null; }
  const ativas = charges.filter(function(c){ if (c.deleted) return false; if (mes && c.date) return _chargeInMonth(c, mes); return true; });
  // V1 (revisão 10/07): UMA definição de "vencido" no app inteiro — _chargeVencida
  // (status overdue OU pendente com data passada). O filtro antigo por
  // status==='overdue' dava sempre ~R$0 porque nada seta esse status.
  const receitaTotal = ativas.filter(c => c.status === 'paid').reduce((s, c) => s + c.value, 0);
  const vencidas     = ativas.filter(function(c){ return _chargeVencida(c); });
  const emAtraso     = vencidas.reduce((s, c) => s + c.value, 0);
  const aReceber     = ativas.filter(function(c){ return c.status !== 'paid' && !_chargeVencida(c); }).reduce((s, c) => s + c.value, 0);
  const _fmtR = fmtMoedaCompact;
  const stats = document.querySelectorAll('#page-financeiro .stat-value');
  if (stats[0]) stats[0].textContent = _fmtR(receitaTotal);
  if (stats[1]) stats[1].textContent = _fmtR(aReceber);
  // Stat "Planos mensais" (index 2): NUNCA era atualizado — ficava no valor demo.
  var _planosAtivos = (typeof plans !== 'undefined' ? plans : []).filter(function(pl){ return pl && pl.status === 'ativo'; });
  if (stats[2]) stats[2].textContent = _planosAtivos.length;
  if (stats[3]) stats[3].textContent = _fmtR(emAtraso);
  // Deltas dos 4 cards: eram TEXTO FABRICADO fixo no HTML — agora refletem o cálculo.
  var deltas = document.querySelectorAll('#page-financeiro .stat-delta');
  var _mensaisMes = ativas.filter(function(c){ return c.billing === 'mensal' && c.status === 'paid'; }).reduce(function(s,c){ return s + c.value; }, 0);
  if (deltas[0]) deltas[0].textContent = receitaTotal > 0 ? (_fmtR(_mensaisMes) + ' de planos + ' + _fmtR(receitaTotal - _mensaisMes) + ' avulsos') : 'Nenhum pagamento no período';
  var _pendCount = ativas.filter(function(c){ return c.status !== 'paid' && !_chargeVencida(c); }).length;
  if (deltas[1]) deltas[1].textContent = _pendCount + (_pendCount === 1 ? ' cobrança pendente' : ' cobranças pendentes');
  var _recorrente = _planosAtivos.reduce(function(s,pl){ return s + (parseFloat(pl.valor) || 0); }, 0);
  if (deltas[2]) deltas[2].textContent = _planosAtivos.length ? (_fmtR(_recorrente) + '/mês recorrente') : 'Nenhum plano ativo';
  if (deltas[3]) deltas[3].textContent = vencidas.length
    ? (vencidas.length + (vencidas.length === 1 ? ' cobrança vencida' : ' cobranças vencidas') + ' · ' + _firstName(vencidas[0].patient || ''))
    : 'Nada em atraso';
  // Tags de contagem (mesma régua)
  var countPaid = ativas.filter(function(c){ return c.status==='paid'; }).length;
  var countOver = vencidas.length;
  var countPend = _pendCount;
  var el;
  el = document.getElementById('fin-count-paid');    if (el) el.textContent = countPaid + ' paga' + (countPaid!==1?'s':'');
  el = document.getElementById('fin-count-pending'); if (el) el.textContent = countPend + ' pendente' + (countPend!==1?'s':'');
  el = document.getElementById('fin-count-overdue'); if (el) el.textContent = countOver + ' atrasada' + (countOver!==1?'s':'');
}

function exportarFinanceiro() {
  const rows = charges.filter(c => !c.deleted);
  if (!rows.length) { showToast('Nenhuma cobrança para exportar.'); return; }

  const statusLabel = s => s === 'paid' ? 'Pago' : s === 'overdue' ? 'Atrasado' : 'Pendente';
  const billingLabel = b => b === 'mensal' ? 'Mensal' : 'Avulso';
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const header = ['Paciente','Sessão/Plano','Tipo','Data','Valor (R$)','Método','Status','Data Pagamento','Dias em Aberto'];
  const csvRows = [header.map(esc).join(',')];

  rows.forEach(c => {
    const sessionCol = c.billing === 'mensal' ? (c.planLabel || '') : `Sessão ${c.session}`;
    csvRows.push([
      esc(c.patient),
      esc(sessionCol),
      esc(billingLabel(c.billing)),
      esc(c.date || ''),
      esc(Number(c.value || 0).toFixed(2).replace('.', ',')),
      esc(c.method || 'PIX'),
      esc(statusLabel(c.status)),
      esc(c.paidDate || ''),
      esc(c.status !== 'paid' ? (_calcDaysOpen(c) || '') : '')
    ].join(','));
  });

  const bom = '\uFEFF'; // UTF-8 BOM para Excel reconhecer acentos
  const blob = new Blob([bom + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const hoje = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  a.download = `teravia-financeiro-${hoje}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  showToast(`CSV exportado — ${rows.length} cobranças`);
}

function exportarRelatorioMensal() {
  const rows = charges.filter(c => !c.deleted);
  if (!rows.length) { showToast('Nenhuma cobrança para gerar relatório.'); return; }

  const terapeuta = tfUserData || {};
  const hoje = new Date();
  const mesAtual = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const fmt = fmtMoeda;
  const statusLabel = s => s === 'paid' ? 'Pago' : s === 'overdue' ? 'Em atraso' : 'Pendente';
  const statusColor = s => s === 'paid' ? '#166534' : s === 'overdue' ? 'var(--red)' : 'var(--amber)';
  const statusBg = s => s === 'paid' ? '#dcfce7' : s === 'overdue' ? 'var(--red-light)' : 'var(--amber-light)';

  const receitaTotal = rows.filter(c=>c.status==='paid').reduce((s,c)=>s+c.value,0);
  const aReceber = rows.filter(c=>c.status==='pending').reduce((s,c)=>s+c.value,0);
  const emAtraso = rows.filter(c=>c.status==='overdue').reduce((s,c)=>s+c.value,0);
  const totalGeral = rows.reduce((s,c)=>s+c.value,0);
  const taxaAdimplencia = totalGeral ? Math.round(receitaTotal/totalGeral*100) : 0;

  // Agrupar por paciente
  const porPaciente = {};
  rows.forEach(c => {
    if (!porPaciente[c.patient]) porPaciente[c.patient] = { pago:0, pendente:0, atrasado:0, sessoes:0 };
    const pp = porPaciente[c.patient];
    if (c.status==='paid') pp.pago += c.value;
    else if (c.status==='overdue') pp.atrasado += c.value;
    else pp.pendente += c.value;
    pp.sessoes++;
  });

  const tabelaRows = rows.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(c => `
    <tr>
      <td>${c.date ? new Date(c.date+'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td>${escHTML(c.patient||'—')}</td>
      <td>${c.billing==='mensal'?(c.planLabel||'Plano mensal'):'Sessão '+(c.session||'')}</td>
      <td>${escHTML(c.method||'PIX')}</td>
      <td style="text-align:right;font-weight:600">${fmt(c.value)}</td>
      <td style="text-align:center"><span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${statusBg(c.status)};color:${statusColor(c.status)}">${statusLabel(c.status)}</span></td>
    </tr>`).join('');

  const pacienteRows = Object.entries(porPaciente).map(([nome, v]) => `
    <tr>
      <td>${escHTML(nome)}</td>
      <td style="text-align:right;color:#166534;font-weight:600">${fmt(v.pago)}</td>
      <td style="text-align:right;color:var(--amber)">${fmt(v.pendente)}</td>
      <td style="text-align:right;color:var(--red)">${fmt(v.atrasado)}</td>
      <td style="text-align:right">${v.sessoes}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Financeiro — ${mesAtual}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,Arial,sans-serif;color:#1a1a1a;background:var(--white);padding:40px 48px;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #4a7c59}
.logo{font-size:22px;font-weight:700;color:#4a7c59;letter-spacing:-.5px}
.header-right{text-align:right;color:#666;font-size:12px;line-height:1.6}
h2{font-size:16px;font-weight:700;margin:28px 0 12px;color:#1a1a1a;border-left:4px solid #4a7c59;padding-left:10px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.stat{padding:16px;border-radius:10px;border:1px solid #e5e7eb;text-align:center}
.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:6px}
.stat-value{font-size:20px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f9fafb;text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666}
td{padding:8px 10px;border-bottom:1px solid var(--line-2);vertical-align:middle}tr:hover td{background:#fafafa}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#999;font-size:11px;text-align:center}
@media print{body{padding:20px 28px}.stats{break-inside:avoid}h2{break-before:auto}}
</style></head><body>
<div class="header">
  <div><div class="logo">Teravia</div><div style="font-size:13px;color:#666;margin-top:4px">Relatório Financeiro Mensal</div></div>
  <div class="header-right">
    <strong>${escHTML(terapeuta.nome||'Terapeuta')}</strong><br>
    CRP: ${escHTML(terapeuta.crp||'—')}<br>
    ${mesAtual}<br>
    Gerado em ${hoje.toLocaleDateString('pt-BR')}
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-label">Receita recebida</div><div class="stat-value" style="color:#166534">${fmt(receitaTotal)}</div></div>
  <div class="stat"><div class="stat-label">A receber</div><div class="stat-value" style="color:var(--amber)">${fmt(aReceber)}</div></div>
  <div class="stat"><div class="stat-label">Em atraso</div><div class="stat-value" style="color:var(--red)">${fmt(emAtraso)}</div></div>
  <div class="stat"><div class="stat-label">Adimplência</div><div class="stat-value" style="color:#4a7c59">${taxaAdimplencia}%</div></div>
</div>

<h2>Extrato de cobranças</h2>
<table><thead><tr><th>Data</th><th>Paciente</th><th>Descrição</th><th>Método</th><th style="text-align:right">Valor</th><th style="text-align:center">Status</th></tr></thead>
<tbody>${tabelaRows}</tbody>
<tfoot><tr style="background:#f9fafb;font-weight:700"><td colspan="4" style="padding:8px 10px">Total geral</td><td style="text-align:right;padding:8px 10px">${fmt(totalGeral)}</td><td></td></tr></tfoot>
</table>

<h2>Resumo por paciente</h2>
<table><thead><tr><th>Paciente</th><th style="text-align:right">Pago</th><th style="text-align:right">Pendente</th><th style="text-align:right">Atrasado</th><th style="text-align:right">Sessões</th></tr></thead>
<tbody>${pacienteRows}</tbody>
</table>

<div class="footer">Teravia · Relatório gerado automaticamente em ${hoje.toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})} · Documento não tem valor fiscal</div>
</body></html>`;

  var win = window.open('', '_blank');
  if (!win) { showToast('Permita pop-ups para este site e tente novamente.', 'error'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ win.print(); }, 600);
  showToast('📊 Relatório mensal gerado!');
  try { localStorage.setItem('tf_first_export', Date.now()); verificarMarcos(); } catch(e){}
}

// Dados do terapeuta para o recibo (tfUserData ou fallback do localStorage).
function _reciboTerapeuta() {
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  return (typeof tfUserData !== 'undefined' && tfUserData && tfUserData.nome)
    ? tfUserData : { nome: acc.nome||'—', crp: acc.crp||'—' };
}

// Número do recibo: baseado no id da cobrança (determinístico/rastreável) ou seq.
function _reciboNum(c) {
  if (c && c.id != null) return String(c.id).slice(-4).padStart(4,'0');
  var seq = 0; try { seq = parseInt(localStorage.getItem('tf_recibo_seq')||'0')||0; } catch(e){}
  seq++; try { localStorage.setItem('tf_recibo_seq', String(seq)); } catch(e){}
  return String(seq).padStart(4,'0');
}

// Corpo de UM recibo (uma "página"). Reusado no recibo individual e no lote.
function _reciboCorpo(c, terapeuta, hoje) {
  var num = _reciboNum(c);
  return `<div class="recibo-page">
  <div class="header">
    <div><div class="logo">Teravia</div><div class="logo-sub">Plataforma clínica para psicólogos</div></div>
    <div class="recibo-num"><strong>Recibo nº ${num}</strong>Emitido em ${hoje}</div>
  </div>
  <div class="section grid">
    <div><div class="label">Terapeuta responsável</div><div class="value">${escHTML(terapeuta.nome||'—')}</div><div style="font-size:12px;color:#666">CRP ${escHTML(terapeuta.crp||'—')}</div></div>
    <div><div class="label">Paciente</div><div class="value">${c ? escHTML(c.patient) : '—'}</div></div>
  </div>
  <div class="section grid">
    <div><div class="label">Descrição do serviço</div><div class="value">${c ? (c.billing === 'mensal' ? escHTML(c.planLabel||'Plano mensal') : 'Sessão de psicoterapia nº '+escHTML(String(c.session||'—'))) : 'Sessão de psicoterapia'}</div></div>
    <div><div class="label">Data da sessão</div><div class="value">${c && c.date ? escHTML(fmtDataBR(c.date)) : hoje}</div></div>
  </div>
  <div class="section grid">
    <div><div class="label">Forma de pagamento</div><div class="value">${c ? escHTML(c.method||'PIX') : '—'}</div></div>
    <div><div class="label">Status</div><div class="value">${c && c.status === 'paid' ? '✅ Pago' : '⏳ Pendente'}</div></div>
  </div>
  <div class="total-box"><div class="total-label">Valor recebido</div><div class="total-value">${c ? fmtMoeda(c.value) : '—'}</div></div>
  <div class="assinatura"><div style="margin-bottom:32px">&nbsp;</div>${escHTML(terapeuta.nome||'Terapeuta')}<div style="font-size:11px;color:#888">CRP ${escHTML(terapeuta.crp||'—')} · Psicólogo(a)</div></div>
  <div class="footer">Recibo emitido pela plataforma Teravia · Uso exclusivamente profissional<br/>Este documento é gerado eletronicamente e tem validade como comprovante de pagamento</div>
</div>`;
}

// Documento completo com 1+ recibos (page-break entre eles → 1 por folha no PDF).
function _reciboDoc(corpos) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"/>
<title>Recibo${corpos.length>1?'s ('+corpos.length+')':''} — Teravia</title>
<style>
  body{font-family:'Arial',sans-serif;color:#1a1a1a;font-size:13px;margin:0}
  .recibo-page{max-width:580px;margin:40px auto;padding:0 24px;page-break-after:always}
  .recibo-page:last-child{page-break-after:auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2d5a3d;padding-bottom:16px;margin-bottom:24px}
  .logo{font-size:20px;font-weight:700;color:#2d5a3d}
  .logo-sub{font-size:11px;color:#666;margin-top:3px}
  .recibo-num{text-align:right;font-size:11px;color:#888}
  .recibo-num strong{display:block;font-size:18px;color:#1a1a1a}
  .section{margin-bottom:20px}
  .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#999;margin-bottom:6px}
  .value{font-size:14px;color:#1a1a1a}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .total-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;margin:24px 0}
  .total-label{font-size:11px;color:#666;margin-bottom:4px}
  .total-value{font-size:28px;font-weight:700;color:#2d5a3d}
  .footer{margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:11px;color:#999;text-align:center;line-height:1.8}
  .assinatura{margin-top:40px;border-top:1px solid #1a1a1a;padding-top:8px;font-size:12px;color:#444;width:260px}
</style></head><body>${corpos.join('\n')}</body></html>`;
}

function _abrirImpressao(html) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Permita pop-ups para gerar o recibo.'); return false; }
  win.document.write(html); win.document.close(); win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}

function gerarReciboPDF(btn) {
  const card = btn.closest('[data-charge-id]') || btn.closest('.card') || btn.parentElement;
  const chargeId = card ? parseInt(card.dataset.chargeId) : null;
  const c = chargeId != null ? charges.find(ch => String(ch.id) === String(chargeId)) : null;
  _abrirImpressao(_reciboDoc([_reciboCorpo(c, _reciboTerapeuta(), new Date().toLocaleDateString('pt-BR'))]));
}

// Lote: gera UM documento com os recibos de todas as cobranças PAGAS do mês
// selecionado (ou de todos os meses se nenhum filtro válido) — um por página.
function gerarRecibosLote() {
  var sel = document.getElementById('fin-month-select');
  var mes = (sel && sel.value && /^\d{4}-\d{2}$/.test(sel.value)) ? sel.value : null;
  var pagos = (typeof charges !== 'undefined' ? charges : []).filter(function(c){
    return !c.deleted && c.status === 'paid' && (!mes || _chargeInMonth(c, mes));
  });
  if (!pagos.length) { showToast('Nenhuma cobrança paga' + (mes ? ' neste mês' : '') + ' para gerar recibos.', 'warning'); return; }
  var terapeuta = _reciboTerapeuta();
  var hoje = new Date().toLocaleDateString('pt-BR');
  var corpos = pagos.map(function(c){ return _reciboCorpo(c, terapeuta, hoje); });
  if (_abrirImpressao(_reciboDoc(corpos))) {
    showToast('📄 ' + pagos.length + ' recibo' + (pagos.length>1?'s':'') + ' gerado' + (pagos.length>1?'s':'') + ' — revise e salve/imprima.');
  }
}

/* ── DECLARAÇÃO P/ CONVÊNIO + RELATÓRIO ANUAL (IR) — por paciente ──
 * Primos dos recibos: documento assinável gerado das cobranças PAGAS do
 * paciente (textos-modelo em docs-rascunhos/modelos-declaracao-convenio-e-ir.md).
 * CPF do paciente/pagador vivem na ficha (viajam no metadata do sync — a lista
 * explícita em js/03 PRECISA contê-los); CPF/CNPJ e endereço do profissional
 * ficam em tf_account (mesmo nível da chave PIX: só neste aparelho). */
var _declCtx = { idx: null, tipo: 'convenio' };

function _declPagos(p) {
  return (typeof charges !== 'undefined' ? charges : [])
    .filter(function(c){ return c && !c.deleted && c.status === 'paid' && c.patient === p.name && c.date; })
    .sort(function(a, b){ return a.date < b.date ? -1 : 1; });
}

function _declPagosSelecionados() {
  var p = patients[_declCtx.idx];
  if (!p) return [];
  var pagos = _declPagos(p);
  if (_declCtx.tipo === 'ir') {
    var anoEl = document.getElementById('decl-ano');
    var ano = anoEl ? anoEl.value : '';
    return pagos.filter(function(c){ return c.date.slice(0, 4) === ano; });
  }
  var de = (document.getElementById('decl-de') || {}).value || '';
  var ate = (document.getElementById('decl-ate') || {}).value || '';
  return pagos.filter(function(c){ return (!de || c.date >= de) && (!ate || c.date <= ate); });
}

function abrirModalDeclaracao(i, tipo) {
  var p = patients[i];
  if (!p) return;
  _declCtx = { idx: i, tipo: tipo };
  var conv = tipo === 'convenio';
  document.getElementById('decl-titulo').textContent = conv ? 'Declaração para convênio' : 'Relatório anual para o IR';
  document.getElementById('decl-sub').textContent = conv
    ? 'Documento para ' + p.name + ' pedir reembolso ao plano de saúde, com as sessões pagas do período. Os dados preenchidos ficam salvos para a próxima vez.'
    : 'Declaração anual de pagamentos para ' + p.name + ' usar no Imposto de Renda. Os dados preenchidos ficam salvos para a próxima vez.';
  document.getElementById('decl-grupo-modalidade').style.display = conv ? '' : 'none';
  document.getElementById('decl-grupo-periodo').style.display = conv ? '' : 'none';
  document.getElementById('decl-grupo-cid').style.display = conv ? '' : 'none';
  document.getElementById('decl-grupo-ano').style.display = conv ? 'none' : '';
  document.getElementById('decl-grupo-pagador').style.display = conv ? 'none' : '';

  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch(e){}
  document.getElementById('decl-pac-cpf').value = p.cpf || '';
  document.getElementById('decl-doc').value = acc.doc_fiscal || '';
  document.getElementById('decl-cidade').value = acc.cidade || '';
  document.getElementById('decl-endereco').value = acc.endereco_prof || '';

  var pagos = _declPagos(p);
  if (conv) {
    document.getElementById('decl-de').value = pagos.length ? pagos[0].date : '';
    document.getElementById('decl-ate').value = pagos.length ? pagos[pagos.length - 1].date : '';
    document.getElementById('decl-cid').value = (p.cid && p.cid !== '—') ? p.cid : '';
    document.getElementById('decl-cid-ok').checked = false;
  } else {
    var anos = [];
    pagos.forEach(function(c){ var a = c.date.slice(0, 4); if (anos.indexOf(a) < 0) anos.push(a); });
    if (!anos.length) anos.push(String(new Date().getFullYear()));
    anos.sort().reverse();
    document.getElementById('decl-ano').innerHTML = anos.map(function(a){ return '<option>' + a + '</option>'; }).join('');
    document.getElementById('decl-pagador-nome').value = p.pagadorNome || '';
    document.getElementById('decl-pagador-cpf').value = p.pagadorCpf || '';
  }
  _declAtualizaResumo();
  showModal('modal-declaracao');
}

function _declAtualizaResumo() {
  var el = document.getElementById('decl-resumo');
  if (!el) return;
  var sel = _declPagosSelecionados();
  var total = sel.reduce(function(s, c){ return s + (parseFloat(c.value) || 0); }, 0);
  el.innerHTML = sel.length
    ? '🧾 <strong>' + sel.length + ' pagamento' + (sel.length > 1 ? 's' : '') + '</strong> no ' + (_declCtx.tipo === 'ir' ? 'ano' : 'período') + ' — total <strong>' + fmtMoeda(total) + '</strong>.'
    : '⚠ Nenhum pagamento nesse intervalo — o documento é gerado das cobranças marcadas como <strong>pagas</strong> no Financeiro.';
}

// Valor por extenso em pt-BR (recibos/declarações fiscais pedem).
function _valorPorExtenso(v) {
  var cents = Math.round((parseFloat(v) || 0) * 100);
  var reais = Math.floor(cents / 100), cent = cents % 100;
  var U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function ate999(n) {
    if (n === 100) return 'cem';
    var c = Math.floor(n / 100), r = n % 100, s = [];
    if (c) s.push(C[c]);
    if (r) s.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
    return s.join(' e ');
  }
  var mi = Math.floor(reais / 1000000), mil = Math.floor((reais % 1000000) / 1000), rst = reais % 1000;
  var partes = [];
  if (mi) partes.push(ate999(mi) + (mi === 1 ? ' milhão' : ' milhões'));
  if (mil) partes.push(mil === 1 ? 'mil' : ate999(mil) + ' mil');
  if (rst) partes.push(ate999(rst));
  var txt = '';
  if (reais) {
    txt = partes.join(' e ') + (mi && !mil && !rst ? ' de' : '') + (reais === 1 ? ' real' : ' reais');
  }
  if (cent) txt += (txt ? ' e ' : '') + ate999(cent) + (cent === 1 ? ' centavo' : ' centavos');
  return txt || 'zero reais';
}

// Casca de impressão da declaração (mesma estética dos recibos).
function _declDoc(titulo, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"/>
<title>${titulo} — Teravia</title>
<style>
  body{font-family:'Arial',sans-serif;color:#1a1a1a;font-size:13px;margin:0}
  .decl-page{max-width:640px;margin:40px auto;padding:0 24px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2d5a3d;padding-bottom:16px;margin-bottom:28px}
  .logo{font-size:20px;font-weight:700;color:#2d5a3d}
  .logo-sub{font-size:11px;color:#666;margin-top:3px}
  .emissao{text-align:right;font-size:11px;color:#888}
  h1{font-size:15px;text-align:center;letter-spacing:.5px;margin:0 0 24px}
  p{line-height:1.8;text-align:justify;margin:0 0 14px}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:12.5px}
  th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#999;border-bottom:1px solid #ccc;padding:6px 8px}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  .num{text-align:right}
  .total-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center;margin:20px 0}
  .total-label{font-size:11px;color:#666;margin-bottom:4px}
  .total-value{font-size:24px;font-weight:700;color:#2d5a3d}
  .extenso{font-size:11.5px;color:#555;margin-top:4px}
  .local{margin-top:28px}
  .assinatura{margin-top:56px;border-top:1px solid #1a1a1a;padding-top:8px;font-size:12px;color:#444;width:300px}
  .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e0e0e0;font-size:10.5px;color:#999;text-align:center;line-height:1.7}
</style></head><body><div class="decl-page">${corpo}</div></body></html>`;
}

function gerarDeclaracaoPDF() {
  var p = patients[_declCtx.idx];
  if (!p) return;
  var conv = _declCtx.tipo === 'convenio';
  var sel = _declPagosSelecionados();
  if (!sel.length) { showToast('⚠ Nenhuma cobrança paga nesse intervalo — marque os pagamentos no Financeiro antes de gerar.', 'warning'); return; }
  var pacCpf = document.getElementById('decl-pac-cpf').value.trim();
  var doc = document.getElementById('decl-doc').value.trim();
  var cidade = document.getElementById('decl-cidade').value.trim();
  var endereco = document.getElementById('decl-endereco').value.trim();
  if (!pacCpf) { showToast('⚠ Informe o CPF do paciente — convênio e Receita exigem.', 'warning'); return; }
  if (!doc) { showToast('⚠ Informe seu CPF ou CNPJ — é ele que identifica quem recebeu.', 'warning'); return; }
  var cidOk = conv && document.getElementById('decl-cid-ok').checked;
  var cid = conv ? document.getElementById('decl-cid').value.trim() : '';
  if (cidOk && !cid) { showToast('⚠ Preencha o CID a incluir ou desmarque a autorização.', 'warning'); return; }
  var pagNome = conv ? '' : document.getElementById('decl-pagador-nome').value.trim();
  var pagCpf = conv ? '' : document.getElementById('decl-pagador-cpf').value.trim();

  // Persiste o que foi preenchido (paciente → ficha/sync; profissional → tf_account).
  p.cpf = pacCpf;
  if (!conv) { p.pagadorNome = pagNome || null; p.pagadorCpf = pagCpf || null; }
  salvarPacientes();
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    acc.doc_fiscal = doc; acc.endereco_prof = endereco;
    if (cidade) acc.cidade = cidade;
    localStorage.setItem('tf_account', JSON.stringify(acc));
  } catch(e){}

  var t = _reciboTerapeuta();
  var total = sel.reduce(function(s, c){ return s + (parseFloat(c.value) || 0); }, 0);
  var nSess = sel.filter(function(c){ return c.billing !== 'mensal'; }).length;
  var nMens = sel.length - nSess;
  var hoje = new Date().toLocaleDateString('pt-BR');
  var hojeLonga = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  var linhas = sel.map(function(c){
    var desc = c.billing === 'mensal' ? escHTML(c.planLabel || 'Mensalidade — plano mensal') : 'Sessão de psicoterapia';
    return '<tr><td>' + escHTML(fmtDataBR(c.date)) + '</td><td>' + desc + '</td><td class="num">' + fmtMoeda(c.value) + '</td><td class="num">' + _reciboNum(c) + '</td></tr>';
  }).join('');
  var tabela = '<table><thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th class="num">Recibo nº</th></tr></thead><tbody>' + linhas + '</tbody></table>';
  var cabecalho = '<div class="header"><div><div class="logo">Teravia</div><div class="logo-sub">Plataforma clínica para psicólogos</div></div><div class="emissao">Emitido em ' + hoje + '</div></div>';
  var assinatura = '<div class="assinatura">' + escHTML(t.nome || '—')
    + '<div style="font-size:11px;color:#888">CRP ' + escHTML(t.crp || '—') + ' · Psicólogo(a) · CPF/CNPJ ' + escHTML(doc) + '</div></div>';
  var local = '<p class="local">' + (cidade ? escHTML(cidade) + ', ' : '') + hojeLonga + '.</p>';
  var corpo, tituloDoc;

  if (conv) {
    var modalidade = document.getElementById('decl-modalidade').value;
    var qtd = nMens
      ? '<strong>' + sel.length + (sel.length === 1 ? ' pagamento</strong> referente' : ' pagamentos</strong> referentes') + ' a psicoterapia individual ('
        + (nSess ? nSess + (nSess === 1 ? ' sessão avulsa' : ' sessões avulsas') + ' e ' : '')
        + nMens + (nMens === 1 ? ' mensalidade' : ' mensalidades') + ', modalidade ' + modalidade + ')'
      : '<strong>' + nSess + (nSess === 1 ? ' sessão' : ' sessões') + ' de psicoterapia individual</strong> (modalidade ' + modalidade + ')';
    var linhaCid = cidOk
      ? 'CID: <strong>' + escHTML(cid) + '</strong> — inclusão autorizada por escrito pelo paciente.'
      : 'CID: não informado, por opção do paciente.';
    tituloDoc = 'Declaração de atendimento';
    corpo = cabecalho
      + '<h1>DECLARAÇÃO DE ATENDIMENTO PSICOLÓGICO</h1>'
      + '<p>Declaro, para fins de solicitação de reembolso junto ao plano de saúde, que <strong>' + escHTML(p.name) + '</strong>, CPF <strong>' + escHTML(pacCpf) + '</strong>, esteve em atendimento psicológico sob meus cuidados profissionais no período de <strong>' + escHTML(fmtDataBR(sel[0].date)) + '</strong> a <strong>' + escHTML(fmtDataBR(sel[sel.length - 1].date)) + '</strong>, totalizando ' + qtd + ', nas datas relacionadas abaixo:</p>'
      + tabela
      + '<div class="total-box"><div class="total-label">Valor total do período</div><div class="total-value">' + fmtMoeda(total) + '</div><div class="extenso">(' + _valorPorExtenso(total) + ')</div></div>'
      + '<p>' + linhaCid + '</p>'
      + local + assinatura
      + '<div class="footer">Documento gerado pela plataforma Teravia a partir das cobranças registradas — confira os dados antes de assinar e enviar.</div>';
  } else {
    var ano = document.getElementById('decl-ano').value;
    var pagClause = pagNome
      ? ', por intermédio de <strong>' + escHTML(pagNome) + '</strong>' + (pagCpf ? ', CPF <strong>' + escHTML(pagCpf) + '</strong>' : '') + ', responsável pelo pagamento'
      : '';
    var qtdIR = nMens ? sel.length + (sel.length === 1 ? ' pagamento' : ' pagamentos') : nSess + (nSess === 1 ? ' sessão' : ' sessões');
    tituloDoc = 'Declaração anual ' + ano;
    corpo = cabecalho
      + '<h1>DECLARAÇÃO ANUAL DE PAGAMENTOS — ANO-CALENDÁRIO ' + escHTML(ano) + '</h1>'
      + '<p>Declaro que recebi de <strong>' + escHTML(p.name) + '</strong>, CPF <strong>' + escHTML(pacCpf) + '</strong>' + pagClause + ', a importância total de <strong>' + fmtMoeda(total) + '</strong> (' + _valorPorExtenso(total) + '), referente a ' + qtdIR + ' de atendimento psicológico no ano-calendário de ' + escHTML(ano) + ', conforme recibos emitidos e relação abaixo:</p>'
      + tabela
      + '<p style="background:#f7f7f5;border-radius:8px;padding:12px 14px;font-size:12px">Para fins de dedução no IRPF (despesas com saúde — profissional: psicólogo(a)):<br/>'
      + 'Nome: <strong>' + escHTML(t.nome || '—') + '</strong> · CPF/CNPJ: <strong>' + escHTML(doc) + '</strong> · Registro: CRP <strong>' + escHTML(t.crp || '—') + '</strong>'
      + (endereco ? '<br/>Endereço profissional: ' + escHTML(endereco) : '') + '</p>'
      + local + assinatura
      + '<div class="footer">Documento gerado pela plataforma Teravia a partir das cobranças registradas — confira com seu contador.<br/>O paciente deve guardar os recibos originais de cada pagamento.</div>';
  }

  if (_abrirImpressao(_declDoc(tituloDoc, corpo))) {
    showToast('🧾 Documento gerado — revise antes de assinar e enviar.');
    closeModal('modal-declaracao');
  }
}

function filterFinMonth(val) {
  // val é 'YYYY-MM'
  var nomesMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var label = val;
  if (val && val.includes('-')) {
    var parts = val.split('-');
    label = nomesMes[parseInt(parts[1])-1] + ' de ' + parts[0];
  }
  const sub = document.querySelector('#page-financeiro .page-subtitle');
  if (sub) sub.textContent = label + ' · Cobranças, pagamentos e recibos';
  renderCharges(val);
  atualizarStatsFinanceiro(val);
  // V1: o seletor de mês agora vale também para Recibos (Inadimplência segue
  // global de propósito — dívida vencida importa independentemente do mês).
  renderFinRecibos();
}

function switchPlanType(type) {
  document.getElementById('ptype-mensal').classList.toggle('selected', type === 'mensal');
  document.getElementById('ptype-avulso').classList.toggle('selected', type === 'avulso');
  document.getElementById('plan-fields-mensal').style.display = type === 'mensal' ? '' : 'none';
  document.getElementById('plan-fields-avulso').style.display = type === 'avulso' ? '' : 'none';
  document.getElementById('plan-create-btn').textContent = type === 'mensal' ? 'Criar plano' : 'Criar cobrança';
}

/* ── PLANOS MENSAIS (entidade) ──
 * Decisão do usuário 09/07: o plano é uma entidade — gera a cobrança do mês
 * automaticamente na entrada do app/financeiro (sem cron) e é gerenciável
 * (pausar/retomar/cancelar). Vive em tf_plans e sincroniza via users.settings
 * (migration 024, LWW — só o terapeuta edita), junto com bloqueios/horários. */
var plans = [];
try { plans = JSON.parse(localStorage.getItem('tf_plans') || '[]'); } catch(e) { plans = []; }

function salvarPlanos() {
  // Demo não persiste nem sobe: um plano criado brincando na demo geraria
  // cobrança REAL todo mês na conta de verdade (mesmo padrão do F5/charges).
  if (window._tfDemo) return;
  try { localStorage.setItem('tf_plans', JSON.stringify(plans)); } catch(e) {}
  if (typeof _supaSync_settings === 'function') _supaSync_settings();
}

function _mesKeyAtual() {
  var h = new Date();
  return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0');
}

/* Id numérico determinístico da cobrança do mês: mesmo plano+mês → mesmo id em
 * qualquer dispositivo (o UNIQUE de charges.local_id no banco descarta a
 * duplicata se dois devices gerarem em paralelo). */
function _planChargeId(plan, mesKey) {
  var parts = mesKey.split('-');
  var mesesDesde2020 = (parseInt(parts[0]) - 2020) * 12 + (parseInt(parts[1]) - 1);
  return plan.id * 100 + (mesesDesde2020 % 100);
}

function _novaCobrancaDoPlano(pl, mesKey) {
  var parts = mesKey.split('-');
  var diaVenc = Math.min(Math.max(parseInt(pl.diaVenc) || 5, 1), 28);
  var p = (typeof patients !== 'undefined' ? patients : []).find(function(x){ return x.name === pl.patient; });
  return {
    id: _planChargeId(pl, mesKey), planId: pl.id, planMes: mesKey,
    patient: pl.patient,
    initials: p ? p.initials : (pl.patient || '?').split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase(),
    color: p ? p.color : '#4a7c59',
    value: pl.valor, date: parts[0] + '-' + parts[1] + '-' + String(diaVenc).padStart(2, '0'),
    status: 'pending', deleted: false,
    billing: 'mensal', planLabel: pl.sessoesMes + ' sessões/mês', session: pl.sessoesMes + 'x/mês',
    method: 'PIX',
  };
}

/* Gera as cobranças do mês corrente dos planos ativos. Idempotente — chamado no
 * boot (js/18), no restore pós-login (js/00) e ao entrar no Financeiro. */
function _gerarCobrancasDosPlanos() {
  if (window._tfDemo) return;
  if (!Array.isArray(plans) || !plans.length) return;
  var mesKey = _mesKeyAtual();
  var geradas = 0, mudou = false;
  plans.forEach(function(pl) {
    if (!pl || pl.status !== 'ativo') return;
    if (pl.ultimoMesGerado && pl.ultimoMesGerado >= mesKey) return;
    var chargeId = _planChargeId(pl, mesKey);
    // Guard local além do UNIQUE do banco: se a cobrança deste plano+mês já
    // existe (inclusive excluída pelo usuário), só marca o mês — não ressuscita.
    // Ids restaurados do Supabase voltam como string (local_id) → comparar por String.
    var jaExiste = charges.some(function(c) {
      return c && (String(c.id) === String(chargeId) || (c.planMes === mesKey && String(c.planId) === String(pl.id)));
    });
    if (!jaExiste) { charges.push(_novaCobrancaDoPlano(pl, mesKey)); geradas++; }
    pl.ultimoMesGerado = mesKey;
    mudou = true;
  });
  if (mudou) {
    salvarPlanos();
    if (typeof salvarCharges === 'function') salvarCharges();
    if (geradas && typeof showToast === 'function') {
      showToast('📅 ' + geradas + (geradas === 1 ? ' cobrança do mês gerada' : ' cobranças do mês geradas') + ' pelos planos mensais.');
    }
  }
}

function _getPlano(id) {
  return plans.find(function(pl){ return pl && String(pl.id) === String(id); }) || null;
}

function pausarPlano(id) {
  var pl = _getPlano(id);
  if (!pl) return;
  pl.status = 'pausado';
  salvarPlanos();
  renderFinPlanos();
  showToast('⏸ Plano de ' + _firstName(pl.patient) + ' pausado — nenhuma cobrança nova até retomar.');
}

function retomarPlano(id) {
  var pl = _getPlano(id);
  if (!pl) return;
  pl.status = 'ativo';
  salvarPlanos();
  _gerarCobrancasDosPlanos(); // gera o mês corrente se ainda não existir (meses pausados não são retroativos)
  renderFinPlanos();
  if (typeof renderCharges === 'function') renderCharges();
  if (typeof atualizarStatsFinanceiro === 'function') atualizarStatsFinanceiro();
  showToast('▶ Plano de ' + _firstName(pl.patient) + ' retomado.');
}

function cancelarPlano(id) {
  var pl = _getPlano(id);
  if (!pl) return;
  if (!confirm('Cancelar o plano mensal de ' + pl.patient + '? As cobranças já geradas são mantidas; nenhuma nova será criada.')) return;
  pl.status = 'cancelado';
  salvarPlanos();
  renderFinPlanos();
  showToast('✕ Plano de ' + _firstName(pl.patient) + ' cancelado.');
}

function removerPlano(id) {
  var pl = _getPlano(id);
  if (!pl) return;
  if (!confirm('Remover o registro do plano cancelado de ' + pl.patient + ' da lista?')) return;
  plans = plans.filter(function(x){ return String(x.id) !== String(id); });
  salvarPlanos();
  renderFinPlanos();
}

/* Mostra o campo de dia livre quando "Outro dia…" é escolhido no vencimento. */
function _planVencOutroToggle(sel) {
  var inp = document.getElementById('plan-venc-outro');
  if (!inp) return;
  var mostrar = sel && sel.value === 'outro';
  inp.style.display = mostrar ? '' : 'none';
  if (mostrar) inp.focus();
}

function createNewPlan() {
  var isMensal = document.getElementById('ptype-mensal').classList.contains('selected');
  var nome = (document.getElementById('plan-paciente-select') || {}).value || '';
  if (!nome) { showToast('Selecione o paciente.', 'warning'); return; }
  var p = (typeof patients !== 'undefined' ? patients : []).find(function(x){ return x.name === nome; });
  var _initials = p ? p.initials : nome.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
  var _color = p ? p.color : '#4a7c59';

  var novaCobranca;
  if (isMensal) {
    var sessoes = parseInt((document.getElementById('plan-sessions-select') || {}).value || '4');
    var valor = _parseValorBR((document.getElementById('plan-valor-pacote') || {}).value);
    var venc = (document.getElementById('plan-vencimento') || {}).value || 'Dia 5';
    if (valor <= 0) { showToast('Informe o valor do pacote.', 'warning'); return; }
    // Um plano ATIVO por paciente — evita cobrança dupla silenciosa.
    var jaTemPlano = plans.some(function(pl){ return pl && pl.patient === nome && pl.status === 'ativo'; });
    if (jaTemPlano) { showToast('⚠ ' + _firstName(nome) + ' já tem um plano mensal ativo. Cancele-o na aba "Planos e pacientes" antes de criar outro.'); return; }
    // Vencimento: "Dia X" fixo, "Outro dia…" com dia livre (1–28, para valer em
    // TODOS os meses — fevereiro incluso), ou "Combinado" (sai com dia 5).
    var diaVenc;
    if (venc === 'outro') {
      diaVenc = parseInt((document.getElementById('plan-venc-outro') || {}).value, 10);
      if (!diaVenc || diaVenc < 1 || diaVenc > 28) {
        showToast('⚠ Informe o dia de vencimento entre 1 e 28 (para existir em todos os meses).');
        var _vo = document.getElementById('plan-venc-outro'); if (_vo) _vo.focus();
        return;
      }
    } else {
      diaVenc = parseInt((venc.match(/\d+/) || ['5'])[0]) || 5;
      // "Combinado com paciente" e o parêntese "(cobrança sai com dia 5)": o
      // regex pegaria o 5 do rótulo — que é exatamente o comportamento desejado.
      if (/combinado/i.test(venc)) diaVenc = 5;
    }
    var hoje = new Date();
    var dtVenc = new Date(hoje.getFullYear(), hoje.getMonth(), diaVenc);
    if (dtVenc < hoje) dtVenc.setMonth(dtVenc.getMonth() + 1);
    // Cria a ENTIDADE plano (recorre todo mês) + a 1ª cobrança, do mês do vencimento.
    var mesGerado = dtVenc.getFullYear() + '-' + String(dtVenc.getMonth() + 1).padStart(2, '0');
    var plano = {
      id: Date.now(), patient: nome, sessoesMes: sessoes, valor: valor,
      diaVenc: diaVenc, status: 'ativo', criadoEm: hojeISO(), ultimoMesGerado: mesGerado,
    };
    plans.push(plano);
    salvarPlanos();
    novaCobranca = _novaCobrancaDoPlano(plano, mesGerado);
  } else {
    var valorA = _parseValorBR((document.getElementById('plan-valor-sessao') || {}).value);
    var dataA = (document.getElementById('fin-plano-data') || {}).value;
    var metodoA = (document.getElementById('plan-metodo-pgto') || {}).value || 'PIX';
    if (valorA <= 0) { showToast('Informe o valor da sessão.', 'warning'); return; }
    var isoA = _chargeDateISO(dataA) || hojeISO();
    novaCobranca = {
      id: Date.now(), patient: nome, initials: _initials, color: _color,
      value: valorA, date: isoA, status: 'pending', deleted: false,
      billing: 'avulso', session: fmtDataBR(isoA), method: metodoA,
    };
  }
  charges.push(novaCobranca);
  salvarCharges();
  if (typeof _recalcFinStatus === 'function') { _recalcFinStatus(); if (typeof salvarPacientes === 'function') salvarPacientes(); }
  closeModal('modal-novo-plano');
  renderCharges();
  if (typeof atualizarStatsFinanceiro === 'function') atualizarStatsFinanceiro();
  showToast(isMensal
    ? '📅 Plano mensal criado para ' + _firstName(nome) + ' — ' + fmtMoedaInt(novaCobranca.value) + '/mês. A cobrança de cada mês é gerada automaticamente.'
    : '💳 Cobrança criada para ' + _firstName(nome) + ' — ' + fmtMoedaInt(novaCobranca.value));
}


// ── PORTAL DO PACIENTE ──
const moodHistory = [6,5,null,7,4,6,5,7,6,null,8,6,7,6]; // last 14 days, null = not logged
let _portalCountdownInterval = null;

function initPortal() {
  // Popular select de pacientes
  const sel = document.getElementById('portal-patient-select');
  if (sel) {
    sel.innerHTML = patients.map((p, i) =>
      `<option value="${i}" ${i === currentPortalPatientIdx ? 'selected' : ''}>${p.name}</option>`
    ).join('');
  }

  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  // Atualiza progresso com dados reais antes de renderizar
  p.progress = _calcProgress(p);
  const firstName = _firstName(p.name);

  // Greeting e labels
  const greeting = document.getElementById('portal-greeting');
  if (greeting) greeting.textContent = `Olá, ${firstName}`;

  const modeLabel = document.getElementById('portal-mode-label');
  if (modeLabel) modeLabel.textContent = `Gerenciando portal de ${p.name}`;

  const subtitle = document.getElementById('portal-subtitle');
  if (subtitle) subtitle.textContent = `Prévia do portal de ${p.name} — o que ele(a) vê entre as sessões`;

  // Progresso dinâmico
  const pct = p.progress || 0;
  const ringFill = document.getElementById('portal-ring-fill');
  const ringPct  = document.getElementById('portal-ring-pct');
  if (ringFill) ringFill.setAttribute('stroke-dashoffset', (238.76 * (1 - pct / 100)).toFixed(2));
  if (ringPct)  ringPct.textContent = pct + '%';

  const exDone = (p.exercises || []).filter(e => e.done).length;
  const statS = document.getElementById('portal-stat-sessoes');
  const statE = document.getElementById('portal-stat-exercicios');
  const statC = document.getElementById('portal-stat-checkins');
  if (statS) statS.textContent = (p.sessions || 0) + ' sessões';
  if (statE) statE.textContent = exDone + ' exercício' + (exDone !== 1 ? 's' : '');
  if (statC) statC.textContent = (p.mood !== null && p.mood !== undefined ? '✓ ativo' : '—');

  // Exercícios, countdown, mood, conteúdo editável
  if (typeof _fillPreviewMoodRow === 'function') _fillPreviewMoodRow(); // B5: escala nova na prévia
  renderExercises();
  renderMoodHistory();
  renderDiarioPortal(p);
  renderDiarioLivre(p);
  if (typeof updateDiaryCount === 'function') updateDiaryCount(); // era só chamado pela composição removida da prévia — "3 registros" ficava estático
  renderMensagemPortal();
  renderDicaPortal();
  renderMetasPortal();
  updatePortalCountdown();
  var _jornadaWrap = document.getElementById('portal-jornada-wrap');
  if (_jornadaWrap && typeof renderTrajetoriaPortal === 'function') {
    _jornadaWrap.innerHTML = renderTrajetoriaPortal(p, currentPortalPatientIdx, true);
  }
  // B5: card de conquistas removido da prévia (a gamificação de troféus saiu do portal real)
  clearInterval(_portalCountdownInterval);
  _portalCountdownInterval = setInterval(updatePortalCountdown, 60000);

  // Nome do terapeuta nos registros
  const nomeT = (tfUserData?.nome || '').split(' ')[0] || 'sua terapeuta';
  document.querySelectorAll('.therapist-label-first').forEach(el => {
    el.textContent = `✓ ${nomeT} verá na sessão`;
  });
  atualizarProximaSessaoPortal();
}

function switchPortalPatient(idx) {
  currentPortalPatientIdx = idx;
  initPortal();
}

// ── DIÁRIO ADAPTADO POR ABORDAGEM ──────────────────────────────────────────

// Humanista → só registro livre, sem segunda aba

function renderDiarioPortal(p) {
  const abordagem = p?.abordagem || '—';
  const config = DIARY_CONFIG[abordagem];
  const tab = document.getElementById('diary-tab-tcc');
  const panel = document.getElementById('diary-panel-tcc');
  const headerSub = document.querySelector('#page-portal .card .section-title + *');

  if (!config) {
    // Abordagem sem diário especializado (Humanista, —, etc.) → oculta segunda aba
    if (tab) tab.style.display = 'none';
    if (panel) panel.style.display = 'none';
    // Garante que registro livre está ativo
    switchDiaryTab('livre');
    return;
  }

  // Mostra e configura a segunda aba
  if (tab) { tab.style.display = ''; tab.innerHTML = config.tab; } // config.tab traz ícone SVG

  // Renderiza conteúdo no painel
  if (panel) {
    panel.innerHTML =
      `<div style="background:${config.corLight};border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:${config.cor};line-height:1.6">${config.instrucao}</div>`
      + config.html()
      + `<div id="diary-esp-list" style="display:flex;flex-direction:column;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"></div>`;
    // Estilo dos textareas injetados
    panel.querySelectorAll('.diary-ta').forEach(function(ta) {
      ta.style.cssText += 'width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box;transition:border-color .15s';
      ta.addEventListener('focus', function(){ this.style.borderColor = config.cor; });
      ta.addEventListener('blur',  function(){ this.style.borderColor = 'var(--border)'; });
    });
    // Esta tela é a PRÉVIA do terapeuta — quem preenche é o paciente, no portal
    // (pacSalvarDiario). Form desabilitado e botão "salvar" trocado por aviso;
    // antes chamava saveDiaryEsp, que só criava card no DOM e sumia no F5 (F4.6 #6).
    panel.querySelectorAll('textarea, input').forEach(function(el){ el.disabled = true; el.style.opacity = '.65'; });
    panel.querySelectorAll('button').forEach(function(btn) {
      var oc = btn.getAttribute('onclick') || '';
      if (oc.indexOf('saveDiaryEsp') !== -1) {
        var note = document.createElement('span');
        note.style.cssText = 'font-size:12px;color:var(--muted);font-style:italic';
        note.innerHTML = _tfIcon('eye', 12) + ' Prévia — o paciente preenche e salva no portal dele';
        btn.parentNode.replaceChild(note, btn);
      } else {
        btn.disabled = true; btn.removeAttribute('onclick');
        btn.style.opacity = '.55'; btn.style.cursor = 'default';
      }
    });
    // Popula os registros especializados JÁ salvos pelo paciente (tipo 'esp' vem do
    // portal via pacSalvarDiario). Sem isto a lista nascia vazia e o terapeuta nunca
    // via o diário especializado real.
    var espList = document.getElementById('diary-esp-list');
    if (espList) {
      (p && p.diary ? p.diary : []).forEach(function(e) {
        if (e.tipo !== 'esp' && e.tipo !== 'tcc') return; // 'tcc' = formato legado do compose antigo
        var linhas = e.campos || [e.text, e.pensamento, (e.emocao ? e.emocao + (e.intensidade ? ' · ' + e.intensidade : '') : null), e.alternativa].filter(Boolean);
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--bg);border-radius:10px;padding:14px 16px;border-left:3px solid ' + config.cor;
        card.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">' + escHTML(e.date || '') + (e.hora ? ' · ' + escHTML(e.hora) : '') + '</div>'
          + linhas.map(function(c){ return '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin-bottom:4px">' + escHTML(c) + '</div>'; }).join('');
        espList.appendChild(card);
      });
    }
  }
}

function renderDiarioLivre(p) {
  const list = document.getElementById('diary-livre-list');
  if (!list) return;
  list.innerHTML = '';
  const allEntries = (p && p.diary) ? p.diary : [];
  // Só registros livres nesta lista (os 'esp' vivem na aba especializada). Entradas
  // antigas sem tipo contam como livres. `ei` fica sendo o índice REAL em p.diary
  // porque salvarRespostaDiario indexa o array completo.
  const entries = [];
  allEntries.forEach(function(e, i) { if (!e.tipo || e.tipo === 'livre') entries.push({ entry: e, ei: i }); });
  if (entries.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px 0;font-style:italic">Nenhum registro ainda. Escreva algo acima.</div>';
    return;
  }
  var therapistFirst = (typeof tfUserData !== 'undefined' && tfUserData.nome ? tfUserData.nome : 'sua terapeuta').split(' ')[0];
  var pidx = currentPortalPatientIdx;

  entries.forEach(function(item) {
    var entry = item.entry, ei = item.ei;
    var div = document.createElement('div');
    div.className = 'fade-in';
    div.style.cssText = 'background:var(--bg);border-radius:8px;padding:12px 14px;border-left:3px solid var(--sage);margin-bottom:8px';

    // Entrada do paciente
    var replyHtml = '';
    if (entry.reply) {
      replyHtml = '<div style="margin-top:10px;padding:10px 12px;background:var(--white);border-radius:8px;border-left:3px solid var(--purple)">'
        + '<div style="font-size:10px;color:var(--purple);font-weight:600;margin-bottom:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/></svg> Resposta de ' + escHTML(therapistFirst) + '</div>'
        + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(entry.reply) + '</div>'
        + '</div>';
    }
    var inputId = 'diary-reply-' + ei;
    var replyInputHtml = '<div id="reply-area-'+ei+'" style="display:none;margin-top:10px">'
      + '<textarea id="'+inputId+'" placeholder="Escreva sua resposta para '+escHTML((p.name||'').split(' ')[0])+'…" rows="2" style="width:100%;padding:8px 10px;border:1.5px solid var(--purple);border-radius:8px;font-size:12.5px;font-family:inherit;resize:none;outline:none;box-sizing:border-box;line-height:1.5"></textarea>'
      + '<div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">'
        + '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'reply-area-'+ei+'\').style.display=\'none\'">Cancelar</button>'
        + '<button class="btn btn-primary btn-sm" style="background:var(--purple);border-color:var(--purple)" onclick="salvarRespostaDiario('+pidx+','+ei+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/></svg> Enviar resposta</button>'
      + '</div></div>';

    div.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:5px;display:flex;justify-content:space-between;align-items:center">'
      + '<span>' + escHTML(entry.date) + '</span>'
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="color:var(--sage);font-weight:600;font-size:10px">✓ ' + escHTML(therapistFirst) + ' viu</span>'
        + '<button onclick="document.getElementById(\'reply-area-'+ei+'\').style.display=\'block\';document.getElementById(\'diary-reply-'+ei+'\').focus()" style="font-size:10px;padding:2px 7px;background:var(--purple-light);color:var(--purple);border:none;border-radius:5px;cursor:pointer;font-family:inherit;font-weight:600">'
          + _tfIcon('sparkle',11) + (entry.reply ? ' Editar resposta' : ' Responder') + '</button>'
      + '</div>'
      + '</div>'
      + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(entry.texto || entry.text || '') + '</div>'
      + replyHtml + replyInputHtml;

    list.appendChild(div);
  });
}

function salvarRespostaDiario(pidx, entryIdx) {
  var p = patients[pidx];
  if (!p || !p.diary || !p.diary[entryIdx]) return;
  var input = document.getElementById('diary-reply-' + entryIdx);
  if (!input || !input.value.trim()) { showToast('⚠ Escreva a resposta primeiro.'); return; }
  p.diary[entryIdx].reply = input.value.trim();
  p.diary[entryIdx]._up = Date.now(); // P10: a resposta é edição do elemento — vence a cópia stale do portal
  salvarPacientes();
  renderDiarioLivre(p);
  showToast('✦ Resposta enviada! O paciente verá na próxima vez que abrir o portal.');
}

// saveDiaryEsp foi removida (F4.6 item 6): era DOM-only — o card sumia no F5 com
// toast "salvo!". O form real é o do portal do paciente (pacSalvarDiario, js/13);
// na prévia do terapeuta o form agora é somente-leitura (renderDiarioPortal).

// ── MENSAGEM DA SEMANA ──
function renderMensagemPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  const texto = p.portalMensagem || 'Boa semana! Lembre-se de praticar os exercícios que combinamos. Estou aqui se precisar.';
  const view = document.getElementById('portal-mensagem-view');
  if (view) view.textContent = texto;
}

function editarMensagemPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  const texto = p?.portalMensagem || 'Boa semana! Lembre-se de praticar os exercícios que combinamos. Estou aqui se precisar.';
  const input = document.getElementById('portal-mensagem-input');
  if (input) input.value = texto;
  document.getElementById('portal-mensagem-view').style.display = 'none';
  document.getElementById('portal-mensagem-edit').style.display = '';
  document.getElementById('portal-mensagem-meta').style.display = 'none';
  if (input) { input.focus(); input.select(); }
}

function cancelarMensagemPortal() {
  document.getElementById('portal-mensagem-view').style.display = '';
  document.getElementById('portal-mensagem-edit').style.display = 'none';
  document.getElementById('portal-mensagem-meta').style.display = '';
}

function salvarMensagemPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  const val = (document.getElementById('portal-mensagem-input').value || '').trim();
  if (!val) return;
  p.portalMensagem = val;
  salvarPacientes();
  cancelarMensagemPortal();
  renderMensagemPortal();
  showToast('Mensagem atualizada!');
}
