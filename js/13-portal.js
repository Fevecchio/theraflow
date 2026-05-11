// 13-portal.js — Portal do paciente (visão terapeuta + visão paciente)

/* ── PORTAL DO PACIENTE — LÓGICA ── */
// ── DICA DA SEMANA ──
function renderDicaPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  const texto = p.portalDica || 'Quando perceber um pensamento catastrófico, tente se perguntar: "Qual a evidência real de que isso vai acontecer?" — Isso ajuda a separar o medo da realidade.';
  const view = document.getElementById('portal-dica-view');
  if (view) view.textContent = texto;
}

function editarDicaPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  const texto = p?.portalDica || 'Quando perceber um pensamento catastrófico, tente se perguntar: "Qual a evidência real de que isso vai acontecer?" — Isso ajuda a separar o medo da realidade.';
  const input = document.getElementById('portal-dica-input');
  if (input) input.value = texto;
  document.getElementById('portal-dica-view').style.display = 'none';
  document.getElementById('portal-dica-edit').style.display = '';
  document.getElementById('portal-dica-meta').style.display = 'none';
  if (input) { input.focus(); input.select(); }
}

function cancelarDicaPortal() {
  document.getElementById('portal-dica-view').style.display = '';
  document.getElementById('portal-dica-edit').style.display = 'none';
  document.getElementById('portal-dica-meta').style.display = '';
}

function salvarDicaPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  const val = (document.getElementById('portal-dica-input').value || '').trim();
  if (!val) return;
  p.portalDica = val;
  salvarPacientes();
  cancelarDicaPortal();
  renderDicaPortal();
  showToast('Dica atualizada!');
}

// ── METAS TERAPÊUTICAS ──
function renderMetasPortal() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  const metas = p.portalMetas || [];
  const list = document.getElementById('portal-metas-list');
  const empty = document.getElementById('portal-metas-empty');
  if (!list) return;
  if (metas.length === 0) {
    list.innerHTML = '';
    if (empty) { empty.style.display = ''; list.appendChild(empty); }
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = metas.map(function(m) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:'+(m.done?'var(--sage-light)':'var(--bg)')+';border:1px solid '+(m.done?'rgba(74,124,89,.2)':'var(--border)')+';">'
      +'<input type="checkbox"'+(m.done?' checked':'')+' onchange="toggleMetaPortal('+m.id+',this)" style="width:16px;height:16px;accent-color:var(--sage);cursor:pointer;flex-shrink:0"/>'
      +'<span style="flex:1;font-size:13.5px;'+(m.done?'text-decoration:line-through;color:var(--muted)':'color:var(--ink)')+'">'+escHTML(m.text)+'</span>'
      +'<button onclick="excluirMetaPortal('+m.id+')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 6px;border-radius:5px" title="Remover">✕</button>'
      +'</div>';
  }).join('');
}

function adicionarMetaPortal() {
  const texto = prompt('Nova meta terapêutica:');
  if (!texto || !texto.trim()) return;
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  if (!p.portalMetas) p.portalMetas = [];
  p.portalMetas.push({ id: Date.now(), text: texto.trim(), done: false });
  salvarPacientes();
  renderMetasPortal();
  showToast('Meta adicionada!');
}

function toggleMetaPortal(id, cb) {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p?.portalMetas) return;
  const m = p.portalMetas.find(function(x){ return x.id === id; });
  if (m) { m.done = cb.checked; salvarPacientes(); }
  renderMetasPortal();
}

function excluirMetaPortal(id) {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p?.portalMetas) return;
  p.portalMetas = p.portalMetas.filter(function(x){ return x.id !== id; });
  salvarPacientes();
  renderMetasPortal();
  showToast('Meta removida.');
}

function tagLabel(tag) {
  const m = { tcc:'📋 TCC', relaxa:'🧘 Relaxamento', diario:'📊 Diário', exposicao:'🎯 Exposição', mindfulness:'🌱 Mindfulness', outro:'💡 Outro' };
  return m[tag] || tag;
}

function tagClass(tag) {
  const m = { tcc:'exercise-tag-tcc', relaxa:'exercise-tag-relaxa', diario:'exercise-tag-diario', exposicao:'exercise-tag-tcc', mindfulness:'exercise-tag-relaxa', outro:'exercise-tag-diario' };
  return m[tag] || 'exercise-tag-diario';
}

function renderExercises() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  const list = document.getElementById('exercise-list');
  if (!list) return;
  const exercises = p?.exercises || [];
  if (exercises.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px 16px;color:var(--muted)">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      <div style="font-size:13px;margin-bottom:12px">Nenhum exercício atribuído ainda.</div>
      <button class="btn btn-primary btn-sm" onclick="abrirModalExercicio()">+ Adicionar primeiro exercício</button>
    </div>`;
  } else {
    var hoje = hojeISO();
    list.innerHTML = exercises.map(function(ex) {
      var total = ex.total || 1;
      var concluidos = ex.concluidos || 0;
      var pct = Math.min(100, Math.round(concluidos / total * 100));
      var prazoStr = '';
      var prazoColor = 'var(--muted)';
      if (ex.prazo) {
        var diasRestantes = Math.ceil((new Date(ex.prazo) - new Date()) / 86400000);
        if (diasRestantes < 0) { prazoStr = '⚠ Prazo vencido'; prazoColor = 'var(--red)'; }
        else if (diasRestantes === 0) { prazoStr = '⏰ Vence hoje'; prazoColor = 'var(--amber)'; }
        else { prazoStr = '📅 ' + diasRestantes + 'd restantes'; }
      }
      var progressBar = total > 1
        ? '<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px"><span>' + concluidos + '/' + total + ' realizados</span><span>' + pct + '%</span></div>' +
          '<div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? 'var(--sage)' : 'var(--amber)') + ';border-radius:3px;transition:width .4s"></div></div></div>'
        : '';
      return '<div class="exercise-item ' + (ex.done || pct >= 100 ? 'completed' : '') + '" id="exercise-item-' + ex.id + '">' +
        '<div class="exercise-check" onclick="toggleExercise(' + ex.id + ')" style="cursor:pointer">✓</div>' +
        '<div style="flex:1">' +
          '<div class="exercise-title">' + escHTML(ex.title) + '</div>' +
          '<div class="exercise-meta">' + escHTML(ex.desc) + '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">' +
            '<span class="exercise-tag ' + tagClass(ex.tag) + '">' + tagLabel(ex.tag) + '</span>' +
            (prazoStr ? '<span style="font-size:11px;color:' + prazoColor + '">' + prazoStr + '</span>' : '') +
          '</div>' +
          progressBar +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:4px;margin-left:8px;flex-shrink:0">' +
          (total > 1 && pct < 100 ? '<button onclick="incrementarExercicio(' + ex.id + ')" title="Marcar realização" style="background:var(--sage-light);border:1px solid var(--sage);border-radius:6px;cursor:pointer;font-size:11px;padding:2px 7px;color:var(--sage);font-weight:600">+1</button>' : '') +
          '<button onclick="abrirModalExercicio(' + ex.id + ')" title="Editar" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;padding:2px 7px;color:var(--muted)">✎</button>' +
          '<button onclick="excluirExercicio(' + ex.id + ')" title="Remover" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;padding:2px 7px;color:var(--muted)">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  updateExerciseCounter();
}

function toggleExercise(exerciseId) {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p?.exercises) return;
  const ex = p.exercises.find(e => e.id === exerciseId);
  if (ex) { ex.done = !ex.done; salvarPacientes(); }
  renderExercises();
}

function incrementarExercicio(exerciseId) {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p?.exercises) return;
  const ex = p.exercises.find(e => e.id === exerciseId);
  if (!ex) return;
  ex.concluidos = Math.min((ex.concluidos || 0) + 1, ex.total || 1);
  if (ex.concluidos >= (ex.total || 1)) { ex.done = true; showToast('🎉 Exercício concluído! Parabéns, ' + (p.name||'').split(' ')[0] + '!'); }
  else showToast('✓ Realização registrada — ' + ex.concluidos + '/' + ex.total);
  salvarPacientes();
  renderExercises();
}

function abrirModalExercicio(exerciseId) {
  _editingExerciseId = exerciseId || null;
  if (exerciseId) {
    const p = patients[currentPortalPatientIdx] || patients[0];
    const ex = p?.exercises?.find(e => e.id === exerciseId);
    if (ex) {
      document.getElementById('modal-exercicio-titulo').textContent = 'Editar exercício';
      document.getElementById('ex-titulo').value = ex.title;
      document.getElementById('ex-desc').value = ex.desc;
      document.getElementById('ex-tag').value = ex.tag;
      document.getElementById('ex-prazo').value = ex.prazo || '';
      document.getElementById('ex-total').value = ex.total || 1;
    }
  } else {
    document.getElementById('modal-exercicio-titulo').textContent = 'Novo exercício';
    document.getElementById('ex-titulo').value = '';
    document.getElementById('ex-desc').value = '';
    document.getElementById('ex-tag').value = 'tcc';
    document.getElementById('ex-prazo').value = '';
    document.getElementById('ex-total').value = '1';
  }
  showModal('modal-exercicio');
}

function salvarExercicio() {
  const titulo = document.getElementById('ex-titulo')?.value.trim();
  if (!titulo) { showToast('⚠ Informe um título.'); return; }
  const desc  = document.getElementById('ex-desc')?.value.trim() || '';
  const tag   = document.getElementById('ex-tag')?.value || 'outro';
  const prazo = document.getElementById('ex-prazo')?.value || '';
  const total = parseInt(document.getElementById('ex-total')?.value) || 1;
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p) return;
  if (!p.exercises) p.exercises = [];
  if (_editingExerciseId) {
    const ex = p.exercises.find(e => e.id === _editingExerciseId);
    if (ex) { ex.title = titulo; ex.desc = desc; ex.tag = tag; ex.prazo = prazo; ex.total = total; }
    showToast('✓ Exercício atualizado no portal.');
  } else {
    p.exercises.push({ id: Date.now(), title: titulo, desc: desc, tag: tag, done: false, prazo: prazo, total: total, concluidos: 0 });
    showToast('✓ Exercício adicionado ao portal de ' + _firstName(p.name) + '.');
  }
  salvarPacientes();
  closeModal('modal-exercicio');
  _editingExerciseId = null;
  renderExercises();
}

function excluirExercicio(exerciseId) {
  const p = patients[currentPortalPatientIdx] || patients[0];
  if (!p?.exercises) return;
  p.exercises = p.exercises.filter(e => e.id !== exerciseId);
  salvarPacientes();
  renderExercises();
  showToast('Exercício removido.');
}

function selectMoodEmoji(el) {
  document.querySelectorAll('.mood-emoji').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  const val = parseInt(el.dataset.mood);
  document.getElementById('mood-slider').value = val;
}

function updateMoodSlider(val) {
  val = parseInt(val);
  document.querySelectorAll('.mood-emoji').forEach(e => {
    const m = parseInt(e.dataset.mood);
    e.classList.toggle('selected', m === [1,1,3,3,5,5,7,7,10,10,10][val-1] || m === val);
  });
  // Select closest emoji
  const emojis = document.querySelectorAll('.mood-emoji');
  const vals = [1,3,5,7,10];
  let closest = vals.reduce((a,b) => Math.abs(b-val) < Math.abs(a-val) ? b : a);
  emojis.forEach(e => e.classList.toggle('selected', parseInt(e.dataset.mood) === closest));
}

function saveMoodCheckin() {
  const sliderVal = parseInt(document.getElementById('mood-slider').value);
  // Atualiza moodHistory real do paciente atual no portal
  const _mp = patients[currentPortalPatientIdx] || patients[0];
  if (_mp) {
    if (!_mp.moodHistory) _mp.moodHistory = [];
    const _todayKey = hojeISO();
    if (_mp._moodLastDate === _todayKey && _mp.moodHistory.length > 0) {
      // já registrou hoje — substitui último valor
      _mp.moodHistory[_mp.moodHistory.length - 1] = sliderVal;
    } else {
      _mp.moodHistory.push(sliderVal);
      _mp._moodLastDate = _todayKey;
    }
    _mp.mood = sliderVal;
    // Atualiza trend: compara com valor anterior
    if (_mp.moodHistory.length >= 2) {
      const prev = _mp.moodHistory[_mp.moodHistory.length - 2];
      _mp.moodTrend = sliderVal > prev ? 'up' : sliderVal < prev ? 'down' : 'stable';
    }
    salvarPacientes();
    // Atualiza contador de check-ins no painel
    const statC = document.getElementById('portal-stat-checkins');
    if (statC) { const cnt = _mp.moodHistory.length; statC.textContent = cnt + ' check-in' + (cnt !== 1 ? 's' : ''); }
  } else {
    // fallback: array global
    moodHistory[moodHistory.length - 1] = sliderVal;
  }
  renderMoodHistory();
  const msg = document.getElementById('mood-saved-msg');
  msg.classList.add('show');
  const btn = document.getElementById('mood-save-btn');
  btn.textContent = '✓ Registrado';
  btn.style.background = '#3d6b4b';
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const lastReg = document.querySelector('#mood-save-btn + span');
  if (lastReg) lastReg.textContent = `Último registro: hoje às ${h}:${m}`;
  setTimeout(() => {
    msg.classList.remove('show');
    btn.textContent = 'Registrar humor';
    btn.style.background = '';
  }, 3000);
}

function renderMoodHistory() {
  const chart = document.getElementById('mood-history-chart');
  if (!chart) return;
  const p = patients[currentPortalPatientIdx] || patients[0];
  // Usa moodHistory do paciente se disponível, senão usa o array global
  const rawHistory = (p && p.moodHistory && p.moodHistory.length > 0) ? p.moodHistory : moodHistory;
  // Pega últimos 14 dias
  const data = rawHistory.slice(-14);
  const days = ['D','S','T','Q','Q','S','S'];
  const today = new Date();
  const W = 280, H = 70, PAD = 10;
  const validVals = data.filter(function(v){ return v !== null && v !== undefined; });
  const avg = validVals.length ? (validVals.reduce(function(s,v){ return s+v; },0)/validVals.length).toFixed(1) : '—';

  // Pontos SVG
  var points = [];
  data.forEach(function(val, i) {
    if (val === null || val === undefined) return;
    var x = PAD + (i / 13) * (W - PAD*2);
    var y = H - PAD - ((val / 10) * (H - PAD*2));
    points.push({ x: x, y: y, val: val, i: i });
  });

  // Linha de tendência
  var polyline = points.map(function(pt){ return pt.x + ',' + pt.y; }).join(' ');
  // Área de preenchimento
  var areaPath = points.length >= 2
    ? 'M'+points[0].x+','+points[0].y+' '+points.slice(1).map(function(pt){ return 'L'+pt.x+','+pt.y; }).join(' ')+'L'+points[points.length-1].x+','+(H-PAD)+' L'+points[0].x+','+(H-PAD)+' Z'
    : '';

  // Labels de dia (a cada 2)
  var labelsHtml = data.map(function(val, i) {
    if (i % 2 !== 0) return '<div style="flex:1"></div>';
    var d2 = new Date(today); d2.setDate(d2.getDate() - (data.length - 1 - i));
    var lbl = days[d2.getDay()];
    return '<div style="flex:1;text-align:center;font-size:10px;color:var(--muted)">'+lbl+'</div>';
  }).join('');

  // Tooltip pontos SVG
  var circlesHtml = points.map(function(pt){
    var col = getMoodColor(pt.val);
    return '<circle cx="'+pt.x+'" cy="'+pt.y+'" r="3" fill="'+col+'" stroke="#fff" stroke-width="1.5"><title>'+pt.val+'/10</title></circle>';
  }).join('');

  // Referências horizontais
  var refLines = [3,5,7].map(function(v){
    var y = H - PAD - ((v/10)*(H-PAD*2));
    return '<line x1="'+PAD+'" y1="'+y+'" x2="'+(W-PAD)+'" y2="'+y+'" stroke="#e0e3e0" stroke-dasharray="3,3" stroke-width="1"/>'
      + '<text x="'+(W-PAD+2)+'" y="'+(y+3)+'" font-size="8" fill="#bbb">'+v+'</text>';
  }).join('');

  chart.innerHTML =
    '<div style="width:100%">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<span style="font-size:12px;color:var(--muted)">Últimos 14 dias</span>'
      + (validVals.length ? '<span style="font-size:12px;font-weight:600;color:'+getMoodColor(parseFloat(avg))+'">Média: '+avg+'/10</span>' : '<span style="font-size:12px;color:var(--muted)">Sem registros</span>')
    + '</div>'
    + '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:70px;overflow:visible">'
      + refLines
      + (areaPath ? '<path d="'+areaPath+'" fill="rgba(74,124,89,.08)"/>' : '')
      + (polyline.includes(',') ? '<polyline points="'+polyline+'" fill="none" stroke="#4a7c59" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' : '')
      + circlesHtml
    + '</svg>'
    + '<div style="display:flex;margin-top:4px">'+labelsHtml+'</div>'
    + '</div>';
}

function getMoodColor(val) {
  if (val <= 2) return '#c0392b';
  if (val <= 4) return '#c97d2e';
  if (val <= 5) return '#dbb94e';
  if (val <= 7) return '#8fb89c';
  return '#4a7c59';
}

function updateExerciseCounter() {
  const p = patients[currentPortalPatientIdx] || patients[0];
  const total = p?.exercises?.length || 0;
  const done  = p?.exercises?.filter(e => e.done).length || 0;
  const counter = document.getElementById('exercise-counter');
  if (counter) counter.textContent = total > 0 ? `${done} de ${total} concluídos` : 'Nenhum exercício';
}



// ── DIÁRIO DA SEMANA ─────────────────────────────────────────────────
function switchDiaryTab(tab) {
  const isLivre = tab === 'livre';
  document.getElementById('diary-panel-livre').style.display = isLivre ? '' : 'none';
  document.getElementById('diary-panel-tcc').style.display = isLivre ? 'none' : '';
  const btnLivre = document.getElementById('diary-tab-livre');
  const btnTcc = document.getElementById('diary-tab-tcc');
  btnLivre.style.background = isLivre ? 'var(--white)' : 'transparent';
  btnLivre.style.color = isLivre ? 'var(--sage)' : 'var(--muted)';
  btnLivre.style.borderBottom = isLivre ? '2px solid var(--sage)' : '2px solid transparent';
  btnLivre.style.fontWeight = isLivre ? '600' : '500';
  btnTcc.style.background = !isLivre ? 'var(--white)' : 'transparent';
  btnTcc.style.color = !isLivre ? 'var(--purple)' : 'var(--muted)';
  btnTcc.style.borderBottom = !isLivre ? '2px solid var(--purple)' : '2px solid transparent';
  btnTcc.style.fontWeight = !isLivre ? '600' : '500';
}

function saveDiaryLivre() {
  const ta = document.getElementById('diary-livre-text');
  const text = ta.value.trim();
  if (!text) { showToast('Escreva algo antes de salvar.'); return; }
  const now = new Date();
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dateStr = days[now.getDay()] + ', ' + String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + ' · ' +
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const list = document.getElementById('diary-livre-list');
  const div = document.createElement('div');
  div.className = 'fade-in';
  div.style.cssText = 'background:var(--bg);border-radius:8px;padding:12px 14px;border-left:3px solid var(--sage)';
  var therapistFirst = (tfUserData.nome || 'Ana').split(' ')[0];
  div.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:5px;display:flex;justify-content:space-between"><span>'+dateStr+'</span><span style="color:var(--sage);font-weight:600">✓ '+therapistFirst+' verá na sessão</span></div><div style="font-size:13px;color:var(--ink-soft);line-height:1.6">'+text+'</div>';
  // Remove empty state se existir
  var emptyEl = list.querySelector('div[style*="Nenhum registro"]');
  if (emptyEl) emptyEl.remove();
  list.insertBefore(div, list.firstChild);
  // Persistir no paciente
  var pPortal = patients[currentPortalPatientIdx];
  if (pPortal) {
    if (!pPortal.diary) pPortal.diary = [];
    pPortal.diary.unshift({ date: dateStr, text: text });
    salvarPacientes();
  }
  ta.value = '';
  updateDiaryCount();
  showToast('Registro salvo. ' + (tfUserData.nome || 'Ana').split(' ')[0] + ' verá na próxima sessão. 🌿');
}

let tccEmocaoSelecionada = '';
function selectEmoTCC(btn, emocao) {
  document.querySelectorAll('.tcc-emocao-btn').forEach(b => {
    b.style.background = '#fff'; b.style.color = 'var(--ink)'; b.style.borderColor = 'var(--border)';
  });
  btn.style.background = 'var(--purple-light)'; btn.style.color = 'var(--purple)'; btn.style.borderColor = 'var(--purple)';
  tccEmocaoSelecionada = emocao;
}

function saveDiaryTCC() {
  const sit = document.getElementById('tcc-situacao').value.trim();
  const pen = document.getElementById('tcc-pensamento').value.trim();
  const alt = document.getElementById('tcc-alternativo').value.trim();
  const intVal = document.getElementById('tcc-intensidade-val').textContent;
  if (!sit || !pen) { showToast('Preencha ao menos a situação e o pensamento.'); return; }
  const now = new Date();
  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dateStr = days[now.getDay()] + ', ' + String(now.getDate()).padStart(2,'0') + '/' + String(now.getMonth()+1).padStart(2,'0') + ' · ' +
    String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const emoBadge = tccEmocaoSelecionada
    ? '<span style="background:var(--purple-light);color:var(--purple);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">'+tccEmocaoSelecionada+' · '+intVal+'</span>'
    : '';
  const altBlock = alt
    ? '<div style="font-size:12px;color:var(--sage);background:var(--sage-light);border-radius:6px;padding:8px 10px"><span style="font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.4px;opacity:.7">Alternativa</span><br>'+alt+'</div>'
    : '';
  const div = document.createElement('div');
  div.className = 'fade-in';
  div.style.cssText = 'background:var(--bg);border-radius:10px;padding:14px 16px;border-left:3px solid var(--purple)';
  const _nomeT2 = (tfUserData?.nome || '').split(' ')[0] || 'sua terapeuta';
  div.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px;display:flex;justify-content:space-between"><span>'+dateStr+'</span><span class="therapist-label-first" style="color:var(--sage);font-weight:600">✓ '+_nomeT2+' verá na sessão</span></div><div style="display:flex;flex-direction:column;gap:6px"><div style="font-size:12px"><span style="font-weight:700;color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.4px">Situação</span><br><span style="color:var(--ink-soft)">'+sit+'</span></div><div style="font-size:12px"><span style="font-weight:700;color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:.4px">Pensamento automático</span><br><span style="color:var(--ink-soft)">"'+pen+'"</span></div>'+(emoBadge?'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+emoBadge+'</div>':'')+altBlock+'</div>';
  document.getElementById('diary-tcc-list').insertBefore(div, document.getElementById('diary-tcc-list').firstChild);
  ['tcc-situacao','tcc-pensamento','tcc-alternativo'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.tcc-emocao-btn').forEach(b => { b.style.background='#fff'; b.style.color='var(--ink)'; b.style.borderColor='var(--border)'; });
  tccEmocaoSelecionada = '';
  updateDiaryCount();
  showToast('Registro TCC salvo. 🧠');
}

function updateDiaryCount() {
  const livreCount = document.getElementById('diary-livre-list').children.length;
  const tccCount = document.getElementById('diary-tcc-list').children.length;
  const el = document.getElementById('diary-count');
  if (el) el.textContent = (livreCount + tccCount) + ' registros';
}

function proximaSessaoDate() {
  const now = new Date();
  const nowIso = localDateISO(now);
  const p = patients[currentPortalPatientIdx] || patients[0];
  const pidx = currentPortalPatientIdx;

  // 1. Busca próximo appointment real deste paciente
  if (typeof appointments !== 'undefined' && appointments.length) {
    var futuros = appointments.filter(function(a) {
      return a.patientIdx === pidx && a.status !== 'cancelada' && a.date >= nowIso;
    }).sort(function(a,b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : 1; });
    if (futuros.length) {
      var ap = futuros[0];
      var parts = ap.date.split('-');
      var timeParts = (ap.time || '09:00').split(':');
      var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]), parseInt(timeParts[0]), parseInt(timeParts[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. Fallback: p.next (formato DD/MM ou DD/MM/AAAA)
  if (p && p.next && p.next !== '—') {
    const parts = p.next.split('/');
    if (parts.length >= 2) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parts.length >= 3 ? parseInt(parts[2]) : now.getFullYear();
      const d = new Date(year, month, day, 9, 0, 0, 0);
      if (d >= now && !isNaN(d.getTime())) return d;
    }
  }

  // 3. Fallback: próxima terça-feira às 09h
  const target = new Date(now);
  let daysUntilTer = (2 - now.getDay() + 7) % 7;
  if (daysUntilTer === 0 && now.getHours() >= 9) daysUntilTer = 7;
  target.setDate(now.getDate() + daysUntilTer);
  target.setHours(9, 0, 0, 0);
  return target;
}

function atualizarProximaSessaoPortal() {
  const target = proximaSessaoDate();
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const hora = String(target.getHours()).padStart(2,'0') + ':' + String(target.getMinutes()).padStart(2,'0');
  const label = `${dias[target.getDay()]}, ${String(target.getDate()).padStart(2,'0')}/${String(target.getMonth()+1).padStart(2,'0')} às ${hora}`;
  var labelEl = document.getElementById('portal-next-session-label');
  if (labelEl) labelEl.innerHTML = 'Próxima sessão: <strong>' + label + '</strong>';
  else { var span = document.querySelector('.portal-next-session strong'); if (span) span.textContent = label; }
}

function updatePortalCountdown() {
  const el = document.getElementById('portal-countdown');
  if (!el) return;
  const now = new Date();
  const target = proximaSessaoDate();
  const diff = target - now;
  if (diff <= 0) {
    el.textContent = 'Agora!';
    el.style.color = '#fff';
    return;
  }
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  if (days > 0) {
    el.textContent = `em ${days}d ${hours}h`;
  } else if (hours > 0) {
    el.textContent = `em ${hours}h ${mins}min`;
  } else {
    el.textContent = `em ${mins}min`;
  }
}

// ── PERFIL ──
const abordagemCalibration = {
  tcc: {
    notas: 'Estrutura S-O-A-P com foco em pensamentos automáticos, distorções cognitivas e tarefas de casa.',
    briefing: 'Perguntas sobre tarefas de casa, evolução de sintomas mensuráveis e distorções identificadas.',
    supervisao: 'Rastreia evolução de sintomas com métricas, adesão às tarefas e consistência do plano terapêutico.',
    plano: 'Metas SMART com indicadores mensuráveis e prazo estimado de conclusão.',
  },
  psicanalise: {
    notas: 'Notas narrativas com foco em transferência, resistência, associações livres e material inconsciente.',
    briefing: 'Perguntas sobre sonhos, associações, repetições e dinâmica transferencial da última sessão.',
    supervisao: 'Acompanha temas inconscientes recorrentes, padrões de resistência e movimentos transferenciais.',
    plano: 'Objetivos processuais sem metas numéricas — foco na qualidade do processo terapêutico.',
  },
  sistemica: {
    notas: 'Notas com mapeamento relacional: dinâmicas familiares, padrões de comunicação e posição no sistema.',
    briefing: 'Perguntas sobre mudanças no sistema familiar, comunicação recente e padrões interacionais.',
    supervisao: 'Monitora dinâmicas do sistema, coalização, triangulações e padrões intergeracionais.',
    plano: 'Objetivos relacionais com foco em mudanças no sistema e novos padrões de comunicação.',
  },
  humanista: {
    notas: 'Notas centradas na experiência presente, qualidade do contato, autenticidade e awareness.',
    briefing: 'Perguntas sobre experiências significativas recentes, contato consigo mesmo e presença.',
    supervisao: 'Observa qualidade da relação terapêutica, presença, contato e crescimento da consciência.',
    plano: 'Objetivos de crescimento pessoal e autenticidade, sem estrutura rígida de metas.',
  },
  act: {
    notas: 'Notas com foco em flexibilidade psicológica, valores, mindfulness e padrões de evitação.',
    briefing: 'Perguntas sobre práticas de mindfulness, desfusão cognitiva e ações comprometidas com valores.',
    supervisao: 'Rastreia flexibilidade psicológica, evitação experiencial e alinhamento com valores do paciente.',
    plano: 'Metas baseadas em valores e ações comprometidas, com foco em qualidade de vida.',
  },
};

let profileAbordagem = 'tcc';

function toggleApiKeyVisibility() {
  const inp = document.getElementById('perfil-api-key');
  const btn = document.getElementById('btn-toggle-apikey');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function getApiKey() {
  try {
    const acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    return acc.claude_api_key || '';
  } catch(e) { return ''; }
}

function loadApiKeyToForm() {
  const key = getApiKey();
  const inp = document.getElementById('perfil-api-key');
  if (inp && key) {
    inp.value = key;
    showApiKeyStatus(true);
  }
}


// ── App do paciente (visão paciente) ──
/* ── APP DO PACIENTE (área do paciente) ── */
function renderPatientApp(idx, pacs) {
  var src = pacs && pacs.length ? pacs : (typeof patients !== 'undefined' ? patients : []);
  var p = src[idx];
  if (!p) return;

  var firstName = (p.name || 'Paciente').split(' ')[0];
  document.getElementById('pac-app-name').textContent = firstName;

  var body = document.getElementById('pac-app-body');
  if (!body) return;

  // Próxima sessão
  var proximaStr = p.next && p.next !== '—' ? p.next : null;
  var sessionLink = p.sessionLink || null;
  var proximaHtml = '<div class="patient-next-session" style="flex-direction:column;align-items:flex-start;gap:10px">'
    + '<div style="display:flex;align-items:center;gap:8px;width:100%">'
      + '<span>🗓</span>'
      + (proximaStr
          ? '<span>Próxima sessão: <strong>' + escHTML(proximaStr) + '</strong></span>'
          : '<span style="opacity:.8">Próxima sessão não agendada</span>')
    + '</div>'
    + (proximaStr
        ? sessionLink
          ? '<a href="' + escHTML(sessionLink) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:#fff;color:var(--sage);font-weight:700;font-size:13.5px;padding:9px 18px;border-radius:10px;text-decoration:none;transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.12)" onmouseover="this.style.background=\'#f0f7f3\'" onmouseout="this.style.background=\'#fff\'">▶ Entrar na sessão</a>'
          : '<div style="font-size:12px;opacity:.7;font-style:italic">Link da sala será disponibilizado pelo seu terapeuta</div>'
        : '')
    // Botão solicitar nova sessão
    + '<div id="pac-solicitar-wrap" style="margin-top:4px">'
      + '<button onclick="pacToggleSolicitarSessao()" style="background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.4);color:inherit;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px">📅 Solicitar nova sessão</button>'
      + '<div id="pac-solicitar-form" style="display:none;margin-top:10px;background:rgba(255,255,255,.15);border-radius:10px;padding:12px">'
        + '<textarea id="pac-solicitar-msg" placeholder="Horários de preferência ou observações (opcional)…" style="width:100%;min-height:64px;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit;resize:none;outline:none;background:rgba(255,255,255,.2);color:inherit;line-height:1.5;box-sizing:border-box"></textarea>'
        + '<button onclick="pacEnviarSolicitacaoSessao(\''+escHTML(p.name)+'\')" style="margin-top:8px;width:100%;padding:10px;background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.5);color:inherit;border-radius:8px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit">📲 Enviar via WhatsApp</button>'
      + '</div>'
    + '</div>'
    + '</div>';

  // Mensagem do terapeuta
  var msgTexto = p.portalMensagem || 'Boa semana! Lembre-se de praticar os exercícios que combinamos. 🌿';
  var msgBlock = '<div class="patient-msg-card"><div class="patient-msg-label">✉️ Mensagem da sua terapeuta</div><div class="patient-msg-text">' + escHTML(msgTexto) + '</div></div>';

  // Exercícios
  var exercicios = p.exercises || [];
  var exHtml = exercicios.length === 0
    ? '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0">Nenhum exercício atribuído ainda.</div>'
    : exercicios.map(function(ex) {
        return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
          + '<div onclick="pacToggleEx('+idx+','+ex.id+',\''+escHTML(p.name)+'\')" style="width:22px;height:22px;border-radius:6px;border:2px solid '+(ex.done?'var(--sage)':'var(--border)')
          +';background:'+(ex.done?'var(--sage)':'#fff')+';cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;transition:all .2s">'+(ex.done?'✓':'')+'</div>'
          + '<div style="flex:1"><div style="font-size:14px;font-weight:500;'+(ex.done?'text-decoration:line-through;color:var(--muted)':'color:var(--ink)')+'">'+escHTML(ex.title)+'</div>'
          + '<div style="font-size:12.5px;color:var(--muted);margin-top:3px;line-height:1.5">'+escHTML(ex.desc)+'</div></div>'
          + '</div>';
      }).join('');

  // Metas
  var metas = p.portalMetas || [];
  var metasHtml = metas.length === 0
    ? '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0">Nenhuma meta definida ainda.</div>'
    : metas.map(function(m) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<input type="checkbox"'+(m.done?' checked':'')+' onchange="pacToggleMeta('+idx+','+m.id+',this,\''+escHTML(p.name)+'\')" style="width:17px;height:17px;accent-color:var(--sage);cursor:pointer;flex-shrink:0"/>'
          + '<span style="font-size:13.5px;'+(m.done?'text-decoration:line-through;color:var(--muted)':'color:var(--ink)')+'">'+escHTML(m.text)+'</span>'
          + '</div>';
      }).join('');

  // Dica
  var dica = p.portalDica || 'Quando perceber um pensamento catastrófico, tente se perguntar: "Qual a evidência real de que isso vai acontecer?"';

  // Progresso
  var pct = p.progress || 0;
  var circunf = 238.76;
  var offset = (circunf * (1 - pct / 100)).toFixed(2);
  var exDone = exercicios.filter(function(e){ return e.done; }).length;

  // Diário — abordagem adaptada
  var diarioHtml = renderPatientDiario(p, idx);

  // ── Streak ──
  var streakHtml = (p.checkInStreak||0) >= 2
    ? '<div class="streak-bar">'
        + '<div style="font-size:32px;line-height:1">🔥</div>'
        + '<div>'
          + '<div style="font-size:26px;font-weight:700;color:#c97d2e;line-height:1">'+(p.checkInStreak)+'</div>'
          + '<div style="font-size:12px;color:var(--muted);margin-top:2px">dias seguidos de check-in — não quebre a sequência!</div>'
        + '</div>'
      + '</div>'
    : '';

  // ── Conquistas ──
  var badgesHtml = '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">🏅 Minhas conquistas</div></div>'
    + '<div class="patient-section-body"><div class="badges-grid">'
      + BADGES_DEF.map(function(b){
          var earned = b.cond(p);
          return '<div class="badge-card '+(earned?'earned':'locked')+'">'
            + '<div style="font-size:26px;line-height:1">'+b.icon+'</div>'
            + '<div style="font-size:11px;font-weight:600;color:var(--ink);line-height:1.3;margin-top:2px">'+b.name+'</div>'
            + '<div style="font-size:10px;color:var(--muted)">'+b.desc+'</div>'
          + '</div>';
        }).join('')
    + '</div></div></div>';

  // ── Materiais ──
  var mats = p.materials || [];
  var readMats = p.readMaterials || [];
  var matsHtml = mats.length === 0 ? '' : '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">📚 Materiais da sua terapeuta <span style="margin-left:auto;font-size:11px;font-weight:400;color:var(--muted)">'+readMats.length+'/'+mats.length+' lidos</span></div></div>'
    + '<div class="patient-section-body" style="display:flex;flex-direction:column;gap:10px">'
      + mats.map(function(m){
          var lido = readMats.indexOf(m.id) >= 0;
          var tIcon = m.tipo==='livro'?'📖':m.tipo==='artigo'?'📄':m.tipo==='video'?'🎬':m.tipo==='podcast'?'🎙':'🔗';
          return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
            + '<div style="font-size:22px;line-height:1;flex-shrink:0;margin-top:1px">'+tIcon+'</div>'
            + '<div style="flex:1;min-width:0">'
              + (m.url ? '<a href="'+escHTML(m.url)+'" target="_blank" rel="noopener" style="font-size:13.5px;font-weight:500;color:var(--sage);text-decoration:none;'+(lido?'opacity:.55;text-decoration:line-through':'')+'">'+escHTML(m.titulo)+'</a>'
                       : '<div style="font-size:13.5px;font-weight:500;color:var(--ink);'+(lido?'opacity:.55;text-decoration:line-through':'')+'">'+escHTML(m.titulo)+'</div>')
              + (m.desc ? '<div style="font-size:12px;color:var(--muted);margin-top:3px">'+escHTML(m.desc)+'</div>' : '')
              + '<div style="margin-top:6px"><button onclick="pacMarcarMaterialLido('+idx+','+m.id+')" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid '+(lido?'var(--sage)':'var(--border)')+';background:'+(lido?'#eaf6f0':'transparent')+';color:'+(lido?'var(--sage)':'var(--muted)')+';cursor:pointer;font-family:inherit">'+(lido?'✓ Lido':'Marcar como lido')+'</button></div>'
            + '</div>'
          + '</div>';
        }).join('')
    + '</div></div>';

  // ── Técnica do dia ──
  var tecnica = _getTecnicaDia(p.abordagem || 'default');
  var tecnicaHtml = '<div style="background:linear-gradient(135deg,#edf7f1,#f4fbf7);border:1px solid rgba(74,124,89,.2);border-radius:14px;padding:18px 20px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">⚡ Técnica do dia</div>'
    + '<div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:8px">'+tecnica.icone+' '+escHTML(tecnica.titulo)+'</div>'
    + '<div style="font-size:13.5px;color:var(--ink-soft);line-height:1.7">'+escHTML(tecnica.instrucao)+'</div>'
  + '</div>';

  // ── Nota pré-sessão ──
  var notaPreHtml = '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">💬 Nota para a próxima sessão</div></div>'
    + '<div class="patient-section-body">'
      + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">O que você quer lembrar de trazer para a próxima sessão? Sua terapeuta verá antes de vocês se encontrarem.</div>'
      + '<textarea id="pac-nota-pre-text" placeholder="Escreva aqui…" style="width:100%;min-height:80px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">'+escHTML(p.portalNota||'')+'</textarea>'
      + '<div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:8px">'
        + '<div id="pac-nota-saved" style="display:none;font-size:12px;color:var(--sage);font-weight:600">✓ Salvo!</div>'
        + '<button onclick="pacSalvarNotaPreSessao('+idx+')" class="btn btn-primary btn-sm">Salvar nota</button>'
      + '</div>'
    + '</div>'
  + '</div>';

  // ── Notificações ──
  var notifPermStatus = (typeof Notification !== 'undefined') ? Notification.permission : 'not-supported';
  var notifHora = p.portalNotifHour || '20';
  var notifHtml = '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px 18px">'
    + '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:10px">🔔 Lembrete de check-in diário</div>'
    + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<select id="pac-notif-hora" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;background:#fff">'
        + [7,8,9,12,18,19,20,21,22].map(function(h){ return '<option value="'+h+'"'+(h===parseInt(notifHora)?' selected':'')+'>'+h+'h</option>'; }).join('')
      + '</select>'
      + '<button onclick="pacAtivarNotificacoes('+idx+')" class="btn btn-secondary btn-sm">Ativar lembrete</button>'
      + '<div id="pac-notif-status" style="font-size:12px;color:var(--muted);flex:1">'
        + (notifPermStatus === 'granted' ? '✓ Notificações ativas' : 'Receba um toque diário para registrar seu humor')
      + '</div>'
    + '</div>'
  + '</div>';

  // ── Anamnese (portal — só aparece quando terapeuta ativar) ──
  var anamnesePortalHtml = '';
  if (p.portalAnamneseAtiva) {
    var _ana = p.anamnese || {};
    anamnesePortalHtml = '<div class="patient-section-card" id="pac-anamnese-secao">'
      + '<div class="patient-section-header"><div class="patient-section-title">📋 Formulário de anamnese</div></div>'
      + '<div class="patient-section-body">'
        + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:16px;line-height:1.6">Sua terapeuta precisa de algumas informações antes do início do processo. Preencha com calma — tudo é confidencial.</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">O que te traz para a terapia?</label>'
          + '<textarea id="pac-ana-queixa" rows="3" placeholder="Descreva com suas palavras…" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">' + escHTML(_ana.queixaPrincipal||'') + '</textarea>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Há quanto tempo você sente isso?</label>'
          + '<input id="pac-ana-inicio" type="text" placeholder="Ex: alguns meses, depois de uma situação difícil…" value="' + escHTML(_ana.inicioSintomas||'') + '" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"/>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">O que você espera alcançar com a terapia?</label>'
          + '<textarea id="pac-ana-objetivos" rows="2" placeholder="Seus objetivos e expectativas…" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">' + escHTML(_ana.objetivosTerapia||'') + '</textarea>'
        + '</div>'

        + '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">'
          + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px">'
            + '<input type="checkbox" id="pac-ana-terapia-ant"' + (_ana.terapiaAnterior?' checked':'') + ' style="accent-color:var(--sage);width:16px;height:16px"/> Já fiz terapia antes</label>'
          + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px">'
            + '<input type="checkbox" id="pac-ana-psiquiatra"' + (_ana.psiquiatra?' checked':'') + ' style="accent-color:var(--sage);width:16px;height:16px"/> Acompanho psiquiatra atualmente</label>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Terapia anterior (se sim): abordagem, tempo, motivo de encerramento</label>'
          + '<textarea id="pac-ana-terapia-ant-desc" rows="2" placeholder="Opcional…" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">' + escHTML(_ana.terapiaAnteriorDesc||'') + '</textarea>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Psiquiatra (se sim): nome, diagnóstico, medicação</label>'
          + '<textarea id="pac-ana-psiquiatra-desc" rows="2" placeholder="Opcional…" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">' + escHTML(_ana.psiquiatraDesc||'') + '</textarea>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Medicações em uso</label>'
          + '<input id="pac-ana-medicacoes" type="text" placeholder="Nome, dose (ou nenhuma)" value="' + escHTML(_ana.medicacoes||'') + '" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"/>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:14px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Condições de saúde / doenças</label>'
          + '<input id="pac-ana-doencas" type="text" placeholder="Ex: hipertensão, diabetes (ou nenhuma)" value="' + escHTML(_ana.doencasCronicas||'') + '" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"/>'
        + '</div>'

        + '<div class="form-group" style="margin-bottom:20px">'
          + '<label style="font-size:12px;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:6px">Histórico familiar de saúde mental</label>'
          + '<textarea id="pac-ana-hist-familiar" rows="2" placeholder="Familiar com diagnóstico ou tratamento? (opcional)" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">' + escHTML(_ana.historicoFamiliarSaudeMental||'') + '</textarea>'
        + '</div>'

        + '<button onclick="pacSalvarAnamnese(' + idx + ')" style="width:100%;padding:12px;background:var(--sage);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Enviar para minha terapeuta</button>'
      + '</div>'
    + '</div>';
  }

  // ── Insights de humor ──
  var moodInsights = _getMoodInsights(p);

  body.innerHTML =
    // Banner
    '<div class="patient-banner">'
      + '<div class="patient-banner-greeting">Olá, ' + escHTML(firstName) + ' 🌿</div>'
      + '<div class="patient-banner-sub">Como você está se sentindo hoje?</div>'
      + proximaHtml
      + '<button onclick="pacEmergencia()" style="margin-top:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);color:rgba(255,255,255,.82);padding:8px 14px;border-radius:8px;font-size:12.5px;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;width:100%;justify-content:center">🆘 Preciso de apoio agora</button>'
    + '</div>'

    // Streak
    + streakHtml

    // Mensagem
    + msgBlock

    // Check-in de humor
    + '<div class="patient-section-card">'
      + '<div class="patient-section-header"><div class="patient-section-title">😊 Check-in de humor</div></div>'
      + '<div class="patient-section-body">'
        + (function() {
            var mh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; }).slice(-12);
            if (mh.length < 2) return '';
            var W = 220, H = 48, pad = 6;
            var minV = 1, maxV = 10;
            var stepX = (W - pad*2) / (mh.length - 1);
            var pts = mh.map(function(v, i) {
              var x = pad + i * stepX;
              var y = H - pad - ((v - minV) / (maxV - minV)) * (H - pad*2);
              return x.toFixed(1) + ',' + y.toFixed(1);
            }).join(' ');
            var trend = mh[mh.length-1] - mh[0];
            var cor = trend > 0.5 ? '#4a7c59' : trend < -0.5 ? '#c0392b' : '#c97d2e';
            var ultimo = mh[mh.length-1];
            return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;background:var(--bg);border-radius:10px;padding:10px 12px">'
              + '<svg width="'+W+'" height="'+H+'" style="flex-shrink:0"><polyline points="'+pts+'" fill="none" stroke="'+cor+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>'
              + '<div style="flex-shrink:0;text-align:center"><div style="font-size:22px;font-weight:700;color:'+cor+'">'+ultimo+'</div><div style="font-size:10px;color:var(--muted)">último</div></div>'
              + '</div>';
          })()
        + moodInsights
        + '<div style="font-size:13px;color:var(--muted);margin-bottom:14px">Como você está neste momento?</div>'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:14px" id="pac-mood-emojis">'
          + [['😢','1','Muito mal'],['😟','3','Mal'],['😐','5','Neutro'],['🙂','7','Bem'],['😄','10','Muito bem']].map(function(e){
              return '<div style="text-align:center;cursor:pointer" onclick="pacSelectMood('+e[1]+',this)">'
                + '<div style="font-size:28px;transition:transform .15s" class="pac-mood-em">'+e[0]+'</div>'
                + '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+e[2]+'</div></div>';
            }).join('')
        + '</div>'
        + '<input type="range" id="pac-mood-slider" min="1" max="10" value="5" style="-webkit-appearance:none;width:100%;height:6px;background:linear-gradient(90deg,var(--sage) 50%,#e8f0eb 50%);border-radius:10px;outline:none;margin-bottom:12px" oninput="pacMoodSliderInput(this.value)"/>'
        + '<textarea id="pac-mood-note" placeholder="O que está passando pela sua cabeça? (opcional)" style="width:100%;min-height:70px;border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"></textarea>'
        + '<button onclick="pacSalvarMood('+idx+')" style="width:100%;margin-top:12px;padding:11px;background:var(--sage);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Registrar humor</button>'
        + '<div id="pac-mood-saved" style="display:none;text-align:center;color:var(--sage);font-size:13px;font-weight:600;margin-top:10px">✓ Registrado! Sua terapeuta verá na próxima sessão.</div>'
      + '</div>'
    + '</div>'

    // Conquistas
    + badgesHtml

    // Exercícios
    + '<div class="patient-section-card">'
      + '<div class="patient-section-header"><div class="patient-section-title">📋 Exercícios entre sessões <span style="margin-left:auto;font-size:12px;color:var(--muted);font-weight:400" id="pac-ex-counter">'+exDone+' de '+exercicios.length+' concluídos</span></div></div>'
      + '<div class="patient-section-body" id="pac-ex-list">'+exHtml+'</div>'
    + '</div>'

    // Metas
    + (metas.length > 0
      ? '<div class="patient-section-card">'
          + '<div class="patient-section-header"><div class="patient-section-title">🎯 Minhas metas</div></div>'
          + '<div class="patient-section-body" id="pac-metas-list">'+metasHtml+'</div>'
        + '</div>'
      : '')

    // Materiais
    + matsHtml

    // Diário
    + diarioHtml

    // Histórico de sessões
    + (function() {
        var notas = (p.prontuarioNotes || []).slice().reverse().slice(0, 5);
        var itens = notas.length === 0
          ? '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0">Suas notas de sessão aparecerão aqui.</div>'
          : notas.map(function(n, ni) {
              var resumo = (n.text || '').slice(0, 120) + ((n.text||'').length > 120 ? '…' : '');
              var id = 'pac-hist-'+ni;
              return '<div style="border-bottom:1px solid var(--border);padding:12px 0">'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
                  + '<div style="width:7px;height:7px;border-radius:50%;background:var(--sage);flex-shrink:0"></div>'
                  + '<span style="font-size:12px;font-weight:600;color:var(--ink)">' + escHTML(n.date || '—') + '</span>'
                + '</div>'
                + '<div id="'+id+'-resumo" style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(resumo) + '</div>'
                + ((n.text||'').length > 120
                  ? '<div id="'+id+'-full" style="display:none;font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(n.text) + '</div>'
                    + '<button onclick="var r=document.getElementById(\''+id+'-resumo\'),f=document.getElementById(\''+id+'-full\'),b=this;if(f.style.display===\'none\'){f.style.display=\'block\';r.style.display=\'none\';b.textContent=\'ver menos\';}else{f.style.display=\'none\';r.style.display=\'block\';b.textContent=\'ler mais\';}" style="background:none;border:none;color:var(--sage);font-size:12px;cursor:pointer;padding:4px 0;font-family:inherit;font-weight:500">ler mais</button>'
                  : '')
                + '</div>';
            }).join('');
        return '<div class="patient-section-card">'
          + '<div class="patient-section-header"><div class="patient-section-title">📖 Histórico de sessões</div></div>'
          + '<div class="patient-section-body">' + itens + '</div>'
          + '</div>';
      })()

    // Progresso
    + '<div class="patient-section-card">'
      + '<div class="patient-section-header"><div class="patient-section-title">📈 Meu progresso</div></div>'
      + '<div class="patient-section-body" style="display:flex;align-items:center;gap:20px">'
        + '<div style="position:relative;flex-shrink:0"><svg width="80" height="80" viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" fill="none" stroke="#e8f0eb" stroke-width="7"/><circle cx="45" cy="45" r="38" fill="none" stroke="var(--sage)" stroke-width="7" stroke-dasharray="238.76" stroke-dashoffset="'+offset+'" stroke-linecap="round"/></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:17px;font-weight:700;color:var(--ink)">'+pct+'%</div><div style="font-size:9px;color:var(--muted)">completo</div></div></div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;flex:1">'
          + '<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--sage)"></div><span style="font-size:13px"><strong>'+p.sessions+'</strong> sessões realizadas</span></div>'
          + '<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--amber)"></div><span style="font-size:13px"><strong>'+exDone+'</strong> exercícios concluídos</span></div>'
          + '<div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--blue)"></div><span style="font-size:13px">Abordagem: <strong>'+escHTML(p.abordagem||'—')+'</strong></span></div>'
        + '</div>'
      + '</div>'
    + '</div>'

    // Técnica do dia
    + tecnicaHtml

    // Dica da semana
    + '<div style="background:linear-gradient(135deg,#f0ecfa,#faf8ff);border:1px solid rgba(90,62,138,.15);border-radius:14px;padding:18px 20px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:20px">💡</span><div style="font-size:15px;font-weight:600;color:var(--purple)">Dica da semana</div></div>'
      + '<div style="font-size:13.5px;color:var(--ink-soft);line-height:1.7">'+escHTML(dica)+'</div>'
    + '</div>'

    // Nota pré-sessão
    + notaPreHtml

    // Anamnese (visível apenas quando terapeuta ativar)
    + anamnesePortalHtml

    // Notificações
    + notifHtml;

  // Popula listas de diário com entradas já salvas
  setTimeout(function(){ _renderDiarioExistente(p); }, 0);
  // Agenda notificação se configurada
  setTimeout(function(){ _checkNotifPortal(p); }, 0);
}

function renderPatientDiario(p, idx) {
  var abordagem = p.abordagem || '—';
  var config = (typeof DIARY_CONFIG !== 'undefined') ? DIARY_CONFIG[abordagem] : null;

  var tabLabel = config ? config.tab : null;
  var instrucao = config ? config.instrucao : null;
  var formHtml  = config ? config.html() : '';

  var tabs = '<div style="display:flex;border-bottom:1px solid var(--border);background:#fafbfa">'
    + '<button id="pac-diary-tab-livre" onclick="pacSwitchDiary(\'livre\')" style="flex:1;padding:10px;font-size:13px;font-weight:600;border:none;background:#fff;color:var(--sage);border-bottom:2px solid var(--sage);cursor:pointer;font-family:inherit">✏️ Registro livre</button>'
    + (tabLabel ? '<button id="pac-diary-tab-esp" onclick="pacSwitchDiary(\'esp\')" style="flex:1;padding:10px;font-size:13px;font-weight:500;border:none;background:transparent;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer;font-family:inherit">'+tabLabel+'</button>' : '')
    + '</div>';

  var panelLivre = '<div id="pac-diary-livre" style="padding:16px 18px">'
    + '<textarea id="pac-diary-livre-text" placeholder="O que está passando pela sua cabeça? Pode ser qualquer coisa…" style="width:100%;min-height:100px;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13.5px;font-family:inherit;resize:none;outline:none;line-height:1.6;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"></textarea>'
    + '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="pacSalvarDiario(\'livre\','+idx+')">💾 Salvar registro</button></div>'
    + '<div id="pac-diary-livre-list" style="display:flex;flex-direction:column;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"></div>'
    + '</div>';

  var panelEsp = tabLabel
    ? '<div id="pac-diary-esp" style="display:none;padding:16px 18px">'
        + (instrucao ? '<div style="background:var(--sage-light);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--sage);line-height:1.6">'+instrucao+'</div>' : '')
        + formHtml.replace(/onclick="saveDiaryEsp\([^)]+\)"/g, 'onclick="pacSalvarDiario(\'esp\','+idx+')"')
        + '<div id="pac-diary-esp-list" style="display:flex;flex-direction:column;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"></div>'
      + '</div>'
    : '';

  return '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">📓 Diário da semana</div></div>'
    + tabs + panelLivre + panelEsp
    + '</div>';
}

function pacSwitchDiary(tab) {
  var livre = document.getElementById('pac-diary-livre');
  var esp   = document.getElementById('pac-diary-esp');
  var tabLivre = document.getElementById('pac-diary-tab-livre');
  var tabEsp   = document.getElementById('pac-diary-tab-esp');
  if (tab === 'livre') {
    if (livre) livre.style.display = '';
    if (esp)   esp.style.display   = 'none';
    if (tabLivre) { tabLivre.style.background='#fff'; tabLivre.style.color='var(--sage)'; tabLivre.style.borderBottom='2px solid var(--sage)'; tabLivre.style.fontWeight='600'; }
    if (tabEsp)   { tabEsp.style.background='transparent'; tabEsp.style.color='var(--muted)'; tabEsp.style.borderBottom='2px solid transparent'; tabEsp.style.fontWeight='500'; }
  } else {
    if (livre) livre.style.display = 'none';
    if (esp)   esp.style.display   = '';
    if (tabEsp)   { tabEsp.style.background='#fff'; tabEsp.style.color='var(--sage)'; tabEsp.style.borderBottom='2px solid var(--sage)'; tabEsp.style.fontWeight='600'; }
    if (tabLivre) { tabLivre.style.background='transparent'; tabLivre.style.color='var(--muted)'; tabLivre.style.borderBottom='2px solid transparent'; tabLivre.style.fontWeight='500'; }
  }
}

function pacSelectMood(val, el) {
  document.querySelectorAll('.pac-mood-em').forEach(function(e){ e.style.transform='scale(1)'; e.style.filter='grayscale(60%)'; });
  var em = el.querySelector('.pac-mood-em');
  if (em) { em.style.transform='scale(1.3)'; em.style.filter='none'; }
  var slider = document.getElementById('pac-mood-slider');
  if (slider) { slider.value = val; pacMoodSliderInput(val); }
}

function pacMoodSliderInput(val) {
  var slider = document.getElementById('pac-mood-slider');
  if (slider) slider.style.background = 'linear-gradient(90deg,var(--sage) '+val*10+'%,#e8f0eb '+val*10+'%)';
}

function pacSalvarMood(idx) {
  var val  = parseInt(document.getElementById('pac-mood-slider')?.value || 5);
  var nota = (document.getElementById('pac-mood-note')?.value || '').trim();
  var hoje = new Date();
  var dataStr = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear();

  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx];
  if (p) {
    // Fix 1: salva nota de humor
    if (!p.moodNotes) p.moodNotes = [];
    p.moodNotes.push({ date: dataStr, val: val, nota: nota });
    // Mantém apenas últimas 30 entradas
    if (p.moodNotes.length > 30) p.moodNotes = p.moodNotes.slice(-30);

    // Fix 2: atualiza moodHistory (que alimenta o sparkline)
    if (!p.moodHistory) p.moodHistory = [];
    p.moodHistory.push(val);
    if (p.moodHistory.length > 12) p.moodHistory = p.moodHistory.slice(-12);

    p.mood = val;
    p.moodTrend = p.moodHistory.length >= 2
      ? (p.moodHistory[p.moodHistory.length-1] > p.moodHistory[p.moodHistory.length-2] ? 'up'
        : p.moodHistory[p.moodHistory.length-1] < p.moodHistory[p.moodHistory.length-2] ? 'down' : 'stable')
      : 'stable';
    p._moodLastDate = dataStr;
    // Streak de check-in
    if (typeof _calcStreak === 'function') _calcStreak(p);
  }
  localStorage.setItem('tf_patients', JSON.stringify(pacs));

  // Fix 4: mantém _loggedPatientData sincronizado antes do sync Supabase
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData && p) {
    Object.assign(_loggedPatientData, {
      mood: p.mood, moodTrend: p.moodTrend,
      moodHistory: p.moodHistory, moodNotes: p.moodNotes,
      _moodLastDate: p._moodLastDate,
      checkInStreak: p.checkInStreak, lastCheckInDate: p.lastCheckInDate,
    });
  }
  if (typeof patients !== 'undefined' && patients[idx] && p) {
    Object.assign(patients[idx], {
      mood: p.mood, moodTrend: p.moodTrend,
      moodHistory: p.moodHistory, moodNotes: p.moodNotes,
      _moodLastDate: p._moodLastDate,
      checkInStreak: p.checkInStreak, lastCheckInDate: p.lastCheckInDate,
    });
  }

  // Limpa o campo de nota após salvar
  var noteEl = document.getElementById('pac-mood-note');
  if (noteEl) noteEl.value = '';

  var savedEl = document.getElementById('pac-mood-saved');
  if (savedEl) { savedEl.style.display = ''; setTimeout(function(){ var e = document.getElementById('pac-mood-saved'); if (e) e.style.display = 'none'; }, 3000); }
  try { localStorage.setItem('tf_portal_new_data', '1'); } catch(e){}

  // Sync silencioso para Supabase
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
}

function pacToggleEx(pidx, exId, patientName) {
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[pidx]; if (!p || !p.exercises) return;
  var ex = p.exercises.find(function(e){ return e.id === exId; });
  if (ex) ex.done = !ex.done;
  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof patients !== 'undefined' && patients[pidx]) patients[pidx].exercises = p.exercises;
  renderPatientApp(pidx, pacs);
}

function pacToggleMeta(pidx, metaId, cb, patientName) {
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[pidx]; if (!p || !p.portalMetas) return;
  var m = p.portalMetas.find(function(x){ return x.id === metaId; });
  if (m) m.done = cb.checked;
  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof patients !== 'undefined' && patients[pidx]) patients[pidx].portalMetas = p.portalMetas;
  renderPatientApp(pidx, pacs);
}

function pacSalvarDiario(tipo, idx) {
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx];
  if (!p) return;
  if (!p.diary) p.diary = [];

  var hoje = new Date();
  var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var dataStr = dias[hoje.getDay()]+', '+String(hoje.getDate()).padStart(2,'0')+'/'+String(hoje.getMonth()+1).padStart(2,'0')+'/'+hoje.getFullYear();
  var horaStr = String(hoje.getHours()).padStart(2,'0')+':'+String(hoje.getMinutes()).padStart(2,'0');

  var entrada = null;

  if (tipo === 'livre') {
    var texto = (document.getElementById('pac-diary-livre-text')?.value || '').trim();
    if (!texto) return;
    entrada = { tipo: 'livre', texto: texto, date: dataStr, hora: horaStr, ts: Date.now() };
    document.getElementById('pac-diary-livre-text').value = '';
  } else {
    var campos = [];
    [1,2,3,4].forEach(function(n){
      var el = document.getElementById('esp-campo-'+n);
      if (el && el.value.trim()) campos.push(el.value.trim());
    });
    if (campos.length === 0) return;
    entrada = { tipo: 'esp', campos: campos, date: dataStr, hora: horaStr, ts: Date.now() };
    [1,2,3,4].forEach(function(n){ var el = document.getElementById('esp-campo-'+n); if(el) el.value=''; });
  }

  p.diary.unshift(entrada);
  if (p.diary.length > 50) p.diary = p.diary.slice(0, 50);

  localStorage.setItem('tf_patients', JSON.stringify(pacs));

  // Mantém memória em sincronia
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) {
    _loggedPatientData.diary = p.diary;
  }
  if (typeof patients !== 'undefined' && patients[idx]) {
    patients[idx].diary = p.diary;
  }

  // Insere card no topo da lista sem re-render completo
  _renderDiarioCard(entrada, tipo === 'livre' ? 'pac-diary-livre-list' : 'pac-diary-esp-list', true);

  // Feedback visual
  var btn = event?.target;
  if (btn) { var orig = btn.textContent; btn.textContent = '✓ Salvo!'; btn.style.background='var(--sage)'; setTimeout(function(){ btn.textContent=orig; btn.style.background=''; }, 2000); }

  try { localStorage.setItem('tf_portal_new_data', '1'); } catch(e){}
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
}

function _renderDiarioCard(entrada, listId, prepend) {
  var list = document.getElementById(listId);
  if (!list) return;
  var card = document.createElement('div');
  if (entrada.tipo === 'livre') {
    card.style.cssText = 'background:var(--bg);border-radius:8px;padding:12px 14px;border-left:3px solid var(--sage)';
    card.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:5px">'+escHTML(entrada.date)+' · '+escHTML(entrada.hora)+'</div>'
      + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">'+escHTML(entrada.texto)+'</div>';
  } else {
    card.style.cssText = 'background:var(--bg);border-radius:10px;padding:14px 16px;border-left:3px solid var(--sage)';
    card.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">'+escHTML(entrada.date)+'</div>'
      + (entrada.campos||[]).map(function(c){ return '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin-bottom:4px">'+escHTML(c)+'</div>'; }).join('');
  }
  if (prepend) list.insertBefore(card, list.firstChild);
  else list.appendChild(card);
}

function _renderDiarioExistente(p) {
  var diary = p.diary || [];
  var livre = document.getElementById('pac-diary-livre-list');
  var esp   = document.getElementById('pac-diary-esp-list');
  if (livre) livre.innerHTML = '';
  if (esp)   esp.innerHTML   = '';
  diary.forEach(function(e) {
    if (e.tipo === 'livre' && livre) _renderDiarioCard(e, 'pac-diary-livre-list', false);
    else if (e.tipo === 'esp' && esp) _renderDiarioCard(e, 'pac-diary-esp-list', false);
  });
}
