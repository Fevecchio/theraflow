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
  const validEntries = data.filter(function(v){ return v !== null && v !== undefined; });
  const validVals = validEntries.map(function(e){ return _normMoodVal(e); });
  const avg = validVals.length ? (validVals.reduce(function(s,v){ return s+v; },0)/validVals.length).toFixed(1) : '—';

  // Pontos SVG
  var points = [];
  data.forEach(function(entry, i) {
    if (entry === null || entry === undefined) return;
    var val = _normMoodVal(entry);
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

function _normMoodVal(entry) {
  return typeof entry === 'object' ? (entry.value || 0) : (entry || 0);
}
function _normMoodEmoji(entry) {
  if (typeof entry === 'object' && entry.emoji) return entry.emoji;
  var v = _normMoodVal(entry);
  return v <= 2 ? '😢' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '🙂' : '😄';
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
  // Persistir entrada TCC no paciente
  var pTcc = patients[currentPortalPatientIdx];
  if (pTcc) {
    if (!pTcc.diary) pTcc.diary = [];
    pTcc.diary.unshift({
      date: dateStr,
      text: sit,
      tipo: 'tcc',
      pensamento: pen,
      emocao: tccEmocaoSelecionada,
      intensidade: intVal,
      alternativa: alt
    });
    salvarPacientes();
  }
  tccEmocaoSelecionada = '';
  updateDiaryCount();
  showToast('Registro TCC salvo. 🧠');
}

function updateDiaryCount() {
  const p = patients[currentPortalPatientIdx];
  const total = p ? (p.diary || []).length : 0;
  const el = document.getElementById('diary-count');
  if (el) el.textContent = total + (total === 1 ? ' registro' : ' registros');
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
  var _nameEl = document.getElementById('pac-app-name');
  if (_nameEl) _nameEl.textContent = firstName;

  var body = document.getElementById('pac-app-body');
  if (!body) return;

  // Expande para layout de 2 colunas
  body.style.maxWidth = '1200px';
  body.style.paddingBottom = '40px';

  // Sincroniza índice para funções que usam currentPortalPatientIdx
  if (typeof currentPortalPatientIdx !== 'undefined') currentPortalPatientIdx = idx;

  var _daysLong = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  var _monthsLong = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var _tnow = new Date();
  var _dateLabel = _daysLong[_tnow.getDay()] + ', ' + _tnow.getDate() + ' de ' + _monthsLong[_tnow.getMonth()];

  var _therapistName = (typeof tfUserData !== 'undefined' && tfUserData && tfUserData.nome) ? tfUserData.nome
    : ((typeof _loggedPatientData !== 'undefined' && _loggedPatientData && _loggedPatientData._therapistNome) ? _loggedPatientData._therapistNome : 'Ana');
  var _therapistFirst = _therapistName.split(' ')[0];
  var _therapistInitial = _therapistFirst.charAt(0).toUpperCase();

  var proximaStr = p.next && p.next !== '—' ? p.next : null;
  var sessionLink = p.sessionLink || null;
  var _streak = p.checkInStreak || 0;
  var exercicios = p.exercises || [];
  var metas = p.portalMetas || [];
  var msgTexto = p.portalMensagem || 'Boa semana! Lembre-se de praticar os exercícios que combinamos. 🌿';
  var pct = p.progress || 0;
  var exDone = exercicios.filter(function(e){ return e.done || (e.concluidos||0) >= (e.total||1); }).length;

  var diarioHtml = renderPatientDiario(p, idx);
  var jornadaHtml = renderTrajetoriaPortal(p, idx);

  // Exercícios — layout do terapeuta mas ações do paciente (sem editar/excluir)
  var exListHtml = exercicios.length === 0
    ? '<div style="text-align:center;padding:24px 16px;color:var(--muted);font-size:13px">Nenhum exercício atribuído ainda.</div>'
    : exercicios.map(function(ex) {
        var total = ex.total || 1, conc = ex.concluidos || 0;
        var pctEx = Math.min(100, Math.round(conc / total * 100));
        var _done = ex.done || conc >= total;
        var prazoStr = '', prazoColor = 'var(--muted)';
        if (ex.prazo) {
          var diasR = Math.ceil((new Date(ex.prazo) - new Date()) / 86400000);
          if (diasR < 0) { prazoStr = '⚠ Prazo vencido'; prazoColor = 'var(--red)'; }
          else if (diasR === 0) { prazoStr = '⏰ Vence hoje'; prazoColor = 'var(--amber)'; }
          else { prazoStr = '📅 ' + diasR + 'd restantes'; }
        }
        var progressBar = total > 1
          ? '<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px"><span>' + conc + '/' + total + ' realizados</span><span>' + pctEx + '%</span></div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pctEx + '%;background:' + (pctEx >= 100 ? 'var(--sage)' : 'var(--amber)') + ';border-radius:3px;transition:width .4s"></div></div></div>'
          : '';
        return '<div class="exercise-item ' + (_done ? 'completed' : '') + '">'
          + '<div class="exercise-check" onclick="pacToggleEx(' + idx + ',' + ex.id + ',\'' + escHTML(p.name) + '\')" style="cursor:pointer">✓</div>'
          + '<div style="flex:1">'
            + '<div class="exercise-title">' + escHTML(ex.title) + '</div>'
            + '<div class="exercise-meta">' + escHTML(ex.desc) + '</div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">'
              + '<span class="exercise-tag ' + tagClass(ex.tag) + '">' + tagLabel(ex.tag) + '</span>'
              + (prazoStr ? '<span style="font-size:11px;color:' + prazoColor + '">' + prazoStr + '</span>' : '')
            + '</div>'
            + progressBar
          + '</div>'
          + (total > 1 && !_done ? '<button onclick="pacIncrementarEx(' + idx + ',' + ex.id + ')" title="Marcar realização" style="background:var(--sage-light);border:1px solid var(--sage);border-radius:6px;cursor:pointer;font-size:11px;padding:2px 7px;color:var(--sage);font-weight:600;flex-shrink:0">+1</button>' : '')
          + '</div>';
      }).join('');

  var metasHtml = metas.length === 0
    ? '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px 0">Nenhuma meta definida ainda.</div>'
    : metas.map(function(m) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:' + (m.done?'var(--sage-light)':'var(--bg)') + ';border:1px solid ' + (m.done?'rgba(74,124,89,.2)':'var(--border)') + ';">'
          + '<input type="checkbox"' + (m.done?' checked':'') + ' onchange="pacToggleMeta(' + idx + ',' + m.id + ',this,\'' + escHTML(p.name) + '\')" style="width:16px;height:16px;accent-color:var(--sage);cursor:pointer;flex-shrink:0"/>'
          + '<span style="flex:1;font-size:13.5px;' + (m.done?'text-decoration:line-through;color:var(--muted)':'color:var(--ink)') + '">' + escHTML(m.text) + '</span>'
          + '</div>';
      }).join('');

  var ringOffset = (238.76 * (1 - pct / 100)).toFixed(2);

  body.innerHTML =
  '<div class="portal-banner">'
    + '<div class="portal-greeting">Olá, ' + escHTML(firstName) + ' 🌿'
      + (_streak > 0 ? ' <span style="font-size:14px;font-weight:700;color:#b86e1a">· 🔥 ' + _streak + '</span>' : '')
    + '</div>'
    + '<div class="portal-sub">' + _dateLabel + '</div>'
    + '<div class="portal-next-session"><span>🗓</span><span id="portal-next-session-label">Próxima sessão: <strong>' + (proximaStr ? escHTML(proximaStr) : '—') + '</strong></span></div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      + (sessionLink && proximaStr ? '<a href="' + escHTML(sessionLink) + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm">▶ Entrar na sessão</a>' : '')
      + '<button onclick="pacToggleSolicitarSessao()" class="btn btn-sm" style="background:rgba(74,124,89,.1);border:1px solid rgba(74,124,89,.22);color:var(--sage)">📅 ' + (proximaStr ? 'Remarcar' : 'Solicitar sessão') + '</button>'
      + '<button onclick="pacEmergencia()" class="btn btn-sm" style="background:rgba(220,80,60,.06);border:1px solid rgba(220,80,60,.18);color:#c0392b">🆘 Preciso de apoio</button>'
    + '</div>'
    + '<div id="pac-solicitar-form" style="display:none;margin-top:10px;padding:12px;background:rgba(74,124,89,.05);border-radius:10px;border:1px solid rgba(74,124,89,.12)">'
      + '<textarea id="pac-solicitar-msg" placeholder="Horários de preferência ou observações (opcional)…" style="width:100%;min-height:64px;border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"></textarea>'
      + '<button onclick="pacEnviarSolicitacaoSessao(\'' + escHTML(p.name) + '\')" class="btn btn-primary btn-sm" style="margin-top:8px;width:100%">📲 Enviar via WhatsApp</button>'
    + '</div>'
  + '</div>'
  + '<div class="portal-grid">'
    + '<div style="display:flex;flex-direction:column;gap:20px">'
      + '<div class="card mood-card">'
        + '<div class="section-header" style="margin-bottom:0"><div class="section-title">Check-in de humor</div><span class="tag tag-green" style="font-size:11px">Diário</span></div>'
        + '<div style="font-size:13px;color:var(--muted);margin-top:4px;margin-bottom:4px">Como você está neste momento?</div>'
        + '<div class="mood-emoji-row" id="pac-mood-emojis">'
          + [['😢','1','Muito mal'],['😟','3','Mal'],['😐','5','Neutro'],['🙂','7','Bem'],['😄','10','Muito bem']].map(function(e){
              return '<div style="text-align:center;cursor:pointer" onclick="pacSelectMood(' + e[1] + ',this)">'
                + '<div class="mood-emoji"><span class="pac-mood-em">' + e[0] + '</span></div>'
                + '<div class="mood-emoji-label">' + e[2] + '</div>'
              + '</div>';
            }).join('')
        + '</div>'
        + '<input type="range" id="pac-mood-slider" min="1" max="10" value="5" style="display:none" oninput="pacMoodSliderInput(this.value)"/>'
        + '<textarea class="mood-note-input" id="pac-mood-note" placeholder="O que está passando pela sua cabeça? (opcional)" rows="2"></textarea>'
        + '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">'
          + '<button class="btn btn-primary" onclick="pacSalvarMood(' + idx + ')">Registrar humor</button>'
          + '<div id="pac-mood-saved" style="display:none;font-size:12px;color:var(--sage);font-weight:600">✓ Registrado!</div>'
        + '</div>'
        + '<div id="pac-quick-note-wrap" style="display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:12px"><div style="font-size:12.5px;color:var(--muted);margin-bottom:7px">Quer adicionar uma nota rápida?</div><textarea id="pac-quick-note-text" placeholder="Uma palavra, uma frase…" style="width:100%;min-height:58px;border:1px solid var(--border);border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;resize:none;outline:none;line-height:1.5;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"></textarea><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:7px"><button onclick="document.getElementById(\'pac-quick-note-wrap\').style.display=\'none\'" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;padding:5px 8px;font-family:inherit">Pular</button><button onclick="pacSalvarNotaRapida(' + idx + ')" class="btn btn-primary btn-sm">Salvar nota</button></div></div>'
        + '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"><div class="mood-history" id="pac-mood-history-chart"></div></div>'
      + '</div>'
      + diarioHtml
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:20px">'
      + '<div id="pac-traj-wrap">' + jornadaHtml + '</div>'
      + '<div class="card"><div class="section-header" style="margin-bottom:14px"><div class="section-title">Exercícios entre sessões</div><span style="font-size:13px;color:var(--muted)">' + exDone + ' de ' + exercicios.length + ' concluídos</span></div><div id="pac-ex-list">' + exListHtml + '</div></div>'
      + '<div class="card"><div class="section-title" style="margin-bottom:16px">Meu progresso</div><div class="progress-ring-wrap"><div class="progress-ring"><svg width="90" height="90" viewBox="0 0 90 90"><circle cx="45" cy="45" r="38" fill="none" stroke="#e8f0eb" stroke-width="6"/><circle id="portal-ring-fill" cx="45" cy="45" r="38" fill="none" stroke="#4a7c59" stroke-width="6" stroke-dasharray="238.76" stroke-dashoffset="' + ringOffset + '" stroke-linecap="round"/></svg><div class="progress-ring-text"><div class="progress-ring-num">' + pct + '%</div><div class="progress-ring-lbl">completo</div></div></div><div class="progress-stats"><div class="progress-stat-row"><div class="progress-dot" style="background:var(--sage)"></div><span style="font-weight:500" id="portal-stat-sessoes">' + (p.sessions||0) + '</span><span style="color:var(--muted)">sessões realizadas</span></div><div class="progress-stat-row"><div class="progress-dot" style="background:var(--amber)"></div><span style="font-weight:500" id="portal-stat-exercicios">' + exDone + '</span><span style="color:var(--muted)">exercícios concluídos</span></div><div class="progress-stat-row"><div class="progress-dot" style="background:var(--blue)"></div><span style="font-weight:500" id="portal-stat-checkins">' + ((p.moodHistory||[]).length) + '</span><span style="color:var(--muted)">check-ins de humor</span></div></div></div></div>'
      + (metas.length > 0 ? '<div class="card"><div class="section-title" style="margin-bottom:14px">🎯 Metas terapêuticas</div><div id="pac-metas-list" style="display:flex;flex-direction:column;gap:8px">' + metasHtml + '</div></div>' : '')
      + '<div class="card"><div style="font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:10px;display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3a6347,var(--sage));display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:700;flex-shrink:0">' + _therapistInitial + '</div>' + escHTML(_therapistFirst) + ' deixou uma mensagem</div><div style="font-size:13px;color:#4a5568;line-height:1.6;font-style:italic;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid var(--sage)">&#8220;' + escHTML(msgTexto) + '&#8221;</div></div>'
    + '</div>'
  + '</div>';

  setTimeout(function(){ _renderDiarioExistente(p); }, 0);
  setTimeout(function(){
    renderMoodHistory();
    // renderMoodHistory() usa getElementById e pega o do portal do terapeuta (primeiro na DOM)
    // Copia o resultado para o container exclusivo do portal do paciente
    var src = document.getElementById('mood-history-chart');
    var dst = document.getElementById('pac-mood-history-chart');
    if (src && dst) dst.innerHTML = src.innerHTML;
  }, 0);
  setTimeout(function(){ _checkNotifPortal(p); }, 0);
}

function pacIncrementarEx(pidx, exId) {
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[pidx]; if (!p || !p.exercises) return;
  var ex = p.exercises.find(function(e){ return e.id === exId; });
  if (!ex) return;
  ex.concluidos = Math.min((ex.concluidos||0)+1, ex.total||1);
  if (ex.concluidos >= (ex.total||1)) { ex.done = true; showToast('🎉 Exercício concluído! Parabéns!'); }
  else showToast('✓ Realização registrada — ' + ex.concluidos + '/' + (ex.total||1));
  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof patients !== 'undefined' && patients[pidx]) patients[pidx].exercises = p.exercises;
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) _loggedPatientData.exercises = p.exercises;
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
  renderPatientApp(pidx, pacs);
}


function _pacRenderChatBlock(p, msgs, idx) {
  var _fname = (p.name||'').split(' ')[0];
  var _tFirst = (_loggedPatientData && _loggedPatientData._therapistNome)
    ? (_loggedPatientData._therapistNome||'').split(' ')[0]
    : 'sua terapeuta';
  var _tInit = _tFirst.charAt(0).toUpperCase();
  var unread = (msgs||[]).filter(function(m){ return m.sender_role==='therapist' && !m.read_at; }).length;
  var thread = (msgs||[]).map(function(m) {
    var isT = m.sender_role === 'therapist';
    var ts = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    return '<div style="display:flex;flex-direction:column;align-items:'+(isT?'flex-start':'flex-end')+';gap:2px">'
      + '<div class="chat-bubble '+(isT?'chat-bubble-therapist':'chat-bubble-patient')+'">'+escHTML(m.body)+'</div>'
      + '<span class="chat-ts">'+ts+'</span>'
      + '</div>';
  }).join('');
  if (!thread) thread = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px 0">Nenhuma mensagem ainda.<br>'+escHTML(_tFirst)+' pode te enviar dicas e lembretes aqui.</div>';

  return '<div style="background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow)">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    + '<div style="width:28px;height:28px;border-radius:50%;background:var(--sage);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-family:\'Instrument Serif\',serif;flex-shrink:0">'+_tInit+'</div>'
    + '<div><div style="font-size:12px;font-weight:600;color:var(--ink)">'+escHTML(_tFirst)+'</div><div style="font-size:10px;color:var(--muted)">mensagens entre sessões</div></div>'
    + (unread > 0 ? '<span style="margin-left:auto;background:var(--sage);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:2px 7px">'+unread+' nova'+(unread>1?'s':'')+'</span>' : '')
    + '</div>'
    + '<div class="chat-thread" id="pac-chat-thread">'+thread+'</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">'
    + '<input id="pac-chat-input" type="text" placeholder="Escreva para '+escHTML(_tFirst)+'…" '
    + 'style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:8px 12px;font-size:13px;font-family:\'DM Sans\',sans-serif;outline:none;background:#fafaf8;color:var(--ink)" '
    + 'onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'" '
    + 'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();pacEnviarMensagem('+idx+')}">'
    + '<button onclick="pacEnviarMensagem('+idx+')" style="background:var(--sage);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Enviar</button>'
    + '</div>'
    + '</div>';
}

function _pacInitChat(idx, p) {
  if (!p || !p.id) return;
  var block = document.getElementById('pac-chat-block');
  if (!block) return;
  var msgs = _msgCache[p.id] || [];
  block.innerHTML = _pacRenderChatBlock(p, msgs, idx);
  _supaFetchMessages(p.id, supaPatient).then(function(msgs) {
    if (!document.getElementById('pac-chat-block')) return;
    block.innerHTML = _pacRenderChatBlock(p, msgs, idx);
    var thread = document.getElementById('pac-chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
    _pacUpdateMsgDot(p.id);
    _supaMarkRead(p.id, 'therapist', supaPatient).catch(function(){});
  });
  _startMsgPoll(p.id, function(msgs) {
    var b = document.getElementById('pac-chat-block');
    if (!b) { _stopMsgPoll(); return; }
    b.innerHTML = _pacRenderChatBlock(p, msgs, idx);
    var thread = document.getElementById('pac-chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
    _pacUpdateMsgDot(p.id);
  });
}

function _pacUpdateMsgDot(patientId) {
  var dot = document.getElementById('pac-msg-dot');
  if (!dot) return;
  var unread = ((_msgCache[patientId]||[]).filter(function(m){ return m.sender_role==='therapist' && !m.read_at; })).length;
  dot.style.display = unread > 0 ? 'block' : 'none';
}

async function pacEnviarMensagem(idx) {
  var src = typeof patients !== 'undefined' ? patients : [];
  var p = _loggedPatientData || src[idx];
  if (!p || !p.id) return;
  var input = document.getElementById('pac-chat-input');
  if (!input) return;
  var body = input.value.trim();
  if (!body) return;
  input.value = '';
  input.disabled = true;
  var msgs = await _supaSendMessage(p.id, 'patient', body, supaPatient);
  input.disabled = false;
  if (msgs) {
    var block = document.getElementById('pac-chat-block');
    if (block) block.innerHTML = _pacRenderChatBlock(p, msgs, idx);
    var thread = document.getElementById('pac-chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  } else {
    showToast('⚠ Falha ao enviar. Verifique sua conexão.');
    input.value = body;
  }
  input.focus();
}

function renderPatientDiario(p, idx) {
  var abordagem = p.abordagem || '—';
  var config = (typeof DIARY_CONFIG !== 'undefined') ? DIARY_CONFIG[abordagem] : null;

  var tabLabel = config ? config.tab : null;
  var instrucao = config ? config.instrucao : null;
  var formHtml  = config ? config.html() : '';

  // ── Gráfico de linha do humor ──
  var _rawMh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; });
  var mh = _rawMh.map(function(e){ return typeof e === 'object' ? e : { value: e, emoji: null }; });
  var panelHumor = '<div id="pac-diary-humor" style="display:none;padding:16px 18px">';
  if (mh.length < 2) {
    panelHumor += '<div style="text-align:center;padding:24px 0;color:var(--muted);font-size:13px">Registre seu humor pelo menos 2 vezes para ver o gráfico.</div>';
  } else {
    var W = 290, H = 120, pad = 12;
    var stepX = (W - pad*2) / (mh.length - 1);
    var dayLabels = ['D','S','T','Q','Q','S','S'];
    var today = new Date();
    var pts = mh.map(function(e, i) {
      var v = _normMoodVal(e);
      var x = pad + i * stepX;
      var y = H - pad - ((v - 1) / 9) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var areaBase = H - pad;
    var fv = _normMoodVal(mh[0]), lv = _normMoodVal(mh[mh.length-1]);
    var firstPt = pad.toFixed(1) + ',' + (H - pad - ((fv-1)/9)*(H-pad*2)).toFixed(1);
    var lastPt  = (pad + (mh.length-1)*stepX).toFixed(1) + ',' + (H - pad - ((lv-1)/9)*(H-pad*2)).toFixed(1);
    var areaPath = 'M'+firstPt+' '+mh.slice(1).map(function(e,i){
      var v = _normMoodVal(e);
      var x = pad + (i+1)*stepX; var y = H - pad - ((v-1)/9)*(H-pad*2);
      return 'L'+x.toFixed(1)+','+y.toFixed(1);
    }).join(' ')+' L'+lastPt.split(',')[0]+','+areaBase+' L'+pad+','+areaBase+' Z';
    var circles = mh.map(function(e,i){
      var v = _normMoodVal(e);
      var emoji = _normMoodEmoji(e);
      var x = pad + i*stepX; var y = H - pad - ((v-1)/9)*(H-pad*2);
      return '<text x="'+x.toFixed(1)+'" y="'+(parseFloat(y.toFixed(1))+5)+'" font-size="14" text-anchor="middle" style="user-select:none"><title>'+v+'/10</title>'+emoji+'</text>';
    }).join('');
    var refLines = [3,5,7].map(function(v){
      var y = (H - pad - ((v-1)/9)*(H-pad*2)).toFixed(1);
      return '<line x1="'+pad+'" y1="'+y+'" x2="'+(W-pad)+'" y2="'+y+'" stroke="#e8e4d8" stroke-dasharray="3,3" stroke-width="1"/>'
        + '<text x="'+(W-pad+3)+'" y="'+(parseFloat(y)+4)+'" font-size="9" fill="#bbb">'+v+'</text>';
    }).join('');
    var avg = (mh.reduce(function(s,e){return s+_normMoodVal(e);},0)/mh.length).toFixed(1);
    var trend = lv - fv;
    var trendTxt = trend > 0.5 ? '↑ Em alta' : trend < -0.5 ? '↓ Em queda' : '→ Estável';
    var trendCol = trend > 0.5 ? '#4a7c59' : trend < -0.5 ? '#c0392b' : '#c97d2e';
    var xLabels = mh.map(function(_,i){
      var d = new Date(today); d.setDate(d.getDate() - (mh.length - 1 - i));
      return '<text x="'+(pad + i*stepX).toFixed(1)+'" y="'+(H+4)+'" font-size="9" fill="#aaa" text-anchor="middle">'+dayLabels[d.getDay()]+'</text>';
    }).join('');
    panelHumor += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div style="font-size:13px;font-weight:600;color:var(--ink)">Últimos '+mh.length+' registros</div>'
      + '<div style="display:flex;gap:12px;font-size:12px">'
        + '<span style="color:var(--muted)">Média: <strong style="color:var(--ink)">'+avg+'</strong></span>'
        + '<span style="color:'+trendCol+';font-weight:600">'+trendTxt+'</span>'
      + '</div>'
    + '</div>'
    + '<svg viewBox="0 0 '+(W+20)+' '+(H+12)+'" style="width:100%;height:auto;overflow:visible">'
      + refLines
      + '<path d="'+areaPath+'" fill="rgba(74,124,89,.07)"/>'
      + '<polyline points="'+pts+'" fill="none" stroke="#4a7c59" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
      + circles + xLabels
    + '</svg>'
    + '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--muted)">'
      + '<span>😢  Muito mal</span><span>Muito bem  😄</span>'
    + '</div>';
  }
  panelHumor += '</div>';

  var tabs = '<div style="display:flex;border-bottom:1px solid var(--border);background:#fafbfa">'
    + '<button id="pac-diary-tab-livre" class="pac-diary-sub-tab" onclick="pacSwitchDiary(\'livre\')" style="flex:1;font-weight:600;border:none;background:#fff;color:var(--sage);border-bottom:2px solid var(--sage);cursor:pointer;font-family:inherit">✏️ Registro livre</button>'
    + (tabLabel ? '<button id="pac-diary-tab-esp" class="pac-diary-sub-tab" onclick="pacSwitchDiary(\'esp\')" style="flex:1;font-weight:500;border:none;background:transparent;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer;font-family:inherit">'+tabLabel+'</button>' : '')
    + '<button id="pac-diary-tab-humor" class="pac-diary-sub-tab" onclick="pacSwitchDiary(\'humor\')" style="flex:1;font-weight:500;border:none;background:transparent;color:var(--muted);border-bottom:2px solid transparent;cursor:pointer;font-family:inherit">📈 Humor</button>'
    + '</div>';

  var panelLivre = '<div id="pac-diary-livre" style="padding:16px 18px">'
    + '<textarea id="pac-diary-livre-text" placeholder="O que está passando pela sua cabeça? Pode ser qualquer coisa…" style="width:100%;min-height:100px;border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13.5px;font-family:inherit;resize:none;outline:none;line-height:1.6;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'"></textarea>'
    + '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="pacSalvarDiario(\'livre\','+idx+')">💾 Salvar registro</button></div>'
    + '<div id="pac-diary-livre-list" style="display:flex;flex-direction:column;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)"></div>'
    + '</div>';

  var panelEsp = tabLabel
    ? '<div id="pac-diary-esp" style="display:none;padding:16px 18px">'
        + (instrucao ? '<div style="background:#f4f7f5;border:1px solid var(--border);border-radius:10px;padding:11px 14px;margin-bottom:4px;font-size:12.5px;color:var(--ink-soft);line-height:1.6">'+instrucao+'</div>' : '')
        + formHtml.replace(/onclick="saveDiaryEsp\([^)]+\)"/g, 'onclick="pacSalvarDiario(\'esp\','+idx+')"')
        + '<div id="pac-diary-esp-list" style="display:flex;flex-direction:column;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)"></div>'
      + '</div>'
    : '';

  return '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">📓 Diário da semana</div></div>'
    + tabs + panelLivre + panelEsp + panelHumor
    + '</div>';
}

function pacSwitchDiary(tab) {
  var panels = { livre: 'pac-diary-livre', esp: 'pac-diary-esp', humor: 'pac-diary-humor' };
  var tabBtns = { livre: 'pac-diary-tab-livre', esp: 'pac-diary-tab-esp', humor: 'pac-diary-tab-humor' };
  Object.keys(panels).forEach(function(k) {
    var p = document.getElementById(panels[k]);
    var b = document.getElementById(tabBtns[k]);
    var active = k === tab;
    if (p) p.style.display = active ? '' : 'none';
    if (b) {
      b.style.background = active ? '#fff' : 'transparent';
      b.style.color = active ? 'var(--sage)' : 'var(--muted)';
      b.style.borderBottom = active ? '2px solid var(--sage)' : '2px solid transparent';
      b.style.fontWeight = active ? '600' : '500';
    }
  });
}

var _pacSelectedMoodEmoji = '😐';
function pacSelectMood(val, el) {
  document.querySelectorAll('.pac-mood-em').forEach(function(e){ e.style.transform='scale(1)'; e.style.filter='grayscale(60%)'; });
  var em = el.querySelector('.pac-mood-em');
  if (em) { em.style.transform='scale(1.3)'; em.style.filter='none'; _pacSelectedMoodEmoji = em.textContent.trim() || '😐'; }
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
    p.moodHistory.push({ value: val, emoji: _pacSelectedMoodEmoji || '😐', date: dataStr });
    if (p.moodHistory.length > 12) p.moodHistory = p.moodHistory.slice(-12);

    p.mood = val;
    var _lastMv = _normMoodVal(p.moodHistory[p.moodHistory.length-1]);
    var _prevMv = _normMoodVal(p.moodHistory[p.moodHistory.length-2]);
    p.moodTrend = p.moodHistory.length >= 2
      ? (_lastMv > _prevMv ? 'up' : _lastMv < _prevMv ? 'down' : 'stable')
      : 'stable';
    p._moodLastDate = (typeof hojeISO === 'function') ? hojeISO() : dataStr;
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
  var qnWrap = document.getElementById('pac-quick-note-wrap');
  if (qnWrap) { qnWrap.style.display = ''; }
  try { localStorage.setItem('tf_portal_new_data', '1'); } catch(e){}

  // Sync silencioso para Supabase
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
}

function pacSalvarNotaRapida(idx) {
  var texto = (document.getElementById('pac-quick-note-text')?.value || '').trim();
  if (!texto) { showToast('Escreva algo antes de salvar.'); return; }
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx];
  if (p) {
    if (!p.diary) p.diary = [];
    var hoje = new Date();
    var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    var dataStr = dias[hoje.getDay()]+', '+String(hoje.getDate()).padStart(2,'0')+'/'+String(hoje.getMonth()+1).padStart(2,'0')+'/'+hoje.getFullYear();
    var horaStr = String(hoje.getHours()).padStart(2,'0')+':'+String(hoje.getMinutes()).padStart(2,'0');
    p.diary.unshift({ tipo: 'livre', texto: texto, date: dataStr, hora: horaStr, ts: Date.now() });
    localStorage.setItem('tf_patients', JSON.stringify(pacs));
    if (typeof patients !== 'undefined' && patients[idx]) patients[idx].diary = p.diary;
    if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
  }
  var wrap = document.getElementById('pac-quick-note-wrap');
  if (wrap) wrap.style.display = 'none';
  showToast('Nota salva. 🌿');
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

function renderTrajetoriaPortal(p, idx, readonly) {
  // Prefer global appointments array (therapist context — complete history)
  // Fall back to p.appointments (patient remote login — loaded from Supabase)
  var sourceAppts;
  if (typeof appointments !== 'undefined' && appointments.length) {
    sourceAppts = appointments.filter(function(a) { return a.patientIdx === idx || a.patientName === p.name; });
  } else {
    sourceAppts = (p.appointments || []);
  }
  var appts = sourceAppts.filter(function(a) {
    return a.presenca && a.date;
  }).sort(function(a, b) { return b.date.localeCompare(a.date); });

  if (!appts.length) {
    return '<div class="patient-section-card"><div class="patient-section-header"><div class="patient-section-title">📅 Minha jornada</div></div>'
      + '<div class="patient-section-body"><div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0">Suas sessões aparecerão aqui.</div></div></div>';
  }

  // Monta índice de moodNotes por data para join
  var moodByDate = {};
  (p.moodNotes || []).forEach(function(mn) {
    if (!mn.date) return;
    // Normaliza DD/MM/YYYY → YYYY-MM-DD
    var d = mn.date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      var pts = d.split('/'); d = pts[2] + '-' + pts[1] + '-' + pts[0];
    } else if (/^\d{2}\/\d{2}$/.test(d)) {
      d = new Date().getFullYear() + '-' + d.split('/')[1] + '-' + d.split('/')[0];
    }
    moodByDate[d] = mn.val;
  });

  // Calcula marcos (data da 1ª sessão)
  var ordenadoAsc = appts.slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
  var _sessionCount = 0;
  var _first = ordenadoAsc[0];
  var _firstDate = _first ? new Date(_first.date + 'T12:00') : null;

  var _isMilestone = function(appt) {
    var cnt = appt._trajCount;
    if (cnt === 1) return { icon:'🌱', label:'Primeira sessão!' };
    if (cnt === 5) return { icon:'🌿', label:'5 sessões!' };
    if (cnt === 10) return { icon:'🌳', label:'10 sessões!' };
    if (cnt === 20) return { icon:'🏅', label:'20 sessões!' };
    if (_firstDate) {
      var dias = Math.round((new Date(appt.date+'T12:00') - _firstDate) / 86400000);
      if (dias >= 180 && dias < 220) return { icon:'🎉', label:'6 meses de terapia!' };
      if (dias >= 90 && dias < 120 && cnt < 20) return { icon:'✨', label:'3 meses de terapia!' };
      if (dias >= 30 && dias < 45 && cnt < 10) return { icon:'🌟', label:'1 mês de terapia!' };
    }
    return null;
  };

  // Atribui contador crescente (em ordem asc) para usar nos marcos
  var countMap = {};
  var sc = 0;
  ordenadoAsc.forEach(function(a) { if (a.presenca === 'compareceu') { sc++; countMap[a.id] = sc; } });

  var _filterState = 'all'; // só pré-renderização, filtro é aplicado via JS

  var cards = appts.map(function(a) {
    a._trajCount = countMap[a.id] || 0;
    var milestone = a.presenca === 'compareceu' ? _isMilestone(a) : null;
    var dateObj = new Date(a.date + 'T12:00');
    var dateStr = dateObj.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'});
    var statusColor = a.presenca === 'compareceu' ? 'var(--sage)' : a.presenca === 'faltou' ? 'var(--red)' : 'var(--amber)';
    var statusLabel = a.presenca === 'compareceu' ? 'Compareceu' : a.presenca === 'faltou' ? 'Faltou' : 'Cancelou';
    var statusBg = a.presenca === 'compareceu' ? '#e8f5ee' : a.presenca === 'faltou' ? '#fdecea' : '#fff8e6';
    var mood = moodByDate[a.date];
    var moodHtml = mood ? '<span style="font-size:11px;color:var(--muted);margin-left:6px">Humor: <strong style="color:var(--sage)">' + mood + '/10</strong></span>' : '';
    var resumo = a.resumoParaPaciente || '';
    var insight = a.meuInsight || '';

    return '<div class="traj-entry'+(milestone?' traj-milestone':'')+'" data-presenca="'+a.presenca+'" data-date="'+a.date+'" data-id="'+escHTML(String(a.id))+'">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
        + '<div style="font-size:12px;color:var(--muted);flex:1">' + dateStr + moodHtml + '</div>'
        + '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+statusBg+';color:'+statusColor+';font-weight:600">' + statusLabel + '</span>'
      + '</div>'
      + (milestone ? '<div style="font-size:13px;font-weight:700;color:var(--sage);margin-bottom:8px">'+milestone.icon+' '+escHTML(milestone.label)+'</div>' : '')
      + (resumo
          ? '<div class="traj-resumo-ia">'
              + '<div class="traj-resumo-label">✨ O que abordamos</div>'
              + '<div class="traj-resumo-text">'+escHTML(resumo)+'</div>'
            + '</div>'
          : '')
      + '<div class="traj-insight-wrap">'
        + '<div class="traj-insight-label">💭 O que fica pra mim desta sessão</div>'
        + (readonly
          ? '<div style="font-size:13px;color:var(--muted);font-style:italic;padding:8px 0">'
              + (insight ? escHTML(insight) : 'Nenhum registro ainda.')
              + '</div>'
          : '<textarea id="insight-'+escHTML(String(a.id))+'" class="traj-insight-ta" placeholder="Escreva algo que ficou desta sessão…" '
              + 'onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">'
              + escHTML(insight)
              + '</textarea>'
              + '<button onclick="pacSalvarInsight('+idx+',\''+escHTML(String(a.id))+'\')" class="traj-insight-btn">Salvar ✓</button>')
      + '</div>'
      + '</div>';
  }).join('');

  return '<div class="patient-section-card">'
    + '<div class="patient-section-header"><div class="patient-section-title">📅 Minha jornada</div></div>'
    + '<div style="padding:0 16px 8px;display:flex;gap:6px;flex-wrap:wrap">'
    + '<button class="traj-filter-btn active" onclick="pacTrajFilter(\'all\',this)">Tudo</button>'
    + '<button class="traj-filter-btn" onclick="pacTrajFilter(\'milestones\',this)">Marcos</button>'
    + '<button class="traj-filter-btn" onclick="pacTrajFilter(\'month\',this)">Este mês</button>'
    + '</div>'
    + '<div class="patient-section-body" id="pac-traj-list">' + cards + '</div>'
    + '</div>';
}

function pacTrajFilter(tipo, btn) {
  document.querySelectorAll('.traj-filter-btn').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  var entries = document.querySelectorAll('#pac-traj-list .traj-entry');
  var hoje = new Date();
  var mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0');
  entries.forEach(function(el) {
    var show = true;
    if (tipo === 'milestones') show = el.classList.contains('traj-milestone');
    if (tipo === 'month') show = (el.dataset.date || '').startsWith(mesAtual);
    el.style.display = show ? '' : 'none';
  });
}

async function pacSalvarInsight(pidx, apptId) {
  var src = typeof patients !== 'undefined' ? patients : [];
  var p = _loggedPatientData || src[pidx];
  if (!p) return;
  var ta = document.getElementById('insight-' + apptId);
  if (!ta) return;
  var texto = ta.value.trim();

  // Atualiza no array global de appointments (contexto do terapeuta / mesmo navegador)
  if (typeof appointments !== 'undefined') {
    var globalAppt = appointments.find(function(a) { return String(a.id) === String(apptId); });
    if (globalAppt) {
      globalAppt.meuInsight = texto;
      _salvarAppointments();
      _supaSync_appointments().catch(function(){});
    }
  }

  // Atualiza em p.appointments (contexto do paciente remoto)
  var appt = (p.appointments || []).find(function(a) { return String(a.id) === String(apptId); });
  if (appt) {
    appt.meuInsight = texto;
    // Persiste via Supabase usando cliente do paciente
    if (typeof supaPatient !== 'undefined' && p.id) {
      supaPatient.from('appointments')
        .update({ metadata: { resumoParaPaciente: appt.resumoParaPaciente || null, meuInsight: texto } })
        .eq('patient_id', p.id)
        .eq('local_id', String(apptId))
        .then(function(){})
        .catch(function(){});
    }
  }

  if (_loggedPatientData) _loggedPatientData.appointments = p.appointments;
  showToast(texto ? '✓ Insight salvo!' : '✓ Insight removido');
}

function pacNavTo(tab) {
  var tabs = ['home','ex','diary','me'];
  tabs.forEach(function(t) {
    var el = document.getElementById('pac-tab-'+t);
    var btn = document.getElementById('pac-nav-'+t);
    if (el)  el.style.display  = (t === tab) ? '' : 'none';
    if (btn) btn.classList[t === tab ? 'add' : 'remove']('active');
  });
  // Ao navegar para Perfil, re-renderiza trajetória para mostrar resumos recém-salvos
  if (tab === 'me') {
    var _trajWrap = document.getElementById('pac-traj-wrap');
    if (_trajWrap) {
      var _srcPacs = typeof patients !== 'undefined' ? patients : [];
      var _pMe = _loggedPatientData || (_srcPacs.length > 0 ? _srcPacs[_loggedPatientIdx != null ? _loggedPatientIdx : 0] : null);
      var _idxMe = _loggedPatientIdx != null ? _loggedPatientIdx : 0;
      if (_pMe) _trajWrap.innerHTML = renderTrajetoriaPortal(_pMe, _idxMe);
    }
  }
  // Ao voltar para Home, marca mensagens da terapeuta como lidas
  if (tab === 'home' && _loggedPatientData && _loggedPatientData.id) {
    var pid = _loggedPatientData.id;
    _supaMarkRead(pid, 'therapist', supaPatient).then(function() {
      _pacUpdateMsgDot(pid);
    }).catch(function(){});
  }
}
