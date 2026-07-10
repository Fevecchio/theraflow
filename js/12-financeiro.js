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
let currentFinMode = 'pre';

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
      <div style="font-size:40px;margin-bottom:12px">💳</div>
      <div style="font-weight:600;font-size:15px;color:var(--ink-soft);margin-bottom:6px">Nenhuma cobrança ainda</div>
      <div style="font-size:13px;margin-bottom:20px">Registre cobranças avulsas ou crie planos mensais para seus pacientes.</div>
      <button class="btn-primary" onclick="abrirModalNovaCobranca()">+ Nova cobrança</button>
    </div>`;
    return;
  }
  list.innerHTML = visible.map(c => {
    const _dOpen = _calcDaysOpen(c);
    const statusTag = c.status === 'paid'
      ? `<span class="tag tag-green tag-dot">Pago${c.paidDate?' · '+c.paidDate:''}</span>`
      : c.status === 'overdue'
        ? `<span class="tag tag-red tag-dot">${_dOpen}d atraso</span>`
        : `<span class="tag tag-amber tag-dot">Pendente${_dOpen?' · '+_dOpen+'d':''}</span>`;

    // ids SEMPRE entre aspas nos onclick: cobranças antigas têm id string com hífen
    // (interpolado cru virava SyntaxError e o botão morria em silêncio). Lote 1.
    const paidActions = c.status === 'paid'
      ? `<button class="charge-btn" onclick="event.stopPropagation();gerarReciboPDF(this)">📄 Recibo</button>
         <button class="charge-btn" onclick="event.stopPropagation();undoPayment('${c.id}')" style="color:var(--muted);font-size:11px" title="Desfazer pagamento">↩ Desfazer</button>`
      : `<button class="charge-btn charge-btn-wpp" onclick="event.stopPropagation();sendWppCharge('${c.id}')">📲 WhatsApp</button>
         <button class="charge-btn charge-btn-check" onclick="event.stopPropagation();confirmPayment(this,'${c.id}')">✓ Pago</button>`;

    const deleteBtn = `<button class="charge-btn-delete" onclick="event.stopPropagation();deleteCharge('${c.id}',this)" title="Excluir cobrança">✕</button>`;

    const billingBadge = c.billing === 'mensal'
      ? `<span class="plan-badge plan-badge-mensal" style="margin-left:6px">Mensal</span>`
      : `<span class="plan-badge plan-badge-avulso" style="margin-left:6px">Avulso</span>`;

    const sessionLabel = c.billing === 'mensal'
      ? c.planLabel || ''
      : `Sessão ${c.session}`;

    const timingLabel = currentFinMode === 'pre' && c.status !== 'paid' && c.billing !== 'mensal'
      ? `<span style="font-size:10px;background:var(--sage-light);color:var(--sage);padding:1px 6px;border-radius:4px;margin-left:6px">pré-sessão</span>`
      : currentFinMode === 'post' && c.status !== 'paid' && c.billing !== 'mensal'
        ? `<span style="font-size:10px;background:var(--amber-light);color:var(--amber);padding:1px 6px;border-radius:4px;margin-left:6px">pós-sessão</span>`
        : '';

    return `<div class="charge-row" data-charge-id="${c.id}">
      <div class="patient-info">
        <div class="patient-avatar" style="background:${c.color};color:#fff;width:30px;height:30px;font-size:10px">${c.initials}</div>
        <div><span class="patient-name" style="font-size:13.5px">${escHTML(c.patient||'')}</span><span class="patient-meta"> · ${escHTML(sessionLabel)}</span>${billingBadge}${timingLabel}</div>
      </div>
      <span class="fin-editable" onclick="editField(this,'${c.id}','date')" title="Clique para editar">${escHTML(c.date||'')}</span>
      <span class="fin-editable" onclick="editField(this,'${c.id}','value')" title="Clique para editar" style="font-weight:500">R$${escHTML(String(c.value))}</span>
      <span style="font-size:12px;display:flex;align-items:center;gap:4px"><span style="color:#00BDAE">◉</span> ${escHTML(c.method||'PIX')}</span>
      ${statusTag}
      <div class="charge-actions">${paidActions}${deleteBtn}</div>
    </div>`;
  }).join('');
}

function setFinMode(mode, el) {
  currentFinMode = mode;
  document.querySelectorAll('.fin-mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  const desc = document.getElementById('fin-mode-desc');
  const badge = document.getElementById('fin-mode-badge');

  if (mode === 'pre') {
    desc.textContent = 'Cobrança enviada antes da sessão. Pagamento funciona como confirmação de presença.';
    badge.className = 'fin-mode-badge fin-mode-badge-pre';
    badge.innerHTML = '⚡ Pré-sessão ativo';
  } else if (mode === 'post') {
    desc.textContent = 'Cobrança enviada após a sessão. O paciente paga depois de ser atendido.';
    badge.className = 'fin-mode-badge fin-mode-badge-post';
    badge.innerHTML = '🕐 Pós-sessão ativo';
  } else {
    desc.textContent = 'Cobrança enviada antes, mas sessão acontece mesmo sem pagamento. Cobrança vira pendente se não pagar.';
    badge.className = 'fin-mode-badge fin-mode-badge-hybrid';
    badge.innerHTML = '🔄 Híbrido ativo';
  }
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
  if (tabId === 'fin-inad') renderFinInadimplencia();
  if (tabId === 'fin-fluxo') renderFinFluxo();
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
          + '<button class="btn btn-secondary btn-sm" onclick="cancelarPlano(\'' + pl.id + '\')">✕ Cancelar</button>';
      } else if (pl.status === 'pausado') {
        acoes = '<button class="btn btn-secondary btn-sm" onclick="retomarPlano(\'' + pl.id + '\')">▶ Retomar</button>'
          + '<button class="btn btn-secondary btn-sm" onclick="cancelarPlano(\'' + pl.id + '\')">✕ Cancelar</button>';
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
      html += '<button class="charge-btn charge-btn-wpp" onclick="sendWppReminder(\'' + escHTML(nome) + '\')">📲 Cobrar via WhatsApp</button>';
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
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Nenhum paciente em atraso. 🎉</div>';
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
      html += '<button class="charge-btn charge-btn-wpp" onclick="sendWppCharge(\'' + c.id + '\')">📲 Cobrar</button>';
    } else if (p && p.email) {
      html += '<a class="charge-btn charge-btn-wpp" href="mailto:' + escHTML(p.email) + '?subject=' + encodeURIComponent('Lembrete de pagamento') + '&body=' + encodeURIComponent('Olá ' + _firstName(c.patient||'') + ',\n\nPassando para lembrar sobre o pagamento de ' + fmtMoedaInt(parseFloat(c.value)||0) + ' referente à sua sessão de psicoterapia.\n\nQualquer dúvida, estou à disposição.') + '" style="text-decoration:none">📧 Email</a>';
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
  var nomeT = acc.nome ? acc.nome.split(' ')[0] : 'sua terapeuta';
  var msg = 'Olá ' + _firstName(p.name) + '! Segue o lembrete de pagamento da sessão de psicoterapia no valor de R$' + value + '.'
    + (pixKey ? '\n\nChave PIX: ' + pixKey : '')
    + '\n\nPode pagar quando puder! 💚\n— ' + nomeT;
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
  + 'td{padding:8px 10px;border-bottom:1px solid #f3f4f6}.total-row{font-weight:700;background:#f0fdf4}'
  + '.disclaimer{margin-top:32px;padding:16px;background:#fef9c3;border-radius:8px;font-size:12px;color:#713f12}'
  + '.footer{margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#999;font-size:11px;text-align:center}'
  + '@media print{body{margin:20px}}</style></head><body>'
  + '<h1>Relatório de Rendimentos '+anoAtual+'</h1>'
  + '<p class="sub">'+escHTML(terapeuta.nome||'Terapeuta')+' · CRP '+escHTML(terapeuta.crp||'—')+' · Ano-base: '+anoAtual+'</p>'
  + '<h2>Resumo por mês</h2>'
  + '<table><thead><tr><th>Mês</th><th style="text-align:right">Sessões</th><th style="text-align:right">Receita</th></tr></thead>'
  + '<tbody>'+resumoHtml+'<tr class="total-row"><td>Total '+anoAtual+'</td><td style="text-align:right">'+rows.length+' sessões</td><td style="text-align:right">'+fmt(total)+'</td></tr></tbody>'
  + '</table>'
  + '<div class="disclaimer">⚠ <strong>Aviso:</strong> Este relatório é gerado automaticamente a partir dos registros do TheraFlow. Para fins de declaração de Imposto de Renda, consulte seu contador. Mantenha todos os recibos e comprovantes originais.</div>'
  + '<div class="footer">TheraFlow · Relatório gerado em '+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})+' · Documento auxiliar — não tem valor fiscal</div>'
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
            + '<span>'+(temWpp?'📱':'⚠ ')+escHTML(c.patient)+'</span>'
            + '<span style="font-weight:600">'+(c.status==='overdue'?'<span style="color:var(--red)">Em atraso</span>':'Pendente')+' · '+fmt(c.value)+'</span>'
            + '</div>';
        }).join('')
        + '</div>';
    }
    if (btn) btn.textContent = '📲 Enviar ' + pendentes.length + ' cobrança' + (pendentes.length!==1?'s':'');
  }
  showModal('modal-wpp-lote');
}

function sendWppBatch() {
  closeModal('modal-wpp-lote');
  var pendentes = charges.filter(function(c){ return !c.deleted && (c.status==='pending'||c.status==='overdue'); });
  if (!pendentes.length) { showToast('Nenhuma cobrança pendente no momento.'); return; }
  var enviados = 0;
  pendentes.forEach(function(c){
    var p = patients.find(function(pt){ return pt.name === c.patient; });
    if (!p || !p.whatsapp) return;
    var n = p.whatsapp.replace(/\D/g,'');
    n = n.startsWith('55') ? n : '55' + n;
    var val = fmtMoeda(c.value);
    var msg = 'Olá ' + _firstName(p.name) + '! Segue o lembrete de pagamento da sua sessão de psicoterapia no valor de ' + val + '. Qualquer dúvida, é só me chamar aqui! 💚';
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
    var msg = 'Olá ' + escHTML(_firstName(c.patient)) + '! 😊\n\nPassando para lembrar que temos uma cobrança em aberto: sessão de ' + dataPt + ' no valor de R$' + c.value + '.'
      + (pixKey ? '\n\nChave PIX: ' + pixKey : '')
      + '\n\nQualquer dúvida estou à disposição! 🌿\n— ' + nomeT;
    var link = wpp ? 'https://wa.me/' + wpp + '?text=' + encodeURIComponent(msg) : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<div>'
        + '<div style="font-size:13.5px;font-weight:500;color:var(--ink)">' + escHTML(c.patient) + '</div>'
        + '<div style="font-size:12px;color:var(--muted)">Sessão ' + escHTML(dataPt) + ' · R$' + c.value + ' · ' + (_calcDaysOpen(c)||'?') + 'd em atraso</div>'
      + '</div>'
      + (link
        ? '<a href="' + link + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:#25d366;color:#fff;border-radius:8px;font-size:12.5px;font-weight:600;text-decoration:none;flex-shrink:0">📲 Cobrar</a>'
        : '<span style="font-size:12px;color:var(--muted)">⚠ Sem WhatsApp</span>')
      + '</div>';
  }).join('');

  var modal = document.getElementById('modal-inadimplentes');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'modal-inadimplentes';
  modal.className = 'modal-overlay';
  modal.innerHTML = '<div class="modal" style="max-width:460px">'
    + '<div class="modal-header"><div class="modal-title">⚠ Cobranças em atraso (' + vencidas.length + ')</div>'
    + '<button class="modal-close" onclick="closeModal(\'modal-inadimplentes\')">✕</button></div>'
    + '<div class="modal-body">' + itens + '</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.classList.remove('open'); });
  modal.classList.add('open');
}

function initFinanceiro() {
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
  if (btnCobrar) btnCobrar.textContent = '📲 Cobrar ' + (pendentes||'') + ' pendente' + (pendentes!==1?'s':'') + ' via WhatsApp';
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
  const receitaTotal = ativas.filter(c => c.status === 'paid').reduce((s, c) => s + c.value, 0);
  const aReceber    = ativas.filter(c => c.status === 'pending').reduce((s, c) => s + c.value, 0);
  const emAtraso    = ativas.filter(c => c.status === 'overdue').reduce((s, c) => s + c.value, 0);
  const _fmtR = fmtMoedaCompact;
  const stats = document.querySelectorAll('#page-financeiro .stat-value');
  if (stats[0]) stats[0].textContent = _fmtR(receitaTotal);
  if (stats[1]) stats[1].textContent = _fmtR(aReceber);
  if (stats[3]) stats[3].textContent = _fmtR(emAtraso);
  // Tags de contagem
  var countPaid = ativas.filter(function(c){ return c.status==='paid'; }).length;
  var countPend = ativas.filter(function(c){ return c.status==='pending'; }).length;
  var countOver = ativas.filter(function(c){ return c.status==='overdue'; }).length;
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
  a.download = `theraflow-financeiro-${hoje}.csv`;
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
  const statusColor = s => s === 'paid' ? '#166534' : s === 'overdue' ? '#991b1b' : '#92400e';
  const statusBg = s => s === 'paid' ? '#dcfce7' : s === 'overdue' ? '#fee2e2' : '#fef3c7';

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
      <td style="text-align:right;color:#92400e">${fmt(v.pendente)}</td>
      <td style="text-align:right;color:#991b1b">${fmt(v.atrasado)}</td>
      <td style="text-align:right">${v.sessoes}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Financeiro — ${mesAtual}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:40px 48px;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #4a7c59}
.logo{font-size:22px;font-weight:700;color:#4a7c59;letter-spacing:-.5px}
.header-right{text-align:right;color:#666;font-size:12px;line-height:1.6}
h2{font-size:16px;font-weight:700;margin:28px 0 12px;color:#1a1a1a;border-left:4px solid #4a7c59;padding-left:10px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.stat{padding:16px;border-radius:10px;border:1px solid #e5e7eb;text-align:center}
.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:6px}
.stat-value{font-size:20px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f9fafb;text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666}
td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle}tr:hover td{background:#fafafa}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#999;font-size:11px;text-align:center}
@media print{body{padding:20px 28px}.stats{break-inside:avoid}h2{break-before:auto}}
</style></head><body>
<div class="header">
  <div><div class="logo">TheraFlow</div><div style="font-size:13px;color:#666;margin-top:4px">Relatório Financeiro Mensal</div></div>
  <div class="header-right">
    <strong>${escHTML(terapeuta.nome||'Terapeuta')}</strong><br>
    CRP: ${escHTML(terapeuta.crp||'—')}<br>
    ${mesAtual}<br>
    Gerado em ${hoje.toLocaleDateString('pt-BR')}
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-label">Receita recebida</div><div class="stat-value" style="color:#166534">${fmt(receitaTotal)}</div></div>
  <div class="stat"><div class="stat-label">A receber</div><div class="stat-value" style="color:#92400e">${fmt(aReceber)}</div></div>
  <div class="stat"><div class="stat-label">Em atraso</div><div class="stat-value" style="color:#991b1b">${fmt(emAtraso)}</div></div>
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

<div class="footer">TheraFlow · Relatório gerado automaticamente em ${hoje.toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})} · Documento não tem valor fiscal</div>
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
    <div><div class="logo">TheraFlow</div><div class="logo-sub">Plataforma clínica para psicólogos</div></div>
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
  <div class="footer">Recibo emitido pela plataforma TheraFlow · Uso exclusivamente profissional<br/>Este documento é gerado eletronicamente e tem validade como comprovante de pagamento</div>
</div>`;
}

// Documento completo com 1+ recibos (page-break entre eles → 1 por folha no PDF).
function _reciboDoc(corpos) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"/>
<title>Recibo${corpos.length>1?'s ('+corpos.length+')':''} — TheraFlow</title>
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
    // Vencimento: usa o "Dia X" no mês corrente (ou próximo mês se já passou).
    var diaVenc = parseInt((venc.match(/\d+/) || ['5'])[0]) || 5;
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
  if (tab) { tab.style.display = ''; tab.textContent = config.tab; }

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
        note.textContent = '👁 Prévia — o paciente preenche e salva no portal dele';
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
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px 0;font-style:italic">Nenhum registro ainda. Escreva algo acima! 🌿</div>';
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
      replyHtml = '<div style="margin-top:10px;padding:10px 12px;background:#fff;border-radius:8px;border-left:3px solid var(--purple)">'
        + '<div style="font-size:10px;color:var(--purple);font-weight:600;margin-bottom:4px">✦ Resposta de ' + escHTML(therapistFirst) + '</div>'
        + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(entry.reply) + '</div>'
        + '</div>';
    }
    var inputId = 'diary-reply-' + ei;
    var replyInputHtml = '<div id="reply-area-'+ei+'" style="display:none;margin-top:10px">'
      + '<textarea id="'+inputId+'" placeholder="Escreva sua resposta para '+escHTML((p.name||'').split(' ')[0])+'…" rows="2" style="width:100%;padding:8px 10px;border:1.5px solid var(--purple);border-radius:8px;font-size:12.5px;font-family:inherit;resize:none;outline:none;box-sizing:border-box;line-height:1.5"></textarea>'
      + '<div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end">'
        + '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'reply-area-'+ei+'\').style.display=\'none\'">Cancelar</button>'
        + '<button class="btn btn-primary btn-sm" style="background:var(--purple);border-color:var(--purple)" onclick="salvarRespostaDiario('+pidx+','+ei+')">✦ Enviar resposta</button>'
      + '</div></div>';

    div.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:5px;display:flex;justify-content:space-between;align-items:center">'
      + '<span>' + escHTML(entry.date) + '</span>'
      + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="color:var(--sage);font-weight:600;font-size:10px">✓ ' + escHTML(therapistFirst) + ' viu</span>'
        + '<button onclick="document.getElementById(\'reply-area-'+ei+'\').style.display=\'block\';document.getElementById(\'diary-reply-'+ei+'\').focus()" style="font-size:10px;padding:2px 7px;background:var(--purple-light);color:var(--purple);border:none;border-radius:5px;cursor:pointer;font-family:inherit;font-weight:600">'
          + (entry.reply ? '✦ Editar resposta' : '✦ Responder') + '</button>'
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
