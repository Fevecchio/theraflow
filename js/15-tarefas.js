// 15-tarefas.js — Tarefas, filtros, CRUD, badge, modal nova tarefa

/* ══════════════════════════════════════
   TAREFAS
══════════════════════════════════════ */
var tasks = [];
var tarefasFiltro = 'abertas';
var tarefasSort = { key: 'date', asc: true };
var editingTaskId = null;

function carregarTarefas() {
  try { tasks = JSON.parse(localStorage.getItem('tf_tasks') || '[]'); } catch(e) { tasks = []; }
  // demo tasks se vazio
  if (tasks.length === 0) {
    var hoje = new Date();
    var fmt = localDateISO;
    var ontem = new Date(hoje); ontem.setDate(hoje.getDate()-1);
    var amanha = new Date(hoje); amanha.setDate(hoje.getDate()+1);
    tasks = [
      { id: 1, title: 'Enviar recibo de março', patientName: 'Camila Rocha', dueDate: fmt(ontem), status: 'aberta', createdAt: fmt(hoje) },
      { id: 2, title: 'Ligar — faltou à sessão', patientName: 'Rafael Andrade', dueDate: fmt(hoje), status: 'aberta', createdAt: fmt(hoje) },
      { id: 3, title: 'Preparar material TCC para amanhã', patientName: 'Camila Rocha', dueDate: fmt(amanha), status: 'aberta', createdAt: fmt(hoje) },
      { id: 4, title: 'Renovar CRP', patientName: '', dueDate: fmt(amanha), status: 'aberta', createdAt: fmt(hoje) },
      { id: 5, title: 'Agendar supervisão mensal', patientName: '', dueDate: '', status: 'aberta', createdAt: fmt(hoje) }
    ];
    salvarTarefas();
  }
}

function salvarTarefas() {
  localStorage.setItem('tf_tasks', JSON.stringify(tasks));
  atualizarBadgeTarefas();
  _supaSync_tasks().catch(() => {});
}

function atualizarBadgeTarefas() {
  var abertas = tasks.filter(function(t){ return t.status === 'aberta'; }).length;
  var badge = document.getElementById('nav-tarefas-badge');
  if (!badge) return;
  if (abertas > 0) { badge.textContent = abertas; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

function setTarefasFiltro(f) {
  tarefasFiltro = f;
  ['abertas','todas','concluidas'].forEach(function(k){
    var btn = document.getElementById('tf-btn-'+k);
    if (btn) btn.classList.toggle('active', k === f);
  });
  renderTarefas();
}

function sortTarefas(key) {
  if (tarefasSort.key === key) tarefasSort.asc = !tarefasSort.asc;
  else { tarefasSort.key = key; tarefasSort.asc = true; }
  renderTarefas();
}

function getTarefasFiltradas() {
  var q = (document.getElementById('tarefas-search')?.value || '').toLowerCase();
  var list = tasks.slice();
  if (tarefasFiltro === 'abertas') list = list.filter(function(t){ return t.status === 'aberta'; });
  if (tarefasFiltro === 'concluidas') list = list.filter(function(t){ return t.status === 'concluida'; });
  if (q) list = list.filter(function(t){ return t.title.toLowerCase().includes(q) || (t.patientName||'').toLowerCase().includes(q); });
  list.sort(function(a,b){
    var va, vb;
    if (tarefasSort.key === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
    else if (tarefasSort.key === 'patient') { va = (a.patientName||'').toLowerCase(); vb = (b.patientName||'').toLowerCase(); }
    else { va = a.dueDate || 'z'; vb = b.dueDate || 'z'; }
    if (va < vb) return tarefasSort.asc ? -1 : 1;
    if (va > vb) return tarefasSort.asc ? 1 : -1;
    return 0;
  });
  return list;
}

/* ── TAREFAS ── */
function formatarDataTarefa(dateStr) {
  if (!dateStr) return '—';
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  var diff = Math.round((d - hoje)/(1000*60*60*24));
  var partes = dateStr.split('-');
  var label = partes[2]+'/'+partes[1]+'/'+partes[0];
  if (diff < 0) return { text: label + ' · atrasada', cls: 'overdue' };
  if (diff === 0) return { text: 'Hoje', cls: 'today' };
  if (diff === 1) return { text: 'Amanhã', cls: '' };
  return { text: label, cls: '' };
}

function renderTarefas() {
  var list = getTarefasFiltradas();
  var tbody = document.getElementById('tarefas-tbody');
  if (!tbody) return;

  // info bar
  var total = tasks.filter(function(t){ return t.status==='aberta'; }).length;
  var sub = document.getElementById('tarefas-subtitle');
  if (sub) sub.textContent = total + ' tarefa' + (total!==1?'s':'') + ' aberta' + (total!==1?'s':'');
  var info = document.getElementById('tarefas-info-bar');
  if (info) {
    var label = tarefasFiltro==='abertas'?'Tarefas abertas':tarefasFiltro==='concluidas'?'Concluídas':'Todas';
    info.textContent = list.length + ' tarefa' + (list.length!==1?'s':'') + ' · Classificado por data de vencimento · Filtrado por ' + label;
  }

  if (list.length === 0) {
    const noTasks = tasks.length === 0;
    const msg = noTasks
      ? `<div style="padding:48px 24px;text-align:center;color:var(--muted)">
           <div style="font-size:40px;margin-bottom:12px">✅</div>
           <div style="font-weight:600;font-size:15px;color:var(--ink-soft);margin-bottom:6px">Sem tarefas pendentes</div>
           <div style="font-size:13px;margin-bottom:20px">Crie lembretes, follow-ups e pendências dos seus pacientes aqui.</div>
           <button class="btn-primary" onclick="showModal('modal-nova-tarefa')">+ Nova tarefa</button>
         </div>`
      : `<div style="padding:32px;text-align:center;color:var(--muted)">
           <div style="font-size:28px;margin-bottom:8px">🔍</div>
           <div style="font-weight:600;margin-bottom:4px">Nenhuma tarefa encontrada</div>
           <div style="font-size:12px">Tente outro filtro ou termo de busca</div>
         </div>`;
    tbody.innerHTML = `<tr><td colspan="7">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(function(t, i){
    var concluida = t.status === 'concluida';
    var dtObj = formatarDataTarefa(t.dueDate);
    var dtText = typeof dtObj === 'object' ? dtObj.text : dtObj;
    var dtCls  = typeof dtObj === 'object' ? dtObj.cls : '';
    var pac = t.patientName ? '<span class="task-paciente">'+escHTML(t.patientName)+'</span>' : '<span class="task-paciente none">—</span>';
    var statusTag = concluida
      ? '<span class="tag tag-green" style="font-size:11px">Concluída</span>'
      : (dtCls==='overdue' ? '<span class="tag" style="font-size:11px;background:var(--red-light);color:var(--red)">Atrasada</span>'
        : dtCls==='today' ? '<span class="tag tag-amber" style="font-size:11px">Hoje</span>'
        : '<span class="tag" style="font-size:11px;background:#f0f2f0;color:var(--ink-soft)">Aberta</span>');
    var acaoBtn = concluida
      ? '<button class="task-reabrir-btn" onclick="toggleTarefa('+t.id+')">↩ Reabrir</button>'
      : '<button class="task-concluir-btn" onclick="toggleTarefa('+t.id+')">✓ Concluir</button>';
    var assuntoCell = concluida
      ? '<span class="task-assunto done">'+escHTML(t.title)+'</span>'
      : '<span class="task-assunto task-inline-trigger" onclick="tarefaEditInline(this,'+t.id+',\'title\')" title="Clique para editar">'+escHTML(t.title)+'<span class="task-inline-icon">✏</span></span>';
    var dataCell = concluida
      ? '<span class="task-date '+dtCls+'">'+escHTML(dtText)+'</span>'
      : '<span class="task-date '+dtCls+' task-inline-trigger" onclick="tarefaEditInline(this,'+t.id+',\'date\')" title="Clique para editar">'+escHTML(dtText)+'<span class="task-inline-icon">✏</span></span>';
    return '<tr class="task-row'+(concluida?' concluida':'')+'" data-id="'+t.id+'">'
      +'<td>'+acaoBtn+'</td>'
      +'<td class="task-num">'+(i+1)+'</td>'
      +'<td>'+assuntoCell+'</td>'
      +'<td>'+pac+'</td>'
      +'<td>'+dataCell+'</td>'
      +'<td>'+statusTag+'</td>'
      +'<td style="display:flex;gap:2px;align-items:center">'
        +'<button class="task-delete" onclick="excluirTarefa('+t.id+')" title="Excluir">✕</button>'
      +'</td>'
      +'</tr>';
  }).join('');
}

function toggleTarefa(id) {
  var t = tasks.find(function(x){ return x.id===id; });
  if (!t) return;
  t.status = t.status === 'aberta' ? 'concluida' : 'aberta';
  salvarTarefas();
  renderTarefas();
  renderDashTarefas();
  showToast(t.status === 'concluida' ? 'Tarefa concluída!' : 'Tarefa reaberta.');
}

function excluirTarefa(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  tasks = tasks.filter(function(t){ return t.id!==id; });
  salvarTarefas();
  renderTarefas();
  renderDashTarefas();
  showToast('Tarefa excluída.');
}

function abrirModalNovaTarefa() {
  editingTaskId = null;
  document.getElementById('modal-tarefa-titulo').textContent = 'Nova tarefa';
  document.getElementById('tarefa-titulo-input').value = '';
  document.getElementById('tarefa-data-input').value = '';
  preencherSelectPacientesTarefa('');
  showModal('modal-nova-tarefa');
  setTimeout(function(){ document.getElementById('tarefa-titulo-input').focus(); }, 100);
}

function abrirModalNovaTarefaPaciente(nomePaciente) {
  editingTaskId = null;
  document.getElementById('modal-tarefa-titulo').textContent = 'Nova tarefa';
  document.getElementById('tarefa-titulo-input').value = '';
  document.getElementById('tarefa-data-input').value = '';
  preencherSelectPacientesTarefa(nomePaciente);
  showModal('modal-nova-tarefa');
  setTimeout(function(){ document.getElementById('tarefa-titulo-input').focus(); }, 100);
}

function editarTarefa(id) {
  var t = tasks.find(function(x){ return x.id===id; });
  if (!t) return;
  editingTaskId = id;
  document.getElementById('modal-tarefa-titulo').textContent = 'Editar tarefa';
  document.getElementById('tarefa-titulo-input').value = t.title;
  document.getElementById('tarefa-data-input').value = t.dueDate || '';
  preencherSelectPacientesTarefa(t.patientName || '');
  showModal('modal-nova-tarefa');
  setTimeout(function(){ document.getElementById('tarefa-titulo-input').focus(); }, 100);
}

function preencherSelectPacientesTarefa(selectedName) {
  var sel = document.getElementById('tarefa-paciente-select');
  sel.innerHTML = '<option value="">— Nenhum (tarefa geral) —</option>';
  (typeof patients !== 'undefined' ? patients : []).forEach(function(p){
    var opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === selectedName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function salvarNovaTarefa() {
  var titulo = (document.getElementById('tarefa-titulo-input').value || '').trim();
  if (!titulo) { showToast('⚠ Informe o assunto da tarefa.'); document.getElementById('tarefa-titulo-input').style.borderColor='#e74c3c'; document.getElementById('tarefa-titulo-input').focus(); return; }
  var paciente = document.getElementById('tarefa-paciente-select').value;
  var data = document.getElementById('tarefa-data-input').value;
  if (editingTaskId !== null) {
    var t = tasks.find(function(x){ return x.id===editingTaskId; });
    if (t) { t.title = titulo; t.patientName = paciente; t.dueDate = data; }
    showToast('Tarefa atualizada!');
  } else {
    var newId = Date.now();
    tasks.push({ id: newId, title: titulo, patientName: paciente, dueDate: data, status: 'aberta', createdAt: hojeISO() });
    showToast('Tarefa criada!');
  }
  editingTaskId = null;
  salvarTarefas();
  closeModal('modal-nova-tarefa');
  renderTarefas();
  renderDashTarefas();
  atualizarBadgeTarefas();
}

function renderDashTarefas() {
  var container = document.getElementById('dash-tarefas-list');
  var emptyEl = document.getElementById('dash-tarefas-empty');
  var countEl = document.getElementById('dash-tarefas-count');
  if (!container) return;
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var abertas = tasks.filter(function(t){ return t.status==='aberta'; });
  // mostra atrasadas + hoje + próximas (max 5)
  abertas.sort(function(a,b){
    var va = a.dueDate||'z', vb = b.dueDate||'z';
    return va<vb?-1:va>vb?1:0;
  });
  var exibir = abertas.slice(0,5);
  if (countEl) {
    if (abertas.length>0){ countEl.textContent=abertas.length+' aberta'+(abertas.length!==1?'s':''); countEl.style.display=''; }
    else countEl.style.display='none';
  }
  if (exibir.length === 0) {
    container.innerHTML = '';
    if (emptyEl) { emptyEl.style.display=''; container.appendChild(emptyEl); }
    return;
  }
  if (emptyEl) emptyEl.style.display='none';
  container.innerHTML = exibir.map(function(t){
    var dtObj = formatarDataTarefa(t.dueDate);
    var dtText = typeof dtObj==='object'?dtObj.text:dtObj;
    var dtCls  = typeof dtObj==='object'?dtObj.cls:'';
    var meta = t.patientName ? t.patientName+(t.dueDate?' · '+dtText:'') : (t.dueDate?dtText:'Sem data');
    return '<div class="dash-task-row">'
      +'<button class="dash-concluir-btn" onclick="toggleTarefa('+t.id+')">✓ Concluir</button>'
      +'<span class="dash-task-title">'+escHTML(t.title)+'</span>'
      +'<span class="dash-task-meta '+dtCls+'">'+escHTML(meta)+'</span>'
      +'</div>';
  }).join('');
  if (abertas.length > 5) {
    container.innerHTML += '<div style="text-align:center;padding:8px 0"><button class="btn btn-ghost btn-sm" onclick="navigate(\'tarefas\')">Ver mais '+(abertas.length-5)+' tarefas →</button></div>';
  }
}

function tarefaEditInline(el, id, field) {
  var t = tasks.find(function(x){ return x.id===id; });
  if (!t) return;
  var isDate = field === 'date';
  var input = document.createElement('input');
  input.className = 'task-inline-input';
  input.type = isDate ? 'date' : 'text';
  input.value = isDate ? (t.dueDate || '') : t.title;
  if (!isDate) input.style.width = Math.max(180, el.offsetWidth) + 'px';
  el.replaceWith(input);
  input.focus();
  if (!isDate) { input.select(); }
  function salvar() {
    var val = input.value.trim();
    if (isDate) {
      t.dueDate = val;
    } else {
      if (!val) { input.style.borderColor='#e74c3c'; input.focus(); return; }
      t.title = val;
    }
    salvarTarefas();
    renderTarefas();
    renderDashTarefas();
  }
  input.addEventListener('blur', salvar);
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { renderTarefas(); }
  });
}

function initTarefas() {
  carregarTarefas();
  renderTarefas();
}


/* ══════════════════════════════════════════
   ÁREA DO PACIENTE
══════════════════════════════════════════ */
var _loggedPatientIdx = null;
var _loggedPatientData = null;
var _therapistPatientsBackup = null; // backup dos pacientes do terapeuta durante sessão do portal
