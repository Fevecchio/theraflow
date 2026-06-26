// 11-briefing-ia.js — Briefing IA, cache, renderização, perguntas por abordagem

// Temas: extrai palavras-chave das notas do paciente (heurística simples)
function buildThemes(p) {
  const PALETTE = [
    { color:'#b83232', bg:'#fdf0f0' }, { color:'#2c5f8a', bg:'#eaf1f8' },
    { color:'#c97d2e', bg:'#fdf3e7' }, { color:'#5a3e8a', bg:'#f0ecfa' },
    { color:'#4a7c59', bg:'#e8f0eb' }, { color:'#7a5c00', bg:'#fdf9e7' },
  ];
  const KEYWORDS = [
    'ansiedade','medo','insônia','sono','trabalho','família','relacionamento',
    'autoexigência','perfeccionismo','tristeza','choro','raiva','culpa',
    'autoestima','bloqueio','procrastinação','concentração','memória',
    'luto','separação','conflito','pressão','cansaço','exaustão'
  ];
  const notas = (p && p.prontuarioNotes) ? p.prontuarioNotes : [];
  if (notas.length === 0) return [];
  const fullText = notas.map(n => (n.text || '').toLowerCase()).join(' ');
  const found = KEYWORDS
    .map(kw => ({ label: kw.charAt(0).toUpperCase() + kw.slice(1), freq: (fullText.match(new RegExp(kw, 'g')) || []).length }))
    .filter(t => t.freq > 0)
    .sort((a, b) => b.freq - a.freq)
    .slice(0, 8);
  return found.map((t, i) => ({ ...t, ...PALETTE[i % PALETTE.length] }));
}

let currentBriefingPatientIdx = 0;
let _briefingForceRefresh = false;

function initBriefing() {
  // Reseta para estado inicial "gerar"
  document.getElementById('b-state-gen').style.display  = 'block';
  document.getElementById('b-state-load').style.display = 'none';
  document.getElementById('b-state-result').style.display = 'none';
  document.getElementById('b-section-themes').style.display = 'none';
  document.getElementById('b-section-timeline').style.display = 'none';
  // Reseta steps
  for (let i = 0; i < 5; i++) {
    const icon = document.getElementById(`bs${i}-icon`);
    const lbl  = document.getElementById(`bs${i}-lbl`);
    if (icon) { icon.className = 'step-icon step-pending'; icon.textContent = ['🔍','🔁','📈','⚠','💡'][i]; }
    if (lbl)  lbl.className = 'step-label';
  }
  // Atualiza hero com paciente atual
  const p = patients[currentBriefingPatientIdx] || patients[0];
  if (!p) return;
  // Popula seletor de pacientes
  var sel = document.getElementById('briefing-patient-select');
  if (sel) {
    sel.innerHTML = patients.map(function(pt, i) {
      return '<option value="' + i + '"' + (i === currentBriefingPatientIdx ? ' selected' : '') + '>' + escHTML(pt.name) + '</option>';
    }).join('');
  }
  const av = document.querySelector('.briefing-hero .hero-av');
  const nm = document.querySelector('.briefing-hero .hero-name');
  if (av) { av.style.background = p.colorGrad || p.color || '#4a7c59'; av.textContent = p.initials || (p.name ? p.name.trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : '?'); }
  if (nm) nm.textContent = p.name;
  const sub = document.querySelector('.briefing-hero .hero-sub');
  if (sub) sub.innerHTML = `<span>📋 ${escHTML(p.abordagem)} — ${p.cid !== '—' ? escHTML(p.cid) : 'em avaliação'}</span><span>🕐 Hoje</span><span>⏱ 50 min</span>`;
  const sessNum = document.querySelector('.briefing-hero .session-num');
  if (sessNum) sessNum.textContent = `${(p.sessions || 0) + 1}ª`;
  // Atualiza memória disponível
  const memSessions = document.querySelector('.memory-chip b');
  if (memSessions) memSessions.textContent = p.sessions || 0;
  // Atualiza badge
  const loadTxt = document.querySelector('#b-state-load > div:first-child');
  if (loadTxt) loadTxt.innerHTML = `<div class="ai-dot"></div>Analisando ${p.sessions || 0} sessões…`;
  // Atualiza header do resultado
  const resHeader = document.querySelector('#b-state-result > div:first-child > div > div:first-child');
  if (resHeader) resHeader.textContent = `Briefing — ${p.name}`;
  // Verificar cache — exibir direto se válido (hoje)
  var _bpKey = p.id || p.name;
  var _bcache = _getBriefingCache(_bpKey);
  if (_bcache) {
    document.getElementById('b-state-gen').style.display = 'none';
    document.getElementById('b-state-result').style.display = 'block';
    document.getElementById('b-section-themes').style.display = 'block';
    document.getElementById('b-section-timeline').style.display = 'block';
    var _ct = new Date(_bcache.generatedAt);
    var _ts = String(_ct.getHours()).padStart(2,'0') + ':' + String(_ct.getMinutes()).padStart(2,'0');
    var subEl = document.getElementById('b-result-subtitle');
    var _unch = _briefingCacheUnchanged(_bcache, p);
    if (subEl) subEl.textContent = 'Cache de ' + _ts + ' · ' + (p.sessions||0) + ' sessões · ' + (_unch ? 'sem alterações' : 'há alterações');
    renderBriefingContent(_bcache.content);
    renderThemes(); renderTimeline();
    _setRegenBtn(_unch);
  }
}

function trocarPacienteBriefing(idx) {
  currentBriefingPatientIdx = idx;
  initBriefing();
}

function _getBriefingCache(key) {
  try {
    var raw = localStorage.getItem('tf_bc_' + key);
    if (!raw) return null;
    var c = JSON.parse(raw);
    var todayStart = new Date(); todayStart.setHours(0,0,0,0);
    if (c.generatedAt < todayStart.getTime()) return null;
    return c;
  } catch(_) { return null; }
}

function _briefingCacheUnchanged(c, bp) {
  return c.sessionCount === (bp.sessions || 0) &&
         c.noteCount === (bp.prontuarioNotes || []).length;
}

function _saveBriefingCache(key, content) {
  try {
    var bp = patients[currentBriefingPatientIdx] || {};
    localStorage.setItem('tf_bc_' + key, JSON.stringify({
      content: content,
      generatedAt: Date.now(),
      sessionCount: bp.sessions || 0,
      noteCount: (bp.prontuarioNotes || []).length
    }));
  } catch(_) {}
}

function _setRegenBtn(disabled) {
  var btn = document.getElementById('briefing-regen-btn');
  if (!btn) return;
  if (disabled) {
    btn.disabled = true;
    btn.title = 'Nenhuma alteração desde o último briefing — regenerar não agrega valor e consome créditos';
    btn.style.opacity = '0.4';
    btn.style.cursor = 'not-allowed';
  } else {
    btn.disabled = false;
    btn.title = '';
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
}

function startBriefing() {
  document.getElementById('b-state-gen').style.display = 'none';
  document.getElementById('b-state-load').style.display = 'block';
  const icons = ['🔍','🔁','📈','⚠','💡'];
  const labels = ['Lendo notas e transcrições anteriores','Identificando temas recorrentes','Mapeando evolução clínica','Verificando pontos de atenção','Sugerindo perguntas para hoje'];
  const delays = [800, 1800, 2800, 3600, 4400];
  delays.forEach((d, i) => {
    setTimeout(() => {
      if(i > 0) {
        document.getElementById(`bs${i-1}-icon`).className = 'step-icon step-done';
        document.getElementById(`bs${i-1}-icon`).textContent = '✓';
        document.getElementById(`bs${i-1}-lbl`).className = 'step-label done';
      }
      document.getElementById(`bs${i}-icon`).className = 'step-icon step-running';
      document.getElementById(`bs${i}-lbl`).className = 'step-label running';
      if(i === delays.length - 1) setTimeout(showBriefingResult, 1200);
    }, d);
  });
}

function showBriefingResult() {
  document.getElementById('b-state-load').style.display = 'none';
  document.getElementById('b-state-result').style.display = 'block';
  document.getElementById('b-section-themes').style.display = 'block';
  document.getElementById('b-section-timeline').style.display = 'block';
  // Atualiza título com nome do paciente e sessões
  var bp = patients[currentBriefingPatientIdx] || patients[0];
  if (bp) {
    var el = document.getElementById('b-result-title');
    var sub = document.getElementById('b-result-subtitle');
    if (el) el.textContent = 'Briefing — ' + bp.name;
    if (sub) sub.textContent = 'Gerado agora · ' + (bp.sessions||0) + ' sessões analisadas';
  }
  renderThemes(); renderTimeline(); callBriefingAI();
}

function copiarBriefing() {
  var c = document.getElementById('b-content');
  if (!c) return;
  var texto = c.innerText || c.textContent || '';
  var bp = patients[currentBriefingPatientIdx] || patients[0];
  var header = 'BRIEFING PRÉ-SESSÃO — ' + (bp ? bp.name.toUpperCase() : 'PACIENTE') + '\n' +
    'Gerado em ' + new Date().toLocaleString('pt-BR') + '\n' +
    ('─'.repeat(50)) + '\n\n';
  var full = header + texto;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(function(){ showToast('📋 Briefing copiado!'); }).catch(function(){ _copiarFallback(full); });
  } else { _copiarFallback(full); }
}

function _copiarFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('📋 Briefing copiado!'); } catch(e) { showToast('Não foi possível copiar.','error'); }
  document.body.removeChild(ta);
}

function exportarBriefing() {
  var c = document.getElementById('b-content');
  if (!c) return;
  var bp = patients[currentBriefingPatientIdx] || patients[0];
  var nome = bp ? bp.name : 'Paciente';
  var data = new Date().toLocaleDateString('pt-BR');
  var conteudo = c.innerHTML;
  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Briefing — '+escHTML(nome)+'</title><style>body{font-family:system-ui,sans-serif;max-width:740px;margin:40px auto;color:#1a1a1a;padding:0 24px}h1{font-size:22px;margin-bottom:4px}p.sub{color:#888;font-size:13px;margin-bottom:28px}.insight-block{margin-bottom:18px;padding:16px 18px;border-radius:10px;background:#f8f8f8;border-left:4px solid #aaa}.insight-block.priority{border-left-color:#4a7c59}.insight-block.pattern{border-left-color:#6d28d9}.insight-block.progress{border-left-color:#2563eb}.insight-block.alert{border-left-color:#dc2626}.insight-block.question{border-left-color:#b45309}.insight-type{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;opacity:.7}.question-item{display:block;padding:8px 0;border:none;background:none;text-align:left;font-size:14px;cursor:default}@media print{body{margin:20px}}</style></head><body><h1>Briefing — '+escHTML(nome)+'</h1><p class="sub">Gerado em '+data+' · TheraFlow</p>'+conteudo+'</body></html>';
  var blob = new Blob([html], {type:'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'briefing-'+nome.toLowerCase().replace(/\s+/g,'-')+'-'+data.replace(/\//g,'-')+'.html';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
  showToast('⬇ Briefing exportado!');
  try { localStorage.setItem('tf_first_export', Date.now()); verificarMarcos(); } catch(e){}
}

async function callBriefingAI() {
  const c = document.getElementById('b-content');
  // Demo mode: exibe fallback diretamente sem chamar API
  if (window._tfDemo) {
    c.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--purple);font-size:14px;padding:8px 0"><div class="ai-dot"></div> Gerando análise clínica…</div>`;
    await new Promise(r => setTimeout(r, 1200));
    renderBriefingFallback();
    _briefingForceRefresh = false;
    return;
  }

  const bp = patients[currentBriefingPatientIdx] || patients[0];

  // Verificar cache antes de chamar API
  if (!_briefingForceRefresh) {
    var _cacheKey = bp.id || bp.name;
    var _cached = _getBriefingCache(_cacheKey);
    if (_cached) {
      renderBriefingContent(_cached.content);
      var _cct = new Date(_cached.generatedAt);
      var _cts = String(_cct.getHours()).padStart(2,'0') + ':' + String(_cct.getMinutes()).padStart(2,'0');
      var _subEl = document.getElementById('b-result-subtitle');
      var _cUnch = _briefingCacheUnchanged(_cached, bp);
      if (_subEl) _subEl.textContent = 'Cache de ' + _cts + ' · ' + (bp.sessions||0) + ' sessões · ' + (_cUnch ? 'sem alterações' : 'há alterações');
      _setRegenBtn(_cUnch);
      _briefingForceRefresh = false;
      return;
    }
  }
  _briefingForceRefresh = false;

  c.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--purple);font-size:14px;padding:8px 0"><div class="ai-dot"></div> Gerando análise clínica…</div>`;

  const system = `Você é um assistente clínico especializado em psicologia. Gera briefings pré-sessão para psicólogos e terapeutas. Tom clínico, objetivo e empático. Nunca faz diagnósticos — apenas observações baseadas no histórico. Responda em português brasileiro.`;
  const bpHistory = buildSessionHistory(bp);
  const bpThemes = buildThemes(bp);
  const totalSessoes = bp?.sessions || 0;

  const historicoTxt = bpHistory.length > 0
    ? bpHistory.map(s => `Sessão ${s.num} (${s.date}): ${s.summary}`).join('\n')
    : 'Sem histórico de sessões indexadas ainda. Esta é a primeira sessão ou nenhuma nota foi indexada.';

  const temasTxt = bpThemes.length > 0
    ? bpThemes.map(t => `- "${t.label}": mencionado ${t.freq}x nas notas`).join('\n')
    : 'Sem padrões identificados ainda.';

  const user = `Analise o histórico e gere um briefing pré-sessão.

PACIENTE: ${bp?.name || 'Paciente'}, ${bp?.age || '—'} anos | Abordagem: ${bp?.abordagem || 'TCC'} | CID: ${bp?.cid || '—'} | Sessão ${totalSessoes + 1} hoje
Queixa principal: ${bp?.notes || 'não informada'}

HISTÓRICO DE SESSÕES (${totalSessoes} sessões anteriores indexadas):
${historicoTxt}

PADRÕES NAS NOTAS CLÍNICAS:
${temasTxt}

Estruture em 5 blocos com estes títulos EXATOS:
1. FOCO RECOMENDADO PARA HOJE
2. PADRÃO IDENTIFICADO
3. EVOLUÇÃO
4. PONTO DE ATENÇÃO
5. PERGUNTAS SUGERIDAS

Máximo 300 palavras. Seja específico, baseie-se apenas nos dados fornecidos acima.`;

  try {
    // Chama a Edge Function no servidor (chave Anthropic fica no servidor, não no cliente)
    const res = await fetchWithTimeout('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ systemPrompt: system, userPrompt: user, patientData: bp })
    }, 30000);
    if (!res.ok) {
      let errDetail = 'HTTP_' + res.status;
      try { const eb = await res.json(); errDetail = 'HTTP_' + res.status + ' ' + (eb.error || ''); } catch(_){}
      throw new Error(errDetail);
    }
    const data = await res.json();
    const text = data.content || '';
    if (!text || text.length < 80) throw new Error('Resposta vazia');
    renderBriefingContent(text);
    _saveBriefingCache((bp.id || bp.name), text);
    _setRegenBtn(false);
    try { localStorage.setItem('tf_last_briefing', Date.now()); verificarMarcos(); } catch(e2){}
  } catch(e) {
    renderBriefingFallback();
    const status = e.message || '';
    console.error('[Briefing] Erro:', status, e);
    const httpCode = parseInt((status.match(/^HTTP_(\d+)/) || [])[1] || '0');
    if (httpCode === 401 || httpCode === 402 || httpCode === 403) {
      const billingLink = httpCode === 402 ? ' · <a href="https://console.anthropic.com/settings/billing" target="_blank" style="color:inherit;text-decoration:underline">Adicionar créditos →</a>' : '';
      _showBriefingError('💳', (httpCode === 402 ? 'Saldo insuficiente na conta Anthropic.' : 'Chave de API inválida ou não configurada no servidor.') + billingLink);
    } else if (httpCode === 500) {
      _showBriefingError('🔑', 'Erro interno no servidor. Verifique se ANTHROPIC_API_KEY está configurada no Vercel.');
    } else {
      _showBriefingNote('⚡ Análise local · <a href="#" onclick="callBriefingAI();return false" style="color:inherit;text-decoration:underline;font-weight:600">Tentar novamente</a>');
    }
  }
}

function _showBriefingError(icon, msg) {
  const c = document.getElementById('b-content');
  if (!c) return;
  const note = document.createElement('div');
  note.style.cssText = 'margin:0 0 16px;padding:12px 16px;background:#fff8e1;border:1px solid #f0c040;border-radius:10px;font-size:13px;color:#7a5c00;display:flex;gap:10px;align-items:flex-start;line-height:1.5';
  note.innerHTML = '<span style="font-size:18px;flex-shrink:0;line-height:1">' + icon + '</span><span>' + msg + '</span>';
  c.insertBefore(note, c.firstChild);
}

function _showBriefingNote(html) {
  const c = document.getElementById('b-content');
  if (!c) return;
  const note = document.createElement('div');
  note.style.cssText = 'margin:0 0 16px;padding:10px 14px;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:10px;font-size:12px;color:#777;display:flex;gap:8px;align-items:center;line-height:1.4';
  note.innerHTML = html;
  c.insertBefore(note, c.firstChild);
}

function renderBriefingContent(text) {
  const c = document.getElementById('b-content');
  if(text.length < 80) { renderBriefingFallback(); return; }
  const defs = [
    { key:'FOCO RECOMENDADO', type:'priority', icon:'🎯', label:'Foco recomendado para hoje' },
    { key:'PADRÃO IDENTIFICADO', type:'pattern', icon:'🔁', label:'Padrão identificado' },
    { key:'EVOLUÇÃO', type:'progress', icon:'📈', label:'Evolução clínica' },
    { key:'PONTO DE ATENÇÃO', type:'alert', icon:'⚠', label:'Ponto de atenção' },
    { key:'PERGUNTAS SUGERIDAS', type:'question', icon:'💬', label:'Perguntas sugeridas para hoje' },
  ];
  let blocks = defs.map(d => ({ ...d, pos: text.toUpperCase().indexOf(d.key) })).filter(b => b.pos !== -1).sort((a,b) => a.pos-b.pos);
  if(!blocks.length) { renderBriefingFallback(); return; }
  let html = '';
  blocks.forEach((b, i) => {
    const end = i < blocks.length-1 ? blocks[i+1].pos : text.length;
    let content = text.slice(b.pos, end).replace(new RegExp(b.key+'[:\\-—\\s1234567890.]*','i'),'').trim();
    if(b.type === 'question') {
      const qs = content.split(/\n|\d[.)]\s/).filter(q => q.trim().length > 10);
      html += `<div class="insight-block ${b.type}"><div class="insight-type">${b.icon} ${b.label}</div>${qs.map((q,qi)=>`<button class="question-item" onclick="markQuestion(this)"><span class="q-num">${qi+1}.</span><span>${q.trim()}</span></button>`).join('')}</div>`;
    } else {
      html += `<div class="insight-block ${b.type} fade-in"><div class="insight-type">${b.icon} ${b.label}</div><div class="insight-text">${content.replace(/\n/g,'<br/>')}</div></div>`;
    }
  });
  c.innerHTML = html;
}

function renderBriefingFallback() {
  const bp = patients[currentBriefingPatientIdx] || patients[0] || {};
  const nome = bp.name || 'Paciente';
  const abordagem = bp.abordagem || 'TCC';
  const totalSessoes = bp.sessions || 0;
  const queixa = bp.notes || 'não informada';

  const moodHist = bp.moodHistory || [];
  const moodRecente = moodHist.length > 0 ? moodHist[moodHist.length - 1].value : null;
  const moodAnterior = moodHist.length > 1 ? moodHist[moodHist.length - 2].value : null;
  const moodTrend = moodRecente && moodAnterior
    ? (moodRecente > moodAnterior ? 'em alta' : moodRecente < moodAnterior ? 'em queda' : 'estável')
    : '';
  const moodStr = moodRecente ? (moodRecente + '/10' + (moodTrend ? ' · ' + moodTrend : '')) : 'não registrado';

  const notas = (bp.prontuarioNotes || []).slice(-3);
  const ultimaNota = notas.length > 0 ? notas[notas.length - 1] : null;
  const temaRecente = ultimaNota ? (ultimaNota.content || ultimaNota.text || '').replace(/<[^>]+>/g,'').substring(0, 120) : null;

  const exerciciosPend = (bp.exercicios || []).filter(function(e){ return !e.done; }).slice(0, 2);
  const exercStr = exerciciosPend.length > 0
    ? exerciciosPend.map(function(e){ return '“' + (e.titulo || e.title || e.nome || 'exercício') + '”'; }).join(' e ')
    : null;

  const questoes = _briefingQuestoesPorAbordagem(abordagem, nome);
  const faseStr = totalSessoes === 0
    ? 'Primeira sessão — estabelecer vínculo e colher anamnese.'
    : totalSessoes < 5
      ? 'Fase inicial — foco em vínculo terapêutico e definição de objetivos.'
      : 'Fase intermediária — consolidar ganhos e aprofundar o processo.';

  document.getElementById('b-content').innerHTML =
    '<div class="insight-block priority fade-in">' +
      '<div class="insight-type">🎯 Foco recomendado para hoje</div>' +
      '<div class="insight-text">' +
        (exercStr ? 'Verificar aderência ao(s) exercício(s) ' + exercStr + ' desde a sessão anterior. ' : 'Retomar os objetivos terapêuticos e verificar o progresso desde a última sessão. ') +
        faseStr +
      '</div>' +
    '</div>' +
    '<div class="insight-block pattern fade-in">' +
      '<div class="insight-type">🔁 Padrão identificado</div>' +
      '<div class="insight-text">' +
        (temaRecente
          ? 'Temas recentes: "' + temaRecente + (temaRecente.length >= 120 ? '…' : '') + '". Queixa principal: <strong>' + queixa + '</strong>.'
          : 'Queixa principal: <strong>' + queixa + '</strong>. Observe padrões cognitivos e emocionais ao longo das sessões.') +
        ' <em>Abordagem: ' + abordagem + '.</em>' +
      '</div>' +
    '</div>' +
    '<div class="insight-block progress fade-in">' +
      '<div class="insight-type">📈 Evolução clínica</div>' +
      '<div class="insight-text">' +
        (totalSessoes === 0
          ? 'Primeira sessão — estabelecer vínculo terapêutico, colher anamnese detalhada e definir objetivos iniciais.'
          : totalSessoes + ' sessão' + (totalSessoes > 1 ? 'ões' : '') + ' realizada' + (totalSessoes > 1 ? 's' : '') + '. Humor mais recente: <strong>' + moodStr + '</strong>. Monitore a evolução e ajuste as intervenções conforme necessário.') +
      '</div>' +
    '</div>' +
    '<div class="insight-block alert fade-in">' +
      '<div class="insight-type">⚠ Ponto de atenção</div>' +
      '<div class="insight-text">' +
        (notas.length < 2
          ? 'Poucas notas indexadas (' + notas.length + '). Indexe as sessões anteriores para análises mais precisas pela IA.'
          : 'Revise as últimas ' + notas.length + ' notas clínicas antes da sessão. Verifique temas recorrentes não resolvidos ou mudanças relevantes no contexto de vida de ' + nome + '.') +
      '</div>' +
    '</div>' +
    '<div class="insight-block question fade-in">' +
      '<div class="insight-type">💬 Perguntas sugeridas para hoje</div>' +
      questoes.map(function(q, i){ return '<button class="question-item" onclick="markQuestion(this)"><span class="q-num">' + (i+1) + '.</span><span>' + q + '</span></button>'; }).join('') +
    '</div>';
}

function _briefingQuestoesPorAbordagem(abordagem, nome) {
  var ab = (abordagem || '').toLowerCase();
  if (ab.includes('tcc') || ab.includes('cognitivo-comportamental') || ab.includes('cognitivo comportamental')) return [
    'O que passou pela sua cabeça quando a situação aconteceu? Quais pensamentos automáticos surgiram?',
    'Em uma escala de 0 a 10, como você avaliaria a intensidade da emoção que sentiu naquele momento?',
    'Que evidências você tem a favor e contra esse pensamento?',
  ];
  if (ab.includes('psicanáli') || ab.includes('psicanalít') || ab.includes('dinâmic') || ab.includes('freudian')) return [
    'O que vem à sua mente quando pensa nisso — deixe fluir livremente.',
    'Você lembra de algum momento na infância que lhe faz pensar nessa situação?',
    'Como você se sentiu em relação ao nosso trabalho terapêutico ao longo desta semana?',
  ];
  if (ab.includes('humanis') || ab.includes('centrada na pessoa') || ab.includes('gestalt') || ab.includes('rogers')) return [
    'Como você está se sentindo agora, neste momento, aqui na sessão?',
    'O que essa experiência significa para você como pessoa?',
    'O que você precisaria para se sentir mais inteiro(a) nessa situação?',
  ];
  if (ab.includes('act') || ab.includes('aceitação e compromisso') || ab.includes('mindful')) return [
    'Que valores são mais importantes para você nessa situação?',
    'Você consegue observar esse pensamento como um evento mental, sem se fundir a ele?',
    'Que ação comprometida com seus valores você poderia tomar esta semana?',
  ];
  return [
    'Como foi a sua semana desde nossa última conversa?',
    'Houve alguma situação que chamou especialmente sua atenção ou que ficou na cabeça?',
    'Que expectativa você tem para a sessão de hoje?',
  ];
}

function markQuestion(el) {
  el.style.background = 'rgba(44,95,138,.18)';
  setTimeout(() => { el.style.background = ''; }, 1400);
}

function renderThemes() {
  const bp = patients[currentBriefingPatientIdx] || patients[0];
  const temas = buildThemes(bp);
  const el = document.getElementById('b-themes');
  if (!el) return;
  if (temas.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);font-style:italic">Nenhuma nota indexada ainda — temas serão identificados após as sessões.</div>';
    return;
  }
  const maxFreq = Math.max(...temas.map(t => t.freq), 1);
  el.innerHTML = temas.map(t => {
    const size = 12 + (t.freq / maxFreq) * 5;
    return `<div class="theme-chip" style="background:${t.bg};color:${t.color};font-size:${size}px;border:1px solid ${t.color}22">${escHTML(t.label)}<span class="freq">${t.freq}x</span></div>`;
  }).join('');
}

function renderTimeline() {
  const bp = patients[currentBriefingPatientIdx] || patients[0];
  const history = buildSessionHistory(bp);
  const el = document.getElementById('b-timeline');
  if (!el) return;
  if (history.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--muted);font-style:italic;padding:8px 0">Nenhuma sessão indexada ainda. As notas aparecerão aqui após encerrar e indexar uma sessão.</div>';
    return;
  }
  // Enriquece com mood history se disponível
  var moodArr = (bp && bp.moodHistory) ? bp.moodHistory : [];
  el.innerHTML = history.map(function(s, idx) {
    var moodIdx = moodArr.length - 1 - idx;
    var moodVal = (moodIdx >= 0 && moodArr[moodIdx] !== undefined) ? moodArr[moodIdx] : null;
    var moodHtml = '';
    if (moodVal !== null) {
      var moodColor = moodVal <= 3 ? '#e05060' : moodVal <= 6 ? '#c97d2e' : '#4a7c59';
      moodHtml = ' <span style="font-size:11px;color:'+moodColor+';font-weight:600">● '+moodVal+'/10</span>';
    }
    return '<div class="tl-row">'
      + '<div class="tl-dot-mini" style="background:#4a7c59"></div>'
      + '<div class="tl-content-mini">'
        + '<div class="tl-date-mini">Sessão '+s.num+' · '+escHTML(s.date)+moodHtml+'</div>'
        + '<div style="font-size:12px;color:var(--ink-soft);margin-top:2px;line-height:1.5">'+escHTML(s.summary)+'</div>'
      + '</div></div>';
  }).join('');
}

function regenerateBriefing() {
  _briefingForceRefresh = true;
  document.getElementById('b-state-result').style.display = 'none';
  document.getElementById('b-section-themes').style.display = 'none';
  document.getElementById('b-section-timeline').style.display = 'none';
  for(let i=0;i<5;i++){
    document.getElementById(`bs${i}-icon`).className = 'step-icon step-pending';
    document.getElementById(`bs${i}-icon`).textContent = ['🔍','🔁','📈','⚠','💡'][i];
    document.getElementById(`bs${i}-lbl`).className = 'step-label';
  }
  document.getElementById('b-state-load').style.display = 'block';
  const delays = [800,1800,2800,3600,4400];
  delays.forEach((d,i) => {
    setTimeout(() => {
      if(i>0){document.getElementById(`bs${i-1}-icon`).className='step-icon step-done';document.getElementById(`bs${i-1}-icon`).textContent='✓';document.getElementById(`bs${i-1}-lbl`).className='step-label done';}
      document.getElementById(`bs${i}-icon`).className='step-icon step-running';
      document.getElementById(`bs${i}-lbl`).className='step-label running';
      if(i===delays.length-1) setTimeout(showBriefingResult, 1200);
    }, d);
  });
}

// ── FINANCEIRO V2 ──
function _getDemoCharges() {
  function dAgo(n) { var d=new Date(); d.setDate(d.getDate()-n); return localDateISO(d); }
  return [
    { id:1, patient:'Camila Rocha',  initials:'CR', color:'#4a7c59', session:12, date:dAgo(5),  value:720, method:'PIX', status:'paid',    paidDate:dAgo(5),  billing:'mensal', planLabel:'Mensal · 4 sessões' },
    { id:2, patient:'Rafael Andrade',initials:'RA', color:'#2c5f8a', session:7,  date:dAgo(3),  value:200, method:'PIX', status:'pending', daysOpen:3,  billing:'avulso' },
    { id:3, patient:'Rafael Andrade',initials:'RA', color:'#2c5f8a', session:6,  date:dAgo(14), value:200, method:'PIX', status:'overdue', daysOpen:14, billing:'avulso' },
    { id:4, patient:'Marcos Oliveira',initials:'MO',color:'#c97d2e', session:5,  date:dAgo(6),  value:720, method:'PIX', status:'paid',    paidDate:dAgo(6),  billing:'mensal', planLabel:'Mensal · 4 sessões' },
    { id:5, patient:'Pedro Alves',   initials:'PA', color:'#8b4513', session:3,  date:dAgo(7),  value:200, method:'PIX', status:'overdue', daysOpen:7,  billing:'avulso' },
    { id:6, patient:'Pedro Alves',   initials:'PA', color:'#8b4513', session:2,  date:dAgo(19), value:200, method:'PIX', status:'overdue', daysOpen:19, billing:'avulso' },
    { id:7, patient:'Juliana Costa', initials:'JC', color:'#6a3d7a', session:9,  date:dAgo(4),  value:250, method:'PIX', status:'pending', daysOpen:4,  billing:'avulso' },
    { id:8, patient:'Rafael Andrade',initials:'RA', color:'#2c5f8a', session:5,  date:dAgo(22), value:200, method:'PIX', status:'paid',    paidDate:dAgo(22), billing:'avulso' },
  ];
}

// Normaliza data de cobrança para YYYY-MM para filtros
// Suporta: YYYY-MM-DD, DD/MM/YYYY, DD/MM (assume ano atual)
function _chargeMonthKey(c) {
  var d = c.date || '';
  if (!d || d === '—') return '';
  if (/^\d{4}-\d{2}/.test(d)) return d.slice(0,7);        // YYYY-MM-DD → YYYY-MM
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {                  // DD/MM/YYYY
    var p = d.split('/');
    return p[2] + '-' + p[1];
  }
  if (/^\d{2}\/\d{2}$/.test(d)) {                         // DD/MM (sem ano)
    var p2 = d.split('/');
    return new Date().getFullYear() + '-' + p2[1];
  }
  return '';
}

function _chargeInMonth(c, key) {
  return _chargeMonthKey(c) === key;
}

function _calcDaysOpen(c) {
  if (c.status === 'paid' || !c.date) return 0;
  try {
    var d = new Date(c.date + 'T12:00');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today - d) / 86400000));
  } catch(e) { return 0; }
}

function carregarCharges() {
  try {
    const raw = localStorage.getItem('tf_charges');
    return raw ? JSON.parse(raw) : _getDemoCharges();
  } catch(e) { return _getDemoCharges(); }
}

function salvarCharges() {
  try { localStorage.setItem('tf_charges', JSON.stringify(charges)); } catch(e) {}
  // Mantém o status financeiro dos pacientes consistente com as cobranças
  // (pagamento/estorno/exclusão refletem na lista de pacientes e no dashboard sem precisar renavegar).
  if (typeof _recalcFinStatus === 'function') _recalcFinStatus();
  _supaSync_charges().catch(() => {});
}
