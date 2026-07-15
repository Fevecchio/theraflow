// 09-sessions.js — Sessões, notas pós-sessão, exercícios, transcrição, session link

async function startSession() {
  if (!patients || patients.length === 0) { showToast('⚠ Cadastre um paciente antes de iniciar uma sessão.'); navigate('pacientes'); return; }

  // C2: Verifica trial contra o Supabase para bloquear bypass via localStorage
  const _accCheck = JSON.parse(localStorage.getItem('tf_account') || '{}');
  if (_accCheck.supa_id && _accCheck.plano !== 'pro' && _accCheck.plano !== 'clinic') {
    try {
      const { data: profile } = await Promise.race([
        supa.from('users').select('sessoes_usadas, plano').eq('id', _accCheck.supa_id).single(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      if (profile) {
        _accCheck.sessoes_usadas = profile.sessoes_usadas;
        _accCheck.plano = profile.plano;
        _accCheck.trial_token = tfTrialToken(profile.sessoes_usadas);
        localStorage.setItem('tf_account', JSON.stringify(_accCheck));
        if (profile.plano === 'pro' || profile.plano === 'clinic') _tfPlanPro = true;
        if (typeof atualizarTrialUI === 'function') atualizarTrialUI();
      }
    } catch(_) { /* offline ou timeout — usa localStorage */ }
  }

  // Guard de trial: bloqueia após 20 sessões
  if (getTrialCount() >= 20) {
    tfTrack('trial_esgotado_visto', { contexto: 'iniciar_sessao' });
    if (_tfTrialDismissed) {
      showToast('Trial esgotado — assine o plano Pro para iniciar novas sessões.');
    } else {
      showModal('modal-trial-esgotado');
    }
    return;
  }
  _sessionAlreadySaved = false;
  sessionSeconds = 0; if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; } if (typeof _setSessionLiveUI === 'function') _setSessionLiveUI(false);
  // Reseta o estado da área de vídeo para pré-sessão
  const prestate = document.getElementById('whereby-prestate');
  if (prestate) prestate.style.display = 'block';
  // Pré-aquece o SDK de vídeo (carregado sob demanda): o download (~540 KB) começa ao abrir
  // a tela de sessão, não no clique de "Entrar na sala". Falha aqui é silenciosa — o clique
  // tenta de novo e mostra erro se persistir.
  if (!window._tfDemo && window._TF_LIVEKIT_ENABLED && typeof _lkLoadSdk === 'function') _lkLoadSdk().catch(function(){});
  const badge = document.querySelector('.session-live-badge');
  if (badge) badge.innerHTML = '<span class="live-dot"></span>AO VIVO';
  // Atualiza header e ficha com o paciente da sessão. A identidade (id) foi
  // fixada NO CLIQUE via _tfSetSessionPatient/_tfSetSessionPatientAppt (js/01);
  // o resolvedor re-ancora o índice por ela. Entradas legadas sem setter caem
  // no fallback por índice e a linha abaixo fixa a identidade a partir dele.
  const sp = _tfSessionPatient();
  window._tfSessionPatientId = sp ? sp.id : null;
  tfTrack('session_started', { session_number: sp?.sessions, trial_count: getTrialCount() });
  if (sp) {
    _popularSelectPaciente();
    var _metaEl = document.getElementById('session-subtitle-meta');
    if (_metaEl) _metaEl.textContent = `· Sessão ${(sp.sessions||0)+1} · ${sp.abordagem||'—'}`;
    const av = document.getElementById('session-prestate-avatar');
    if (av) av.textContent = sp.initials || sp.name.slice(0,2).toUpperCase();
    const nm = document.getElementById('session-prestate-name');
    if (nm) nm.textContent = sp.name;
    // Ficha
    const sfA = document.getElementById('sf-abordagem');
    const sfS = document.getElementById('sf-sessao');
    const sfC = document.getElementById('sf-cid');
    if (sfA) sfA.textContent = sp.abordagem || '—';
    const _acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    const _isPro = _acc.plano === 'pro' || _acc.plano === 'clinic' || _acc.plano === 'demo';
    if (sfS) sfS.textContent = _isPro
      ? `Sessão ${(sp.sessions||0)+1}`
      : `${(sp.sessions||0)+1} de 20 (trial)`;
    if (sfC) sfC.textContent = sp.cid !== '—' ? sp.cid : '—';
  }
  // Atualiza botão de vídeo conforme link do paciente
  const _btnSala = document.getElementById('btn-entrar-sala');
  const _warnSala = document.getElementById('session-no-link-warning');
  if (_btnSala && _warnSala) {
    // No modo LiveKit a sala é criada automaticamente — link do paciente é dispensável.
    const _hasLink = (!!window._TF_LIVEKIT_ENABLED && !window._tfDemo) || !!(sp && sp.sessionLink);
    _btnSala.disabled = !_hasLink;
    _btnSala.style.opacity = _hasLink ? '1' : '.45';
    _btnSala.style.cursor  = _hasLink ? 'pointer' : 'not-allowed';
    _btnSala.title = _hasLink ? '' : 'Configure o link da sala na ficha do paciente';
    _warnSala.style.display = _hasLink ? 'none' : 'block';
  }
  // Limpa anotações rápidas
  const qn = document.getElementById('session-quick-notes');
  if (qn) qn.value = '';
  // Auto-popula nota clínica com template por abordagem (TEXTO puro — é textarea)
  const _noteEl = document.getElementById('session-ai-note');
  if (_noteEl) {
    const _sp2 = _tfSessionPatient();
    if (_sp2) _noteEl.value = _notaTemplateTexto(_sp2);
  }
  // Preenche painel de contexto clínico
  _renderSessionContext(sp);
  // Pontinho sutil no ✦ Briefing quando há dados novos desde a última geração
  var _bbtn = document.getElementById('sess-briefing-btn');
  if (_bbtn && sp && typeof _briefingDotHtml === 'function') _bbtn.innerHTML = '✦ Briefing' + _briefingDotHtml(sp);
}

/* Template de nota em TEXTO PURO para o textarea #session-ai-note.
 * (O primo _gerarNotaEstrutural devolve HTML para painéis renderizados — jogar
 * HTML num textarea mostrava o código cru na tela, bug reportado 14/07.) */
function _notaTemplateTexto(sp) {
  var ab = (sp.abordagem || 'TCC').toLowerCase();
  var nomeP = sp.name.split(' ')[0];
  var sessN = (sp.sessions || 0) + 1;
  if (ab.includes('tcc') || ab.includes('cognitivo')) {
    return 'Sessão ' + sessN + ' · ' + nomeP + ' · Abordagem: TCC\n\nS — Subjetivo: [relato do paciente após revisão da transcrição]\nO — Objetivo: [observações clínicas]\nA — Avaliação: [análise e progresso]\nP — Plano: [próximos passos e tarefas]';
  }
  if (ab.includes('psicanalit') || ab.includes('psicanál') || ab.includes('psicanalise') || ab.includes('psicodinami')) {
    return 'Sessão ' + sessN + ' · ' + nomeP + ' · Abordagem: Psicanálise\n\nMaterial trazido: [conteúdo da sessão]\nTransferência/Contratransferência: [observações]\nInterpretações: [intervenções realizadas]\nPróxima sessão: [direções]';
  }
  if (ab.includes('sistêm') || ab.includes('sistem')) {
    return 'Sessão ' + sessN + ' · ' + nomeP + ' · Abordagem: Sistêmica\n\nDinâmica relacional: [padrões observados]\nRecursos e fortalezas: [pontos positivos]\nIntervenções: [técnicas utilizadas]\nTarefa para casa: [combinado]';
  }
  if (ab.includes('humanis')) {
    return 'Sessão ' + sessN + ' · ' + nomeP + ' · Abordagem: Humanista\n\nPresença e vínculo: [qualidade da relação terapêutica]\nExperiências trabalhadas: [conteúdo emocional]\nReflexões: [insights do paciente]\nCaminho: [próximos passos]';
  }
  return 'Sessão ' + sessN + ' · ' + nomeP + ' · Abordagem: ' + (sp.abordagem || '—') + '\n\nConteúdo: [relato após revisão da transcrição]\nObservações clínicas: [intervenções e reações]\nPlano: [próximos passos]';
}

function _popularSelectPaciente() {
  var sel = document.getElementById('session-patient-select');
  if (!sel) return;
  sel.innerHTML = patients
    .map(function(p, i) {
      return '<option value="' + i + '"' + (i === currentSessionPatientIdx ? ' selected' : '') + '>'
        + escHTML(p.name) + '</option>';
    }).join('');
}

function trocarPacienteSessao(newIdx) {
  if (newIdx < 0 || newIdx >= patients.length) return;
  // Sessão ao vivo em andamento: trocar o paciente aqui mandaria nota, presença,
  // cobrança e resumo do portal para o prontuário ERRADO ao encerrar. Lote 1.
  if (typeof _lkRoom !== 'undefined' && _lkRoom) {
    var selRb = document.getElementById('session-patient-select');
    if (selRb) selRb.value = String(currentSessionPatientIdx); // desfaz visualmente
    if (typeof showToast === 'function') showToast('⚠ Encerre a sessão atual antes de trocar de paciente.');
    return;
  }
  currentSessionPatientIdx = newIdx;
  window._tfSessionPatientId = (patients[newIdx] || {}).id || null; // identidade acompanha a troca
  currentSessionApptId = null; // agendamento rastreado era do paciente anterior (Lote 1)
  var sp = patients[newIdx];
  // Sincroniza o select visualmente
  var sel = document.getElementById('session-patient-select');
  if (sel) sel.value = String(newIdx);
  // Atualiza meta no cabeçalho
  var metaEl = document.getElementById('session-subtitle-meta');
  if (metaEl) metaEl.textContent = '· Sessão ' + ((sp.sessions||0)+1) + ' · ' + (sp.abordagem||'—');
  // Atualiza avatar e nome no pré-estado
  var av = document.getElementById('session-prestate-avatar');
  if (av) av.textContent = sp.initials || sp.name.slice(0,2).toUpperCase();
  var nm = document.getElementById('session-prestate-name');
  if (nm) nm.textContent = sp.name;
  // Atualiza ficha
  var sfA = document.getElementById('sf-abordagem'); if (sfA) sfA.textContent = sp.abordagem || '—';
  var sfS = document.getElementById('sf-sessao');    if (sfS) sfS.textContent = 'Sessão ' + ((sp.sessions||0)+1);
  var sfC = document.getElementById('sf-cid');       if (sfC) sfC.textContent = sp.cid || '—';
  // Gera novo template de nota para o paciente trocado (TEXTO puro — despejar
  // o HTML de _gerarNotaEstrutural aqui mostrava código cru no textarea, 14/07)
  var noteEl = document.getElementById('session-ai-note');
  if (noteEl) noteEl.value = _notaTemplateTexto(sp);
  // Repopula painel direito (histórico, contexto, perguntas)
  _renderSessionContext(sp);
  // Sincroniza índice do briefing
  if (typeof currentBriefingPatientIdx !== 'undefined') currentBriefingPatientIdx = newIdx;
}

/* Liga/desliga o modo EM SESSÃO da coluna lateral (reordena p/ notas+perguntas) */
function _setSessionLiveUI(on) {
  var panel = document.querySelector('#page-sessao .ai-panel');
  if (panel) panel.classList[on ? 'add' : 'remove']('live');
  // Tarja "AO VIVO" só durante sessão real (B2 — era estática, mentia no
  // pré-estado e após encerrar)
  var badge = document.getElementById('session-live-badge');
  if (badge) badge.style.display = on ? '' : 'none';
  if (!on) {
    var cap = document.getElementById('sess-capture-status');
    if (cap) cap.style.display = 'none';
  }
}

function _iniciarTimerSessao() {
  if (timerInterval !== null) return;
  _setSessionLiveUI(true);
  timerInterval = setInterval(() => {
    sessionSeconds++;
    const m = String(Math.floor(sessionSeconds/60)).padStart(2,'0');
    const s = String(sessionSeconds%60).padStart(2,'0');
    const el = document.getElementById('session-timer');
    if(el) el.textContent = `${m}:${s}`;
  }, 1000);
}
// ── PAINEL DE CONTEXTO CLÍNICO ───────────────────────────────────────────────

function _renderSessionContext(p) {
  if (!p) return;

  // Card 1: últimas notas (sempre local)
  var notas = (p.prontuarioNotes || []).slice(-3).reverse();
  var notasHtml = notas.length
    ? notas.map(function(n) {
        var txt = (n.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim();
        var trunc = txt.substring(0, 80) + (txt.length > 80 ? '…' : '');
        return '<div class="sess-nota-item"><span class="sess-nota-date">' + escHTML(n.date || '') + '</span><span class="sess-nota-txt">' + escHTML(trunc) + '</span></div>';
      }).join('')
    : '<div class="sess-nota-empty">Nenhuma nota registrada ainda.</div>';
  var listEl = document.getElementById('sess-notas-list');
  if (listEl) listEl.innerHTML = notasHtml;

  // Humor médio (últimas 4 entradas) + DATA do último registro (revisão 10/07:
  // "7.3 ↑" sem quando não diz se o dado é de ontem ou do mês passado)
  var mh = (p.moodHistory || []).slice(-4);
  if (mh.length >= 2) {
    var vals = mh.map(function(e) { return typeof e === 'object' ? (e.value || 0) : Number(e); });
    var avg = (vals.reduce(function(a,b){return a+b;},0) / vals.length).toFixed(1);
    var trend = vals[vals.length-1] >= vals[0] ? '↑' : '↓';
    var ultimo = mh[mh.length-1];
    var quando = (typeof ultimo === 'object' && ultimo.date) ? ' · últ. ' + String(ultimo.date).slice(0,5) : '';
    var humEl = document.getElementById('sess-humor-line');
    if (humEl) { humEl.textContent = 'Humor recente: ' + avg + '/10 ' + trend + quando; humEl.style.display = ''; }
  }

  _updateConsentStatus(p);

  // Cards 2 e 3: usa briefing em cache se existir
  var cacheKey = p.id || p.name;
  var cache = typeof _getBriefingCache === 'function' ? _getBriefingCache(cacheKey) : null;
  if (cache && cache.content) {
    _renderSessFromBriefing(p, cache.content);
  } else {
    _renderSessLocalFallback(p);
  }
}

function _parseBriefingSection(content, title) {
  var re = new RegExp(title + '[:\\s]+([\\s\\S]*?)(?=\\n[A-ZÁÉÍÓÚ]{3,}[:\\s]|$)', 'i');
  var m = content.match(re);
  return m ? m[1].trim() : '';
}

// B8: o contexto em-sessão mostrava briefing de cache como "de hoje" mesmo com
// dados novos desde a geração — a página e a aba já avisavam; aqui não.
function _briefingStaleSuffix(p) {
  try {
    var c = _getBriefingCache(p.id || p.name);
    return (c && typeof _briefingCacheUnchanged === 'function' && !_briefingCacheUnchanged(c, p))
      ? ' · há alterações desde a análise' : '';
  } catch (e) { return ''; }
}

function _renderSessFromBriefing(p, content) {
  var foco   = _parseBriefingSection(content, 'FOCO RECOMENDADO PARA HOJE');
  var padrao = _parseBriefingSection(content, 'PADRÃO IDENTIFICADO');
  var alerta = _parseBriefingSection(content, 'PONTO DE ATENÇÃO');
  var html2  = '';
  if (foco)   html2 += '<div class="insight-item"><span class="insight-icon">🎯</span><span>' + escHTML(foco) + '</span></div>';
  if (padrao) html2 += '<div class="insight-item"><span class="insight-icon">🔁</span><span>' + escHTML(padrao) + '</span></div>';
  if (alerta) html2 += '<div class="insight-item"><span class="insight-icon">⚠</span><span>' + escHTML(alerta) + '</span></div>';
  var _c9 = (typeof _getBriefingCache === 'function') ? _getBriefingCache(p.id || p.name) : null;
  var _q9 = (_c9 && typeof _briefingQuando === 'function') ? _briefingQuando(_c9) : 'hoje';
  html2 += '<div class="sess-briefing-badge">✦ Baseado no briefing gerado ' + escHTML(_q9) + _briefingStaleSuffix(p) + '</div>';
  var el2 = document.getElementById('sess-contexto-body');
  if (el2) el2.innerHTML = html2;

  var perguntas = _parseBriefingSection(content, 'PERGUNTAS SUGERIDAS');
  var linhas = perguntas.split(/\n/)
    .map(function(l){ return l.replace(/^[-•\d.]+\s*/,'').trim(); })
    .filter(Boolean).slice(0, 3);
  _renderSessPerguntas(linhas);
}

function _renderSessLocalFallback(p) {
  var temas = typeof buildThemes === 'function' ? buildThemes(p) : [];
  var temasStr = temas.slice(0,3).map(function(t){ return t.label + ' (' + t.freq + '×)'; }).join(', ') || '—';
  var html2 = '<div class="insight-item"><span class="insight-icon">🔁</span><span>Temas: ' + escHTML(temasStr) + '</span></div>';
  // Metas reais vivem em p.portalMetas[].text (p.metas[].texto nunca é escrito —
  // por isso os objetivos terapêuticos nunca apareciam aqui). Lote 1.
  var _metasSrc = (Array.isArray(p.portalMetas) && p.portalMetas.length) ? p.portalMetas
    : (Array.isArray(p.metas) ? p.metas : []);
  var metasArr = _metasSrc.filter(function(m){ return m && (m.text || m.texto); }).slice(0,2);
  if (metasArr.length) {
    html2 += '<div class="insight-item"><span class="insight-icon">🎯</span><span>' + escHTML(metasArr.map(function(m){ return m.text || m.texto; }).join(' · ').substring(0,100)) + '</span></div>';
  } else if (typeof p.metas === 'string' && p.metas.trim()) {
    html2 += '<div class="insight-item"><span class="insight-icon">🎯</span><span>' + escHTML(p.metas.substring(0,100)) + '</span></div>';
  }
  // Revisão 10/07: "% de evolução" saiu do contexto EM SESSÃO — é métrica de
  // gestão, não orienta decisão clínica ao vivo (e duplicava o card ao lado).
  html2 += '<div class="sess-briefing-badge" style="color:var(--muted)">Gere o briefing antes da sessão para insights detalhados</div>';
  var el2 = document.getElementById('sess-contexto-body');
  if (el2) el2.innerHTML = html2;

  var abord = (p.abordagem || '').toLowerCase();
  var mapa = {
    'tcc':        ['Quais pensamentos automáticos surgiram esta semana?','Que evidências contrariam essa crença?','Como foi a tarefa de casa combinada?'],
    'cognitivo':  ['Quais pensamentos automáticos surgiram esta semana?','Que evidências contrariam essa crença?','Como foi a tarefa de casa combinada?'],
    'psicanál':   ['O que ficou em aberto da sessão anterior?','Que associações surgem espontaneamente?','Há algo que prefere não trazer?'],
    'psicanali':  ['O que ficou em aberto da sessão anterior?','Que associações surgem espontaneamente?','Há algo que prefere não trazer?'],
    'sistêm':     ['Como o sistema familiar reagiu esta semana?','Quem mais é afetado por esse padrão?','O que mudou nas relações?'],
    'sistem':     ['Como o sistema familiar reagiu esta semana?','Quem mais é afetado por esse padrão?','O que mudou nas relações?'],
    'humanis':    ['Como você se sentiu consigo mesmo esta semana?','O que o aproxima de quem quer ser?','O que precisa de mais espaço aqui?'],
    'act':        ['Em que valores quer se apoiar hoje?','O que a mente diz que te impede?','Que ação pequena comprometeria esta semana?'],
  };
  var chave = Object.keys(mapa).find(function(k){ return abord.includes(k); });
  _renderSessPerguntas(chave ? mapa[chave] : ['Como você está chegando hoje?','O que quer trazer para esta sessão?','O que ficou da última vez?']);
}

/* Status de consentimento VISÍVEL no topo da sessão (revisão 10/07): o botão
 * abria o modal, mas nada dizia se ESTA sessão está coberta e desde quando. */
function _updateConsentStatus(p) {
  var el = document.getElementById('sess-consent-status');
  if (!el) return;
  var c = window._tfSessionConsent;
  if (c && p && c.patientId === p.id) {
    var h = new Date(c.at);
    el.textContent = 'Consentimento ✓ ' + String(h.getHours()).padStart(2,'0') + ':' + String(h.getMinutes()).padStart(2,'0');
    el.className = 'tag tag-green';
  } else {
    el.textContent = 'Consentimento pendente';
    el.className = 'tag';
    el.style.cssText = 'background:var(--amber-light);color:var(--amber)';
  }
  el.style.display = '';
}

/* ── BRIEFING EM OVERLAY (revisão 10/07): consultar sem sair da sessão ao vivo.
 * Antes, "Ver briefing" NAVEGAVA para fora da tela com a sessão rodando. ── */
function abrirBriefingOverlay() {
  var ov = document.getElementById('sess-briefing-overlay');
  var body = document.getElementById('sess-briefing-body');
  if (!ov || !body) return;
  ov.classList.add('open');
  var p = _tfSessionPatient();
  if (!p) { body.innerHTML = '<div style="color:var(--muted)">Nenhum paciente selecionado.</div>'; return; }
  var cache = (typeof _getBriefingCache === 'function') ? _getBriefingCache(p.id || p.name) : null;
  if (cache && cache.content) {
    // Cache persistente (reforma 14/07): mostra o último briefing SEMPRE; se os
    // dados mudaram desde a geração, oferece atualizar — senão, nada de queimar
    // tokens à toa.
    var _stale = (typeof _briefingCacheUnchanged === 'function') && !_briefingCacheUnchanged(cache, p);
    var _quando = (typeof _briefingQuando === 'function') ? _briefingQuando(cache) : '';
    body.innerHTML = (_stale
        ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:var(--amber-light);border-radius:8px;font-size:12px;color:var(--amber)">Há informações novas desde este briefing.'
          + '<button class="btn btn-purple btn-sm" style="margin-left:auto" onclick="_gerarBriefingNoOverlay()">↻ Atualizar</button></div>'
        : '')
      + _briefingParaHtml(cache.content)
      + '<div class="sess-briefing-badge" style="margin-top:16px">✦ Briefing gerado ' + escHTML(_quando) + ' · ' + escHTML(p.name) + '</div>';
  } else {
    body.innerHTML = '<div style="color:var(--muted);margin-bottom:12px">Ainda não há briefing gerado para ' + escHTML(_firstName(p.name)) + '. Depois de gerado, ele fica sempre disponível aqui.</div>'
      + '<button class="btn btn-purple btn-sm" onclick="_gerarBriefingNoOverlay()">✦ Gerar agora</button>';
  }
}

function fecharBriefingOverlay() {
  var ov = document.getElementById('sess-briefing-overlay');
  if (ov) ov.classList.remove('open');
}

async function _gerarBriefingNoOverlay() {
  var body = document.getElementById('sess-briefing-body');
  var p = _tfSessionPatient();
  if (!body || !p) return;
  body.innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--purple)"><div class="ai-dot"></div> Gerando análise clínica…</div>';
  try {
    var texto = await _gerarBriefingTexto(p);
    body.innerHTML = _briefingParaHtml(texto)
      + '<div class="sess-briefing-badge" style="margin-top:16px">✦ Briefing de hoje · ' + escHTML(p.name) + '</div>';
    // O painel lateral também aproveita o briefing recém-gerado
    _renderSessionContext(p);
  } catch (e) {
    body.innerHTML = '<div style="color:var(--red);font-size:13px">Não foi possível gerar agora (' + escHTML(e.message || 'erro') + '). As perguntas por abordagem do painel continuam valendo.</div>';
  }
}

// Formata o texto do briefing. Reforma 14/07: a IA responde em markdown leve
// (cerquilhas, asteriscos, traços) e o overlay mostrava os SÍMBOLOS crus na
// tela (print do usuário). Conversor próprio, escapa antes de converter.
function _briefingParaHtml(content) {
  var linhas = String(content || '').split(/\n/);
  function _inline(t) {
    return escHTML(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  return linhas.map(function(l) {
    var t = l.trim();
    if (!t) return '';
    if (/^-{3,}$/.test(t)) return ''; // separador --- vira só respiro
    var mH = t.match(/^#{1,3}\s*(.+)$/);
    if (mH) return '<h4>' + _inline(mH[1].replace(/^\d+\.?\s*/, '').trim()) + '</h4>';
    if (/^\d?\.?\s*[A-ZÁÉÍÓÚÇÃÕ][A-ZÁÉÍÓÚÇÃÕ\s]{4,}:?$/.test(t)) {
      return '<h4>' + escHTML(t.replace(/^\d\.\s*/, '').replace(/:$/, '')) + '</h4>';
    }
    var mLi = t.match(/^[-•]\s+(.+)$/);
    if (mLi) return '<div style="margin:0 0 6px 10px;display:flex;gap:6px"><span style="color:var(--sage);flex-shrink:0">•</span><span>' + _inline(mLi[1]) + '</span></div>';
    return '<div style="margin-bottom:6px">' + _inline(t) + '</div>';
  }).join('');
}

function _renderSessPerguntas(linhas) {
  var el = document.getElementById('sess-perguntas');
  if (!el || !linhas.length) return;
  el.innerHTML = '<div class="sess-perguntas-title">Perguntas sugeridas</div>' +
    linhas.map(function(l){ return '<div class="sess-pergunta">• ' + escHTML(l) + '</div>'; }).join('');
}

// ── INÍCIO/FIM DE SESSÃO — roteamento ────────────────────────────────────────
// Nomes start/endWherebySession são legado (onclick no HTML) — o fluxo real é LiveKit.

function startWherebySession() {
  // Fluxo real (vídeo LiveKit + transcrição IA) SEMPRE fora da demo — o `?livekit=0` só vale
  // para a demo. Isto garante que um usuário real NUNCA caia no fluxo legado/simulado (que tem
  // transcrição e "marco clínico" fabricados). Se o LiveKit não carregar, startLiveKitSession
  // avisa com erro honesto — melhor que dado falso. (Auditoria 07/07 — crítico.)
  if (!window._tfDemo && typeof _startSessionWithConsent === 'function') {
    return _startSessionWithConsent();
  }
  const sp = _tfSessionPatient();
  const link = sp && sp.sessionLink;
  // Link /sala é o convite DA PACIENTE (auto-publicado pelo LiveKit) — nunca abrir como
  // sala do terapeuta (token errado/expirado → aba que não carrega).
  if (!link || _isSalaLink(link)) {
    showToast('⚠ Adicione o link da videochamada na ficha do paciente antes de iniciar.');
    return;
  }
  window.open(link.startsWith('http') ? link : 'https://' + link, '_blank');
  const badge = document.querySelector('.session-live-badge');
  if (badge) badge.innerHTML = '<span class="live-dot"></span>AO VIVO';
  _iniciarTimerSessao();
}

function endWherebySession() {
  // Fora da demo, encerra SEMPRE pelo caminho real (gravação → transcreve → nota). O fluxo
  // legado abaixo (showPostSessionFlow) é teatro fabricado e só roda em demo.
  if (!window._tfDemo && typeof endLiveKitSession === 'function') {
    return endLiveKitSession();
  }
  if (timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }
  const prestate = document.getElementById('whereby-prestate');
  if (prestate) prestate.style.display = 'none';

  // Mostra modal de pós-sessão (teatro demo-only)
  showPostSessionFlow();
}

function showPostSessionFlow() {
  // ⚠️ TEATRO DEMO-ONLY: este modal exibe transcrição/análise HARDCODED ("CRENÇA
  // NUCLEAR DETECTADA") com selo "Exemplo ilustrativo". Só deve rodar no modo demo.
  // Fora da demo, o encerramento vai para endLiveKitSession (fluxo real). Não
  // inventar capacidades que o produto não tem (score de confiança, stack antiga
  // Whereby/Whisper) — F4.6 item 12. Gate defensivo: (Auditoria 07/07 — crítico.)
  if (!window._tfDemo) { if (typeof endLiveKitSession === 'function') return endLiveKitSession(); return; }
  // Remove modal anterior se existir
  const existing = document.getElementById('modal-post-session');
  if (existing) existing.remove();
  const _sp = _tfSessionPatient();
  const _spNome = _sp ? _sp.name : 'Paciente';
  const _spFirst = _firstName(_spNome);
  const _spInitials = _sp?.initials || _spNome.slice(0,2).toUpperCase();
  const _tNomeCompleto = tfUserData?.nome || 'Terapeuta';
  const _tNome = _tNomeCompleto.split(' ')[0];
  const _tInitials = _tNomeCompleto.trim().split(' ').filter(w=>w).map(w=>w[0].toUpperCase()).slice(0,2).join('');
  const _quickNotes = (document.getElementById('session-quick-notes')?.value || '').trim();
  const _sessionNote = (document.getElementById('session-ai-note')?.value || '').trim();

  const modal = document.createElement('div');
  modal.id = 'modal-post-session';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  // Calcula duração real da sessão
  const _durMin = Math.floor(sessionSeconds / 60);
  const _durStr = _durMin > 0 ? `${_durMin} min` : '< 1 min';

  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3)">

      <!-- STEP 1: gravação finalizando + transcrição processando -->
      <div id="post-step-1" style="padding:36px 40px;text-align:center">

        <!-- Ícone animado -->
        <div style="position:relative;width:64px;height:64px;margin:0 auto 20px">
          <div style="width:64px;height:64px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:28px">📹</div>
          <div id="whisper-spin" style="position:absolute;inset:-4px;border-radius:50%;border:3px solid transparent;border-top-color:#4a7c59;animation:spin 1s linear infinite"></div>
        </div>

        <div style="font-size:17px;font-weight:600;color:#1a1a1a;margin-bottom:6px" id="whisper-title">Finalizando gravação…</div>
        <div style="font-size:13px;color:#888;margin-bottom:6px" id="whisper-subtitle">Isso leva cerca de 1–2 minutos</div>

        <!-- Etapas visuais -->
        <div style="display:flex;flex-direction:column;gap:6px;text-align:left;margin:20px 0 22px">
          <div class="ps-step" id="ps-step-a" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#f8f8f8;font-size:13px;color:#aaa">
            <span id="ps-icon-a" style="font-size:15px">⏳</span>
            <span>Encerrando a chamada e processando o áudio</span>
          </div>
          <div class="ps-step" id="ps-step-b" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#f8f8f8;font-size:13px;color:#aaa">
            <span id="ps-icon-b" style="font-size:15px">⏳</span>
            <span>Gravação recebida · enviando para transcrição</span>
          </div>
          <div class="ps-step" id="ps-step-c" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#f8f8f8;font-size:13px;color:#aaa">
            <span id="ps-icon-c" style="font-size:15px">⏳</span>
            <span>Transcrevendo ambos os lados (pt-BR)</span>
          </div>
          <div class="ps-step" id="ps-step-d" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:#f8f8f8;font-size:13px;color:#aaa">
            <span id="ps-icon-d" style="font-size:15px">⏳</span>
            <span>Claude gerando nota clínica a partir da transcrição</span>
          </div>
        </div>

        <div style="font-size:11px;color:#bbb">Você pode fechar e voltar — uma notificação aparecerá quando estiver pronta</div>
      </div>

      <!-- STEP 2: Transcrição + nota prontas -->
      <div id="post-step-2" style="display:none">

        <!-- Header -->
        <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">✅</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:15px;color:#1a1a1a">Transcrição pronta · ${_durStr} <span style="font-size:10px;font-weight:700;color:#7c3aed;background:#faf0ff;border:1px solid #d8b4fe;border-radius:5px;padding:2px 7px;vertical-align:middle;margin-left:6px;white-space:nowrap">✦ Exemplo ilustrativo</span></div>
            <div style="font-size:12px;color:#888;margin-top:2px">Transcrição da sessão · ambos os lados · revisão recomendada</div>
          </div>
          <button onclick="baixarTranscricao()" title="Baixar transcrição" style="background:none;border:1px solid var(--border);border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;color:var(--muted);white-space:nowrap">📥 .txt</button>
        </div>

        <!-- Transcrição dos dois lados -->
        <div style="padding:16px 24px;max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:10px" id="full-transcript">

          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="min-width:28px;height:28px;border-radius:50%;background:#4a7c59;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px;flex-shrink:0">${_tInitials}</div>
            <div style="background:#f8faf8;border-radius:0 10px 10px 10px;padding:10px 14px;flex:1">
              <div style="font-size:10px;color:#aaa;margin-bottom:4px">${_tNome} · 00:01</div>
              <div style="font-size:13px;color:#1a1a1a">Oi ${_spFirst}, como você está chegando hoje?</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse">
            <div style="min-width:28px;height:28px;border-radius:50%;background:#c97d2e;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px;flex-shrink:0">${_spInitials}</div>
            <div style="background:#fff8f0;border-radius:10px 0 10px 10px;padding:10px 14px;flex:1;text-align:right">
              <div style="font-size:10px;color:#aaa;margin-bottom:4px">${_spNome} · 00:03</div>
              <div style="font-size:13px;color:#1a1a1a">Tô chegando bem cansada, foi uma semana muito pesada no trabalho. Sinto que não consigo dar conta de tudo.</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="min-width:28px;height:28px;border-radius:50%;background:#4a7c59;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px;flex-shrink:0">${_tInitials}</div>
            <div style="background:#f8faf8;border-radius:0 10px 10px 10px;padding:10px 14px;flex:1">
              <div style="font-size:10px;color:#aaa;margin-bottom:4px">${_tNome} · 00:05</div>
              <div style="font-size:13px;color:#1a1a1a">Que partes te deixaram com essa sensação de não dar conta?</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:flex-start;flex-direction:row-reverse">
            <div style="min-width:28px;height:28px;border-radius:50%;background:#c97d2e;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px;flex-shrink:0">${_spInitials}</div>
            <div style="background:#fff8f0;border-radius:10px 0 10px 10px;padding:10px 14px;flex:1;text-align:right">
              <div style="font-size:10px;color:#aaa;margin-bottom:4px">${_spNome} · 00:08</div>
              <div style="font-size:13px;color:#1a1a1a">Meu chefe pediu três entregas ao mesmo tempo e fico pensando que se eu não fizer tudo perfeito vou decepcionar todo mundo. Aí fico travada.</div>
            </div>
          </div>

          <!-- Marco clínico detectado -->
          <div style="background:#faf0ff;border:1px solid #d8b4fe;border-radius:8px;padding:10px 14px;display:flex;gap:8px;align-items:flex-start">
            <span style="font-size:14px;flex-shrink:0">✦</span>
            <div>
              <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:2px">CRENÇA NUCLEAR DETECTADA</div>
              <div style="font-size:12px;color:#555">"se eu não fizer tudo perfeito vou decepcionar todo mundo" — 4ª ocorrência nos últimos 6 atendimentos.</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="min-width:28px;height:28px;border-radius:50%;background:#4a7c59;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:2px;flex-shrink:0">${_tInitials}</div>
            <div style="background:#f8faf8;border-radius:0 10px 10px 10px;padding:10px 14px;flex:1">
              <div style="font-size:10px;color:#aaa;margin-bottom:4px">${_tNome} · 00:12</div>
              <div style="font-size:13px;color:#1a1a1a">Esse pensamento de decepcionar todo mundo... de onde você acha que ele vem?</div>
            </div>
          </div>

          <div style="text-align:center;padding:6px 0">
            <span style="font-size:11px;color:#ccc">··· ${_durMin > 10 ? _durMin - 10 : 40} min restantes na gravação ···</span>
          </div>

        </div>

        <!-- Nota clínica gerada pela IA -->
        <div style="padding:0 24px 16px">
          <div style="background:#f8faf8;border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;font-weight:700;color:#4a7c59;margin-bottom:8px;display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.4px">
              ✦ Nota clínica — gerada pelo Claude a partir da transcrição
            </div>
            <div style="font-size:13px;color:#333;line-height:1.6" id="post-note-text">${_quickNotes ? `<span style="display:block;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin-bottom:10px;border-radius:0 6px 6px 0;font-size:12px;color:var(--amber)"><strong>Suas anotações:</strong> ${_quickNotes}</span>` : ''}Paciente chegou relatando cansaço intenso e sobrecarga no trabalho. Identificada crença nuclear recorrente: "preciso ser perfeita para não decepcionar" — 4ª ocorrência nos últimos 6 atendimentos. Foram trabalhadas técnicas de reestruturação cognitiva, com foco no pensamento dicotômico. Paciente demonstrou insight ao reconhecer o padrão de paralisia frente à exigência autoimposta. Exercício de casa: registro de pensamentos automáticos por 3 dias, com atenção especial ao momento de "travar".</div>
          </div>
        </div>

        <!-- Resumo para o paciente (IA) -->
        <div style="padding:0 24px 14px" id="pos-sess-resumo-wrap">
          <div style="background:linear-gradient(135deg,#f0f7f3 0%,#fafafa 100%);border:1px solid rgba(74,124,89,.2);border-radius:10px;padding:12px 14px">
            <div style="font-size:10.5px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;display:flex;align-items:center;gap:7px">
              ✨ Resumo para o paciente
              <span id="pos-sess-resumo-loader" style="font-size:10px;font-weight:400;color:#aaa;font-style:italic;text-transform:none;letter-spacing:0">— gerando com IA…</span>
            </div>
            <textarea id="pos-sess-resumo-text" disabled rows="3"
              placeholder="Aguardando geração…"
              style="width:100%;border:1.5px solid #d1e7d9;border-radius:8px;padding:9px 11px;font-size:13px;font-family:'DM Sans',sans-serif;outline:none;resize:none;background:#f9fcfa;color:#333;line-height:1.6;box-sizing:border-box"
            ></textarea>
            <div style="font-size:10.5px;color:#aaa;margin-top:4px">Só é publicado na jornada do paciente quando você salvar — revise e edite à vontade. Se a IA não terminar antes de você fechar, o texto fica como rascunho para aprovar depois.</div>
          </div>
        </div>

        <!-- Ações -->
        <div style="padding:12px 24px 20px;display:flex;gap:8px;border-top:1px solid #f0f0f0">
          <button onclick="editPostNote()" id="btn-edit-note" style="padding:10px 16px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555;white-space:nowrap;font-family:inherit">
            ✏️ Editar nota
          </button>
          <button onclick="indexPostSession()" style="flex:1;padding:10px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
            ✓ Salvar e indexar na IA
          </button>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // Anima etapas do fluxo gravação → transcrição → nota
  function _setStep(id, done) {
    const el = document.getElementById('ps-step-' + id);
    const ic = document.getElementById('ps-icon-' + id);
    if (!el || !ic) return;
    if (done) {
      el.style.background = '#f0fdf4'; el.style.color = '#1a1a1a';
      ic.textContent = '✓';
    } else {
      el.style.background = '#f0f8ff'; el.style.color = '#1a1a1a';
      ic.innerHTML = '<span style="display:inline-block;animation:spin .8s linear infinite;font-style:normal">⟳</span>';
    }
  }

  // Etapa A: processando gravação
  setTimeout(() => {
    _setStep('a', false);
    const t = document.getElementById('whisper-title');
    if (t) t.textContent = 'Processando gravação…';
  }, 300);
  setTimeout(() => { _setStep('a', true); _setStep('b', false); }, 1800);

  // Etapa B: Enviando para transcrição
  setTimeout(() => {
    const t = document.getElementById('whisper-title');
    const s = document.getElementById('whisper-subtitle');
    if (t) t.textContent = 'Gravação recebida · enviando para transcrição…';
    if (s) s.textContent = 'Aguarde ~2 minutos para sessões longas';
  }, 2000);
  setTimeout(() => { _setStep('b', true); _setStep('c', false); }, 3400);

  // Etapa C: transcrevendo
  setTimeout(() => {
    const t = document.getElementById('whisper-title');
    if (t) t.textContent = 'Transcrevendo (pt-BR)…';
  }, 3600);
  setTimeout(() => { _setStep('c', true); _setStep('d', false); }, 5200);

  // Etapa D: Claude gerando nota
  setTimeout(() => {
    const t = document.getElementById('whisper-title');
    if (t) t.textContent = 'Claude gerando nota clínica…';
  }, 5400);

  // Etapa D concluída + transição para step 2
  setTimeout(() => {
    _setStep('d', true);
    const t = document.getElementById('whisper-title');
    const s = document.getElementById('whisper-subtitle');
    const sp = document.getElementById('whisper-spin');
    if (t) t.textContent = 'Tudo pronto!';
    if (s) s.textContent = 'Transcrição e nota clínica disponíveis';
    if (sp) sp.style.borderTopColor = 'transparent';
  }, 6800);
  setTimeout(function() {
    const s1 = document.getElementById('post-step-1');
    const s2 = document.getElementById('post-step-2');
    if (s1) s1.style.display = 'none';
    if (s2) {
      s2.style.display = 'block';
      // Sempre mostra template estruturado (já inclui bloco de notas do terapeuta)
      var noteEl = document.getElementById('post-note-text');
      if (noteEl && noteEl.tagName !== 'TEXTAREA') {
        noteEl.innerHTML = _gerarNotaEstrutural();
        // Se há notas do terapeuta, gera nota SOAP real via IA em background
        // (respeita a Preferência da IA "nota" — autonomia do terapeuta)
        if (_sessionNote && _iaPrefOn('nota')) {
          noteEl.insertAdjacentHTML('afterbegin', '<div id="_note-ia-loader" style="font-size:11px;color:var(--sage,#4a7c59);margin-bottom:10px;display:flex;align-items:center;gap:6px"><span style="display:inline-block;animation:spin .8s linear infinite">⟳</span> Claude gerando nota clínica a partir das suas anotações…</div>');
          _gerarNotaClinicaIA(_tfSessionPatient(), _sessionNote).then(function(notaIA) {
            if (notaIA) tfTrack('nota_ia_gerada', { origem: 'painel_anotacoes' });
            var el = document.getElementById('post-note-text');
            if (notaIA && el && el.tagName !== 'TEXTAREA') {
              el.innerHTML =
                '<span style="display:block;background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;margin-bottom:14px;border-radius:0 8px 8px 0;font-size:12px;color:var(--amber);white-space:pre-wrap"><strong>📝 Suas notas da sessão:</strong>\n' + escHTML(_sessionNote.substring(0, 600)) + '</span>' +
                '<div style="white-space:pre-wrap;font-size:13px;color:#333;line-height:1.6">' + escHTML(notaIA) + '</div>';
            } else {
              var loader = document.getElementById('_note-ia-loader');
              if (loader) loader.remove();
            }
          });
        }
      }
      // Gera resumo para o portal do paciente via IA
      var _spForResumo = _tfSessionPatient();
      var _noteTextForResumo = noteEl ? (noteEl.tagName === 'TEXTAREA' ? noteEl.value : noteEl.textContent) : '';
      _gerarResumoPortalIA(_spForResumo, _noteTextForResumo).then(function(resumo) {
        var loaderEl = document.getElementById('pos-sess-resumo-loader');
        var taEl = document.getElementById('pos-sess-resumo-text');
        // Atualiza textarea se o modal ainda estiver aberto
        if (taEl) {
          if (resumo) {
            taEl.value = resumo;
            taEl.disabled = false;
            if (loaderEl) loaderEl.textContent = '— editável';
          } else {
            if (loaderEl) loaderEl.textContent = '— não disponível';
            taEl.placeholder = 'Não foi possível gerar. Escreva manualmente se quiser.';
            taEl.disabled = false;
          }
        }
        // Modal já fechado quando a IA terminou → vira RASCUNHO pendente de
        // aprovação (antes publicava direto no portal sem o terapeuta ver — o
        // paciente podia ler texto de IA sem revisão). Aprovar/publicar fica em
        // Pacientes → Visão Geral → Trajetória. Não espelha em sp.appointments
        // (payload do portal) enquanto for rascunho.
        if (resumo && _pendingResumoApptId) {
          var _apptAsync = (typeof appointments !== 'undefined' ? appointments : [])
            .find(function(a) { return String(a.id) === _pendingResumoApptId; });
          if (_apptAsync) {
            _apptAsync.resumoPendente = resumo;
            _salvarAppointments();
            if (typeof showToast === 'function') showToast('📝 Resumo para o paciente pronto — revise e publique em Pacientes → Visão Geral.');
          }
          _pendingResumoApptId = null;
        }
      });
    }
  }, 7600);
}

function _gerarNotaEstrutural() {
  var sp = _tfSessionPatient();
  var abord = (sp && sp.abordagem) ? sp.abordagem.toLowerCase() : profileAbordagem || 'tcc';
  var nome = sp ? _firstName(sp.name) : 'Paciente';
  var sessaoNum = sp ? (sp.sessions||0) + 1 : 1;
  var hoje = new Date().toLocaleDateString('pt-BR');
  var qn = (document.getElementById('session-quick-notes')?.value || document.getElementById('session-ai-note')?.value || '').trim();
  var notasHtml = qn ? '<span style="display:block;background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;margin-bottom:10px;border-radius:0 6px 6px 0;font-size:12px;color:var(--amber)"><strong>Notas da sessão:</strong> ' + escHTML(qn.substring(0, 300)) + '</span>' : '';
  var corpo = '';
  if (abord.includes('tcc') || abord.includes('cognitivo')) {
    corpo = '<strong>S — Subjetivo:</strong> ' + nome + ' apresentou-se à sessão ' + sessaoNum + '. Relato do paciente a ser preenchido após revisão da transcrição.<br/><br/>' +
      '<strong>O — Objetivo:</strong> Comportamento observado, nível de engajamento, sinais de progresso ou regressão.<br/><br/>' +
      '<strong>A — Avaliação:</strong> Padrões cognitivos identificados. Hipóteses clínicas.<br/><br/>' +
      '<strong>P — Plano:</strong> Intervenções aplicadas nesta sessão. Tarefas de casa. Foco para a próxima sessão.';
  } else if (abord.includes('psicanalise') || abord.includes('psicodinami') || abord.includes('psicanalí')) {
    corpo = '<strong>Material trazido:</strong> Temas emergentes, sonhos, associações livres relatados pelo paciente.<br/><br/>' +
      '<strong>Transferência/contratransferência:</strong> Dinâmica relacional observada na sessão.<br/><br/>' +
      '<strong>Hipóteses interpretativas:</strong> Conteúdo latente, repetições, defesas predominantes.<br/><br/>' +
      '<strong>Condução:</strong> Intervenções e interpretações realizadas.';
  } else if (abord.includes('sist') || abord.includes('familiar')) {
    corpo = '<strong>Configuração sistêmica:</strong> Subsistemas e padrões relacionais abordados.<br/><br/>' +
      '<strong>Dinâmicas identificadas:</strong> Triângulos, alianças, fronteiras, comunicação.<br/><br/>' +
      '<strong>Intervenções:</strong> Técnicas utilizadas — reenquadramento, escultura, etc.<br/><br/>' +
      '<strong>Próxima sessão:</strong> Hipótese sistêmica a explorar.';
  } else if (abord.includes('act') || abord.includes('dbt') || abord.includes('3ª onda')) {
    corpo = '<strong>Valores e comprometimento:</strong> Valores explorados. Movimento em direção ao que importa.<br/><br/>' +
      '<strong>Desfusão e aceitação:</strong> Exercícios praticados. Nível de abertura observado.<br/><br/>' +
      '<strong>Mindfulness:</strong> Exercício realizado. Reação do paciente.<br/><br/>' +
      '<strong>Plano:</strong> Prática entre sessões. Foco para próximo encontro.';
  } else {
    // Humanista ou genérico
    corpo = '<strong>Experiência presente:</strong> O que emergiu no encontro terapêutico.<br/><br/>' +
      '<strong>Relação terapêutica:</strong> Qualidade do contato. Movimentos de aproximação/distância.<br/><br/>' +
      '<strong>Awareness:</strong> Tomadas de consciência observadas.<br/><br/>' +
      '<strong>Próximo passo:</strong> Questão a manter em aberto para próxima sessão.';
  }
  return notasHtml + '<div style="font-size:12px;color:#888;margin-bottom:8px">Sessão ' + sessaoNum + ' · ' + hoje + ' · ' + (sp ? sp.abordagem : 'Psicologia Clínica') + '</div>' + corpo;
}

async function _gerarNotaClinicaIA(sp, sessionNotes) {
  if (!sessionNotes || !sessionNotes.trim()) return null;
  var abord = (sp && sp.abordagem) ? sp.abordagem : 'TCC';
  var sessao = sp ? (sp.sessions||0)+1 : 1;
  var system = 'Você é um assistente clínico para psicólogos brasileiros. Gere uma nota clínica estruturada em texto simples (sem markdown, sem asteriscos, sem hashtags, sem traços horizontais). Use o formato SOAP para TCC (S — Subjetivo, O — Objetivo, A — Avaliação, P — Plano) ou formato adequado à abordagem. Seja objetivo e conciso. Máximo 250 palavras.';
  var user = 'Paciente: ' + (sp ? sp.name : 'Paciente') + '. Abordagem: ' + abord + '. Sessão ' + sessao + '.\n\nAnotações do terapeuta durante a sessão:\n' + sessionNotes.substring(0, 800) + '\n\nGere a nota clínica estruturada completa baseada nessas anotações.';
  try {
    var res = await fetchWithTimeout('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      // Minimização (LGPD): patientData não é enviado — o servidor o ignora quando
      // systemPrompt vem preenchido, e sp contém prontuário/whatsapp/token da sala.
      body: JSON.stringify({ systemPrompt: system, userPrompt: user })
    }, 25000);
    if (!res.ok) return null;
    var data = await res.json();
    var raw = (data.content || '').trim();
    return raw ? _stripMd(raw) : null;
  } catch(e) {
    console.warn('[NotaClinicaIA]', e.message);
    return null;
  }
}

function _stripMd(txt) {
  return txt
    .replace(/^#{1,4}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^___+$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function _gerarResumoPortalIA(sp, noteText) {
  if (!noteText || !noteText.trim()) return null;
  var plainNote = noteText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 900);
  // Metas reais = portalMetas[].text (p.metas[].texto nunca é escrito) — sem isto
  // os objetivos terapêuticos nunca chegavam ao prompt da IA. Lote 1.
  var metas = ((sp.portalMetas && sp.portalMetas.length ? sp.portalMetas : sp.metas) || [])
    .filter(function(m){ return m && (m.text || m.texto); }).slice(0, 3)
    .map(function(m){ return m.text || m.texto; }).join('; ');
  // Regra dura (feedback do usuário 14/07): a nota clínica pode registrar quedas de
  // conexão/interrupções (registro legítimo do terapeuta), mas o resumo que a
  // PACIENTE lê jamais deve ecoar isso — "problemas técnicos atrapalharam nossa
  // conexão" no portal mina a confiança na terapia e na plataforma.
  var system = 'Você é um assistente que transforma notas clínicas de psicologia em resumos acessíveis para o próprio paciente ler. Nunca use jargão clínico. Seja caloroso, direto e encorajador. Máximo 3 frases curtas. '
    + 'REGRA INEGOCIÁVEL: fale somente do conteúdo terapêutico (o que a pessoa trouxe, trabalhou e leva da sessão). NUNCA mencione problemas técnicos, queda ou qualidade de conexão, interrupções, gravação, transcrição, áudio, vídeo, plataforma ou qualquer aspecto tecnológico do atendimento — se a nota citar algo assim, ignore por completo, como se não estivesse lá. Responda em português brasileiro.';
  var user = 'Abordagem: ' + (sp.abordagem || 'Psicologia Clínica') + '.'
    + (metas ? ' Objetivos terapêuticos: ' + metas + '.' : '')
    + ' Sessão ' + (sp.sessions || 1) + '.\n'
    + 'Nota clínica: ' + plainNote + '\n'
    + 'Escreva um breve resumo desta sessão para o paciente ler no app. Use "você" ao se referir ao paciente. Não mencione diagnósticos nem termos clínicos. Lembre-se: nada de tecnologia, conexão ou interrupções — apenas o conteúdo terapêutico.';
  try {
    var res = await fetchWithTimeout('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      // Minimização (LGPD): patientData omitido — ignorado pelo servidor com systemPrompt presente.
      body: JSON.stringify({ systemPrompt: system, userPrompt: user })
    }, 20000);
    if (!res.ok) return null;
    var data = await res.json();
    var content = (data.content || '').trim();
    // Descarta respostas de recusa/erro do Claude (não devem aparecer para o paciente)
    if (!content || /^desculpe|nota.*incompleta|preciso.*detalhes|não (posso|consigo)|unable to/i.test(content)) return null;
    // Rede de segurança: mesmo instruída, se a IA citar tecnologia/conexão, as
    // frases ofensoras caem antes de virar rascunho (o resumo é da TERAPIA).
    var _tech = /t[ée]cnic|tecnolog|conex[ãa]o|interrup|grava[çc]|transcri|[áa]udio|v[íi]deo|plataforma|sinal|internet|chamada caiu|ca[íi]da/i;
    if (_tech.test(content)) {
      var _frases = content.match(/[^.!?…]+[.!?…]*\s*/g) || [content];
      content = _frases.filter(function(f){ return !_tech.test(f); }).join('').trim();
      if (!content) return null;
    }
    return typeof _stripMd === 'function' ? _stripMd(content) : content;
  } catch(e) {
    console.warn('[ResumoPortalIA]', e.message);
    return null;
  }
}

function baixarTranscricao() {
  const sp = _tfSessionPatient();
  const nome = sp?.name || 'Paciente';
  const sessao = sp ? (sp.sessions || 0) + 1 : 1;
  const hoje = new Date();
  const data = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
  const linhas = document.querySelectorAll('#full-transcript [style*="font-size:13px;color:#1a1a1a"]');
  const labels = document.querySelectorAll('#full-transcript [style*="font-size:10px;color:#aaa"]');
  let txt = `TRANSCRIÇÃO — ${nome} · Sessão ${sessao} · ${data}\n${'─'.repeat(50)}\n\n`;
  labels.forEach((l, i) => {
    const msg = linhas[i]?.textContent?.trim() || '';
    if (msg) txt += `[${l.textContent.trim()}]\n${msg}\n\n`;
  });
  txt += `${'─'.repeat(50)}\nGerado pelo Teravia · transcrição automática (pt-BR)\n`;
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `transcricao-${nome.replace(/\s+/g,'-').toLowerCase()}-sessao${sessao}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📥 Transcrição baixada.');
}

function editPostNote() {
  const noteEl = document.getElementById('post-note-text');
  const btn = document.getElementById('btn-edit-note');
  if (!noteEl || !btn) return;

  // Já está em edição — salvar
  if (noteEl.tagName === 'TEXTAREA') {
    const newText = noteEl.value;
    const div = document.createElement('div');
    div.id = 'post-note-text';
    div.style.cssText = 'font-size:13px;color:#333;line-height:1.6';
    div.textContent = newText;
    noteEl.replaceWith(div);
    btn.innerHTML = '✏️ Editar nota';
    return;
  }

  // Entrar em modo edição — preserva conteúdo, converte HTML de notas estruturais para texto editável
  const currentText = (noteEl.tagName === 'TEXTAREA' ? noteEl.value : noteEl.innerText || noteEl.textContent).trim();
  const textarea = document.createElement('textarea');
  textarea.id = 'post-note-text';
  textarea.value = currentText;
  textarea.style.cssText = `
    width:100%;min-height:110px;font-size:13px;color:#333;line-height:1.6;
    border:1px solid #d0e8d8;border-radius:8px;padding:10px;
    font-family:inherit;resize:vertical;outline:none;background:var(--white);
    box-sizing:border-box;
  `;
  noteEl.replaceWith(textarea);
  textarea.focus();
  btn.innerHTML = '✓ Salvar edição';
}

function closePostSession() {
  const modal = document.getElementById('modal-post-session');
  if (modal) modal.remove();
  navigate('pacientes');
  setTimeout(function() {
    if (typeof selectPatient === 'function') selectPatient(currentSessionPatientIdx);
    if (typeof selectPatientTab === 'function') selectPatientTab('notas');
  }, 150);
}

function indexPostSession() {
  if (_sessionAlreadySaved) return;
  _sessionAlreadySaved = true;
  const modal = document.getElementById('modal-post-session');
  // Captura nota: tenta modal primeiro, depois card da sessão
  const noteEl = document.getElementById('post-note-text') || document.getElementById('session-ai-note');
  const noteText = noteEl ? (noteEl.tagName === 'TEXTAREA' ? noteEl.value : noteEl.textContent.trim()) : '';
  // Captura resumo do paciente gerado pela IA (editável antes de salvar)
  const resumoEl = document.getElementById('pos-sess-resumo-text');
  const resumoText = resumoEl ? resumoEl.value.trim() : '';
  if (!noteText.trim()) {
    showToast('⚠ Adicione uma nota clínica antes de encerrar a sessão.');
    if (noteEl) noteEl.focus();
    _sessionAlreadySaved = false;
    return;
  }
  // Detecta placeholders não preenchidos (padrão [texto entre colchetes]).
  // Aviso com escolha (não bloqueia): o terapeuta pode salvar assim mesmo e revisar depois.
  if (/\[[^\]]{3,}\]/.test(noteText)) {
    if (!confirm('A nota ainda contém campos entre [ ] não preenchidos.\n\nSalvar mesmo assim? (Você pode editar a nota depois no prontuário.)')) {
      _sessionAlreadySaved = false;
      if (noteEl) noteEl.focus();
      return;
    }
  }
  if (modal) modal.remove();
  incrementarSessaoTrial();
  // Atualiza dados do paciente
  const sp = _tfSessionPatient();
  if (sp) {
    sp.sessions = (sp.sessions || 0) + 1;
    const hoje = new Date();
    const hojeIso = hojeISO();
    sp.lastSession = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}`;
    if (noteText) {
      if (!sp.prontuarioNotes) sp.prontuarioNotes = [];
      sp.prontuarioNotes.push({ date: sp.lastSession, text: noteText, _up: Date.now() }); // _up: merge por elemento (027)
    }
    salvarPacientes();
    showToast('✓ Sessão encerrada e nota salva.');
  }
  // Marca appointment de hoje como 'compareceu' automaticamente
  if (typeof appointments !== 'undefined' && sp) {
    var hojeIso2 = hojeISO();
    // Usa o apptId rastreado ao iniciar sessão se disponível; evita marcar sessão errada em dias com 2 agendamentos.
    // Guard: só se o appointment for DESTE paciente — o id é setado no popup do dia
    // (js/08) e vazava entre sessões, marcando presença no agendamento de outro. Lote 1.
    var apptHoje = (typeof currentSessionApptId !== 'undefined' && currentSessionApptId)
      ? appointments.find(function(a){
          return String(a.id) === String(currentSessionApptId)
            && (a.patientIdx === currentSessionPatientIdx || a.patientName === sp.name);
        })
      : null;
    if (!apptHoje) {
      apptHoje = appointments.filter(function(a){
        return a.patientIdx === currentSessionPatientIdx && a.date === hojeIso2 && a.status !== 'cancelada';
      }).sort(function(a,b){ return a.time < b.time ? -1 : 1; })[0];
    }
    // Se não há appointment formal, cria registro mínimo para a jornada aparecer no portal
    if (!apptHoje) {
      apptHoje = {
        id: 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2,5),
        patientIdx: currentSessionPatientIdx,
        patientId: sp.id || null, // C3: identidade estável (índice desloca com exclusões)
        patientName: sp.name,
        date: hojeIso2,
        time: null,
        status: 'realizada',
        presenca: 'compareceu',
        color: null,
      };
      appointments.push(apptHoje);
    }
    if (!apptHoje.presenca) apptHoje.presenca = 'compareceu';
    if (resumoText) apptHoje.resumoParaPaciente = resumoText;
    // Registra ID para o .then() assíncrono da IA salvar o resumo mesmo após o modal fechar
    if (!resumoText) _pendingResumoApptId = String(apptHoje.id);
    _salvarAppointments();
    // Espelha no objeto do paciente → chega ao portal via patients.metadata mesmo sem RLS em appointments
    if (!sp.appointments) sp.appointments = [];
    var _spApptIdx = sp.appointments.findIndex(function(a){ return String(a.id) === String(apptHoje.id); });
    var _spApptEntry = { id: apptHoje.id, date: apptHoje.date, presenca: 'compareceu', resumoParaPaciente: resumoText || null };
    if (_spApptIdx >= 0) sp.appointments[_spApptIdx] = _spApptEntry;
    else sp.appointments.push(_spApptEntry);
    salvarPacientes();
    _supaSync_patients().catch(function(){});
    currentSessionApptId = null;
  }
  // ── Auto-cria cobrança pendente (valor do PACIENTE > valor do perfil) ──
  // MESMO shape e id NUMÉRICO do caminho da agenda (_criarCobrancaPresenca, js/08):
  // o id string com hífen quebrava os onclick do financeiro (interpolam sem aspas)
  // e o objeto sem initials/color/session/billing renderizava "undefined". Lote 1.
  if (sp) {
    try {
      var _profAcc = JSON.parse(localStorage.getItem('tf_account') || '{}');
      var _valorSessao = parseFloat(sp.valorSessao || _profAcc.valor_sessao) || 0;
      var _isoCharge = hojeISO();
      // Evita cobrança duplicada se já existe uma para este paciente hoje
      var _jaTemCobranca = charges.some(function(c){ return c.patient === sp.name && c.date === _isoCharge && !c.deleted; });
      if (_valorSessao > 0 && !_jaTemCobranca) {
        var _diaCharge = fmtDataBR(_isoCharge);
        charges.push({
          id: Date.now(),
          patient: sp.name,
          initials: sp.initials || sp.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase(),
          color: sp.color || '#4a7c59',
          desc: 'Sessão ' + _diaCharge,
          value: _valorSessao,
          date: _isoCharge,
          status: 'pending',
          deleted: false,
          billing: 'avulso',
          session: _diaCharge,
          method: 'PIX',
        });
        salvarCharges();
        // Recalcula status financeiro do paciente
        sp.finStatus = 'pending';
        sp.fin = 'Pendente';
        salvarPacientes();
      } else if (_valorSessao <= 0) {
        // Sem valor definido a cobrança NÃO nasce — avisar em vez de silenciar
        // (pedido do usuário 12/07; o modal pós-sessão também mostra o aviso).
        if (typeof showToast === 'function') showToast('◈ Sessão registrada SEM cobrança — defina o valor da sessão na ficha do paciente (✎ Editar) ou no Perfil.', 'warning');
      }
    } catch(_e) {}
  }
  // M1: Insere em public.sessions para ativar trigger de sessoes_usadas no Supabase
  if (sp && sp.id) {
    (async function() {
      try {
        const { data: { user } } = await supa.auth.getUser();
        if (!user) return;
        await supa.from('sessions').insert({
          patient_id: sp.id,
          user_id: user.id,
          session_number: sp.sessions,
          scheduled_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          status: 'realizada',
        });
      } catch(_) { /* silencioso — trial já incrementado localmente */ }
    })();
  }
  // Abre etapa de exercícios antes de ir para supervisão
  showExercisePosSession();
  // Atualiza supervisão IA com evidências da sessão recém-encerrada
  if (typeof injectNewEvidenceIntoSupervisao === 'function') {
    injectNewEvidenceIntoSupervisao();
  }
}

function showExercisePosSession() {
  const sp = _tfSessionPatient();
  const existing = document.getElementById('modal-exercise-pos');
  if (existing) existing.remove();

  const TEMPLATES = [
    { title:'Diário de pensamentos', desc:'Registre 1 situação de ansiedade, o pensamento automático e uma alternativa equilibrada.', tag:'tcc' },
    { title:'Relaxamento progressivo', desc:'Pratique a sequência de 10 minutos antes de dormir. Observe a diferença no sono.', tag:'relaxa' },
    { title:'Registro de humor diário', desc:'Preencha o check-in de humor no portal pelo menos 5 dias esta semana.', tag:'diario' },
    { title:'Exposição gradual', desc:'Enfrente gradualmente a situação evitada. Depois registre como se sentiu.', tag:'exposicao' },
    { title:'Respiração 4-7-8', desc:'Inspire 4s, segure 7s, expire 8s. Repita 4 vezes quando sentir ansiedade.', tag:'relaxa' },
    { title:'Mindfulness 5 minutos', desc:'Atenção plena por 5 minutos diários. Use um app de sua preferência.', tag:'mindfulness' },
  ];
  window._exTemplates = TEMPLATES;

  const modal = document.createElement('div');
  modal.id = 'modal-exercise-pos';
  modal.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  modal.addEventListener('click', function(e){ if(e.target===modal) fecharExercicioPos(); });
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:540px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.3)">
      <div style="padding:22px 28px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:50%;background:#f0ecfa;display:flex;align-items:center;justify-content:center;font-size:18px">📋</div>
        <div>
          <div style="font-weight:600;font-size:15px;color:#1a1a1a">Exercícios para ${escHTML(sp ? _firstName(sp.name) : 'o paciente')}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">O que ele/ela levará para casa até a próxima sessão?</div>
        </div>
      </div>
      <div style="padding:18px 28px;max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
        <div style="font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Sugestões rápidas</div>
        ${TEMPLATES.map((t, i) => `
          <label id="ex-pos-label-${i}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e8e8e8;border-radius:10px;cursor:pointer;transition:all .15s">
            <input type="checkbox" data-idx="${i}" onchange="toggleExPosTemplate(${i})" style="margin-top:3px;accent-color:#5a3e8a;flex-shrink:0">
            <div>
              <div style="font-size:13px;font-weight:600;color:#1a1a1a">${t.title}</div>
              <div style="font-size:12px;color:#888;margin-top:2px">${t.desc}</div>
            </div>
          </label>`).join('')}
        <div style="margin-top:8px;padding-top:12px;border-top:1px solid #f0f0f0">
          <div style="font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Exercício personalizado</div>
          <input id="ex-pos-titulo" class="form-input" placeholder="Título do exercício" style="margin-bottom:8px"/>
          <textarea id="ex-pos-desc" class="note-area" placeholder="Instrução para o paciente…" style="min-height:56px"></textarea>
        </div>
      </div>
      <div style="padding:16px 28px 22px;display:flex;gap:10px;border-top:1px solid #f0f0f0">
        <button onclick="fecharExercicioPos()" style="padding:10px 16px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555;font-family:inherit">Pular por agora</button>
        <button onclick="confirmarExercicioPos()" style="flex:1;padding:10px;background:#5a3e8a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✓ Enviar para o portal</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function toggleExPosTemplate(i) {
  const label = document.getElementById(`ex-pos-label-${i}`);
  const cb = label?.querySelector('input');
  if (!label) return;
  label.style.borderColor = cb?.checked ? '#5a3e8a' : '#e8e8e8';
  label.style.background  = cb?.checked ? '#f5f0ff' : '';
}

function fecharExercicioPos() {
  document.getElementById('modal-exercise-pos')?.remove();
  navigate('supervisao');
  setTimeout(() => { const b = document.getElementById('sup-new-session-banner'); if (b) b.style.display = 'flex'; }, 400);
  setTimeout(() => _mostrarPromptReflexao(_tfSessionPatient()), 2200);
}

function confirmarExercicioPos() {
  const sp = _tfSessionPatient();
  if (!sp) { fecharExercicioPos(); return; }
  if (!sp.exercises) sp.exercises = [];

  const checkboxes = document.querySelectorAll('#modal-exercise-pos input[type=checkbox]:checked');
  checkboxes.forEach(cb => {
    const t = window._exTemplates[parseInt(cb.dataset.idx)];
    if (t) sp.exercises.push({ id: Date.now() + Math.random(), title: t.title, desc: t.desc, tag: t.tag, done: false });
  });

  const customTitulo = document.getElementById('ex-pos-titulo')?.value.trim();
  const customDesc   = document.getElementById('ex-pos-desc')?.value.trim() || '';
  if (customTitulo) sp.exercises.push({ id: Date.now() + Math.random(), title: customTitulo, desc: customDesc, tag: 'outro', done: false });

  const added = checkboxes.length + (customTitulo ? 1 : 0);
  salvarPacientes();
  document.getElementById('modal-exercise-pos')?.remove();
  if (added > 0) showToast(`✓ ${added} exercício${added > 1 ? 's' : ''} enviado${added > 1 ? 's' : ''} para o portal de ${_firstName(sp.name)}.`);
  // Atualiza portal se estiver visível para o mesmo paciente
  if (currentPortalPatientIdx === currentSessionPatientIdx) {
    try { renderExercises(); } catch(e) {}
  }
  navigate('supervisao');
  setTimeout(() => { const b = document.getElementById('sup-new-session-banner'); if (b) b.style.display = 'flex'; }, 400);
  setTimeout(() => _mostrarPromptReflexao(_tfSessionPatient()), 2200);
}

