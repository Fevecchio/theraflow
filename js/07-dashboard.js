// 07-dashboard.js — Dashboard, sessões de hoje, insights, tarefas dash, contadores

/* ── APP JS ── */
/* APP JS */

// ── NAVEGAÇÃO ──
function countUp(el, target, duration) {
  if (!el || typeof target !== 'number') return;
  const from = parseInt(el.textContent) || 0;
  if (from === target) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

var _dashRefreshInterval = null;
function _startDashAutoRefresh() {
  _stopDashAutoRefresh();
  _dashRefreshInterval = setInterval(function() {
    var pg = document.getElementById('page-dashboard');
    if (pg && pg.classList.contains('active')) _renderDashSessoesHoje(
      appointments.filter(function(a){ return a.date===hojeISO() && a.status!=='cancelada'; })
        .sort(function(a,b){ return a.time<b.time?-1:1; })
    );
  }, 60000);
}
function _stopDashAutoRefresh() {
  if (_dashRefreshInterval) { clearInterval(_dashRefreshInterval); _dashRefreshInterval = null; }
}

function _wppInterpolate(tpl, nome, dia, hora, terapeuta) {
  var base = tpl && tpl.trim()
    ? tpl
    : 'Olá [Nome]! 🌿\n\nLembrete da sua sessão de psicoterapia [dia].\n\nAté logo! 💚\n— [Terapeuta]';
  return base
    .replace(/\[Nome\]/g, nome)
    .replace(/\[dia\]/g, hora ? dia + ' às ' + hora : dia)
    .replace(/\[hora\]/g, hora || '')
    .replace(/\[Terapeuta\]/g, terapeuta);
}

function enviarLembretesSessoesDia() {
  var hoje = hojeISO();
  var sessoesHoje = (typeof appointments !== 'undefined' ? appointments : [])
    .filter(function(a){ return a.date === hoje && a.status !== 'cancelada'; });
  if (!sessoesHoje.length) { showToast('Nenhuma sessão agendada para hoje.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var tpl = acc.wpp_template || '';
  var links = [];
  var semWpp = 0;
  var nomeT = (typeof tfUserData !== 'undefined' && tfUserData.nome ? tfUserData.nome.split(' ')[0] : 'sua terapeuta');
  sessoesHoje.forEach(function(a) {
    var p = patients[a.patientIdx];
    if (!p || !p.whatsapp) { semWpp++; return; }
    var n = _wppNumero(p.whatsapp);
    if (!n) { semWpp++; return; }
    var hora = a.time || '';
    var msg = _wppInterpolate(tpl, _firstName(p.name), 'hoje', hora, nomeT);
    links.push({ nome: _firstName(p.name), url: 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg) });
  });

  if (!links.length) {
    showToast('⚠ Pacientes sem WhatsApp cadastrado. Cadastre em Pacientes → Editar.');
    if (semWpp > 0) showToast('⚠ ' + semWpp + ' paciente(s) sem WhatsApp não receberão o lembrete.');
    return;
  }

  // Se apenas 1 paciente, abre direto (gesto do usuário permite popup)
  if (links.length === 1) {
    window.open(links[0].url, '_blank');
    showToast('💬 Lembrete aberto para ' + links[0].nome + '!');
    if (semWpp > 0) showToast('⚠ ' + semWpp + ' paciente(s) sem WhatsApp omitidos.');
    return;
  }

  // Para múltiplos: exibe modal com botões clicáveis (browsers bloqueiam window.open em loop)
  var existingModal = document.getElementById('modal-wpp-links');
  if (existingModal) existingModal.remove();
  var overlay = document.createElement('div');
  overlay.id = 'modal-wpp-links';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9990;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = '<div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:90%;max-height:80vh;overflow-y:auto">'
    + '<h3 style="margin:0 0 4px;font-size:16px;color:#1a2a1a">💬 Lembretes WhatsApp</h3>'
    + '<p style="margin:0 0 16px;font-size:13px;color:#666">Clique em cada paciente para abrir o WhatsApp.</p>'
    + links.map(function(l) {
        return '<a href="' + l.url + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#e8f5e9;border-radius:10px;margin-bottom:8px;text-decoration:none;color:#1a2a1a;font-size:14px;font-weight:600">'
          + '<span style="font-size:20px">💚</span>' + escHTML(l.nome) + '</a>';
      }).join('')
    + (semWpp > 0 ? '<p style="font-size:12px;color:#999;margin:8px 0 0">⚠ ' + semWpp + ' paciente(s) sem WhatsApp omitidos.</p>' : '')
    + '<button onclick="document.getElementById(\'modal-wpp-links\').remove()" style="margin-top:16px;width:100%;padding:11px;background:#f5f5f5;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;color:#555">Fechar</button>'
    + '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function enviarLembretesAmanha() {
  var amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  var amanhaIso = localDateISO(amanha);
  var amanhaFmt = String(amanha.getDate()).padStart(2,'0') + '/' + String(amanha.getMonth()+1).padStart(2,'0');
  var sessoes = (typeof appointments !== 'undefined' ? appointments : [])
    .filter(function(a){ return a.date === amanhaIso && a.status !== 'cancelada'; });
  if (!sessoes.length) { showToast('Nenhuma sessão agendada para amanhã.'); return; }

  // Monta modal de preview
  var nomeT = (typeof tfUserData !== 'undefined' && tfUserData.nome ? tfUserData.nome.split(' ')[0] : 'sua terapeuta');
  var _accA = {}; try { _accA = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var tplA = _accA.wpp_template || '';
  var itens = sessoes.map(function(a, idx) {
    var p = patients[a.patientIdx];
    var nome = p ? p.name : a.patientName || 'Paciente';
    var temWpp = p && p.whatsapp;
    var hora = a.time || '';
    var msg = _wppInterpolate(tplA, nome.split(' ')[0], 'amanhã, ' + amanhaFmt, hora, nomeT);
    var n = temWpp ? p.whatsapp.replace(/\D/g,'') : '';
    if (n && !n.startsWith('55')) n = '55' + n;
    var link = temWpp ? 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg) : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">'
      + '<div><div style="font-size:14px;font-weight:500">' + escHTML(nome) + '</div>'
      + '<div style="font-size:12px;color:var(--muted)">' + amanhaFmt + (hora ? ' às ' + hora : '') + '</div></div>'
      + (temWpp
          ? '<a href="' + link + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:#25d366;color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">📲 Enviar</a>'
          : '<span style="font-size:12px;color:var(--muted)">⚠ Sem WhatsApp</span>')
      + '</div>';
  }).join('');

  var modal = document.getElementById('modal-lembrete-amanha');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-lembrete-amanha';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal" style="max-width:420px"><div class="modal-header"><div class="modal-title">💬 Lembretes de amanhã</div><button class="modal-close" onclick="closeModal(\'modal-lembrete-amanha\')">✕</button></div><div class="modal-body" id="lembrete-amanha-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.classList.remove('open'); });
  }
  document.getElementById('lembrete-amanha-body').innerHTML = itens;
  modal.classList.add('open');
}

function atualizarDashboard() {
  // Recalcula métricas derivadas antes de renderizar
  _recalcFinStatus();
  _recalcNextSessions();
  _recalcSessions();
  _recalcAllProgress();
  const dias  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const agora  = new Date();
  const hojeIso = hojeISO();

  // ── Sessões de hoje (appointments reais)
  const sessoesHoje = (typeof appointments !== 'undefined' ? appointments : [])
    .filter(a => a.date === hojeIso && a.status !== 'cancelada')
    .sort((a,b) => a.time < b.time ? -1 : 1);

  const subtitle = document.getElementById('dash-subtitle');
  if (subtitle) {
    const dataFmt = `${dias[agora.getDay()]}, ${agora.getDate()} de ${meses[agora.getMonth()]} de ${agora.getFullYear()}`;
    subtitle.textContent = dataFmt + (sessoesHoje.length > 0 ? ` · ${sessoesHoje.length} sessão${sessoesHoje.length!==1?'es':''} hoje` : ' · Sem sessões hoje');
  }

  // Renderiza lista "Sessões de hoje"
  _renderDashSessoesHoje(sessoesHoje);

  // ── Stat: pacientes ativos
  const ativos = patients.filter(p => p.status === 'Ativa').length;
  const novos  = patients.filter(p => p.status === 'Nova').length;
  const elAtivos = document.getElementById('stat-pacientes-ativos');
  const elDelta  = document.getElementById('stat-pacientes-delta');
  if (elAtivos) countUp(elAtivos, ativos, 700);
  if (elDelta)  elDelta.textContent = novos > 0 ? `+ ${novos} novo${novos>1?'s':''}` : 'Total da carteira';

  // ── Stat: sessões esta semana
  const seg = new Date(agora); seg.setDate(agora.getDate()-((agora.getDay()+6)%7));
  const sex = new Date(seg); sex.setDate(seg.getDate()+4);
  const segIso = localDateISO(seg);
  const sexIso = localDateISO(sex);
  const sessSemana = (typeof appointments!=='undefined'?appointments:[])
    .filter(a=>a.status!=='cancelada'&&a.date>=segIso&&a.date<=sexIso).length;
  const elSessoes = document.getElementById('stat-sessoes-semana');
  const elSessoesDelta = document.getElementById('stat-sessoes-delta');
  if (elSessoes) countUp(elSessoes, sessSemana, 700);
  if (elSessoesDelta) elSessoesDelta.textContent = sessoesHoje.length + ' restante' + (sessoesHoje.length!==1?'s':'') + ' hoje';

  // ── Stat: receita do mês (charges pagas)
  const mesAtual = hojeIso.slice(0,7); // YYYY-MM
  const charges_ = typeof charges !== 'undefined' ? charges : [];
  const receitaMes = charges_.filter(c=>!c.deleted&&c.status==='paid'&&_chargeInMonth(c,mesAtual))
    .reduce((acc,c)=>acc+parseFloat(c.value||0),0);
  const elReceita = document.getElementById('stat-receita-mes');
  const elReceitaDelta = document.getElementById('stat-receita-delta');
  if (elReceita) {
    const fmt = receitaMes >= 1000 ? 'R$'+(receitaMes/1000).toFixed(1)+'k' : 'R$'+receitaMes.toFixed(0);
    elReceita.textContent = fmt;
  }
  const inadimplentes = charges_.filter(c=>!c.deleted&&c.status==='overdue').length;
  if (elReceitaDelta) elReceitaDelta.textContent = inadimplentes > 0 ? `⚠ ${inadimplentes} em atraso` : '✓ Em dia';
  if (elReceitaDelta) elReceitaDelta.style.color = inadimplentes > 0 ? 'var(--amber)' : 'var(--sage)';

  // ── Stat: notas — sessões desta semana sem nota
  const semNota = sessSemana > 0 ? Math.max(0, sessSemana - patients.reduce((acc,p)=>{
    return acc + (p.prontuarioNotes||[]).filter(n=>{
      const nd = (n.date||'').split('/').reverse().join('-');
      return nd >= segIso && nd <= sexIso;
    }).length;
  },0)) : 0;
  const elNotas = document.getElementById('stat-notas-pendentes');
  const elNotasDelta = document.getElementById('stat-notas-delta');
  if (elNotas) { elNotas.textContent = semNota; elNotas.style.color = semNota>0?'var(--amber)':'var(--sage)'; }
  if (elNotasDelta) { elNotasDelta.textContent = semNota>0?'Preencher hoje':'Todas em dia'; elNotasDelta.style.color = semNota>0?'var(--amber)':'var(--sage)'; }

  // ── Insights reais da semana
  _renderDashInsights();

  // ── Subtítulo pacientes
  const pacSub = document.getElementById('pacientes-subtitle');
  if (pacSub) pacSub.textContent = `${ativos} ativo${ativos!==1?'s':''}` + (novos>0?` · ${novos} em espera`:'');

  carregarTarefas();
  renderDashTarefas();
  atualizarBadgeTarefas();
}

function _renderDashSessoesHoje(sessoes) {
  const cont = document.getElementById('dash-sessoes-hoje');
  if (!cont) return;
  if (!sessoes.length) {
    // Mostra próximas sessões dos próximos 3 dias em vez de "vazio"
    var hojeIso = hojeISO();
    var proxDias = [1,2,3].map(function(d){ var dt = new Date(); dt.setDate(dt.getDate()+d); return localDateISO(dt); });
    var proximas = appointments.filter(function(a){ return proxDias.includes(a.date) && a.status !== 'cancelada'; })
      .sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); }).slice(0,3);
    if (proximas.length) {
      var tituloEl = document.querySelector('#page-dashboard .section-title');
      if (tituloEl && tituloEl.textContent.trim() === 'Sessões de hoje') tituloEl.textContent = 'Próximas sessões';
      cont.innerHTML = proximas.map(function(a){
        var d = new Date(a.date+'T12:00');
        var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        var dateLbl = dias[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
        return '<div class="list-item" style="display:flex;align-items:center;gap:14px">'
          + '<div style="text-align:center;min-width:56px"><div style="font-size:12px;font-weight:600;color:var(--sage)">'+dateLbl+'</div><div style="font-size:11px;color:var(--muted)">'+escHTML(a.time)+'</div></div>'
          + '<div style="flex:1"><div class="patient-name">'+escHTML(a.patientName)+'</div><div class="patient-meta">'+escHTML(a.abordagem||'—')+'</div></div>'
          + '<button class="btn btn-purple btn-sm" onclick="currentBriefingPatientIdx='+a.patientIdx+';navigate(\'briefing\')" title="Briefing IA pré-sessão">✦ Briefing</button>'
          + '</div>';
      }).join('');
    } else {
      cont.innerHTML = '<div style="text-align:center;padding:28px 16px;color:var(--muted);font-size:13px">Nenhuma sessão agendada para hoje ou amanhã.<br/><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="showAgendarModal()">+ Agendar sessão</button></div>';
    }
    return;
  }
  const agora = new Date();
  cont.innerHTML = sessoes.map(function(a){
    const sessaoDate = new Date(a.date+'T'+a.time);
    const passada = sessaoDate < agora;
    const diffMs = sessaoDate - agora;
    const diffMin = Math.round(diffMs / 60000);
    const emBreve = !passada && diffMs < 30*60*1000;
    const muitoProximo = !passada && diffMs < 5*60*1000;
    var contagem = '';
    if (muitoProximo) contagem = '<span class="tag tag-red tag-dot" style="animation:pulse 1s infinite">Agora!</span>';
    else if (emBreve) contagem = '<span class="tag tag-amber tag-dot">Em ' + diffMin + ' min</span>';
    else if (!passada && diffMin < 120) contagem = '<span class="tag tag-green tag-dot">Em ' + diffMin + ' min</span>';
    else if (passada) contagem = '<span class="tag tag-gray tag-dot">Realizada</span>';
    else contagem = '<span class="tag tag-green tag-dot">Agendada</span>';
    var presencaHtml = '';
    if (passada) {
      if (a.presenca === 'compareceu') presencaHtml = '<span style="font-size:10px;color:#065f46;background:#d1fae5;padding:1px 6px;border-radius:8px">✓</span>';
      else if (a.presenca === 'faltou') presencaHtml = '<span style="font-size:10px;color:#991b1b;background:#fee2e2;padding:1px 6px;border-radius:8px">✗</span>';
      else presencaHtml = '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;background:#f3f4f6;border:none;border-radius:6px;cursor:pointer;color:var(--muted)" onclick="event.stopPropagation();marcarPresenca('+a.id+',\'compareceu\')" title="Confirmar comparecimento">✓ confirmar</button>';
    }
    return '<div class="list-item" style="display:flex;align-items:center;gap:14px;opacity:'+(passada?.65:1)+'">'
      + '<div style="text-align:center;min-width:48px"><div style="font-size:15px;font-weight:600;color:'+(muitoProximo?'var(--red)':emBreve?'var(--amber)':'var(--ink)')+'">'+escHTML(a.time)+'</div><div style="font-size:11px;color:var(--muted)">'+a.duration+'min</div></div>'
      + '<div style="flex:1"><div class="patient-name">'+escHTML(a.patientName)+'</div><div class="patient-meta">'+escHTML(a.abordagem||'—')+'</div></div>'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'
        + presencaHtml
        + contagem
        + '<button class="btn btn-purple btn-sm" onclick="currentBriefingPatientIdx='+a.patientIdx+';navigate(\'briefing\')" title="Briefing IA pré-sessão">✦</button>'
        + (!passada ? '<button class="btn btn-primary btn-sm" onclick="currentSessionPatientIdx='+a.patientIdx+';navigate(\'sessao\')">▶ Entrar</button>' : '')
      + '</div>'
      + '</div>';
  }).join('');
}

function _renderDashInsights() {
  const cont = document.getElementById('dash-insights-list');
  if (!cont) return;
  var insights = [];

  // Temas emergentes na carteira
  var temas = {};
  patients.forEach(function(p){
    var notas = (p.prontuarioNotes||[]).map(function(n){ return (n.text||'').toLowerCase(); }).join(' ');
    ['ansiedade','luto','sono','trabalho','relacionamento','autoestima','procrastinação','família','burnout'].forEach(function(t){
      if (notas.includes(t)) { temas[t] = (temas[t]||0) + 1; }
    });
  });
  var temaTop = Object.entries(temas).sort((a,b)=>b[1]-a[1]).slice(0,1);
  if (temaTop.length && temaTop[0][1] >= 2) {
    insights.push({ icon:'🔁', text: temaTop[0][1]+' pacientes relataram <strong>'+temaTop[0][0]+'</strong> nas notas recentes — tema emergente na carteira.' });
  }

  // Paciente com boa evolução
  var evolucao = patients.filter(function(p){ return (p.progress||0) >= 70 && p.sessions >= 5; }).slice(0,1);
  if (evolucao.length) {
    insights.push({ icon:'📈', text: escHTML(evolucao[0].name.split(' ')[0])+' demonstrou <strong>evolução consistente</strong> ('+evolucao[0].progress+'% de progresso em '+evolucao[0].sessions+' sessões).' });
  }

  // Risco: paciente com humor baixo
  var risco = patients.filter(function(p){
    if (!p.moodHistory || p.moodHistory.length < 2) return false;
    var ult = p.moodHistory.slice(-2);
    return ult[ult.length-1] <= 4;
  }).slice(0,1);
  if (risco.length) {
    insights.push({ icon:'⚠', text: escHTML(risco[0].name.split(' ')[0])+' registrou humor <strong>abaixo de 5/10</strong> nas últimas avaliações. Considerar atenção especial na próxima sessão.' });
  }

  // Sem agendar próxima sessão
  var hojeIso = hojeISO();
  var semProxima = patients.filter(function(p){
    if (p.sessions <= 0 || p.status === 'Inativa') return false;
    var pidx = patients.indexOf(p);
    var temFuturo = appointments.some(function(a){ return a.patientIdx === pidx && a.status !== 'cancelada' && a.date >= hojeIso; });
    return !temFuturo;
  }).slice(0,1);
  if (semProxima.length) {
    insights.push({ icon:'🗓', text: escHTML(semProxima[0].name.split(' ')[0])+' tem '+semProxima[0].sessions+' sessões realizadas mas <strong>sem próxima sessão marcada</strong>. Risco de evasão.' });
  }

  // Inadimplência na carteira
  var inadimplentes = charges.filter(function(c){ return !c.deleted && c.status==='overdue'; });
  if (inadimplentes.length) {
    var totalInad = inadimplentes.reduce(function(s,c){ return s+(parseFloat(c.value)||0); },0);
    insights.push({ icon:'💸', text: '<strong>R$'+totalInad.toLocaleString('pt-BR')+' em atraso</strong> — '+inadimplentes.length+' cobrança'+( inadimplentes.length>1?'s':'')+' vencida'+( inadimplentes.length>1?'s':'')+' aguardando ação.' });
  }

  // Exercícios com baixa adesão
  var baixaAdesao = patients.filter(function(p){
    var exs = (p.exercises||[]).filter(function(e){ return (e.total||1) > 1; });
    if (!exs.length) return false;
    var media = exs.reduce(function(s,e){ return s + ((e.concluidos||0)/(e.total||1)); },0) / exs.length;
    return media < 0.3 && p.status !== 'Inativa';
  }).slice(0,1);
  if (baixaAdesao.length) {
    insights.push({ icon:'📋', text: escHTML(baixaAdesao[0].name.split(' ')[0])+' tem <strong>baixa adesão aos exercícios</strong> (menos de 30% concluídos). Vale revisar na próxima sessão.' });
  }

  // Paciente sem sessão há mais de 30 dias
  var hoje30 = new Date(); hoje30.setDate(hoje30.getDate()-30);
  var iso30 = localDateISO(hoje30);
  var longOut = patients.filter(function(p){
    if (p.status==='Inativa' || !p.sessions) return false;
    var pidx = patients.indexOf(p);
    var ultima = appointments.filter(function(a){ return a.patientIdx===pidx && a.status!=='cancelada'; }).sort(function(a,b){ return b.date<a.date?-1:1; })[0];
    return ultima && ultima.date < iso30;
  }).slice(0,1);
  if (longOut.length) {
    insights.push({ icon:'⏳', text: escHTML(longOut[0].name.split(' ')[0]+' está há mais de 30 dias sem sessão. Considere um contato de acompanhamento.') });
  }

  if (!insights.length) {
    insights.push({ icon:'✅', text: '<strong>Carteira saudável!</strong> Nenhum alerta clínico identificado esta semana.' });
  }

  cont.innerHTML = insights.map(function(ins){
    return '<div class="insight-item"><span class="insight-icon">'+ins.icon+'</span><span>'+ins.text+'</span></div>';
  }).join('');
}

function aprovarNota(btn, paciente) {
  const item = btn.closest('.list-item');
  if (item) {
    item.style.transition = 'opacity .3s';
    item.style.opacity = '0';
    setTimeout(() => {
      item.remove();
      showToast(`✓ Nota de ${paciente} aprovada e salva.`);
      // Atualiza contador
      const pendentes = document.querySelectorAll('#page-dashboard .list-item[style*="border-left:3px solid var(--amber)"]').length;
      const statVal = document.querySelector('#dashboard-stats .stat-value[style*="amber"]');
      if (statVal) statVal.textContent = pendentes || '0';
    }, 300);
  }
}

function checkFirstPatientBanner() {
  const banner = document.getElementById('first-patient-banner');
  const stats = document.getElementById('dashboard-stats');
  if (!banner) return;
  // Banner aparece enquanto o usuário não tiver cadastrado nenhum paciente real
  if (!temPacientesReais()) {
    banner.style.display = 'flex';
    if (stats) stats.style.display = 'none';
  } else {
    banner.style.display = 'none';
    if (stats) stats.style.display = '';
  }
}
