// 06-patients.js — CRUD de pacientes, demo data, renderização, cálculos, status

function calcularIdade(nascStr) {
  if (!nascStr) return '—';
  const nasc = new Date(nascStr);
  if (isNaN(nasc)) return '—';
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade > 0 ? idade : '—';
}

function lerCamposPaciente() {
  const nascimento = document.getElementById('np-nascimento')?.value || '';
  return {
    nome:       document.getElementById('np-nome')?.value.trim() || '',
    email:      document.getElementById('np-email')?.value.trim() || '',
    whatsapp:   document.getElementById('np-whatsapp')?.value.trim() || '',
    cidade:     document.getElementById('np-cidade')?.value.trim() || '—',
    cid:        document.getElementById('np-cid')?.value.trim() || '—',
    abordagem:  document.getElementById('np-abordagem')?.value || 'TCC',
    status:     document.getElementById('np-status')?.value || 'Nova',
    notes:      document.getElementById('np-queixa')?.value.trim() || '',
    nascimento,
    age:        calcularIdade(nascimento),
  };
}

function limparModalPaciente() {
  ['np-nome','np-email','np-whatsapp','np-cidade','np-cid','np-queixa','np-nascimento'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const selStatus = document.getElementById('np-status'); if (selStatus) selStatus.selectedIndex = 0;
  const selAb = document.getElementById('np-abordagem');
  if (selAb) {
    selAb.selectedIndex = 0;
    const ab = tfUserData?.abordagem || 'TCC';
    for (let o of selAb.options) { if (o.text === ab || o.value === ab) { o.selected = true; break; } }
  }
  document.getElementById('modal-paciente-titulo').textContent = 'Novo paciente';
  const btn = document.getElementById('btn-criar-paciente');
  btn.textContent = 'Criar ficha';
  btn.onclick = criarPaciente;
  const chk = document.getElementById('np-consentimento');
  if (chk) chk.checked = false;
  const wrap = document.getElementById('np-consentimento-wrap');
  if (wrap) wrap.style.display = '';
}

function fecharModalPaciente() {
  limparModalPaciente();
  closeModal('modal-novo-paciente');
}

function criarPaciente() {
  const d = lerCamposPaciente();
  if (!d.nome) { showToast('Informe o nome do paciente.'); return; }
  if (!d.whatsapp) { showToast('⚠ WhatsApp é obrigatório para enviar lembretes.'); document.getElementById('np-whatsapp').focus(); return; }
  if (!document.getElementById('np-consentimento')?.checked) { showToast('⚠ Confirme o consentimento LGPD do paciente para continuar.'); return; }
  const initials = d.nome.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  const colorPairs = [
    ['#4a7c59','#2a5238'],['#2c5f8a','#1a3d5c'],['#c97d2e','#9a5c1e'],
    ['#6a3d7a','#3d1f52'],['#8b2252','#5c0f35'],['#1a6b5e','#0d4a3f'],
    ['#7a5230','#4a2e14'],['#3d6b8a','#1e4a6b']
  ];
  const pair = colorPairs[patients.length % colorPairs.length];
  const color = pair[0];
  const colorGrad = `linear-gradient(135deg,${pair[0]},${pair[1]})`;
  const _newPatId = crypto.randomUUID();
  patients.push({
    initials, color, colorGrad,
    id: _newPatId,
    name: d.nome, email: d.email, whatsapp: d.whatsapp,
    nascimento: d.nascimento, age: d.age, cidade: d.cidade,
    abordagem: d.abordagem, cid: d.cid,
    status: d.status, sessions: 0,
    lastSession: '—', next: '—',
    progress: 0, mood: null, moodTrend: null,
    fin: '—', finStatus: 'ok', alert: null,
    notes: d.notes, exercises: []
  });
  _newLocalPatientIds.add(_newPatId);
  salvarPacientes();
  limparModalPaciente();
  closeModal('modal-novo-paciente');
  showToast('✓ Paciente criado com sucesso!');
  checkFirstPatientBanner();
  renderPatients();
  // Oferecer envio de acesso ao portal imediatamente
  const _newIdx = patients.length - 1;
  if (patients[_newIdx] && patients[_newIdx].whatsapp) {
    setTimeout(() => _showConvitePortalModal(_newIdx), 400);
  }
}

function _showConvitePortalModal(idx) {
  const p = patients[idx];
  if (!p) return;
  const modal = document.createElement('div');
  modal.id = 'modal-convite-portal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:380px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.2);text-align:center">
      <div style="font-size:36px;margin-bottom:12px">📲</div>
      <div style="font-family:'Instrument Serif',serif;font-size:20px;margin-bottom:8px">Enviar acesso ao portal?</div>
      <div style="font-size:13.5px;color:#6b7280;line-height:1.6;margin-bottom:20px">
        ${escHTML(_firstName(p.name))} receberá email e senha pelo WhatsApp para acessar o portal entre as sessões.
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="compartilharAcessoPortal(${idx});document.getElementById('modal-convite-portal').remove()" style="background:#4a7c59;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">✓ Sim, enviar via WhatsApp</button>
        <button onclick="document.getElementById('modal-convite-portal').remove()" style="background:none;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;color:#6b7280;font-family:inherit">Enviar depois</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function showEditarPaciente(i) {
  const p = patients[i];
  document.getElementById('np-nome').value        = p.name || '';
  document.getElementById('np-nascimento').value  = p.nascimento || '';
  document.getElementById('np-email').value       = p.email || '';
  document.getElementById('np-whatsapp').value    = p.whatsapp || '';
  document.getElementById('np-cidade').value      = p.cidade !== '—' ? p.cidade : '';
  document.getElementById('np-cid').value         = p.cid !== '—' ? p.cid : '';
  document.getElementById('np-queixa').value      = p.notes || '';
  // Abordagem
  const selAb = document.getElementById('np-abordagem');
  for (let o of selAb.options) { if (o.value === p.abordagem) { o.selected = true; break; } }
  // Status
  const selSt = document.getElementById('np-status');
  for (let o of selSt.options) { if (o.value === p.status) { o.selected = true; break; } }
  // Título e botão
  document.getElementById('modal-paciente-titulo').textContent = 'Editar paciente';
  const btn = document.getElementById('btn-criar-paciente');
  btn.textContent = 'Salvar alterações';
  btn.onclick = () => salvarEdicaoPaciente(i);
  // Oculta checkbox de consentimento no modo editar (já foi coletado no cadastro)
  const wrap = document.getElementById('np-consentimento-wrap');
  if (wrap) wrap.style.display = 'none';
  showModal('modal-novo-paciente');
}

function excluirPaciente(idx) {
  const p = patients[idx];
  if (!p) return;
  if (!confirm('Excluir permanentemente "' + p.name + '"?\n\nTodos os dados clínicos, notas e histórico serão removidos (LGPD — direito de exclusão). Esta ação não pode ser desfeita.')) return;

  // Remove paciente do array e persiste
  patients.splice(idx, 1);
  salvarPacientes();

  // Remove e re-indexa appointments deste paciente (muta in-place para preservar referências)
  var filteredAppts = appointments.filter(function(a) { return a.patientIdx !== idx; });
  appointments.splice(0, appointments.length, ...filteredAppts);
  appointments.forEach(function(a) { if (a.patientIdx > idx) a.patientIdx--; });
  _salvarAppointments();

  // Remove cobranças pelo nome do paciente (in-memory + localStorage + Supabase)
  var filteredChgs = charges.filter(function(c) { return c.patient !== p.name; });
  charges.splice(0, charges.length, ...filteredChgs);
  salvarCharges();

  // Remove do Supabase (assíncrono, sem bloquear UI)
  if (p.id) {
    (async function() {
      const { error } = await supa.from('patients').delete().eq('id', p.id);
      if (error) {
        console.warn('[LGPD] Falha ao excluir paciente do Supabase:', error.message);
        showToast('⚠ Dados removidos localmente, mas a exclusão na nuvem falhou. Verifique sua conexão e tente novamente.');
      }
    })();
  }

  showToast('✓ Paciente excluído — dados removidos conforme LGPD.');
  navigate('pacientes');
  renderPatients();
}

function salvarEdicaoPaciente(i) {
  const d = lerCamposPaciente();
  if (!d.nome) { showToast('Informe o nome do paciente.'); return; }
  const p = patients[i];
  p.name       = d.nome;
  p.email      = d.email;
  p.whatsapp   = d.whatsapp;
  p.nascimento = d.nascimento;
  p.age        = d.age;
  p.cidade     = d.cidade;
  p.cid        = d.cid;
  p.abordagem  = d.abordagem;
  p.status     = d.status;
  p.notes      = d.notes;
  p.initials   = d.nome.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  salvarPacientes();
  limparModalPaciente();
  closeModal('modal-novo-paciente');
  showToast('✓ Alterações salvas.');
  renderPatients();
}

function enviarWhatsappLembrete(i) {
  const p = patients[i];
  if (!p?.whatsapp) { showToast('Número de WhatsApp não cadastrado.'); return; }
  const n = _wppNumero(p.whatsapp);
  if (!n) { showToast('Número de WhatsApp inválido para este paciente.'); return; }
  // Busca próxima sessão real na agenda
  const hojeIso = hojeISO();
  const proxima = appointments.filter(function(a){
    return a.patientIdx === i && a.status !== 'cancelada' && a.date >= hojeIso;
  }).sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); })[0];
  var detalhe = '';
  if (proxima) {
    var d = new Date(proxima.date + 'T12:00');
    var dStr = d.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
    detalhe = ' marcada para ' + dStr + ' às ' + proxima.time;
  }
  const msg = `Olá ${_firstName(p.name)}! Lembrete da sua sessão de psicoterapia${detalhe}. Até breve! 😊`;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

function salvarSessionLink(i) {
  var p = patients[i];
  if (!p) return;
  var input = document.getElementById('pac-session-link-' + i);
  var link = input ? input.value.trim() : '';
  p.sessionLink = link || null;
  salvarPacientes();
  showToast(link ? '🔗 Link salvo — paciente já pode acessar' : 'Link removido');
  selectPatient(i);
}

function limparSessionLink(i) {
  var p = patients[i];
  if (!p) return;
  p.sessionLink = null;
  salvarPacientes();
  showToast('Link removido');
  selectPatient(i);
}

async function redefinirSenhaPaciente(i) {
  var p = patients[i];
  if (!p) return;
  var nova = prompt('Nova senha para ' + _firstName(p.name) + ':');
  if (nova === null) return;
  if (!nova.trim()) { showToast('Senha não pode ser vazia.'); return; }
  p.portalPassword = nova.trim();
  p.portalPasswordHash = await _portalHash(nova.trim());
  salvarPacientes();
  var el = document.getElementById('pac-senha-display-' + i);
  if (el) { el.dataset.real = p.portalPassword; el.dataset.visible = '0'; el.textContent = '••••••'; }
  showToast('Senha atualizada.');
}

async function compartilharAcessoPortal(i) {
  var p = patients[i];
  if (!p) return;

  // Garante UUID no paciente (necessário para Supabase)
  if (!p.id) {
    p.id = crypto.randomUUID();
    salvarPacientes();
  }

  // Gera senha forte se não tiver
  if (!p.portalPassword) {
    var _arr = new Uint8Array(4);
    crypto.getRandomValues(_arr);
    p.portalPassword = 'TF' + Array.from(_arr).map(function(b){ return b.toString(36); }).join('').toUpperCase().substring(0, 6);
    p.portalPasswordHash = await _portalHash(p.portalPassword);
    salvarPacientes();
  } else if (!p.portalPasswordHash) {
    p.portalPasswordHash = await _portalHash(p.portalPassword);
    salvarPacientes();
  }

  var nome = _firstName(p.name);
  var senha = p.portalPassword;

  // Obtém ID do terapeuta logado
  var acc = null;
  try { acc = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
  var therapistId = acc && acc.supa_id;

  // Tenta criar conta no Supabase (não bloqueia se falhar)
  if (therapistId && p.email) {
    // Sync antes para garantir que o paciente existe no banco
    await _supaSync_patients().catch(() => {});
    try {
      var r = await fetchWithTimeout('/api/invite-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
        body: JSON.stringify({
          email: p.email,
          password: senha,
          patientId: p.id,
          therapistId: therapistId,
          patientName: p.name,
        }),
      }, 15000);
      var result = await r.json();
      if (r.ok) {
        showToast('Acesso criado para ' + nome + '!');
        // Re-ativa portal caso tenha sido revogado anteriormente
        var _acc2 = JSON.parse(localStorage.getItem('tf_account') || '{}');
        if (_acc2.supa_id) {
          await supa.from('patient_users').update({ portal_active: true }).eq('patient_id', p.id).eq('therapist_id', _acc2.supa_id).then(() => {}, () => {});
        }
        p.portalRevogado = false;
        salvarPacientes();
      } else if (r.status === 409) {
        showToast('⚠ ' + result.error);
      } else {
        console.warn('[invite-patient]', result.error || result.warning);
      }
    } catch(e) {
      console.warn('[invite-patient] fetch error:', e.message);
    }
  }

  // Envia email com credenciais do portal (se tiver email cadastrado)
  if (p.email && typeof _sendEmail === 'function') {
    var _accP = JSON.parse(localStorage.getItem('tf_account') || '{}');
    _sendEmail('portal', p.email, {
      terapeutaNome: _accP.nome || (tfUserData && tfUserData.nome) || 'Seu terapeuta',
      pacienteNome: p.name,
      email: p.email,
      senha: senha,
      portalUrl: window.location.origin + '/paciente' + (p.email ? '?e=' + encodeURIComponent(p.email) : ''),
    });
  }
  _enviarWhatsAppAcesso(p, nome, senha);
}

function _enviarWhatsAppAcesso(p, nome, senha) {
  var terapeuta = (typeof tfUserData !== 'undefined' && tfUserData.nome ? tfUserData.nome.split(' ')[0] : 'sua terapeuta');
  var portalLink = window.location.origin + '/paciente' + (p.email ? '?e=' + encodeURIComponent(p.email) : '');
  var msg = 'Olá, ' + nome + '! 🌿\n\n'
    + 'Criei seu acesso ao portal TheraFlow — um espaço só seu para registrar seu humor, fazer exercícios e acompanhar sua jornada terapêutica entre nossas sessões.\n\n'
    + '📱 *Acesse aqui:*\n'
    + portalLink + '\n\n'
    + '🔑 *Suas credenciais:*\n'
    + 'Email: ' + (p.email || 'seu email') + '\n'
    + 'Senha: ' + senha + '\n\n'
    + 'No primeiro acesso você criará uma senha pessoal. Depois é só abrir o link e entrar!\n\n'
    + 'Qualquer dúvida é só me chamar. Até a próxima sessão! 💚\n'
    + '— ' + terapeuta;
  var tel = (p.whatsapp || '').replace(/\D/g,'');
  var url = 'https://wa.me/' + (tel ? '55' + tel : '') + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
}

async function revogarPortalPaciente(i) {
  var p = patients[i];
  if (!p) return;
  var nome = _firstName(p.name);
  if (!confirm('Desativar acesso de ' + nome + ' ao portal? Eles não conseguirão mais fazer login até você compartilhar o acesso novamente.')) return;
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    var therapistId = acc.supa_id;
    if (!therapistId) { showToast('Erro: terapeuta não identificado.'); return; }
    await supa
      .from('patient_users')
      .update({ portal_active: false })
      .eq('patient_id', p.id)
      .eq('therapist_id', therapistId);
    p.portalRevogado = true;
    salvarPacientes();
    showToast('Acesso de ' + nome + ' ao portal desativado.');
  } catch(e) {
    showToast('Erro ao desativar portal: ' + (e.message || 'tente novamente'));
  }
}

function toggleStatusDropdown(i) {
  const menu = document.getElementById('status-menu-' + i);
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  // fecha todos
  document.querySelectorAll('.status-dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

function alterarStatus(i, novoStatus) {
  const p = patients[i];
  if (!p) return;
  p.status = novoStatus;
  salvarPacientes();
  document.querySelectorAll('.status-dropdown-menu.open').forEach(m => m.classList.remove('open'));
  renderPatients();
  selectPatient(i);
  showToast('Status atualizado: ' + novoStatus);
}

// fecha dropdown ao clicar fora
document.addEventListener('click', function(e) {
  if (!e.target.closest('.status-dropdown-wrap')) {
    document.querySelectorAll('.status-dropdown-menu.open').forEach(m => m.classList.remove('open'));
  }
});

// ── PACIENTES ──
const DEMO_PATIENTS = [
  { _isDemo:true, initials:'CR', color:'#4a7c59', name:'Camila Rocha', email:'camila.rocha@gmail.com', whatsapp:'11987650001', age:28, cidade:'São Paulo, SP', abordagem:'TCC', cid:'F41.1 — TAG', status:'Ativa', sessions:12, lastSession:'24/03', next:'31/03', progress:60, mood:7, moodTrend:'up', fin:'Em dia', finStatus:'ok', alert:null,
    notes:'Progresso em reestruturação cognitiva. Autoexigência como tema central. Dormindo melhor nas últimas 2 semanas.',
    moodHistory:[4,5,4,6,5,7,6,7,7,8,7,7],
    prontuarioNotes:[
      {date:'10/01',text:'Primeira sessão. Paciente relata ansiedade intensa antes de apresentações no trabalho. Identificadas crenças de autoexigência e medo de julgamento.'},
      {date:'17/01',text:'Trabalho com pensamentos automáticos. Registro de situações de ansiedade. Tarefas de casa: diário de pensamentos.'},
      {date:'24/01',text:'Boa aderência ao diário. Percebe padrão de antecipação catastrófica. Exercícios de relaxamento introduzidos.'},
      {date:'07/02',text:'Melhora no sono relatada espontaneamente. Ansiedade ainda presente em contextos avaliativos. Técnica de respiração consolidada.'},
      {date:'21/02',text:'Exposição gradual iniciada. Apresentou para colega de confiança — sucesso. Autoconfiança em crescimento.'}
    ],
    exercises:[{id:1,title:'Diário de pensamentos',desc:'Registre 1 situação que gerou ansiedade, o pensamento automático e uma alternativa mais equilibrada.',tag:'tcc',done:true,concluidos:1,total:1},{id:2,title:'Relaxamento progressivo',desc:'Pratique a sequência de 10 minutos antes de dormir. Observe a diferença no sono.',tag:'relaxa',done:true,concluidos:1,total:1},{id:3,title:'Registro de humor diário',desc:'Preencha o check-in de humor no portal pelo menos 5 dias esta semana.',tag:'diario',done:false,concluidos:3,total:5},{id:4,title:'Exposição gradual — apresentação',desc:'Preparar 3 slides sobre qualquer tema e apresentar para uma pessoa de confiança.',tag:'exposicao',done:false,concluidos:0,total:1}]
  },
  { _isDemo:true, initials:'RA', color:'#2c5f8a', name:'Rafael Andrade', email:'rafael.andrade@outlook.com', whatsapp:'11987650002', age:35, cidade:'Campinas, SP', abordagem:'Psicanálise', cid:'F32.1 — Depressão', status:'Atenção', sessions:7, lastSession:'21/03', next:'24/03', progress:35, mood:3, moodTrend:'down', fin:'Atrasado', finStatus:'overdue', alert:'Risco clínico · linguagem de desesperança nas últimas 2 sessões',
    notes:'Resistência ao processo. Explorar vínculo terapêutico. Avaliar risco na próxima sessão.',
    moodHistory:[5,4,5,4,3,4,3],
    prontuarioNotes:[
      {date:'03/02',text:'Paciente relata sensação persistente de inutilidade. Resistência em falar sobre relacionamentos familiares. Transferência negativa observada.'},
      {date:'17/02',text:'Expressou frases de desesperança ("não vejo saída"). Avaliação de risco realizada — sem ideação ativa. Contrato terapêutico revisado.'},
      {date:'10/03',text:'Leve abertura ao processo. Trouxe memória da infância espontaneamente — ruptura familiar aos 12 anos. Material rico para trabalho analítico.'}
    ],
    exercises:[]
  },
  { _isDemo:true, initials:'MO', color:'#c97d2e', name:'Marcos Oliveira', email:'marcos.oliveira@gmail.com', whatsapp:'11987650003', age:42, cidade:'Santo André, SP', abordagem:'TCC', cid:'F51.0 — Insônia', status:'Ativa', sessions:5, lastSession:'20/03', next:'25/03', progress:25, mood:5, moodTrend:'stable', fin:'Pendente', finStatus:'pending', alert:null,
    notes:'Queixa de insônia e irritabilidade. Início promissor.',
    moodHistory:[4,5,5,5,5],
    prontuarioNotes:[
      {date:'28/02',text:'Queixa principal: insônia crônica há 2 anos. Irritabilidade no trabalho e família como consequências. Higiene do sono avaliada — vários hábitos inadequados identificados.'},
      {date:'07/03',text:'Introdução de protocolo de restrição de sono e higiene do sono. Resistência inicial do paciente ("não consigo mudar horários").'}
    ],
    exercises:[]
  },
  { _isDemo:true, initials:'JC', color:'#6a3d7a', name:'Juliana Costa', age:31, cidade:'São Paulo, SP', abordagem:'Sistêmica', cid:'F43.2 — Ajustamento', status:'Ativa', sessions:9, lastSession:'19/03', next:'26/03', progress:45, mood:7, moodTrend:'up', fin:'Em dia', finStatus:'ok', alert:null,
    notes:'Padrões relacionais com família de origem. Boa evolução — considerar reduzir frequência.',
    moodHistory:[5,5,6,6,7,6,7,7,7],
    prontuarioNotes:[
      {date:'10/01',text:'Conflito com família de origem — expectativas sobre casamento e filhos. Diferenciação do self como objetivo central.'},
      {date:'07/02',text:'Progresso na identificação de padrões relacionais. Conseguiu estabelecer limite com a mãe pela primeira vez.'},
      {date:'07/03',text:'Relacionamento com parceiro estabilizando. Considera reduzir frequência das sessões — avaliar na próxima.'}
    ],
    exercises:[]
  },
  { _isDemo:true, initials:'LF', color:'#8b2252', name:'Lúcia Fernandes', email:'lucia.fernandes@gmail.com', whatsapp:'11987650004', age:24, cidade:'São Bernardo, SP', abordagem:'—', cid:'—', status:'Nova', sessions:0, lastSession:'—', next:'24/03', progress:0, mood:null, moodTrend:null, fin:'—', finStatus:'ok', alert:null,
    notes:'Avaliação inicial agendada. Encaminhada por psiquiatra.',
    moodHistory:[], prontuarioNotes:[], exercises:[]
  },
  { _isDemo:true, initials:'PA', color:'#8b4513', name:'Pedro Alves', email:'pedro.alves@gmail.com', whatsapp:'11987650005', age:29, cidade:'Guarulhos, SP', abordagem:'TCC', cid:'F40.1 — Fobia social', status:'Ativa', sessions:3, lastSession:'17/03', next:'27/03', progress:15, mood:5, moodTrend:'stable', fin:'Atrasado', finStatus:'overdue', alert:null,
    notes:'Dificuldade de exposição em situações sociais. Comprometimento com as tarefas de casa inconsistente.',
    moodHistory:[4,5,5],
    prontuarioNotes:[
      {date:'03/03',text:'Fobia social significativa em contextos profissionais. Evitação de reuniões e conversas informais. Hierarquia de exposição mapeada.'},
      {date:'10/03',text:'Resistência às tarefas de casa — paciente não realizou a exposição combinada. Explorar motivação e barreiras.'}
    ],
    exercises:[]
  },
];
let patients = [];
let patientFilter = '';
let patientStatusFilter = '';
let patientAbordagemFilter = '';

function salvarPacientes() {
  try {
    localStorage.setItem('tf_patients', JSON.stringify(patients));
  } catch(e) {
    if (e && e.name === 'QuotaExceededError') {
      showToast('⚠ Armazenamento local cheio. Alguns dados podem não ter sido salvos.');
    } else {
      showToast('⚠ Erro ao salvar dados. Verifique o armazenamento do navegador.');
    }
  }
  // Se paciente está logado no portal, sync via sessão do paciente
  if (_loggedPatientData) {
    _supaPatientSync().catch(() => {});
  } else {
    // Debounce: evita 15+ syncs simultâneos em edições rápidas
    clearTimeout(_syncPatientsTimer);
    _syncPatientsTimer = setTimeout(function(){ _supaSync_patients().catch(function(){}); }, 1500);
  }
}

/* Sync de dados do paciente de volta para o Supabase (sessão do paciente) */
async function _supaPatientSync() {
  if (!_loggedPatientData) return; // Não executar no contexto do terapeuta
  const p = _loggedPatientData;
  if (!p || !p.id) return;
  try {
    await supaPatient.from('patients').update({
      metadata: {
        moodHistory: p.moodHistory || [],
        moodNotes: p.moodNotes || [],
        prontuarioNotes: p.prontuarioNotes || [],
        exercises: p.exercises || [],
        materials: p.materials || [],
        diary: p.diary || [],
        metas: p.metas || [],
        portalMetas: p.portalMetas || [],
        appointments: p.appointments || [],
        sessionLink: p.sessionLink || null,
        sessionLinkAt: p.sessionLinkAt || null,
        _moodLastDate: p._moodLastDate || null,
        mood: p.mood || null,
        fin: p.fin || null,
        forma_pagamento: p.forma_pagamento || null,
        portalPasswordHash: p.portalPasswordHash || null,
        checkInStreak: p.checkInStreak || 0,
        lastCheckInDate: p.lastCheckInDate || null,
        readMaterials: p.readMaterials || [],
        portalNota: p.portalNota || null,
        portalNotifHour: p.portalNotifHour || null,
        anamnese: p.anamnese || null,
        portalAnamneseAtiva: p.portalAnamneseAtiva || false,
      }
    }).eq('id', p.id);
  } catch(e) {
    console.warn('[supaPatient] sync falhou:', e.message);
  }
}

function carregarPacientes() {
  // Demo mode always uses fresh DEMO_PATIENTS — localStorage may have stale data with sessions:0
  if (window._tfDemo) {
    patients = JSON.parse(JSON.stringify(DEMO_PATIENTS));
    // Corrige datas hardcoded (março) para serem relativas a hoje
    var _dd = function(n) {
      var d = new Date(); d.setDate(d.getDate() + n);
      return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    };
    var _demoOff = [
      {last:-7,  next:0},   // Camila: última semana, sessão hoje
      {last:-22, next:2},   // Rafael: 3 semanas atrás, sessão depois de amanhã
      {last:-16, next:3},   // Marcos: 2 semanas atrás, sessão em 3 dias
      {last:-10, next:0},   // Juliana: semana passada, sessão hoje
      {last:null,next:0},   // Lúcia: nova, avaliação hoje
      {last:-20, next:2},   // Pedro: 3 semanas atrás, sessão depois de amanhã
    ];
    patients.forEach(function(p, i) {
      var off = _demoOff[i];
      if (!off) return;
      if (off.last !== null) p.lastSession = _dd(off.last);
      p.next = _dd(off.next);
    });
    return;
  }
  try {
    const raw = localStorage.getItem('tf_patients');
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length > 0) {
        // Remove demo patients que possam ter sido salvos acidentalmente em versões anteriores
        const clean = saved.filter(function(p) { return !p._isDemo; });
        patients = clean.length > 0 ? clean : saved;
        return;
      }
    }
  } catch(e) { console.warn('[TF] Erro ao carregar pacientes do localStorage:', e.message); }
  // Primeira vez: usa demo mas não salva no localStorage
  // O banner de "primeiro paciente" só some quando tf_patients existir (i.e., usuário criou um real)
  // Deep clone para não corromper o array DEMO_PATIENTS original
  patients = JSON.parse(JSON.stringify(DEMO_PATIENTS));
}

function temPacientesReais() {
  if (window._tfDemo) return true;
  try { return !!localStorage.getItem('tf_patients'); } catch(e) { return false; }
}
function _calcProgress(p) {
  // Progresso clínico 0–100 baseado em dados reais
  var pts = 0;
  // Sessões: até 40 pts (máx em 10 sessões)
  pts += Math.min(40, (p.sessions || 0) * 4);
  // Exercícios: até 30 pts pela taxa de conclusão
  var exArr = p.exercises || [];
  if (exArr.length > 0) {
    var exDone = exArr.filter(function(e){ return e.done || ((e.concluidos||0) >= (e.total||1)); }).length;
    pts += Math.round((exDone / exArr.length) * 30);
  }
  // Humor médio: até 15 pts
  var mh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; });
  if (mh.length > 0) {
    var avgMood = mh.reduce(function(s,v){ return s+v; }, 0) / mh.length;
    pts += Math.round((avgMood / 10) * 15);
  }
  // Tendência de humor: bônus até 15 pts
  if (mh.length >= 3) {
    var trend = mh[mh.length-1] - mh[0];
    pts += trend > 1 ? 15 : trend > 0 ? 10 : trend === 0 ? 7 : 0;
  }
  return Math.min(100, Math.max(0, pts));
}

function _recalcFinStatus() {
  // Computa finStatus/fin para todos os pacientes a partir de charges reais
  var chargesArr = (typeof charges !== 'undefined' ? charges : []).filter(function(c){ return !c.deleted; });
  // Indexar por nome do paciente
  var idx = {};
  chargesArr.forEach(function(c) {
    var n = c.patient; if (!n) return;
    if (!idx[n]) idx[n] = { overdue:false, pending:false, hasAny:true };
    // Vencida (overdue OU pending com data passada) → semáforo vermelho; pending futura → âmbar.
    if (_chargeVencida(c)) idx[n].overdue = true;
    else if (c.status === 'pending') idx[n].pending = true;
  });
  patients.forEach(function(p) {
    var d = idx[p.name];
    if (d) {
      if (d.overdue)      { p.finStatus = 'overdue'; p.fin = 'Atrasado'; }
      else if (d.pending) { p.finStatus = 'pending'; p.fin = 'Pendente'; }
      else                { p.finStatus = 'ok';      p.fin = 'Em dia'; }
    } else if (!p.fin || p.fin === '—') {
      p.finStatus = 'ok'; p.fin = '—';
    }
  });
}

function _recalcNextSessions() {
  if (typeof appointments === 'undefined') return;
  var nowIso = hojeISO();
  // Constrói mapa patientIdx → próxima data
  var mapa = {};
  var mapaKey = {};
  appointments.forEach(function(a) {
    if (a.status === 'cancelada' || a.date < nowIso) return;
    var key = a.date + 'T' + (a.time || '00:00');
    if (!mapaKey[a.patientIdx] || key < mapaKey[a.patientIdx]) {
      mapa[a.patientIdx] = a.date;
      mapaKey[a.patientIdx] = key;
    }
  });
  patients.forEach(function(p, i) {
    if (mapa[i]) {
      var np = mapa[i].split('-');
      p.next = np[2] + '/' + np[1] + '/' + np[0];
    } else if (p.sessions > 0) {
      p.next = '—';
    }
  });
}

function _recalcSessions() {
  // Demo patients have accurate sessions in DEMO_PATIENTS — don't overwrite with appointment counts
  if (window._tfDemo) return;
  // Conta sessões realizadas a partir de appointments com presença='compareceu'
  // Só atualiza se o valor de appointments for >= ao armazenado (não regride)
  if (typeof appointments === 'undefined') return;
  var contadores = {};
  appointments.forEach(function(a) {
    if (a.presenca === 'compareceu' && a.patientIdx !== undefined && a.patientIdx >= 0) {
      contadores[a.patientIdx] = (contadores[a.patientIdx] || 0) + 1;
    }
  });
  patients.forEach(function(p, i) {
    var contAppt = contadores[i] || 0;
    // Só sobrescreve sessions se há dados reais de presença para o paciente;
    // caso contrário preserva o valor existente (ex.: dados demo).
    var hasPresenca = appointments.some(function(a){ return a.patientIdx === i && a.presenca; });
    if (hasPresenca) p.sessions = contAppt;
  });
}

function _recalcAllProgress() {
  patients.forEach(function(p){ p.progress = _calcProgress(p); });
}

function renderPatients(filter) {
  _recalcFinStatus();
  _recalcNextSessions();
  _recalcSessions();
  _recalcAllProgress();
  const list = document.getElementById('patient-list');
  if (!list) return;
  const q = (filter !== undefined ? filter : patientFilter).toLowerCase();
  const filtered = patients.map((p, i) => ({...p, _i: i})).filter(p => {
    if (patientStatusFilter && p.status !== patientStatusFilter) return false;
    if (patientAbordagemFilter && (!p.abordagem || !p.abordagem.toLowerCase().includes(patientAbordagemFilter.toLowerCase()))) return false;
    return !q || p.name.toLowerCase().includes(q) ||
      (p.abordagem||'').toLowerCase().includes(q) ||
      (p.cid||'').toLowerCase().includes(q) ||
      (p.cidade||'').toLowerCase().includes(q) ||
      (p.status||'').toLowerCase().includes(q);
  });
  if (!filtered.length) {
    const noPatients = patients.length === 0;
    list.innerHTML = noPatients
      ? `<div style="padding:48px 24px;text-align:center;color:var(--muted)">
           <div style="font-size:40px;margin-bottom:12px">🌱</div>
           <div style="font-weight:600;font-size:15px;color:var(--ink-soft);margin-bottom:6px">Nenhum paciente cadastrado</div>
           <div style="font-size:13px;margin-bottom:20px">Adicione seu primeiro paciente para começar a usar o TheraFlow.</div>
           <button class="btn-primary" onclick="showModal('modal-novo-paciente')">+ Novo paciente</button>
         </div>`
      : `<div style="padding:32px;text-align:center;color:var(--muted)">
           <div style="font-size:28px;margin-bottom:8px">🔍</div>
           <div style="font-weight:600;margin-bottom:4px">Nenhum paciente encontrado</div>
           <div style="font-size:12px">Tente outro termo ou limpe o filtro</div>
         </div>`;
    document.getElementById('patient-detail').innerHTML = '';
    return;
  }
  list.innerHTML = filtered.map((p, fi) => {
    const _inits = p.initials || (p.name ? p.name.trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : '?');
    // Semáforo dinâmico: usa dados reais (mood, fin, faltas)
    var _semRisco = false, _semAtencao = false;
    if (p.moodHistory && p.moodHistory.length >= 2) {
      var _ult = p.moodHistory.filter(function(v){return v!==null&&v!==undefined;});
      if (_ult.length >= 2 && (_ult[_ult.length-1] <= 3 || (_ult[_ult.length-1] < _ult[_ult.length-2] - 1.5))) _semRisco = true;
      else if (_ult[_ult.length-1] <= 5) _semAtencao = true;
    }
    if (p.finStatus === 'overdue') _semAtencao = true;
    const alertDot = _semRisco
      ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--red);flex-shrink:0" title="Alerta clínico"></span>'
      : _semAtencao
        ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--amber);flex-shrink:0" title="Atenção"></span>'
        : p.alert
          ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--amber);flex-shrink:0" title="' + escHTML(p.alert) + '"></span>'
          : '';
    const statusClass = p.status==='Ativa'?'tag-green':p.status==='Nova'?'tag-blue':p.status==='Atenção'?'tag-red':'tag-amber';
    const nextShort = p.next ? p.next.replace(/(\d{2})\/(\d{2})(?:\/\d{4})?/, '$1/$2') : '—';
    const finDot = p.finStatus === 'overdue'
      ? '<span style="font-size:10px;color:var(--red)" title="Cobrança em atraso">●</span>'
      : p.finStatus === 'pending'
      ? '<span style="font-size:10px;color:var(--amber)" title="Cobrança pendente">●</span>'
      : '';
    var _msgUnread = p.id ? _countUnread(p.id, 'therapist') : 0;
    var msgBadgeHtml = p.id ? '<span id="pac-msg-badge-'+p.id+'" style="'
      + (_msgUnread > 0 ? '' : 'display:none;')
      + 'background:var(--sage);color:#fff;border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;min-width:14px;text-align:center;line-height:14px">'
      + (_msgUnread || 0) + '</span>' : '';
    return `<div class="list-item ${fi===0?'active':''}" onclick="selectPatientFiltered(${p._i},this)" style="animation:itemStagger .3s ease both;animation-delay:${fi*45}ms">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="patient-avatar" style="background:${p.colorGrad||p.color||'#4a7c59'};color:#fff;width:52px;height:52px;font-size:17px;flex-shrink:0;border-radius:50%">${_inits}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
            <div style="font-weight:600;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHTML(p.name)}</div>
            ${alertDot}${finDot}${msgBadgeHtml}
          </div>
          <div style="font-size:12px;color:var(--muted)">${escHTML(p.abordagem)} · Sessão ${p.sessions}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <span class="tag ${statusClass}" style="font-size:10px;padding:2px 8px">${p.status}</span>
          <span style="font-size:11px;color:var(--sage);font-weight:500">Próx ${nextShort}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  selectPatientFiltered(filtered[0]._i, list.querySelector('.list-item'));
}

function selectPatientFiltered(i, el) {
  document.querySelectorAll('#patient-list .list-item').forEach(x => x.classList.remove('active'));
  if (el) el.classList.add('active');
  selectPatient(i, el);
}

var _searchPatientsTimer = null;
function searchPatients(val) {
  patientFilter = val;
  const clr = document.getElementById('patient-search-clear');
  if (clr) clr.style.display = val ? 'inline' : 'none';
  clearTimeout(_searchPatientsTimer);
  _searchPatientsTimer = setTimeout(function(){ renderPatients(val); }, 150);
}
function filterPatientsByStatus(val) {
  patientStatusFilter = val;
  renderPatients();
}
function filterPatientsByAbordagem(val) {
  patientAbordagemFilter = val;
  renderPatients();
}

// ── PATIENT DETAIL TABS ──
function selectPatientTab(tabName) {
  currentPatientTab = tabName;
  document.querySelectorAll('#ptab-bar .ptab').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  var i = currentPatientIdx;
  if (tabName === 'overview')      renderPatientOverview(i);
  else if (tabName === 'notas')    renderPatientNotas(i);
  else if (tabName === 'ficha')    renderPatientFicha(i);
  else if (tabName === 'plano')    renderPatientPlano(i);
  else if (tabName === 'anamnese') renderPatientAnamnese(i);
  else if (tabName === 'briefing') renderPatientBriefing(i);
}

function _renderTabPlaceholder(tabName) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var labels = { notas:'Notas & Timeline', ficha:'Ficha Clínica', briefing:'Briefing IA', portal:'Portal' };
  content.innerHTML = '<div style="padding:40px 0;text-align:center;color:var(--muted)">'
    + '<div style="font-size:28px;margin-bottom:12px">⚙</div>'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">' + (labels[tabName]||tabName) + '</div>'
    + '<div style="font-size:13px">Em implementação — aguarde os próximos sprints</div></div>';
}

function renderPatientDetailShell(i) {
  var p = patients[i];
  if (!p) return;
  var initials = p.initials || (p.name ? p.name.trim().split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase() : '?');
  var tabDefs = [
    ['overview','Visão Geral'],['notas','Notas & Timeline'],
    ['ficha','Ficha Clínica'],['plano','Plano'],
    ['anamnese','Anamnese'],['briefing','Briefing IA']
  ];
  var tabBarHtml = '<div class="patient-tab-bar" id="ptab-bar">'
    + tabDefs.map(function(td){
        return '<button class="ptab'+(currentPatientTab===td[0]?' active':'')+'" data-tab="'+td[0]+'" onclick="selectPatientTab(\''+td[0]+'\')">'+td[1]+'</button>';
      }).join('')
    + '</div>';

  document.getElementById('patient-detail').innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar" style="background:${p.colorGrad||p.color||'#4a7c59'}">${initials}</div>
      <div>
        <div class="detail-name">${escHTML(p.name)}</div>
        <div class="detail-meta">
          <span>🎂 ${p.age !== '—' && p.age ? p.age + ' anos' : '—'}</span>
          <span>📍 ${escHTML(p.cidade)}</span>
          <span>📋 ${escHTML(p.abordagem)}</span>
          <span>🗓 Próxima: ${p.next || '—'}</span>
          <span style="display:flex;align-items:center;gap:4px">
            ✉️ <a href="mailto:${p.email}" style="color:var(--sage);text-decoration:none;font-size:12px">${p.email}</a>
            <button onclick="event.stopPropagation();navigator.clipboard?.writeText('${p.email}');showToast('Email copiado!')" style="background:none;border:none;cursor:pointer;font-size:10px;color:var(--muted);padding:0 2px" title="Copiar email">⎘</button>
          </span>
        </div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        <div class="status-dropdown-wrap" id="status-wrap-${i}">
          <span class="tag ${p.status==='Ativa'?'tag-green':p.status==='Nova'?'tag-blue':p.status==='Atenção'?'tag-red':'tag-amber'} status-tag-btn" onclick="toggleStatusDropdown(${i})" title="Clique para alterar status">${p.status}</span>
          <div class="status-dropdown-menu" id="status-menu-${i}">
            <div class="status-dropdown-item" onclick="alterarStatus(${i},'Ativa')"><span class="dot" style="background:#4a7c59"></span><div><strong>Ativa</strong><span class="desc">Em acompanhamento regular</span></div></div>
            <div class="status-dropdown-item" onclick="alterarStatus(${i},'Nova')"><span class="dot" style="background:#2c5f8a"></span><div><strong>Nova</strong><span class="desc">Avaliação inicial pendente</span></div></div>
            <div class="status-dropdown-item" onclick="alterarStatus(${i},'Atenção')"><span class="dot" style="background:#c0392b"></span><div><strong>Atenção</strong><span class="desc">Falta, crise ou alerta clínico</span></div></div>
            <div class="status-dropdown-item" onclick="alterarStatus(${i},'Pausa')"><span class="dot" style="background:#c97d2e"></span><div><strong>Pausa</strong><span class="desc">Tratamento suspenso temporariamente</span></div></div>
            <div class="status-dropdown-item" onclick="alterarStatus(${i},'Inativa')"><span class="dot" style="background:#8a9490"></span><div><strong>Inativa</strong><span class="desc">Alta ou abandono</span></div></div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="showEditarPaciente(${i})" title="Editar dados do paciente">✎ Editar</button>
        <button class="btn btn-purple btn-sm" onclick="selectPatientTab('briefing')">✦ Briefing IA</button>
        <button class="btn btn-primary btn-sm" onclick="currentSessionPatientIdx=${i};navigate('sessao')">▶ Sessão</button>
      </div>
    </div>
  ` + tabBarHtml + '<div id="patient-detail-tab-content" class="ptab-content"></div>';
}

function renderPatientOverview(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  const moodColor = p.mood >= 7 ? 'var(--sage)' : p.mood >= 5 ? 'var(--amber)' : 'var(--red)';
  const moodTrendIcon = p.moodTrend === 'up' ? '↑' : p.moodTrend === 'down' ? '↓' : '→';
  const moodTrendColor = p.moodTrend === 'up' ? 'var(--sage)' : p.moodTrend === 'down' ? 'var(--red)' : 'var(--muted)';
  const alertBlock = p.alert ? `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:var(--amber-light);border-radius:10px;border-left:3px solid var(--amber);margin-bottom:16px">
      <span style="font-size:16px">⚠</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Supervisão IA</div>
        <div style="font-size:13px;color:var(--ink-soft)">${p.alert}</div>
      </div>
      <button onclick="navigate('supervisao')" style="margin-left:auto;flex-shrink:0;background:none;border:1px solid var(--amber);color:var(--amber);padding:4px 10px;border-radius:6px;font-size:11.5px;cursor:pointer;font-family:inherit;white-space:nowrap">Ver análise →</button>
    </div>` : '';
  var moodSparkline = '';
  if (p.moodHistory && p.moodHistory.length >= 3) {
    var mh = p.moodHistory.slice(-10).filter(function(v){ return v !== null && v !== undefined; });
    if (mh.length >= 2) {
      var spW = 60, spH = 24;
      var spPts = mh.map(function(v, ii){ return { x: (ii/(mh.length-1))*spW, y: spH - (v/10)*spH }; });
      var spLine = spPts.map(function(pt, ii){ return (ii===0?'M':'L')+pt.x.toFixed(1)+','+pt.y.toFixed(1); }).join(' ');
      moodSparkline = '<svg viewBox="0 0 '+spW+' '+spH+'" style="width:60px;height:24px;margin-left:auto" preserveAspectRatio="none">'
        + '<path d="'+spLine+'" fill="none" stroke="'+moodColor+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="'+spPts[spPts.length-1].x.toFixed(1)+'" cy="'+spPts[spPts.length-1].y.toFixed(1)+'" r="2.5" fill="'+moodColor+'"/>'
        + '</svg>';
    }
  }
  const moodBlock = p.mood !== null ? `
    <div class="stat-card card-sm" style="display:flex;align-items:center;gap:12px">
      <div style="flex:1">
        <div class="stat-label">Humor (portal)</div>
        <div style="font-family:'Instrument Serif',serif;font-size:26px;color:${moodColor};margin-top:4px">${p.mood}<span style="font-size:14px;color:var(--muted)">/10</span></div>
        <div style="font-size:11px;color:${moodTrendColor};margin-top:2px">${moodTrendIcon} ${p.moodTrend==='up'?'Melhorando':p.moodTrend==='down'?'Em queda':'Estável'}</div>
      </div>
      ${moodSparkline}
    </div>` : `<div class="stat-card card-sm"><div class="stat-label">Humor</div><div style="font-size:13px;color:var(--muted);margin-top:8px">Sem registro no portal</div></div>`;
  const finBlock = `
    <div class="stat-card card-sm">
      <div class="stat-label">Financeiro</div>
      <div style="margin-top:6px">
        <span class="tag ${p.finStatus==='ok'?'tag-green':p.finStatus==='overdue'?'tag-red':'tag-amber'}">${p.fin}</span>
      </div>
    </div>`;
  const tarefasPaciente = (typeof tasks !== 'undefined' ? tasks : []).filter(function(t){ return t.status==='aberta' && t.patientName===p.name; });
  const taskBlock = tarefasPaciente.length === 0 ? '' : `
    <div style="margin-bottom:16px;padding:12px 14px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Tarefas abertas · ${tarefasPaciente.length}</div>
        <button onclick="abrirModalNovaTarefaPaciente('${p.name.replace(/'/g,"\\'")}','${i}')" style="background:none;border:none;color:var(--sage);font-size:12px;cursor:pointer;font-family:inherit;font-weight:600;padding:0">+ Adicionar</button>
      </div>
      ${tarefasPaciente.map(function(t){
        var dtObj = formatarDataTarefa(t.dueDate);
        var dtText = typeof dtObj==='object'?dtObj.text:dtObj;
        var dtCls  = typeof dtObj==='object'?dtObj.cls:'';
        var dateLabel = t.dueDate ? ' <span style="font-size:11px;color:'+(dtCls==='overdue'?'var(--red)':dtCls==='today'?'var(--amber)':'var(--muted)')+'">· '+dtText+'</span>' : '';
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">'
          +'<button onclick="toggleTarefa('+t.id+');selectPatient('+i+')" aria-label="Concluir tarefa" title="Concluir tarefa" style="flex-shrink:0;padding:3px 9px;border-radius:20px;border:1.5px solid var(--sage);background:var(--sage-light);color:var(--sage);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background=\'var(--sage)\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'var(--sage-light)\';this.style.color=\'var(--sage)\'">✓</button>'
          +'<span style="flex:1;font-size:13px;color:var(--ink-soft)">'+escHTML(t.title)+dateLabel+'</span>'
          +'<button onclick="editarTarefa('+t.id+')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:5px" title="Editar">✏</button>'
          +'</div>';
      }).join('')}
    </div>`;

  content.innerHTML = `
    <div class="divider"></div>
    ${alertBlock}

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      <div class="stat-card card-sm">
        <div class="stat-label">Sessões</div>
        <div style="font-family:'Instrument Serif',serif;font-size:26px;margin-top:4px">${p.sessions}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Última: ${p.lastSession || '—'}</div>
      </div>
      <div class="stat-card card-sm">
        <div class="stat-label">CID</div>
        <div style="font-size:13px;font-weight:500;margin-top:8px;line-height:1.4">${escHTML(p.cid)}</div>
      </div>
      ${moodBlock}
      ${finBlock}
    </div>

    <div style="margin-bottom:20px">` +
    (function(){
      var pidx = i;
      var sessoesPac = appointments.filter(function(a){ return a.patientIdx===pidx; });
      var compareceu = sessoesPac.filter(function(a){ return a.presenca==='compareceu'; }).length;
      var faltou = sessoesPac.filter(function(a){ return a.presenca==='faltou'; }).length;
      var total = sessoesPac.filter(function(a){ return a.presenca; }).length;
      if (total < 2) return '';
      var taxa = Math.round(compareceu/total*100);
      var taxaCor = taxa>=80?'var(--sage)':taxa>=60?'var(--amber)':'var(--red)';
      return '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:10px 14px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">' +
        '<div style="flex:1;font-size:12px;color:var(--muted)">Taxa de presença</div>' +
        '<div style="font-weight:700;color:'+taxaCor+'">'+taxa+'%</div>' +
        '<div style="font-size:11px;color:var(--muted)">'+compareceu+'✓ '+faltou+'✗ de '+total+' registradas</div></div>';
    })() +
    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:12px;color:var(--muted);font-weight:500">Progresso do plano terapêutico</div>
        <div style="font-size:12px;font-weight:600;color:${p.progress>=60?'var(--sage)':p.progress>=30?'var(--amber)':'var(--muted)'}">${p.progress}%</div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${p.progress}%;transition:width .6s"></div></div>
    </div>

    <div class="card card-sm" style="background:var(--bg);margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Última observação clínica</div>
      <div style="font-size:13.5px;color:var(--ink-soft);line-height:1.7;font-style:italic">"${escHTML(p.notes)}"</div>
    </div>

    ${taskBlock}

    ${renderTrajetoriaTerapeuta(i)}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="selectPatientTab('notas')">≡ Notas & Timeline</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="navigate('financeiro')">◈ Ver financeiro</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="exportarExtratoPaciente(${i})">📄 Extrato PDF</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center;background:#e8faf0;border-color:rgba(37,211,102,.3);color:#075E54" onclick="enviarWhatsappLembrete(${i})">
        📲 WhatsApp lembrete
      </button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="navigate('portal')">♡ Portal do paciente</button>
    </div>
    <div id="pac-chat-section-${i}" style="margin-top:16px">
      ${renderChatTerapeuta(i, _msgCache[p.id] || [])}
    </div>

    <div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="background:var(--blue-light);border:1px solid rgba(44,95,138,.15);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">🔑 Acesso ao portal</div>
        <div style="font-size:12.5px;color:var(--ink-soft);display:flex;flex-direction:column;gap:4px">
          <div>Email: <strong>${escHTML(p.email||'não cadastrado')}</strong></div>
          <div style="display:flex;align-items:center;gap:6px">Senha: <strong id="pac-senha-display-${i}" data-visible="0">••••••</strong>
            <button onclick="_toggleSenhaPortal(${i})" style="background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;padding:0 2px" title="Mostrar/ocultar senha">👁</button>
            <button onclick="redefinirSenhaPaciente(${i})" style="background:none;border:1px solid rgba(44,95,138,.3);color:var(--blue);font-size:11px;padding:2px 8px;border-radius:5px;cursor:pointer;font-family:inherit">Redefinir</button>
          </div>
          <button onclick="compartilharAcessoPortal(${i})" style="margin-top:8px;display:flex;align-items:center;gap:6px;background:#25d366;color:#fff;border:none;border-radius:7px;font-size:11.5px;font-weight:600;padding:6px 12px;cursor:pointer;font-family:inherit;width:100%;justify-content:center">📲 Compartilhar acesso via WhatsApp</button>
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(220,38,38,.12);text-align:right">
            <button onclick="revogarPortalPaciente(${i})" style="background:none;border:none;color:#b91c1c;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline;opacity:.7" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.7'">Desativar acesso ao portal</button>
          </div>
          <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(44,95,138,.12)">
            <div style="font-size:11px;color:var(--blue);font-weight:600;margin-bottom:5px">🔗 Link da sala de sessão</div>
            <div style="display:flex;gap:6px;align-items:center">
              <input id="pac-session-link-${i}" type="url" placeholder="Cole o link da videochamada aqui"
                value="${escHTML(p.sessionLink||'')}"
                style="flex:1;font-size:12px;padding:5px 8px;border:1px solid rgba(44,95,138,.25);border-radius:7px;font-family:inherit;color:var(--ink);background:#fff;outline:none"
                onkeydown="if(event.key==='Enter')salvarSessionLink(${i})"
              />
              <button onclick="salvarSessionLink(${i})" style="background:var(--sage);color:#fff;border:none;border-radius:7px;font-size:11px;padding:5px 10px;cursor:pointer;font-family:inherit;white-space:nowrap">Salvar</button>
              ${p.sessionLink ? `<button onclick="limparSessionLink(${i})" style="background:none;border:1px solid rgba(192,57,43,.3);color:var(--red);border-radius:7px;font-size:11px;padding:5px 8px;cursor:pointer;font-family:inherit">✕</button>` : ''}
            </div>
            ${p.sessionLink ? `<div style="font-size:11px;color:var(--sage);margin-top:4px">✓ Link ativo — visível para o paciente no portal</div>` : `<div style="font-size:11px;color:var(--ink-soft);opacity:.7;margin-top:4px">Sem link — paciente verá mensagem de aguardo</div>`}
          </div>
        </div>
      </div>
      <button class="btn btn-sm" style="color:var(--red);border-color:rgba(192,57,43,.25);background:var(--red-light);justify-content:center;width:100%" onclick="excluirPaciente(${i})">
        ✕ Excluir paciente
      </button>
    </div>
  `;
}

function renderPatientNotas(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  // ── Notas clínicas ──
  var notasHtml = '<div style="display:flex;flex-direction:column;gap:12px">';

  if (p.portalNota && p.portalNota.trim()) {
    notasHtml += '<div style="background:#fffbec;border:1.5px solid #f0d060;border-radius:12px;padding:14px 16px">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
      + '<span style="font-size:16px">📝</span>'
      + '<span style="font-size:11px;font-weight:700;color:#c97d2e;text-transform:uppercase;letter-spacing:.5px">Nota pré-sessão do paciente</span>'
      + '<button onclick="if(confirm(\'Limpar nota?\')){ patients['+i+'].portalNota=\'\'; localStorage.setItem(\'tf_patients\',JSON.stringify(patients)); this.parentElement.parentElement.remove(); }" style="margin-left:auto;background:none;border:none;font-size:11px;color:var(--muted);cursor:pointer;padding:2px 6px;border-radius:4px">× Limpar</button>'
      + '</div>'
      + '<div style="font-size:14px;color:var(--ink);line-height:1.7;font-style:italic">"' + escHTML(p.portalNota.trim()) + '"</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:8px">Escrita pelo paciente no portal antes da sessão</div>'
      + '</div>';
  }

  if (p.prontuarioNotes && p.prontuarioNotes.length > 0) {
    p.prontuarioNotes.slice().reverse().forEach(function(n, ni) {
      var textoId = 'ptab-nota-' + i + '-' + ni;
      notasHtml += '<div class="card card-sm" style="border-left:3px solid var(--sage)">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<span style="font-weight:500">Sessão ' + (p.sessions - ni) + ' — ' + escHTML(n.date) + '</span>'
        + '<div style="display:flex;gap:6px;align-items:center">'
        + '<span class="tag tag-green">Indexada</span>'
        + '<button onclick="editarNotaTab(\'' + textoId + '\',this,' + i + ',\'' + n.date + '\')" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:11px;padding:2px 8px;color:var(--muted)">✎ Editar</button>'
        + '</div>'
        + '</div>'
        + '<p id="' + textoId + '" style="font-size:13.5px;color:var(--ink-soft);line-height:1.7">' + escHTML(n.text) + '</p>'
        + '</div>';
    });
  } else if (!p.portalNota) {
    notasHtml += '<div style="padding:20px 0;color:var(--muted);font-size:13px;font-style:italic;text-align:center">Nenhuma nota clínica registrada ainda.</div>';
  }
  notasHtml += '</div>';

  // ── Linha do tempo ──
  var apptsPac = (typeof appointments !== 'undefined' ? appointments : [])
    .filter(function(a){ return a.patientIdx === i; })
    .sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? 1 : -1; });
  var notasIdx = (p.prontuarioNotes || []).reduce(function(m, n){ m[n.date] = n; return m; }, {});
  var timelineHtml;

  if (!apptsPac.length) {
    timelineHtml = '<div style="padding:20px 0;color:var(--muted);font-size:13px;font-style:italic;text-align:center">Nenhum agendamento registrado ainda.</div>';
  } else {
    var eventos = apptsPac.map(function(a, ai) {
      var nota = notasIdx[a.date.split('-').reverse().join('/')];
      var presencaLabel = a.presenca === 'faltou' ? 'Falta' : a.presenca === 'atrasou' ? 'Atrasou' : '';
      var statusLabel = a.status === 'cancelada' ? 'Cancelada' : (presencaLabel || 'Realizada');
      var dotColor = a.status === 'cancelada' ? 'var(--muted)' : a.presenca === 'faltou' ? 'var(--red)' : a.presenca === 'atrasou' ? 'var(--amber)' : 'var(--sage)';
      var tagHtml = a.status === 'cancelada'
        ? '<span class="tag tag-gray" style="font-size:10px">Cancelada</span>'
        : a.presenca === 'faltou' ? '<span class="tag tag-red" style="font-size:10px">Faltou</span>'
        : a.presenca === 'atrasou' ? '<span class="tag tag-amber" style="font-size:10px">Atrasou</span>'
        : nota ? '<span class="tag tag-green" style="font-size:10px">Nota indexada</span>' : '';
      var _tot = (typeof p.sessions === 'number' && p.sessions > 0) ? p.sessions : apptsPac.length;
      var numSessao = Math.max(1, _tot - ai);
      var dateBR = a.date.split('-').reverse().join('/');
      var moodHtml = '';
      if (p.moodHistory && p.moodHistory[apptsPac.length - ai - 1] !== undefined) {
        var mv = p.moodHistory[apptsPac.length - ai - 1];
        var mc = mv <= 3 ? 'var(--red)' : mv <= 6 ? 'var(--amber)' : 'var(--sage)';
        moodHtml = ' <span style="font-size:11px;color:' + mc + '">● ' + mv + '/10</span>';
      }
      return '<div class="tl-item"><div class="tl-line"><div class="tl-dot" style="background:' + dotColor + '"></div>' + (ai < apptsPac.length - 1 ? '<div class="tl-bar"></div>' : '') + '</div>'
        + '<div class="tl-content"><div class="tl-date">' + dateBR + ' · Sessão ' + numSessao + ' · ' + escHTML(a.time) + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div class="tl-title">' + escHTML(statusLabel) + moodHtml + '</div>' + tagHtml + '</div>'
        + (nota ? '<div class="tl-body">' + escHTML(nota.text.substring(0, 200)) + (nota.text.length > 200 ? '…' : '') + '</div>' : '')
        + (a.motivoCancelamento ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">Motivo: ' + escHTML(a.motivoCancelamento) + '</div>' : '')
        + '</div></div>';
    });
    timelineHtml = '<div class="timeline">' + eventos.join('') + '</div>';
  }

  content.innerHTML = '<div class="divider"></div>'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Notas clínicas</div>'
    + notasHtml
    + '<div style="margin-top:24px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Linha do tempo</div>'
    + timelineHtml;
}

function editarNotaTab(textoId, btn, pidx, noteDate) {
  var el = document.getElementById(textoId);
  if (!el) return;
  if (el.tagName === 'TEXTAREA') _salvarNota(pidx, noteDate, el.value);
  if (typeof editarNota === 'function') editarNota(textoId, btn);
}

function _salvarNota(pidx, noteDate, novoTexto) {
  var p = patients[pidx];
  if (!p || !p.prontuarioNotes) return;
  var nota = p.prontuarioNotes.find(function(n){ return n.date === noteDate; });
  if (nota) { nota.text = novoTexto; salvarPacientes(); }
}

function renderPatientFicha(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  // ── Evolução (sparkline) ──
  var mh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; });
  var sparkHtml = '';
  if (mh.length >= 2) {
    var pts = mh.slice(-12);
    var W = 200, H = 44, pad = 5;
    var stepX = (W - pad * 2) / (pts.length - 1);
    var coords = pts.map(function(v, ii) {
      return (pad + ii * stepX).toFixed(1) + ',' + (H - pad - ((v - 1) / 9) * (H - pad * 2)).toFixed(1);
    }).join(' ');
    var trend = pts[pts.length - 1] - pts[0];
    var cor = trend > 0.5 ? '#4a7c59' : trend < -0.5 ? '#c0392b' : '#c97d2e';
    sparkHtml = '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">'
      + '<svg width="' + W + '" height="' + H + '" style="flex-shrink:0"><polyline points="' + coords + '" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>'
      + '<div style="flex-shrink:0;text-align:center"><div style="font-size:20px;font-weight:700;color:' + cor + '">' + pts[pts.length - 1] + '</div><div style="font-size:10px;color:var(--muted)">/10</div></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + (trend > 0.5 ? '↗ Melhora' : trend < -0.5 ? '↘ Queda' : '→ Estável') + ' — últimas ' + pts.length + ' sessões</div>';
  } else {
    sparkHtml = '<div style="font-size:12px;color:var(--muted);font-style:italic">Humor não registrado ainda.</div>';
  }
  var totalSessoes = p.sessions || 0;
  var prog = p.progress || 0;
  var apptsPac2 = (typeof appointments !== 'undefined' ? appointments : []).filter(function(a){ return a.patientIdx === i && a.presenca; });
  var compareceu2 = apptsPac2.filter(function(a){ return a.presenca === 'compareceu'; }).length;
  var taxaPresenca = apptsPac2.length ? Math.round(compareceu2 / apptsPac2.length * 100) : null;
  var evolucaoHtml = '<div style="margin:0 0 20px;padding:14px 16px;background:var(--bg);border-radius:12px;border:1px solid var(--border)">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Evolução do paciente</div>'
    + '<div style="display:flex;gap:12px;margin-bottom:10px">'
    + '<div style="text-align:center;background:#fff;border-radius:8px;padding:8px 14px;flex:1"><div style="font-size:18px;font-weight:700;color:var(--ink)">' + totalSessoes + '</div><div style="font-size:10px;color:var(--muted)">Sessões</div></div>'
    + '<div style="text-align:center;background:#fff;border-radius:8px;padding:8px 14px;flex:1"><div style="font-size:18px;font-weight:700;color:var(--sage)">' + prog + '%</div><div style="font-size:10px;color:var(--muted)">Progresso</div></div>'
    + '<div style="text-align:center;background:#fff;border-radius:8px;padding:8px 14px;flex:1"><div style="font-size:18px;font-weight:700;color:var(--ink)">' + (mh.length ? mh[mh.length - 1] : '—') + '</div><div style="font-size:10px;color:var(--muted)">Humor atual</div></div>'
    + (taxaPresenca !== null ? '<div style="text-align:center;background:#fff;border-radius:8px;padding:8px 14px;flex:1"><div style="font-size:18px;font-weight:700;color:' + (taxaPresenca >= 80 ? 'var(--sage)' : taxaPresenca >= 60 ? 'var(--amber)' : 'var(--red)') + '">' + taxaPresenca + '%</div><div style="font-size:10px;color:var(--muted)">Presença</div></div>' : '')
    + '</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:4px">Histórico de humor (últimas sessões)</div>'
    + sparkHtml
    + '</div>';

  // ── Materiais ──
  _materialPatientIdx = i;
  var mats = p.materials || [];
  var matsHtml;
  if (mats.length === 0) {
    matsHtml = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Nenhum material adicionado ainda.</div>';
  } else {
    matsHtml = mats.map(function(m) {
      var icon = (typeof MATERIAL_ICONS !== 'undefined' ? MATERIAL_ICONS[m.tipo] : null) || '📎';
      var safeMatUrl = (typeof safeURL === 'function') ? safeURL(m.url) : (/^https?:\/\//i.test(String(m.url||''))? m.url : '');
      var tituloHtml = safeMatUrl
        ? '<a href="' + safeMatUrl + '" target="_blank" rel="noopener">' + escHTML(m.titulo) + '</a>'
        : escHTML(m.titulo);
      var descHtml = m.desc ? '<div class="material-desc">' + escHTML(m.desc) + '</div>' : '';
      var labelMap = (typeof MATERIAL_LABELS !== 'undefined' ? MATERIAL_LABELS : {});
      var tag = '<span style="font-size:10.5px;background:#f0f2f0;color:var(--muted);padding:2px 7px;border-radius:10px;font-weight:500">' + escHTML(labelMap[m.tipo] || m.tipo) + '</span>';
      return '<div class="material-card">'
        + '<div class="material-icon ' + m.tipo + '">' + icon + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div class="material-title" style="display:flex;align-items:center;gap:8px">' + tituloHtml + tag + '</div>'
        + descHtml
        + '<div class="material-date">' + escHTML(m.date) + '</div>'
        + '</div>'
        + '<div class="material-actions">'
        + (safeMatUrl ? '<a href="' + safeMatUrl + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none">↗ Abrir</a>' : '')
        + '<button class="task-delete" onclick="_excluirMaterialFicha(' + i + ',' + m.id + ')" title="Excluir">✕</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  content.innerHTML = '<div class="divider"></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">'
    + '<div>'
    + '<div class="form-group"><label>CID principal</label><div style="font-size:14px;padding:9px 0">' + (p.cid && p.cid !== '—' ? escHTML(p.cid) : 'Não informado') + '</div></div>'
    + '<div class="form-group"><label>Abordagem</label><div style="font-size:14px;padding:9px 0">' + escHTML(p.abordagem || '—') + '</div></div>'
    + '<div class="form-group"><label>Frequência</label><div style="font-size:14px;padding:9px 0">—</div></div>'
    + '</div>'
    + '<div>'
    + '<div class="form-group"><label>Queixa principal</label><div style="font-size:13.5px;line-height:1.6;color:var(--ink-soft);padding:9px 0">' + escHTML(p.notes || '—') + '</div></div>'
    + '<div class="form-group"><label>Medicamentos</label><div style="font-size:14px;padding:9px 0">—</div></div>'
    + '</div>'
    + '</div>'
    + evolucaoHtml
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Materiais</div>'
    + '<button class="btn btn-primary btn-sm" onclick="abrirModalMaterial()">+ Adicionar</button>'
    + '</div>'
    + '<div id="ptab-materiais-list">' + matsHtml + '</div>';
}

function renderPatientPlano(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  content.innerHTML = '<div class="divider"></div>'
    + '<div id="tab-plano-content" style="display:flex;flex-direction:column;gap:16px"></div>';
  currentPatientIdx = i;
  if (typeof renderPlanoProntuario === 'function') renderPlanoProntuario(i);
}

function renderPatientAnamnese(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var src = document.getElementById('tab-anamnese');
  if (!src) return;
  _currentProntuarioIdx = i;
  content.innerHTML = '<div class="divider"></div>' + src.innerHTML;
  if (typeof _popularAnamnese === 'function') _popularAnamnese(i);
}

function _excluirMaterialFicha(pidx, mid) {
  if (!confirm('Remover este material?')) return;
  var p = patients[pidx];
  if (!p || !p.materials) return;
  p.materials = p.materials.filter(function(m){ return m.id !== mid; });
  salvarPacientes();
  renderPatientFicha(pidx);
  showToast('Material removido.');
}

// ── Sprint 3: Briefing IA ───────────────────────────────────────────────────

function renderPatientBriefing(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;
  currentBriefingPatientIdx = i;

  var key = p.id || p.name;
  var cache = typeof _getBriefingCache === 'function' ? _getBriefingCache(key) : null;
  var initials = p.initials || (p.name ? p.name.trim().split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase() : '?');

  var bodyHtml;
  if (cache) {
    var ts = new Date(cache.generatedAt);
    var tsStr = String(ts.getHours()).padStart(2,'0') + ':' + String(ts.getMinutes()).padStart(2,'0');
    var unchanged = typeof _briefingCacheUnchanged === 'function' ? _briefingCacheUnchanged(cache, p) : true;
    bodyHtml = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:8px 12px;background:var(--sage-light);border-radius:8px;border:1px solid rgba(74,124,89,.15)">'
      + '<span style="font-size:18px">✦</span>'
      + '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--sage)">Cache de hoje às ' + tsStr + '</div>'
      + '<div style="font-size:11px;color:var(--muted)">' + (p.sessions||0) + ' sessões · ' + (unchanged ? 'sem alterações' : 'há novas informações') + '</div></div>'
      + '<div style="display:flex;gap:6px">'
      + '<button class="btn btn-secondary btn-sm" onclick="_openBriefingPage(' + i + ')">↗ Abrir completo</button>'
      + (!unchanged ? '<button class="btn btn-primary btn-sm" onclick="_openBriefingPage(' + i + ',true)">↻ Regenerar</button>' : '')
      + '</div></div>'
      + '<div id="ptab-b-cache-content" style="font-size:13px;color:var(--ink-soft)">'
      + _renderBriefingCacheInline(cache.content)
      + '</div>';
  } else {
    bodyHtml = '<div style="text-align:center;padding:32px 20px">'
      + '<div style="width:56px;height:56px;border-radius:50%;background:' + (p.colorGrad||p.color||'#4a7c59') + ';display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:20px;font-weight:700;color:#fff">' + initials + '</div>'
      + '<div style="font-size:15px;font-weight:600;margin-bottom:4px">' + escHTML(p.name) + '</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">' + escHTML(p.abordagem) + ' · ' + (p.sessions||0) + ' sessões</div>'
      + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin-bottom:20px;max-width:320px;margin-left:auto;margin-right:auto">Analisa notas, temas recorrentes e evolução clínica para sugerir o foco da próxima sessão.</div>'
      + '<button class="btn btn-purple" onclick="_openBriefingPage(' + i + ')" style="font-size:13.5px;padding:10px 24px">✦ Gerar Briefing IA</button>'
      + '</div>';
  }

  content.innerHTML = '<div class="divider"></div>'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Briefing IA</div>'
    + '<span style="background:#ede9fe;color:#6d28d9;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">IA</span>'
    + '</div>'
    + bodyHtml;
}

function _renderBriefingCacheInline(text) {
  if (!text || text.length < 60) return '<div style="font-style:italic;color:var(--muted)">Conteúdo indisponível.</div>';
  var defs = [
    { key:'FOCO RECOMENDADO', icon:'🎯', color:'var(--sage)' },
    { key:'PADRÃO IDENTIFICADO', icon:'🔁', color:'var(--purple)' },
    { key:'EVOLUÇÃO', icon:'📈', color:'#2563eb' },
    { key:'PONTO DE ATENÇÃO', icon:'⚠', color:'var(--red)' },
    { key:'PERGUNTAS SUGERIDAS', icon:'💡', color:'var(--amber)' }
  ];
  var html = '';
  defs.forEach(function(d) {
    var re = new RegExp(d.key + '[:\\s]*([\\s\\S]*?)(?=' + defs.map(function(x){ return x.key; }).join('|') + '|$)', 'i');
    var m = text.match(re);
    if (m && m[1] && m[1].trim()) {
      html += '<div style="margin-bottom:12px;padding:12px 14px;border-radius:10px;background:var(--bg);border-left:3px solid ' + d.color + '">'
        + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">' + d.icon + ' ' + d.key + '</div>'
        + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(m[1].trim()) + '</div>'
        + '</div>';
    }
  });
  return html || '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(text.substring(0, 400)) + (text.length > 400 ? '…' : '') + '</div>';
}

function _openBriefingPage(i, forceRegen) {
  currentBriefingPatientIdx = i;
  if (forceRegen) _briefingForceRefresh = true;
  document.querySelectorAll('.page').forEach(function(pg){ pg.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.remove('active'); });
  var pageEl = document.getElementById('page-briefing');
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    if ((n.getAttribute('onclick') || '').includes("'briefing'")) n.classList.add('active');
  });
  try { localStorage.setItem('tf_current_page', 'briefing'); } catch(e) {}
  if (typeof initBriefing === 'function') initBriefing();
}

// ── Sprint 3: Portal preview ────────────────────────────────────────────────

function renderPatientPortalPreview(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  var exercises = p.exercises || [];
  var exDone = exercises.filter(function(e){ return e.done || (e.concluidos||0) >= (e.total||1); }).length;

  var exPreviewHtml = exercises.length === 0
    ? '<div style="color:var(--muted);font-size:12px;font-style:italic">Nenhum exercício atribuído.</div>'
    : exercises.slice(0, 4).map(function(ex) {
        var done = ex.done || (ex.concluidos||0) >= (ex.total||1);
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">'
          + '<div style="width:18px;height:18px;border-radius:50%;border:1.5px solid ' + (done ? 'var(--sage)' : 'var(--border)') + ';background:' + (done ? 'var(--sage)' : '#fff') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
          + (done ? '<span style="color:#fff;font-size:10px">✓</span>' : '')
          + '</div>'
          + '<span style="font-size:13px;color:' + (done ? 'var(--muted)' : 'var(--ink)') + ';' + (done ? 'text-decoration:line-through' : '') + '">' + escHTML(ex.title) + '</span>'
          + '</div>';
      }).join('')
    + (exercises.length > 4 ? '<div style="font-size:11px;color:var(--muted);padding-top:6px">+ ' + (exercises.length - 4) + ' mais</div>' : '');

  var mh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; });
  var lastMood = mh.length ? mh[mh.length - 1] : null;
  var moodColor = lastMood !== null ? (lastMood >= 7 ? 'var(--sage)' : lastMood >= 5 ? 'var(--amber)' : 'var(--red)') : 'var(--muted)';

  var diarioEntries = (p.portalDiario || []).slice(-3).reverse();
  var diarioHtml = diarioEntries.length === 0
    ? '<div style="color:var(--muted);font-size:12px;font-style:italic">Nenhuma entrada no diário ainda.</div>'
    : diarioEntries.map(function(d) {
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">'
          + '<div style="display:flex;justify-content:space-between;margin-bottom:3px">'
          + '<span style="font-size:11px;color:var(--muted)">' + escHTML(d.date || '') + '</span>'
          + '<span style="font-size:13px">' + (d.emoji || '') + '</span>'
          + '</div>'
          + '<div style="font-size:12.5px;color:var(--ink-soft);line-height:1.5">' + escHTML((d.text || d.content || '').substring(0, 120)) + '</div>'
          + '</div>';
      }).join('');

  var msgTexto = p.portalMensagem || 'Nenhuma mensagem do terapeuta definida.';
  var sessionLink = p.sessionLink || null;

  content.innerHTML = '<div class="divider"></div>'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">O que o paciente vê</div>'
    + '<button class="btn btn-secondary btn-sm" onclick="selectPatientTab(\'overview\');setTimeout(function(){var sec=document.querySelector(\'[onclick*=\\"compartilharAcessoPortal\\"]\');if(sec)sec.scrollIntoView({behavior:\'smooth\'})},100)">🔗 Compartilhar acesso</button>'
    + '</div>'

    // Session & message
    + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Próxima sessão</div>'
    + (p.next && p.next !== '—'
        ? '<div style="font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:6px">📅 ' + escHTML(p.next) + '</div>'
        : '<div style="font-size:13px;color:var(--muted);margin-bottom:6px">Não agendada</div>')
    + (sessionLink
        ? '<div style="font-size:12px;color:var(--sage)">🔗 Link da sala ativo</div>'
        : '<div style="font-size:12px;color:var(--muted)">Sem link de sala configurado</div>')
    + '</div>'

    // Therapist message
    + '<div style="background:var(--sage-light);border:1px solid rgba(74,124,89,.15);border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Mensagem do terapeuta</div>'
    + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;font-style:italic">"' + escHTML(msgTexto) + '"</div>'
    + '</div>'

    // Exercises preview
    + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Exercícios</div>'
    + '<span style="font-size:12px;color:var(--sage);font-weight:600">' + exDone + '/' + exercises.length + ' concluídos</span>'
    + '</div>'
    + exPreviewHtml
    + '</div>'

    // Mood
    + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:14px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Último humor registrado</div>'
    + (lastMood !== null
        ? '<div style="display:flex;align-items:center;gap:10px"><div style="font-size:28px;font-weight:700;color:' + moodColor + '">' + lastMood + '<span style="font-size:14px;color:var(--muted)">/10</span></div><div style="font-size:12px;color:var(--muted)">' + (lastMood >= 7 ? 'Bem' : lastMood >= 5 ? 'Regular' : 'Difícil') + '</div></div>'
        : '<div style="color:var(--muted);font-size:12px;font-style:italic">Nenhum registro de humor ainda.</div>')
    + '</div>'

    // Diary
    + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Diário recente</div>'
    + diarioHtml
    + '</div>';
}

function selectPatient(i, el) {
  if (i < 0 || i >= patients.length) return;
  currentPatientIdx = i;
  const p = patients[i];

  // ── Recalcula fin/finStatus + mood a partir de dados reais ──
  (function() {
    var cobPac = (typeof charges !== 'undefined' ? charges : []).filter(function(c){ return !c.deleted && c.patient === p.name; });
    if (cobPac.length > 0) {
      var hasOverdue = cobPac.some(_chargeVencida);
      var hasPending = cobPac.some(function(c){ return c.status === 'pending' && !_chargeVencida(c); });
      if (hasOverdue) { p.finStatus = 'overdue'; p.fin = 'Atrasado'; }
      else if (hasPending) { p.finStatus = 'pending'; p.fin = 'Pendente'; }
      else { p.finStatus = 'ok'; p.fin = 'Em dia'; }
    } else if (!p.fin || p.fin === '—') {
      p.finStatus = 'ok'; p.fin = '—';
    }
    // Recalcula mood atual e tendência a partir de moodHistory real
    if (p.moodHistory && p.moodHistory.length > 0) {
      var mhReal = p.moodHistory.filter(function(v){ return v !== null && v !== undefined; });
      if (mhReal.length > 0) {
        p.mood = mhReal[mhReal.length - 1];
        if (mhReal.length >= 3) {
          var recent = mhReal.slice(-3);
          var trend = recent[2] - recent[0];
          p.moodTrend = trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'stable';
        }
      }
    }
    // Recalcula progresso clínico com dados reais
    p.progress = _calcProgress(p);
    // Recalcula p.next e p.lastSession a partir de appointments reais
    if (typeof appointments !== 'undefined') {
      var nowIso = hojeISO();
      var _matchAppt = function(a) {
        return a.status !== 'cancelada' && (a.patientIdx === i || a.patientName === p.name);
      };
      var futurosP = appointments.filter(function(a){
        return _matchAppt(a) && a.date >= nowIso;
      }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
      if (futurosP.length) {
        var np = futurosP[0].date.split('-');
        p.next = np[2] + '/' + np[1] + '/' + np[0];
      } else if (!p.next) {
        p.next = '—';
      }
      var passadosP = appointments.filter(function(a){
        return _matchAppt(a) && a.date < nowIso;
      }).sort(function(a,b){ return a.date > b.date ? -1 : 1; });
      if (passadosP.length) {
        var lp = passadosP[0].date.split('-');
        p.lastSession = lp[2] + '/' + lp[1] + '/' + lp[0];
      } else if (!p.lastSession) {
        p.lastSession = '—';
      }
    }
    if (!p.next) p.next = '—';
    if (!p.lastSession) p.lastSession = '—';
  })();

  // Renderiza shell (cabeçalho + barra de abas) e preenche aba ativa
  renderPatientDetailShell(i);
  selectPatientTab(currentPatientTab);

  // Após renderizar o painel, carrega mensagens e inicia poll
  (function() {
    var _pId = p.id;
    if (!_pId) return;
    _supaFetchMessages(_pId, supa).then(function(msgs) {
      var sec = document.getElementById('pac-chat-section-' + i);
      if (sec) sec.innerHTML = renderChatTerapeuta(i, msgs);
      var badge = document.getElementById('pac-msg-badge-' + _pId);
      var cnt = _countUnread(_pId, 'therapist');
      if (badge) { badge.style.display = cnt > 0 ? 'inline-flex' : 'none'; badge.textContent = cnt; }
    });
    _startMsgPoll(_pId, function(msgs) {
      var sec = document.getElementById('pac-chat-section-' + i);
      if (sec) sec.innerHTML = renderChatTerapeuta(i, msgs);
      var badge = document.getElementById('pac-msg-badge-' + _pId);
      var cnt = _countUnread(_pId, 'therapist');
      if (badge) { badge.style.display = cnt > 0 ? 'inline-flex' : 'none'; badge.textContent = cnt; }
    });
    _supaMarkRead(_pId, 'patient', supa).catch(function(){});
  })();
}

function renderTrajetoriaTerapeuta(i) {
  var p = patients[i];
  if (!p) return '';
  // Filtra appointments passados deste paciente, ordem DESC
  var hojeIso2 = hojeISO();
  var passados = appointments.filter(function(a) {
    return (a.patientIdx === i || a.patientName === p.name) && a.date <= hojeIso2 && a.presenca;
  }).sort(function(a, b) { return b.date.localeCompare(a.date); });
  if (!passados.length) return '';

  var rows = passados.slice(0, 10).map(function(a, ai) {
    var dateObj = new Date(a.date + 'T12:00');
    var dateStr = dateObj.toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'short'});
    var statusColor = a.presenca === 'compareceu' ? 'var(--sage)' : a.presenca === 'faltou' ? 'var(--red)' : 'var(--amber)';
    var statusLabel = a.presenca === 'compareceu' ? 'Compareceu' : a.presenca === 'faltou' ? 'Faltou' : 'Cancelou';
    var resumo = a.resumoParaPaciente || '';
    return '<div style="border-bottom:1px solid var(--border);padding:10px 0">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<span style="font-size:12px;font-weight:600;color:var(--ink)">' + dateStr + '</span>'
      + '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + (a.presenca==='compareceu'?'#e8f5ee':a.presenca==='faltou'?'#fdecea':'#fff8e6') + ';color:' + statusColor + '">' + statusLabel + '</span>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:5px">Resumo para o paciente (opcional):</div>'
      + '<div style="display:flex;gap:6px;align-items:flex-start">'
      + '<textarea id="resumo-pac-' + a.id + '" placeholder="Escreva um resumo acessível desta sessão para o paciente ver na jornada…" '
      + 'style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;font-family:\'DM Sans\',sans-serif;outline:none;resize:none;min-height:52px;background:#fafaf8;color:var(--ink);line-height:1.5" '
      + 'onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      + escHTML(resumo)
      + '</textarea>'
      + '<div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">'
      + '<button onclick="salvarResumoParaPaciente(' + i + ',\'' + escHTML(a.id) + '\')" style="background:var(--sage-light);border:1px solid var(--sage-100);color:var(--sage);border-radius:7px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Salvar</button>'
      + '<button onclick="regenerarResumoIA(' + i + ',\'' + escHTML(a.id) + '\')" style="background:#fff;border:1px solid var(--border);color:var(--muted);border-radius:7px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">✨ IA</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  var _hasResumo = passados.some(function(a) { return a.resumoParaPaciente; });
  return '<details ' + (_hasResumo ? 'open ' : '') + 'style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;overflow:hidden">'
    + '<summary style="padding:12px 14px;cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;list-style:none;display:flex;align-items:center;gap:6px;background:var(--bg)">'
    + '📅 Trajetória — resumos para o paciente</summary>'
    + '<div style="padding:0 14px 4px">'
    + rows
    + (passados.length > 10 ? '<div style="font-size:11px;color:var(--muted);padding:8px 0;text-align:center">Exibindo últimas 10 sessões</div>' : '')
    + '</div>'
    + '</details>';
}

function salvarResumoParaPaciente(patientIdx, apptId) {
  var ta = document.getElementById('resumo-pac-' + apptId);
  if (!ta) return;
  var texto = ta.value.trim();
  // Atualiza no array global de appointments
  var appt = appointments.find(function(a) { return String(a.id) === String(apptId); });
  if (appt) {
    appt.resumoParaPaciente = texto;
    _salvarAppointments();
    _supaSync_appointments().catch(function(){});
  }
  // Atualiza no metadata do paciente (para sync via _supaSync_patients)
  var p = patients[patientIdx];
  if (p && p.appointments) {
    var pa = p.appointments.find(function(a) { return String(a.id) === String(apptId); });
    if (pa) pa.resumoParaPaciente = texto;
    salvarPacientes();
  }
  showToast(texto ? '✓ Resumo salvo — visível na jornada do paciente' : '✓ Resumo removido');
}

async function regenerarResumoIA(patientIdx, apptId) {
  var btn = document.querySelector('button[onclick="regenerarResumoIA(' + patientIdx + ',\'' + apptId + '\')"]');
  var ta  = document.getElementById('resumo-pac-' + apptId);
  if (!ta) return;
  var p    = patients[patientIdx];
  var appt = appointments.find(function(a) { return String(a.id) === String(apptId); });
  if (!p || !appt) return;

  // Nota clínica da mesma data do appointment
  // prontuarioNotes.date está em DD/MM; appt.date está em YYYY-MM-DD → normalizar
  var apptDateDDMM = appt.date
    ? (appt.date.split('-')[2] + '/' + appt.date.split('-')[1])
    : '';
  var nota = (p.prontuarioNotes || []).find(function(n) { return n.date === apptDateDDMM; });
  var noteText = nota ? (nota.content || nota.text || '') : '';

  if (!noteText.trim()) {
    showToast('⚠ Nenhuma nota clínica encontrada para esta data.');
    return;
  }

  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  ta.style.opacity = '.5';

  var resumo = await _gerarResumoPortalIA(p, noteText);

  if (btn) { btn.textContent = '✨ IA'; btn.disabled = false; }
  ta.style.opacity = '1';

  if (resumo) {
    ta.value = resumo;
    showToast('✨ Resumo gerado — revise e clique Salvar');
  } else {
    showToast('⚠ Não foi possível gerar o resumo. Tente novamente.');
  }
}

function renderChatTerapeuta(i, msgs) {
  var p = patients[i];
  if (!p) return '';
  var unread = _countUnread(p.id, 'therapist');
  var _firstName2 = function(n) { return n ? n.split(' ')[0] : ''; };
  var thread = (msgs || []).map(function(m) {
    var isT = m.sender_role === 'therapist';
    var ts = m.created_at ? new Date(m.created_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    return '<div style="display:flex;flex-direction:column;align-items:'+(isT?'flex-end':'flex-start')+';gap:2px">'
      + '<div class="chat-bubble '+(isT?'chat-bubble-therapist':'chat-bubble-patient')+'">'+escHTML(m.body)+'</div>'
      + '<span class="chat-ts" style="'+(isT?'text-align:right':'')+'">'+ts+(isT?'':(!m.read_at?' · não lida':''))+'</span>'
      + '</div>';
  }).join('');
  if (!thread) thread = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px 0">Nenhuma mensagem ainda. Envie uma dica ou lembrete para '+escHTML(_firstName2(p.name))+'.</div>';

  return '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Mensagens</div>'
    + (unread > 0 ? '<span style="background:var(--sage);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:2px 7px">'+unread+' nova'+(unread>1?'s':'')+'</span>' : '')
    + '</div>'
    + '<div class="chat-thread" id="chat-thread-t-'+i+'">'+thread+'</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">'
    + '<input id="chat-input-t-'+i+'" type="text" placeholder="Envie uma mensagem para '+escHTML(_firstName2(p.name))+'…" '
    + 'style="flex:1;border:1.5px solid var(--border);border-radius:10px;padding:8px 12px;font-size:13px;font-family:\'DM Sans\',sans-serif;outline:none" '
    + 'onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'" '
    + 'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();terapeutaEnviarMensagem('+i+')}">'
    + '<button onclick="terapeutaEnviarMensagem('+i+')" style="background:var(--sage);color:#fff;border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Enviar</button>'
    + '</div>'
    + '</div>';
}

async function terapeutaEnviarMensagem(i) {
  var p = patients[i];
  if (!p || !p.id) return;
  var input = document.getElementById('chat-input-t-' + i);
  if (!input) return;
  var body = input.value.trim();
  if (!body) return;
  input.value = '';
  input.disabled = true;
  var msgs = await _supaSendMessage(p.id, 'therapist', body, supa);
  input.disabled = false;
  if (msgs) {
    var sec = document.getElementById('pac-chat-section-' + i);
    if (sec) sec.innerHTML = renderChatTerapeuta(i, msgs);
    // scroll ao fim
    var thread = document.getElementById('chat-thread-t-' + i);
    if (thread) thread.scrollTop = thread.scrollHeight;
  } else {
    showToast('⚠ Falha ao enviar mensagem. Verifique sua conexão.');
    input.value = body;
  }
}

function _toggleSenhaPortal(i) {
  var el = document.getElementById('pac-senha-display-' + i);
  if (!el) return;
  if (el.dataset.visible === '1') {
    el.textContent = '••••••';
    el.dataset.visible = '0';
  } else {
    var p = patients[i];
    el.textContent = (p && (p.portalPassword || _firstName(p.name).toLowerCase())) || '••••••';
    el.dataset.visible = '1';
  }
}

// ── SESSÃO / TIMER ──
let timerInterval = null, sessionSeconds = 0;
let currentSessionPatientIdx = 0;
let currentSessionApptId = null; // ID do appointment que iniciou a sessão atual
let currentPortalPatientIdx = 0;
let currentPatientIdx = 0;
let currentPatientTab = 'overview';
let _editingExerciseId = null;