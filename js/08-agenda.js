// 08-agenda.js — Agenda, views mês/dia/semana, appointments, horários, bloqueios

var appointments = [];
var APPT_COLORS = ['appt-green','appt-blue','appt-amber','appt-purple'];
var _demoAppointmentsLoaded = false;

function carregarAppointments() {
  // Demo mode: generate fresh appointments once per session (ignore stale localStorage cache)
  if (window._tfDemo) {
    if (!_demoAppointmentsLoaded) {
      _gerarAppointmentsDemo();
      _demoAppointmentsLoaded = true;
    }
    return;
  }
  try {
    appointments = JSON.parse(localStorage.getItem('tf_appointments') || '[]')
      .map(function(a){ return Object.assign({}, a, { id: Number(a.id) }); });
  } catch(e) { appointments = []; }
  if (appointments.length === 0) { _gerarAppointmentsDemo(); _salvarAppointments(); }
}

function marcarPresenca(apptId, tipo) {
  var a = appointments.find(function(ap){ return String(ap.id)===String(apptId); });
  if (!a) return;
  a.presenca = tipo;
  _salvarAppointments();
  var overlay = document.getElementById('modal-mes-detalhe');
  if (overlay) overlay.remove();
  var msg = tipo==='compareceu' ? '✓ Presença registrada.' : tipo==='faltou' ? '✗ Falta registrada.' : '~ Atraso registrado.';
  showToast(msg);
  // Ao marcar compareceu: oferecer criar cobrança. A "nota rápida" automática
  // SAIU por decisão do fundador (15/07): a nota da sessão nasce no fluxo de
  // encerramento — o modal aqui duplicava. Quem faz sessão fora da plataforma
  // ainda tem o caminho da nota pelo painel do paciente e pelo botão flutuante.
  if (tipo === 'compareceu') {
    _ofereceCobrancaPresenca(a);
  }
  if (agendaCurrentView === 'dia') renderDayView();
  else if (agendaCurrentView === 'semana') renderWeekView();
  else renderMonthView();
}

function _ofereceCobrancaPresenca(appt) {
  // Só cria se ainda não existir cobrança para esta data/paciente
  var p = patients[appt.patientIdx];
  if (!p || (appt.patientName && p.name !== appt.patientName)) p = patients.find(function(x){ return x.name === appt.patientName; }) || p;
  if (!p) return;
  var hoje = appt.date || hojeISO();
  var jaExiste = charges.some(function(c){
    return !c.deleted && c.patient === p.name
      && (c.date === hoje || c.date === hoje.split('-').reverse().join('/'));
  });
  if (jaExiste) return;
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var valor = parseFloat(p.valorSessao || acc.valor_sessao) || 0;
  if (!valor) return; // sem valor configurado, silencioso
  // Toast com ação inline (breve respiro após o toast da presença). Vale na
  // Agenda E no Dashboard — o "✓ confirmar" do dash também chega aqui (15/07).
  setTimeout(function() {
    var pgA = document.getElementById('page-agenda');
    var pgD = document.getElementById('page-dashboard');
    var visivel = (pgA && pgA.classList.contains('active')) || (pgD && pgD.classList.contains('active'));
    if (!visivel) return;
    var diaFmt = fmtDataBR(hoje);
    var toast = document.createElement('div');
    toast.className = 'cobranca-presenca-toast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a2a1e;color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;display:flex;align-items:center;gap:12px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw';
    // Handlers via addEventListener (closure) — não interpola o nome do paciente no onclick,
    // que quebrava com apóstrofo (D'Ávila) e era vetor de injeção. F4.4.
    toast.innerHTML = '<span>💳 Criar cobrança para ' + escHTML(_firstName(p.name)) + '? <strong>' + fmtMoedaInt(valor) + '</strong></span>'
      + '<button data-act="criar" style="background:var(--sage);color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap">Criar</button>'
      + '<button data-act="fechar" style="background:transparent;border:none;color:rgba(255,255,255,.6);font-size:16px;cursor:pointer;padding:0 4px">✕</button>';
    document.body.appendChild(toast);
    var _pnome = p.name;
    toast.querySelector('[data-act="criar"]').addEventListener('click', function(){ _criarCobrancaPresenca(_pnome, valor, hoje); });
    toast.querySelector('[data-act="fechar"]').addEventListener('click', function(){ toast.remove(); });
    setTimeout(function(){ if (toast.parentNode) toast.remove(); }, 8000);
  }, 1500);
}

function _criarCobrancaPresenca(nomePaciente, valor, dataIso) {
  var diaFmt = fmtDataBR(dataIso);
  var p = patients.find(function(x){ return x.name === nomePaciente; });
  charges.push({
    id: Date.now(),
    patient: nomePaciente,
    initials: p ? p.initials : nomePaciente.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase(),
    color: p ? p.color : '#4a7c59',
    desc: 'Sessão ' + diaFmt,
    value: valor,
    date: dataIso,
    status: 'pending',
    deleted: false,
    billing: 'avulso',
    session: diaFmt,
    method: 'PIX',
  });
  salvarCharges();
  if (p) { p.finStatus = 'pending'; p.fin = 'Pendente'; salvarPacientes(); }
  showToast('💳 Cobrança criada para ' + _firstName(nomePaciente) + ' — ' + fmtMoedaInt(valor));
  document.querySelectorAll('.cobranca-presenca-toast').forEach(function(el){ el.remove(); });
}

function _promptNotaRapida(appt) {
  var existing = document.getElementById('modal-nota-presenca');
  if (existing) existing.remove();
  var p = patients[appt.patientIdx];
  if (!p || (appt.patientName && p.name !== appt.patientName)) p = patients.find(function(x){ return x.name === appt.patientName; }) || p;
  if (!p) return;
  var overlay = document.createElement('div');
  overlay.id = 'modal-nota-presenca';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding-bottom:0';
  overlay.innerHTML = '<div style="background:var(--white);border-radius:16px 16px 0 0;width:100%;max-width:560px;padding:20px 24px 28px;box-shadow:0 -8px 40px rgba(0,0,0,.18)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
      + '<div style="font-size:14px;font-weight:700;color:var(--ink)">📋 Nota rápida — ' + escHTML(_firstName(p.name)) + '</div>'
      + '<button onclick="document.getElementById(\'modal-nota-presenca\').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);line-height:1">✕</button>'
    + '</div>'
    + '<textarea id="nota-rapida-text" placeholder="Registre brevemente o que ocorreu na sessão de hoje…" rows="4" style="width:100%;padding:10px 12px;border:1.5px solid var(--sage);border-radius:10px;font-size:13.5px;font-family:inherit;resize:none;outline:none;box-sizing:border-box;line-height:1.6;color:var(--ink)"></textarea>'
    + '<div style="display:flex;gap:10px;margin-top:12px">'
      + '<button onclick="document.getElementById(\'modal-nota-presenca\').remove()" style="flex:1;padding:10px;border:1px solid var(--border);background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--muted)">Pular</button>'
      + '<button onclick="_salvarNotaRapida(' + appt.patientIdx + ')" style="flex:2;padding:10px;background:var(--sage);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✓ Salvar nota</button>'
      + '<button id="btn-preench-ia-nota" onclick="_preencherNotaComIA(' + appt.patientIdx + ')" style="flex:2;padding:10px;background:var(--purple);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✦ Rascunho IA</button>'
    + '</div>'
  + '</div>';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(function(){ document.getElementById('nota-rapida-text')?.focus(); }, 80);
}

function _salvarNotaRapida(pidx) {
  var texto = (document.getElementById('nota-rapida-text')?.value || '').trim();
  if (!texto) { showToast('⚠ Escreva algo antes de salvar.'); return; }
  var p = patients[pidx];
  if (!p) return;
  if (!p.prontuarioNotes) p.prontuarioNotes = [];
  var hoje = new Date();
  var data = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0');
  p.prontuarioNotes.push({ date: data, text: texto, _up: Date.now() }); // _up: merge por elemento (migration 027)
  p.lastSession = data;
  salvarPacientes();
  document.getElementById('modal-nota-presenca')?.remove();
  showToast('📋 Nota salva no prontuário de ' + _firstName(p.name) + '.');
}

async function _preencherNotaComIA(pidx) {
  var p = patients[pidx];
  if (!p) return;
  var btn = document.getElementById('btn-preench-ia-nota');
  if (btn) { btn.textContent = '⏳ Gerando…'; btn.disabled = true; }
  // Demo mode: gera nota fictícia sem chamar API
  if (window._tfDemo) {
    await new Promise(r => setTimeout(r, 900));
    var notaDemo = 'Paciente ' + p.name + ' compareceu à sessão ' + ((p.sessions||0)+1) + ' demonstrando boa adesão ao processo terapêutico. '
      + 'Foram abordados temas relacionados a ' + (p.notes || 'queixa principal').toLowerCase().replace(/\.$/, '') + '. '
      + 'Paciente mostrou-se reflexivo(a) e receptivo(a) às intervenções. '
      + 'Manutenção do plano terapêutico vigente. Próxima sessão agendada conforme combinado.';
    var ta = document.getElementById('nota-rapida-text');
    if (ta) { ta.value = notaDemo; ta.focus(); }
    if (btn) { btn.textContent = '✦ Rascunho IA'; btn.disabled = false; }
    showToast('✦ Rascunho gerado — revise antes de salvar.');
    return;
  }
  try {
    var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e2){}
    var hoje = new Date();
    var dataStr = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear();
    var userPrompt = 'Gere um rascunho de nota clínica (3-5 linhas) para a sessão de hoje (' + dataStr + ') do paciente '
      + p.name + '. Baseie-se nos dados disponíveis: abordagem ' + (p.abordagem || 'não especificada')
      + ', sessão nº ' + (p.sessions || '?')
      + ', humor recente ' + (p.mood != null ? p.mood + '/10' : 'não registrado')
      + ', queixa principal: ' + (p.notes || 'não informada') + '.'
      + ' Escreva em primeira pessoa do terapeuta, tom clínico e objetivo.';
    var patientData = { name: p.name, abordagem: p.abordagem, sessions: p.sessions, mood: p.mood, notes: p.notes, cid: p.cid };
    var resp = await fetchWithTimeout('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ userPrompt, patientData }),
    }, 30000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    var texto = data.content || '';
    if (texto) {
      var ta = document.getElementById('nota-rapida-text');
      if (ta) { ta.value = texto; ta.focus(); }
      showToast('✦ Rascunho gerado — revise antes de salvar.');
    } else {
      showToast('⚠ IA não retornou texto. Tente novamente.');
    }
  } catch(e) {
    console.warn('[TF] Erro ao gerar nota com IA:', e.message);
    showToast('⚠ Erro ao conectar com a IA. Verifique a API Key em Perfil.');
  } finally {
    if (btn) { btn.textContent = '✦ Rascunho IA'; btn.disabled = false; }
  }
}

// Badge da Agenda na sidebar = sessões de HOJE (auditoria B3: era "3" fixo no HTML)
function _atualizarBadgeAgenda() {
  try {
    var b = document.getElementById('nav-agenda-badge');
    if (!b) return;
    var hoje = hojeISO();
    var n = (typeof appointments !== 'undefined' ? appointments : [])
      .filter(function(a){ return a.date === hoje && a.status !== 'cancelada'; }).length;
    if (n > 0) { b.textContent = n; b.style.display = 'inline-block'; }
    else { b.style.display = 'none'; }
  } catch(e) {}
}

function _salvarAppointments() {
  _atualizarBadgeAgenda();
  try { localStorage.setItem('tf_appointments', JSON.stringify(appointments)); } catch(e) {}
  _supaSync_appointments();
}

function _gerarAppointmentsDemo() {
  var hoje = new Date();
  var iso = localDateISO;
  var addDays = function(d, n){ var r = new Date(d); r.setDate(r.getDate()+n); return r; };
  var seg = new Date(hoje); seg.setDate(hoje.getDate() - ((hoje.getDay()+6)%7)); // segunda desta semana
  var demos = [
    {h:'08:00', di:0, pi:1, abordagem:'Psicanálise', cor:'appt-blue'},   // seg
    {h:'09:00', di:0, pi:0, abordagem:'TCC', cor:'appt-green'},           // seg
    {h:'09:00', di:1, pi:0, abordagem:'TCC', cor:'appt-green'},           // ter (hoje)
    {h:'11:00', di:1, pi:1, abordagem:'Psicanálise', cor:'appt-blue'},    // ter
    {h:'14:00', di:1, pi:2, abordagem:'TCC', cor:'appt-amber'},           // ter
    {h:'09:00', di:2, pi:3, abordagem:'Sistêmica', cor:'appt-amber'},      // qua
    {h:'11:00', di:2, pi:4, abordagem:'TCC', cor:'appt-green'},           // qua
    {h:'14:00', di:2, pi:0, abordagem:'TCC', cor:'appt-green'},           // qua
    {h:'10:00', di:3, pi:5, abordagem:'Avaliação', cor:'appt-amber'},     // qui
    {h:'15:00', di:3, pi:6, abordagem:'Psicanálise', cor:'appt-blue'},    // qui
    {h:'09:00', di:4, pi:1, abordagem:'Psicanálise', cor:'appt-blue'},    // sex
  ];
  demos.forEach(function(d, i){
    var p = patients[d.pi] || patients[0];
    if (!p) return;
    appointments.push({
      id: Date.now() + i,
      patientIdx: d.pi,
      patientId: p.id || null, // C3: identidade estável (índice desloca com exclusões)
      patientName: p.name,
      date: iso(addDays(seg, d.di)),
      time: d.h,
      duration: 50,
      abordagem: d.abordagem,
      color: d.cor,
      status: 'agendada',
      recorrencia: d.di % 2 === 0 ? 'semanal' : 'nenhuma'
    });
  });
}

function _mostrarOpcoesAppt(pi, apptId) {
  var existente = document.getElementById('_appt-opts-popup');
  if (existente) existente.remove();
  var a = (typeof appointments !== 'undefined' ? appointments : []).find(function(ap){ return ap.id == apptId; });
  var p = (typeof patients !== 'undefined' ? patients : [])[pi];
  if (!p) return;
  var popup = document.createElement('div');
  popup.id = '_appt-opts-popup';
  popup.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.35);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  popup.innerHTML = '<div style="background:var(--white);border-radius:14px;padding:20px 24px;max-width:320px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.25)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div><div style="font-weight:600;font-size:15px;color:var(--ink)">'+escHTML(p.name)+'</div>'
      + '<div style="font-size:12px;color:var(--muted)">'+(a ? escHTML(a.abordagem || '—')+' · '+a.time : '—')+'</div></div>'
      + '<button onclick="document.getElementById(\'_appt-opts-popup\').remove()" style="border:none;background:none;cursor:pointer;font-size:18px;color:var(--muted);padding:0;line-height:1">✕</button>'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px">'
      + '<button onclick="document.getElementById(\'_appt-opts-popup\').remove();_tfSetSessionPatientAppt(\''+apptId+'\');currentSessionApptId=\''+apptId+'\';navigate(\'sessao\')" style="width:100%;padding:10px;background:var(--sage,#4a7c59);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">▶ Iniciar sessão agora</button>'
      + '<button onclick="document.getElementById(\'_appt-opts-popup\').remove();currentBriefingPatientIdx='+pi+';navigate(\'briefing\')" style="width:100%;padding:10px;background:var(--purple-light,#f0ecfa);color:var(--purple,#5a3e8a);border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">✦ Briefing IA' + (typeof _briefingDotHtml === 'function' ? _briefingDotHtml(p) : '') + '</button>'
      // "Ver paciente": conferir a ficha sem sair caçando em Pacientes (pedido do
      // usuário 14/07 — o fluxo agenda→ficha exigia navegar e buscar de novo).
      + '<button onclick="document.getElementById(\'_appt-opts-popup\').remove();navigate(\'pacientes\');setTimeout(function(){if(typeof selectPatient===\'function\')selectPatient('+pi+')},150)" style="width:100%;padding:10px;background:var(--sage-light,#eaf1ec);color:var(--sage-dark,#3d6653);border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">⊙ Ver paciente</button>'
      + (a ? '<button onclick="document.getElementById(\'_appt-opts-popup\').remove();reagendarAppointment('+apptId+')" style="width:100%;padding:10px;background:var(--line-2,#f5f5f5);color:var(--ink-soft,#555);border:none;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit;text-align:left">↻ Reagendar</button>' : '')
    + '</div>'
  + '</div>';
  document.body.appendChild(popup);
  popup.addEventListener('click', function(e){ if(e.target===popup) popup.remove(); });
}

function _agendaConfirm(msg, onConfirm) {
  var over = document.createElement('div');
  over.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
  over.innerHTML = '<div style="background:var(--white);border-radius:14px;padding:24px 28px;max-width:380px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.25)">'
    + '<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1a1a1a;white-space:pre-line">'+escHTML(msg)+'</p>'
    + '<div style="display:flex;gap:10px;justify-content:flex-end">'
    + '<button class="_aga-cancel" style="padding:9px 18px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;color:#555">Cancelar</button>'
    + '<button class="_aga-ok" style="padding:9px 18px;background:var(--sage,#4a7c59);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Continuar</button>'
    + '</div></div>';
  document.body.appendChild(over);
  over.querySelector('._aga-cancel').addEventListener('click', function(){ over.remove(); });
  over.querySelector('._aga-ok').addEventListener('click', function(){ over.remove(); onConfirm(); });
  over.addEventListener('click', function(e){ if(e.target===over) over.remove(); });
}

function confirmarAgendamento() {
  var sel    = document.getElementById('agendar-paciente-select');
  var data   = document.getElementById('agendar-data');
  var hora   = document.getElementById('agendar-hora');
  var dur    = document.getElementById('agendar-duracao');
  var recorr = document.getElementById('agendar-recorrencia');

  if (!sel || !data || !hora) { showToast('⚠ Erro ao abrir formulário de agendamento. Tente novamente.'); return; }

  // Fluxo "Novo paciente": cria o paciente antes de agendar
  if (sel.value === 'novo') {
    var nomeNovo = (document.getElementById('novo-paciente-nome')?.value || '').trim();
    var emailNovo = (document.getElementById('novo-paciente-email')?.value || '').trim();
    if (!nomeNovo) { showToast('⚠ Informe o nome do novo paciente.'); document.getElementById('novo-paciente-nome')?.focus(); return; }
    var _colorPairs = [['#4a7c59','#2a5238'],['#2c5f8a','#1a3d5c'],['#c97d2e','#9a5c1e'],['#6a3d7a','#3d1f52']];
    var _pair = _colorPairs[patients.length % _colorPairs.length];
    patients.push({
      initials: nomeNovo.split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase(),
      color: _pair[0], colorGrad: 'linear-gradient(135deg,' + _pair[0] + ',' + _pair[1] + ')',
      id: crypto.randomUUID(), name: nomeNovo, email: emailNovo, whatsapp: '',
      abordagem: 'TCC', status: 'Nova', sessions: 0,
      lastSession: '—', next: '—', progress: 0, mood: null,
      fin: '—', finStatus: 'ok', alert: null, notes: '', exercises: []
    });
    salvarPacientes();
    // Adiciona opção ao select antes de selecionar (sem opção o browser ignora sel.value)
    var _newIdx = String(patients.length - 1);
    var _opt = document.createElement('option');
    _opt.value = _newIdx; _opt.textContent = nomeNovo;
    sel.appendChild(_opt);
    sel.value = _newIdx;
  }

  var pidx = parseInt(sel.value);
  if (isNaN(pidx) || pidx < 0 || pidx >= patients.length) { showToast('⚠ Selecione um paciente.'); return; }

  var p = patients[pidx];
  var dataVal   = data.value || hojeISO();
  var horaVal   = hora.value || '09:00';
  var durVal    = parseInt(dur?.value || '50');
  var recVal    = recorr?.value || 'nenhuma';
  var colorIdx  = pidx % APPT_COLORS.length;
  var dataBR    = fmtDataBR(dataVal);

  // Verificar conflito de horário (± 30 min) — em TODAS as datas da série
  // recorrente, não só na 1ª (residual da auditoria: dava para agendar 8
  // semanas em cima de sessões existentes sem nenhum aviso).
  var horaMin = parseInt(horaVal.split(':')[0])*60 + parseInt(horaVal.split(':')[1]);
  var _datasChecar = [dataVal];
  if (recVal === 'semanal')   { for (let w=1;w<=7;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setDate(nd.getDate()+w*7); _datasChecar.push(localDateISO(nd)); } }
  if (recVal === 'quinzenal') { for (let w=1;w<=4;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setDate(nd.getDate()+w*14); _datasChecar.push(localDateISO(nd)); } }
  if (recVal === 'mensal')    { for (let w=1;w<=2;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setMonth(nd.getMonth()+w); _datasChecar.push(localDateISO(nd)); } }
  var conflito = appointments.find(function(a) {
    if (a.status === 'cancelada' || _datasChecar.indexOf(a.date) === -1) return false;
    var aMin = parseInt((a.time||'00:00').split(':')[0])*60 + parseInt((a.time||'00:00').split(':')[1]);
    return Math.abs(aMin - horaMin) < 30;
  });

  // Monta lista de avisos para confirmação
  var avisos = [];
  if (dataVal < hojeISO()) {
    avisos.push('⚠ Você está agendando para uma data no passado (' + dataBR + ').\nDeseja continuar mesmo assim?');
  }
  if (isDiaBlockeado(dataVal)) {
    var motivo = typeof _motivoBloqueio === 'function' ? _motivoBloqueio(dataVal) : 'Dia bloqueado';
    avisos.push('⛔ Atenção: ' + dataBR + ' está bloqueado (' + motivo + ').\nDeseja agendar mesmo assim?');
  }
  if (conflito) {
    avisos.push('⚠ Já existe sessão de ' + conflito.patientName + ' às ' + conflito.time + ' em ' + fmtDataBR(conflito.date) + (conflito.date !== dataVal ? ' (data da série recorrente)' : '') + '.\nDeseja agendar mesmo assim?');
  }

  function _executar() {
    var datas = [dataVal];
    if (recVal === 'semanal')    { for(let w=1;w<=7;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setDate(nd.getDate()+w*7); datas.push(localDateISO(nd)); } }
    if (recVal === 'quinzenal')  { for(let w=1;w<=4;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setDate(nd.getDate()+w*14); datas.push(localDateISO(nd)); } }
    if (recVal === 'mensal')     { for(let w=1;w<=2;w++){ const nd=new Date(dataVal+'T12:00:00'); nd.setMonth(nd.getMonth()+w); datas.push(localDateISO(nd)); } }

    datas.forEach(function(dt, i){
      appointments.push({
        id: Date.now() + i,
        patientIdx: pidx,
        patientId: p.id || null, // C3: identidade estável (índice desloca com exclusões)
        patientName: p.name,
        date: dt,
        time: horaVal,
        duration: durVal,
        abordagem: p.abordagem || 'TCC',
        color: APPT_COLORS[colorIdx],
        status: 'agendada',
        recorrencia: recVal
      });
    });

    var proxima = datas[0];
    var parts = proxima.split('-');
    p.next = parts[2]+'/'+parts[1]+'/'+parts[0];
    salvarPacientes();
    _salvarAppointments();
    tfTrack('session_scheduled', { recorrencia: recVal, occurrences: datas.length });

    // Lê checkboxes ANTES de remover o modal (depois o elemento some do DOM)
    var _enviarInvite   = !!(document.getElementById('agendar-chk-invite')?.checked);
    var _enviarReminder = !!(document.getElementById('agendar-chk-reminder')?.checked);
    var _enviarWpp      = !!(document.getElementById('agendar-chk-wpp')?.checked);

    document.getElementById('modal-agendar')?.remove();
    var toastMsg = recVal !== 'nenhuma'
      ? '✅ ' + datas.length + ' sessões agendadas (' + recVal + ')!'
      : '✅ Sessão agendada para ' + horaVal + ' · ' + _firstName(p.name) + '!';
    showToast(toastMsg);
    if (agendaCurrentView === 'dia') renderDayView();
    else if (agendaCurrentView === 'semana') renderWeekView();
    else renderMonthView();

    // Envio de emails via Resend (apenas se o paciente tiver email)
    if (p.email && typeof _sendEmail === 'function') {
      var _acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
      var _tNome = _acc.nome || (typeof tfUserData !== 'undefined' && tfUserData?.nome) || '';
      var _tCrp  = _acc.crp  || (typeof tfUserData !== 'undefined' && tfUserData?.crp)  || '';
      if (!_tNome) showToast('⚠ Adicione seu nome no Perfil para aparecer corretamente nos emails');
      var _dataBR = fmtDataBR(datas[0]);
      var _emailData = {
        terapeutaNome: _tNome || 'Seu terapeuta', terapeutaCrp: _tCrp,
        pacienteNome: p.name,
        data: _dataBR, hora: horaVal, duracao: durVal,
        sessionLink: p.sessionLink || '',
        sessionDateISO: datas[0]
      };
      if (_enviarInvite)   _sendEmail('invite',   p.email, _emailData);
      if (_enviarReminder) {
        // O servidor agenda 24h E 15min antes (Resend scheduledAt) — cada etapa só
        // entra se ainda couber no relógio. Só pulamos tudo se nem 15min couber.
        var _sessionDt = new Date(datas[0] + 'T' + horaVal + ':00');
        if (_sessionDt.getTime() - 15 * 60 * 1000 > Date.now()) {
          _sendEmail('reminder', p.email, _emailData);
          if (_sessionDt.getTime() - 24 * 60 * 60 * 1000 <= Date.now()) {
            showToast('ℹ Sessão em menos de 24h — só o lembrete de 15 min foi agendado');
          }
        } else {
          showToast('ℹ Sessão em menos de 15 min — lembretes não agendados');
        }
      }
    }

    // WhatsApp: abre o wa.me com o convite (antes o checkbox era decorativo).
    if (_enviarWpp) {
      var _wn = (typeof _wppNumero === 'function') ? _wppNumero(p.whatsapp) : null;
      if (_wn) {
        var _dBR = fmtDataBR(datas[0]);
        var _lk = p.sessionLink ? ('\n\n🔗 Link da sala: ' + (String(p.sessionLink).startsWith('http') ? p.sessionLink : 'https://' + p.sessionLink)) : '';
        var _msg = 'Olá ' + _firstName(p.name) + '! 🌿\n\nSua sessão de psicoterapia está agendada para ' + _dBR + ' às ' + horaVal + '.' + _lk + '\n\nQualquer imprevisto, é só me avisar por aqui. Até lá! 💚\n— ' + _wppNomeTerapeuta();
        window.open(_wppLink(p.whatsapp, _msg), '_blank');
      } else {
        showToast('⚠ Paciente sem WhatsApp válido — link não enviado.');
      }
    }
  }

  function _processarAvisos(idx) {
    if (idx >= avisos.length) { _executar(); return; }
    _agendaConfirm(avisos[idx], function(){ _processarAvisos(idx + 1); });
  }
  _processarAvisos(0);
}

function cancelarAppointment(id) {
  var appt = appointments.find(function(a){ return a.id === id; });
  if (!appt) return;

  var existing = document.getElementById('modal-cancelar-appt');
  if (existing) existing.remove();

  var d = new Date(appt.date + 'T12:00');
  var dateLbl = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  var overlay = document.createElement('div');
  overlay.id = 'modal-cancelar-appt';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:420px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.25)">
      <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:6px">Cancelar sessão</div>
      <div style="font-size:13px;color:#666;margin-bottom:20px">${escHTML(appt.patientName)} · ${dateLbl} às ${appt.time}</div>
      <div style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:8px">Motivo do cancelamento</label>
        <div style="display:flex;flex-direction:column;gap:8px" id="cancel-motivos">
          ${['Paciente cancelou','Encaixe/reagendamento','Feriado ou folga','Emergência clínica','Outro'].map(function(m,i){
            return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:13px;transition:border .15s" onclick="selecionarMotivoCancel(this)">'
              + '<input type="radio" name="cancel-motivo" value="'+m+'" style="accent-color:#4a7c59">'
              + escHTML(m) + '</label>';
          }).join('')}
        </div>
        <input type="text" id="cancel-outro" placeholder="Descreva o motivo…" style="display:none;width:100%;margin-top:8px;padding:9px 12px;border:1.5px solid #4a7c59;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none">
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-cancelar-appt').remove()" style="flex:1;padding:11px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit">Voltar</button>
        <button onclick="confirmarCancelamento(${id})" style="flex:1;padding:11px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Confirmar cancelamento</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function selecionarMotivoCancel(label) {
  document.querySelectorAll('#cancel-motivos label').forEach(function(l){ l.style.borderColor='#e0e0e0'; l.style.background=''; });
  label.style.borderColor = '#4a7c59';
  label.style.background = '#f0fdf4';
  var radio = label.querySelector('input[type=radio]');
  if (radio) radio.checked = true;
  var outro = document.getElementById('cancel-outro');
  if (outro) outro.style.display = radio && radio.value === 'Outro' ? 'block' : 'none';
}

function confirmarCancelamento(id) {
  var appt = appointments.find(function(a){ return a.id === id; });
  if (!appt) return;
  var radio = document.querySelector('#cancel-motivos input[type=radio]:checked');
  var motivo = radio ? radio.value : '';
  if (motivo === 'Outro') {
    var outro = document.getElementById('cancel-outro');
    motivo = (outro && outro.value.trim()) ? outro.value.trim() : 'Outro';
  }
  appt.status = 'cancelada';
  appt.motivoCancelamento = motivo;
  appt.canceladoEm = new Date().toISOString();
  _salvarAppointments();
  document.getElementById('modal-cancelar-appt')?.remove();
  if (agendaCurrentView === 'dia') renderDayView();
  else if (agendaCurrentView === 'semana') renderWeekView();
  else renderMonthView();
  showToast('✓ Sessão cancelada' + (motivo ? ' — ' + motivo : '') + '.');
  tfTrack('session_cancelled', { motivo: motivo });
}

function reagendarAppointment(id) {
  var appt = appointments.find(function(a){ return a.id === id; });
  if (!appt) return;

  var existing = document.getElementById('modal-reagendar');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'modal-reagendar';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:380px;padding:28px;box-shadow:0 24px 64px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:700;color:var(--ink);margin-bottom:6px">↻ Reagendar sessão</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:20px">${escHTML(appt.patientName)} · atual: ${appt.date} às ${appt.time}</div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Nova data</label>
          <input type="date" id="reagendar-data" value="${appt.date}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Novo horário</label>
          <input type="time" id="reagendar-hora" value="${appt.time}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Duração</label>
          <select id="reagendar-duracao" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit">
            ${[30,45,50,60,90].map(function(v){ return '<option value="'+v+'"'+(v===(appt.duration||50)?' selected':'')+'>'+v+' minutos</option>'; }).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button onclick="document.getElementById('modal-reagendar').remove()" style="flex:1;padding:11px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>
        <button onclick="confirmarReagendamento(${id})" style="flex:1;padding:11px;background:var(--sage);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✓ Confirmar</button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function confirmarReagendamento(id) {
  var appt = appointments.find(function(a){ return a.id === id; });
  if (!appt) return;
  var novaData = document.getElementById('reagendar-data')?.value;
  var novaHora = document.getElementById('reagendar-hora')?.value;
  if (!novaData || !novaHora) { showToast('⚠ Preencha data e horário.'); return; }
  var novaDuracao = parseInt(document.getElementById('reagendar-duracao')?.value || appt.duration || 50);
  var dataAnterior = appt.date + ' ' + appt.time;
  appt.date = novaData;
  appt.time = novaHora;
  appt.duration = novaDuracao;
  appt.confirmada = false; // nova data ainda não foi confirmada pelo paciente
  _salvarAppointments();
  document.getElementById('modal-reagendar')?.remove();
  if (agendaCurrentView === 'dia') renderDayView();
  else if (agendaCurrentView === 'semana') renderWeekView();
  showToast('✓ Sessão reagendada de ' + dataAnterior + ' para ' + novaData + ' às ' + novaHora);
  tfTrack('session_rescheduled', {});
}

/* ── ESTADO "CONFIRMADA" (anti no-show, v1 otimista — item 5 dos desligados) ──
   Lembrar envia o WhatsApp e marca a sessão como confirmada (otimista); o ✓
   marca sem enviar (paciente confirmou por outro canal). Reagendar reseta.
   Futuro: confirmação real pela resposta do paciente (portal/WhatsApp API). */
function _lembrarConfirmacao(apptId) {
  var a = appointments.find(function(x){ return x.id == apptId; });
  if (!a) return;
  // Só marca se o lembrete realmente saiu (sem WhatsApp não há o que confirmar)
  if (enviarLembreteAgenda(a.patientName) === false) return;
  a.confirmada = true;
  _salvarAppointments();
  if (agendaCurrentView === 'dia') renderDayView();
}

function _marcarConfirmada(apptId) {
  var a = appointments.find(function(x){ return x.id == apptId; });
  if (!a) return;
  a.confirmada = true;
  _salvarAppointments();
  showToast('✓ Sessão de ' + _firstName(a.patientName) + ' marcada como confirmada.');
  if (agendaCurrentView === 'dia') renderDayView();
}

/* ── RENDER DIA ── */
function renderDayView() {
  var container = document.getElementById('agenda-dia-render');
  if (!container) return;
  var d = agendaCurrentDate;
  var iso = localDateISO(d);
  var hoje = hojeISO();
  var diasNome = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  var diasAbrev = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var tituloData = diasNome[d.getDay()] + ', ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  if (iso === hoje) tituloData = 'Hoje — ' + diasNome[d.getDay()];

  var _hConfig = carregarHorarios();
  var _h24 = !!(_hConfig && _hConfig.h24);
  var _hTrabalhoIni = _h24 ? 0  : (_hConfig ? parseInt((_hConfig.inicio||'08:00').split(':')[0]) : 8);
  var _hTrabalhoFim = _h24 ? 23 : (_hConfig ? parseInt((_hConfig.fim||'18:00').split(':')[0]) : 18);
  var sessoesDia = appointments.filter(function(a){ return a.date===iso && a.status!=='cancelada'; });
  // Mostra só horas do expediente + horas com sessão fora do expediente
  var _sessoesHoras = new Set(sessoesDia.map(function(a){ return parseInt((a.time||'09:00').split(':')[0]); }));
  var horas = [];
  for (var _hi = 0; _hi <= 23; _hi++) {
    if ((_hi >= _hTrabalhoIni && _hi <= _hTrabalhoFim) || _sessoesHoras.has(_hi)) horas.push(_hi);
  }

  // Mapa hora → agendamentos
  var porHora = {};
  sessoesDia.forEach(function(a){
    var h = parseInt((a.time||'09:00').split(':')[0]);
    if (!porHora[h]) porHora[h] = [];
    porHora[h].push(a);
  });

  var slotsHtml = horas.map(function(h){
    var appts = porHora[h] || [];
    var horaStr = String(h).padStart(2,'0')+':00';
    var slotContent = appts.length === 0
      ? '<div class="slot-add" onclick="showAgendarModal(\''+iso+'\',\''+horaStr+'\')" title="Agendar sessão às '+horaStr+'"><span class="slot-add-icon">+</span><span class="slot-add-label">Nova sessão</span></div>'
      : appts.map(function(a){
          if (a.patientIdx < 0 || !a.id || !a.time) return '';
          var pi = a.patientIdx;
          var nome = escHTML(a.patientName);
          var isPast = a.date < hoje || (a.date === hoje && parseInt((a.time||'23:59').split(':')[0]) < new Date().getHours());
          var presencaBadge = '';
          if (a.presenca === 'compareceu') {
            presencaBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--sage-light);color:var(--sage-dark);font-weight:600">✓ compareceu</span>';
          } else if (a.presenca === 'faltou') {
            presencaBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--red-light);color:var(--red);font-weight:600">✗ faltou</span>';
          } else if (a.presenca === 'atrasou') {
            presencaBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--amber-light);color:var(--amber);font-weight:600">~ atrasou</span>';
          } else if (isPast) {
            presencaBadge = '<span style="display:flex;gap:3px">'
              + '<button class="btn btn-sm" onclick="event.stopPropagation();marcarPresenca(\''+a.id+'\',\'compareceu\')" style="font-size:10px;padding:2px 6px;background:var(--sage-light);color:var(--sage-dark);border:none;border-radius:8px;cursor:pointer" title="Compareceu">✓</button>'
              + '<button class="btn btn-sm" onclick="event.stopPropagation();marcarPresenca(\''+a.id+'\',\'faltou\')" style="font-size:10px;padding:2px 6px;background:var(--red-light);color:var(--red);border:none;border-radius:8px;cursor:pointer" title="Faltou">✗</button>'
              + '<button class="btn btn-sm" onclick="event.stopPropagation();marcarPresenca(\''+a.id+'\',\'atrasou\')" style="font-size:10px;padding:2px 6px;background:var(--amber-light);color:var(--amber);border:none;border-radius:8px;cursor:pointer" title="Atrasou">~</button>'
              + '</span>';
          }
          var confTag = (a.confirmada && !a.presenca && !isPast)
            ? ' <span style="font-size:9.5px;padding:1px 6px;border-radius:8px;background:var(--sage-light);color:var(--sage-dark);font-weight:600;vertical-align:middle">✓ confirmada</span>' : '';
          return '<div class="'+escHTML(a.color)+' appt-block" style="display:flex;flex-direction:column;gap:5px;margin-bottom:4px;padding:8px">'
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px">'
              + '<div onclick="event.stopPropagation();_mostrarOpcoesAppt('+pi+','+a.id+')" style="cursor:pointer;flex:1"><strong>'+nome+'</strong>'+confTag+'<br/><span style="font-size:11px;opacity:.8">'+escHTML(a.abordagem)+' · '+a.time+'</span></div>'
              + '<div style="display:flex;gap:4px;flex-shrink:0">'
                + '<button class="btn btn-purple btn-sm" onclick="event.stopPropagation();currentBriefingPatientIdx='+pi+';navigate(\'briefing\')" style="font-size:10px;padding:3px 7px" title="Briefing IA">✦</button>'
                + '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();reagendarAppointment('+a.id+')" style="font-size:10px;padding:3px 7px" title="Reagendar">↻</button>'
                + '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();cancelarAppointment('+a.id+')" style="font-size:10px;padding:3px 7px;color:var(--red)" title="Cancelar">✕</button>'
              + '</div>'
            + '</div>'
            + (presencaBadge ? '<div>'+presencaBadge+'</div>' : '')
            + '</div>';
        }).join('');
    var _foraHorario = h < _hTrabalhoIni || h > _hTrabalhoFim;
    return '<div style="display:grid;grid-template-columns:56px 1fr;border-top:1px solid var(--border);'+(_foraHorario?'background:var(--bg)':'background:var(--white)')+'">'
      + '<div class="time-slot" style="padding:10px 8px;font-size:11px;color:var(--muted);display:flex;align-items:flex-start;padding-top:12px;opacity:'+(_foraHorario?'.5':'1')+'">'+horaStr+'</div>'
      + '<div class="appt-slot" style="padding:6px 8px;min-height:56px">'+slotContent+'</div>'
      + '</div>';
  }).join('');

  // Resumo da semana
  var seg = new Date(d); seg.setDate(d.getDate()-((d.getDay()+6)%7));
  var resumoSemana = [0,1,2,3,4].map(function(di){
    var dd = new Date(seg); dd.setDate(seg.getDate()+di);
    var diso = localDateISO(dd);
    var cnt = appointments.filter(function(a){ return a.date===diso&&a.status!=='cancelada'; }).length;
    var isHoje = diso===hoje;
    var isHD = diso===iso;
    return '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:13px;'+(isHD?'font-weight:600;color:var(--ink)':'color:var(--muted)')+'">'+diasAbrev[dd.getDay()]+' '+(isHoje?'(hoje)':'')+'</span>'
      + '<span class="tag '+(cnt>0?'tag-green':'tag-gray')+'">'+(cnt!==1?cnt+' sessões':cnt+' sessão')+'</span>'
      + '</div>';
  }).join('');

  // Confirmações pendentes (hoje ou próximas 48h). Confirmadas saem da lista —
  // antes o Lembrar não mudava estado nenhum e a lista nunca esvaziava (item 5
  // dos desligados, LIGADO no V3: fluxo anti no-show completo).
  var amanha = new Date(hoje); amanha.setDate(amanha.getDate()+2);
  var agoraTs = Date.now();
  var pendentes = appointments.filter(function(a){
    if (!(a.status==='agendada' && !a.confirmada && a.date>=hoje && a.date<=localDateISO(amanha))) return false;
    // Sessão cujo horário já passou não tem o que confirmar (aparecia "Lembrar"
    // para sessão de hoje já realizada — revisão 14/07).
    var ini = new Date(a.date + 'T' + (a.time || '23:59'));
    return isNaN(ini.getTime()) || ini.getTime() > agoraTs;
  }).slice(0,4);
  var pendHtml = pendentes.length === 0
    ? '<div style="font-size:13px;color:var(--muted);font-style:italic">Nenhuma pendência de confirmação. ✓</div>'
    : pendentes.map(function(a){
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
          + '<span style="font-size:13px;flex:1">'+escHTML(_firstName(a.patientName))+' · '+escHTML(a.date.split('-').reverse().slice(0,2).join('/'))+'</span>'
          + '<button class="btn btn-secondary btn-sm" onclick="_lembrarConfirmacao('+a.id+')" title="Envia lembrete WhatsApp e marca como confirmada">'+_tfIcon('send')+' Lembrar</button>'
          + '<button class="btn btn-secondary btn-sm" onclick="_marcarConfirmada('+a.id+')" title="Paciente já confirmou por fora — marcar sem enviar" style="padding-left:8px;padding-right:8px;color:var(--sage)">✓</button>'
          + '</div>';
      }).join('');

  container.innerHTML =
    '<div class="grid-2">'
      + '<div class="card">'
        + '<div class="section-header" style="margin-bottom:20px">'
          + '<div class="section-title">'+tituloData+'</div>'
          + '<span class="tag '+(sessoesDia.length>0?'tag-blue':'tag-gray')+'">'+(sessoesDia.length!==1?sessoesDia.length+' sessões':sessoesDia.length+' sessão')+'</span>'
        + '</div>'
        + '<div>'+slotsHtml+'</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:16px">'
        + '<div class="card"><div class="section-title" style="margin-bottom:14px">Semana — resumo</div><div style="display:flex;flex-direction:column;gap:8px">'+resumoSemana+'</div></div>'
        + '<div class="card"><div class="section-title" style="margin-bottom:12px">Pendências de confirmação</div><div style="display:flex;flex-direction:column;gap:8px">'+pendHtml+'</div></div>'
      + '</div>'
    + '</div>';
}

/* ── RENDER SEMANA ── */
function renderWeekView() {
  var container = document.getElementById('agenda-semana-render');
  if (!container) return;
  var d = agendaCurrentDate;
  var hoje = hojeISO();

  // Segunda desta semana
  var seg = new Date(d); seg.setDate(d.getDate()-((d.getDay()+6)%7));
  var dias = [0,1,2,3,4].map(function(di){
    var dd = new Date(seg); dd.setDate(seg.getDate()+di);
    var _ddIso = localDateISO(dd); return { date: dd, iso: _ddIso, isHoje: _ddIso===hoje };
  });

  var _hConfigW = carregarHorarios();
  var _h24W = !!(_hConfigW && _hConfigW.h24);
  var _hTrabalhoIniW = _h24W ? 0  : (_hConfigW ? parseInt((_hConfigW.inicio||'08:00').split(':')[0]) : 8);
  var _hTrabalhoFimW = _h24W ? 23 : (_hConfigW ? parseInt((_hConfigW.fim||'18:00').split(':')[0]) : 18);
  // Coleta horas com sessão em qualquer dia da semana (para exibir sessões fora do expediente)
  var _semanaAppts = appointments.filter(function(a){
    return dias.some(function(di){ return a.date === di.iso && a.status !== 'cancelada'; });
  });
  var _semanaHoras = new Set(_semanaAppts.map(function(a){ return parseInt((a.time||'09:00').split(':')[0]); }));
  var horas = [];
  for (var _hiw = 0; _hiw <= 23; _hiw++) {
    if ((_hiw >= _hTrabalhoIniW && _hiw <= _hTrabalhoFimW) || _semanaHoras.has(_hiw)) horas.push(_hiw);
  }
  var diasAbrev = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

  // Cabeçalho
  var cabHtml = '<div style="padding:10px 0"></div>';
  dias.forEach(function(di){
    var isH = di.isHoje;
    var isBloqH = isDiaBlockeado(di.iso);
    cabHtml += '<div style="padding:10px 8px;text-align:center;border-bottom:2px solid '+(isH?'var(--sage)':isBloqH?'var(--muted)':'var(--border)')
      +';'+(isH?'background:var(--sage-light);border-radius:8px 8px 0 0':isBloqH?'background:var(--bg);opacity:.6':'') +'">'
      + '<div style="font-size:12px;color:'+(isH?'var(--sage)':isBloqH?'var(--muted)':'var(--muted)')+'">'+diasAbrev[di.date.getDay()]+'</div>'
      + '<div style="font-weight:'+(isH?'700':'600')+';color:'+(isH?'var(--sage)':isBloqH?'var(--muted)':'var(--ink)')+'">'+di.date.getDate()+'</div>'
      + (isH?'<div style="font-size:10px;color:var(--sage)">hoje</div>':isBloqH?'<div style="font-size:10px;color:var(--muted)">bloqueado</div>':'')
      + '</div>';
  });

  var gridHtml = '<div style="display:grid;grid-template-columns:56px repeat(5,1fr);gap:0;min-width:560px">'
    + cabHtml;

  horas.forEach(function(h){
    var horaStr = String(h).padStart(2,'0')+':00';
    var _foraLabelW = h < _hTrabalhoIniW || h > _hTrabalhoFimW;
    gridHtml += '<div style="padding:6px 8px;font-size:11px;color:var(--muted);border-top:1px solid var(--border);display:flex;align-items:flex-start;padding-top:10px;background:var(--bg);opacity:'+(_foraLabelW?'.4':'1')+'">'+horaStr+'</div>';
    dias.forEach(function(di, ci){
      var appts = appointments.filter(function(a){
        return a.date===di.iso && a.status!=='cancelada' && parseInt((a.time||'09:00').split(':')[0])===h;
      });
      var isLast = ci===4;
      var _foraHorarioW = h < _hTrabalhoIniW || h > _hTrabalhoFimW;
      var bg = di.isHoje ? 'rgba(74,124,89,.04)' : (_foraHorarioW ? 'var(--bg)' : 'var(--white)');
      var clickEmpty = 'onclick="showAgendarModal(\''+di.iso+'\',\''+horaStr+'\')"';
      var isBloq = isDiaBlockeado(di.iso);
      var bgFinal = isBloq ? 'var(--bg)' : bg;
      gridHtml += '<div style="border-top:1px solid var(--border);'+(isLast?'':'border-right:1px solid var(--border);')+'padding:3px;min-height:52px;background:'+bgFinal+';position:relative" class="week-cell">';
      if (isBloq) {
        gridHtml += '<div style="font-size:10px;color:var(--muted);padding:4px;text-align:center">⛔</div>';
      } else if (appts.length === 0) {
        gridHtml += '<div class="week-cell-add" '+clickEmpty+' title="Agendar '+horaStr+' — '+diasAbrev[di.date.getDay()]+'"><span>+</span></div>';
      }
      appts.forEach(function(a){
        if (a.patientIdx < 0 || !a.id || !a.time) return;
        var isPastW = di.iso < hoje || (di.iso === hoje && parseInt((a.time||'23:59').split(':')[0]) < new Date().getHours());
        var pBadge = '';
        if (a.presenca === 'compareceu') pBadge = '<div style="font-size:9px;color:var(--sage-dark);background:var(--sage-light);border-radius:6px;padding:1px 4px;margin-top:2px;display:inline-block">✓</div>';
        else if (a.presenca === 'faltou') pBadge = '<div style="font-size:9px;color:var(--red);background:var(--red-light);border-radius:6px;padding:1px 4px;margin-top:2px;display:inline-block">✗</div>';
        else if (a.presenca === 'atrasou') pBadge = '<div style="font-size:9px;color:var(--amber);background:var(--amber-light);border-radius:6px;padding:1px 4px;margin-top:2px;display:inline-block">~</div>';
        else if (isPastW) pBadge = '<div style="display:flex;gap:2px;margin-top:2px">'
          + '<span onclick="event.stopPropagation();marcarPresenca(\''+a.id+'\',\'compareceu\')" style="font-size:9px;cursor:pointer;color:var(--sage-dark);background:var(--sage-light);border-radius:4px;padding:1px 3px" title="Compareceu">✓</span>'
          + '<span onclick="event.stopPropagation();marcarPresenca(\''+a.id+'\',\'faltou\')" style="font-size:9px;cursor:pointer;color:var(--red);background:var(--red-light);border-radius:4px;padding:1px 3px" title="Faltou">✗</span>'
          + '</div>';
        else if (a.confirmada) pBadge = '<div style="font-size:9px;color:var(--sage-dark);background:var(--sage-light);border-radius:6px;padding:1px 4px;margin-top:2px;display:inline-block" title="Presença confirmada pelo paciente">✓ conf.</div>';
        // Clique unificado com a view Dia: abre o popup de opções (antes entrava
        // direto na Sessão — um clique de consulta iniciava atendimento). V3.
        gridHtml += '<div class="'+escHTML(a.color)+' appt-block" style="font-size:11px;padding:3px 5px;margin-bottom:2px" title="'+escHTML(a.patientName)+' — '+escHTML(a.abordagem||'')+'">'
          + '<div style="cursor:pointer" onclick="event.stopPropagation();_mostrarOpcoesAppt('+a.patientIdx+','+a.id+')">'
          + '<strong>'+escHTML(_firstName(a.patientName))+'</strong><br/>'+escHTML(a.abordagem||'')+' '+(a.time||'')+'</div>'
          + pBadge
          + '</div>';
      });
      gridHtml += '</div>';
    });
  });

  gridHtml += '</div>';
  container.innerHTML = '<div class="card" style="overflow-x:auto">'+gridHtml+'</div>';
}

var agendaCompacto = localStorage.getItem('tf_agenda_compact') === '1';

function toggleAgendaCompacto() {
  agendaCompacto = !agendaCompacto;
  try { localStorage.setItem('tf_agenda_compact', agendaCompacto ? '1' : '0'); } catch(e){}
  _aplicarModoCompactoAgenda();
  if (agendaCurrentView === 'dia') renderDayView();
  else if (agendaCurrentView === 'semana') renderWeekView();
  else renderMonthView();
}

function _aplicarModoCompactoAgenda() {
  var pg = document.getElementById('page-agenda');
  if (!pg) return;
  pg.classList.toggle('agenda-compacto', agendaCompacto);
  var btn = document.getElementById('btn-agenda-compacto');
  if (btn) btn.textContent = agendaCompacto ? '⊞ Normal' : '⊡ Compacto';
}

function exportarAgendaICS() {
  if (!appointments || !appointments.length) { showToast('Nenhuma sessão para exportar.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var nomeT = acc.nome || 'Terapeuta';
  function fmtICS(dateIso, timeStr) {
    // dateIso: YYYY-MM-DD, timeStr: HH:MM or empty
    var d = dateIso.replace(/-/g,'');
    if (!timeStr) return d;
    var t = timeStr.replace(':','') + '00';
    return d + 'T' + t;
  }
  function fmtICSEnd(dateIso, timeStr, durMin) {
    if (!timeStr) return dateIso.replace(/-/g,'');
    var parts = timeStr.split(':').map(Number);
    var mins = parts[0]*60 + parts[1] + (durMin || 50);
    var h = String(Math.floor(mins/60)%24).padStart(2,'0');
    var m = String(mins%60).padStart(2,'0');
    return dateIso.replace(/-/g,'') + 'T' + h + m + '00';
  }
  var lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Teravia//PT','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  appointments.filter(function(a){ return a.status !== 'cancelada'; }).forEach(function(a, i) {
    var p = patients[a.patientIdx];
    var nome = p ? p.name : a.patientName || 'Paciente';
    var uid = 'tf-' + (a.id || i) + '@teravia';
    var dtStart = fmtICS(a.date, a.time);
    var dtEnd   = fmtICSEnd(a.date, a.time, a.duration || 50);
    var allDay  = !a.time;
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('SUMMARY:Sessão — ' + nome);
    lines.push('DESCRIPTION:Abordagem: ' + (a.abordagem||'—') + '\\nTerapeuta: ' + nomeT);
    lines.push('LOCATION:Consultório');
    if (allDay) { lines.push('DTSTART;VALUE=DATE:' + dtStart); lines.push('DTEND;VALUE=DATE:' + dtEnd); }
    else        { lines.push('DTSTART:' + dtStart); lines.push('DTEND:' + dtEnd); }
    lines.push('STATUS:' + (a.status === 'cancelada' ? 'CANCELLED' : 'CONFIRMED'));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'teravia-agenda.ics';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('📅 Agenda exportada — importe no Google Calendar ou Apple Calendar.');
}

function initAgenda() {
  carregarAppointments();
  agendaCurrentDate = new Date();
  agendaCompacto = localStorage.getItem('tf_agenda_compact') === '1';
  _aplicarModoCompactoAgenda();
  agendaSetView(agendaCurrentView || 'dia');
}


// ── Horários de atendimento e bloqueios ──
var DIAS_SEMANA_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var DEFAULT_HORARIOS = { 1:true, 2:true, 3:true, 4:true, 5:true }; // Seg–Sex

function carregarHorarios() {
  try { return JSON.parse(localStorage.getItem('tf_horarios') || 'null'); } catch(e) { return null; }
}

function salvarHorarios() {
  var dias = {};
  DIAS_SEMANA_PT.forEach(function(d, i) {
    var cb = document.getElementById('hora-dia-' + i);
    if (cb) dias[i] = cb.checked;
  });
  var inicio = document.getElementById('horario-inicio')?.value || '08:00';
  var fim    = document.getElementById('horario-fim')?.value    || '18:00';
  var h24    = !!document.getElementById('horario-24h')?.checked;
  var config = { dias: dias, inicio: inicio, fim: fim, h24: h24 };
  try { localStorage.setItem('tf_horarios', JSON.stringify(config)); } catch(e) {}
  if (typeof _supaSync_settings === 'function') _supaSync_settings();
  return config;
}

function initHorariosGrid() {
  var grid = document.getElementById('horarios-grid');
  if (!grid) return;
  var saved = carregarHorarios();
  var diasAtivos = saved ? saved.dias : DEFAULT_HORARIOS;
  var inicio = saved ? saved.inicio : '08:00';
  var fim    = saved ? saved.fim    : '18:00';

  // Popula horário inicio/fim
  var inpI = document.getElementById('horario-inicio');
  var inpF = document.getElementById('horario-fim');
  if (inpI) inpI.value = inicio;
  if (inpF) inpF.value = fim;
  var inp24 = document.getElementById('horario-24h');
  if (inp24) inp24.checked = !!(saved && saved.h24);

  grid.innerHTML = '';
  DIAS_SEMANA_PT.forEach(function(nome, i) {
    var checked = diasAtivos[i] !== undefined ? diasAtivos[i] : !!DEFAULT_HORARIOS[i];
    var div = document.createElement('label');
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);cursor:pointer;transition:all .15s;background:'+(checked?'var(--sage-light)':'#fff');
    div.innerHTML = '<input type="checkbox" id="hora-dia-'+i+'" '+(checked?'checked':'')+' style="accent-color:var(--sage);width:16px;height:16px" onchange="this.closest(\'label\').style.background=this.checked?\'var(--sage-light)\':\'#fff\'">'
      + '<span style="font-size:13px;font-weight:500;color:var(--ink)">'+nome+'</span>'
      + (i === 0 || i === 6 ? '<span style="font-size:11px;color:var(--muted);margin-left:auto">Fim de semana</span>' : '');
    grid.appendChild(div);
  });
}

/* ── BLOQUEIOS DE HORÁRIO ── */
var bloqueios = [];
try { bloqueios = JSON.parse(localStorage.getItem('tf_bloqueios') || '[]'); } catch(e) { bloqueios = []; }

function salvarBloqueios() {
  try { localStorage.setItem('tf_bloqueios', JSON.stringify(bloqueios)); } catch(e) {}
  if (typeof _supaSync_settings === 'function') _supaSync_settings();
}

function abrirModalBloqueio() {
  var hoje = hojeISO();
  var inI = document.getElementById('bloq-inicio');
  var inF = document.getElementById('bloq-fim');
  if (inI) inI.value = hoje;
  if (inF) inF.value = hoje;
  showModal('modal-bloqueio');
}

function salvarBloqueio() {
  var inicio = document.getElementById('bloq-inicio')?.value;
  var fim    = document.getElementById('bloq-fim')?.value;
  var motivo = document.getElementById('bloq-motivo')?.value || 'folga';
  var obs    = document.getElementById('bloq-obs')?.value.trim() || '';
  if (!inicio || !fim) { showToast('Informe as datas do bloqueio.'); return; }
  if (fim < inicio)    { showToast('A data final deve ser igual ou posterior à inicial.'); return; }
  bloqueios.push({ id: Date.now(), inicio: inicio, fim: fim, motivo: motivo, obs: obs });
  bloqueios.sort(function(a,b){ return a.inicio.localeCompare(b.inicio); });
  salvarBloqueios();
  closeModal('modal-bloqueio');
  renderBloqueiosList();
  showToast('✓ Bloqueio salvo — ' + formatarDataBR(inicio) + (fim !== inicio ? ' a ' + formatarDataBR(fim) : ''));
}

function removerBloqueio(id) {
  bloqueios = bloqueios.filter(function(b){ return b.id !== id; });
  salvarBloqueios();
  renderBloqueiosList();
  showToast('Bloqueio removido.');
}

function renderBloqueiosList() {
  var el = document.getElementById('bloqueios-list');
  if (!el) return;
  if (!bloqueios.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">Nenhum bloqueio cadastrado.</div>';
    return;
  }
  var motivoLabel = { ferias:'Férias', feriado:'Feriado', folga:'Folga', congresso:'Congresso/curso', outro:'Outro' };
  var hoje = hojeISO();
  el.innerHTML = bloqueios.map(function(b) {
    var passado = b.fim < hoje;
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:' + (passado ? 'var(--bg)' : 'var(--amber-light)') + ';opacity:' + (passado ? '.6' : '1') + '">' +
      '<div style="font-size:20px">' + (b.motivo==='ferias'?'🏖':b.motivo==='feriado'?'🎉':b.motivo==='congresso'?'📚':'🚫') + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-weight:500;font-size:13.5px">' + (motivoLabel[b.motivo]||'Bloqueio') + (b.obs ? ' — ' + escHTML(b.obs) : '') + '</div>' +
        '<div style="font-size:12px;color:var(--muted)">' + formatarDataBR(b.inicio) + (b.fim !== b.inicio ? ' → ' + formatarDataBR(b.fim) : '') + '</div>' +
      '</div>' +
      '<button onclick="removerBloqueio(' + b.id + ')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:4px" title="Remover">✕</button>' +
    '</div>';
  }).join('');
}

function formatarDataBR(iso) {
  if (!iso) return '—';
  var p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function isDiaBlockeado(dateIso) {
  return bloqueios.some(function(b){ return dateIso >= b.inicio && dateIso <= b.fim; });
}
function _motivoBloqueio(dateIso) {
  var motivoLabel = { ferias:'Férias', feriado:'Feriado', folga:'Folga', congresso:'Congresso/curso', outro:'Outro' };
  var b = bloqueios.find(function(b){ return dateIso >= b.inicio && dateIso <= b.fim; });
  if (!b) return 'Bloqueado';
  return (motivoLabel[b.motivo] || 'Bloqueio') + (b.obs ? ': ' + b.obs : '');
}

// ── INIT: renderPatients é chamado via navigate() ──

// ── SUPERVISÃO IA ──
let supActivated = (function() {
  try { var v = localStorage.getItem('tf_sup_activated'); return v === null ? true : v === 'true'; } catch(e) { return true; }
})();

function _salvarSupActivated() {
  try { localStorage.setItem('tf_sup_activated', String(supActivated)); } catch(e) {}
}
