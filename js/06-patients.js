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

// Abertura padrão do modal: sempre limpa ANTES (restaura o onclick do botão
// "Criar ficha", que a conversão de lead e a edição trocam — fechar por clique
// fora não limpava e o handler antigo vazava para o próximo cadastro). V4.
function abrirModalNovoPaciente() {
  limparModalPaciente();
  showModal('modal-novo-paciente');
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
    notes: d.notes, exercises: [],
    _pendingSync: true // marca persistente: paciente ainda não confirmado no Supabase (F2.2)
  });
  _newLocalPatientIds.add(_newPatId);
  salvarPacientes();
  limparModalPaciente();
  closeModal('modal-novo-paciente');
  // Funil de ativação: total permite ver "1º paciente criado" no PostHog (sem nome/dado clínico)
  tfTrack('paciente_criado', { total: patients.filter(function(x){ return !x._isDemo; }).length });
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
    <div style="background:var(--white);border-radius:16px;padding:28px;max-width:380px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.2);text-align:center">
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
  const _oldName = p.name;
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
  // Propaga o rename para tudo que referencia o paciente por NOME — sem isto, renomear
  // órfã cobranças (fin volta a "—"), agenda (fallback por nome quebra) e tarefas. F2.4.
  if (_oldName && _oldName !== d.nome) {
    try {
      if (typeof charges !== 'undefined') {
        var _ch = false; charges.forEach(function(c){ if (c.patient === _oldName) { c.patient = d.nome; _ch = true; } });
        if (_ch && typeof salvarCharges === 'function') salvarCharges();
      }
      if (typeof appointments !== 'undefined') {
        var _ap = false; appointments.forEach(function(a){ if (a.patientName === _oldName) { a.patientName = d.nome; _ap = true; } });
        if (_ap && typeof _salvarAppointments === 'function') _salvarAppointments();
      }
      if (typeof tasks !== 'undefined') {
        var _tk = false; tasks.forEach(function(t){ if (t.patientName === _oldName) { t.patientName = d.nome; _tk = true; } });
        if (_tk && typeof salvarTarefas === 'function') salvarTarefas();
      }
    } catch (_) {}
  }
  // C4: marca a edição como não-sincronizada — se o app fechar antes do sync
  // (offline/debounce), o restore preserva ESTA cópia em vez da do servidor.
  // A flag é limpa no sucesso do sync (js/03), igual às criações.
  p._pendingSync = true;
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
  // Próxima sessão por IDENTIDADE (patientIdx deslocava e a mensagem saía sem
  // dia/hora — revisão 14/07); mensagem única via template do Perfil.
  const proxima = _proximaSessaoDoPaciente(p, i);
  const msg = _wppMsgLembreteSessao(p, proxima);
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


async function compartilharAcessoPortal(i) {
  var p = patients[i];
  if (!p) return;

  // O login do portal (Auth, RPC e local) exige EMAIL. Sem email, o convite ia pelo
  // WhatsApp com "Email: seu email" + senha que não logam em lugar nenhum. Bloqueia
  // e pede o email primeiro. Lote 2 (P12).
  if (!p.email || !p.email.trim()) {
    showToast('⚠ Cadastre o email de ' + _firstName(p.name) + ' antes de enviar o acesso — o login do portal usa o email.');
    if (typeof showEditarPaciente === 'function') showEditarPaciente(i);
    return;
  }

  // Garante UUID no paciente (necessário para Supabase)
  if (!p.id) {
    p.id = crypto.randomUUID();
    salvarPacientes();
  }

  // Reenvio: o paciente já tem acesso e a senha em claro não fica guardada (F3.2),
  // então gerar de novo cria uma senha NOVA que invalida a atual — confirma antes.
  if (p.portalPasswordHash && !p.portalPassword) {
    if (!confirm('Reenviar o acesso vai gerar uma NOVA senha para ' + _firstName(p.name)
      + '. A senha atual dele(a) deixará de funcionar. Continuar?')) return;
  }
  // Gera senha forte quando não há uma em memória (1º acesso, ou reenvio confirmado acima).
  if (!p.portalPassword) {
    var _arr = new Uint8Array(4);
    crypto.getRandomValues(_arr);
    p.portalPassword = 'TF' + Array.from(_arr).map(function(b){ return b.toString(36); }).join('').toUpperCase().substring(0, 6);
    p.portalPasswordHash = await _portalHash(p.portalPassword);
    // Senha temporária: o paciente será obrigado a trocá-la no 1º acesso (ela
    // trafega em claro no WhatsApp/email, não pode virar permanente). F3.2.
    p.pwdTemp = true;
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
    // Sync antes para garantir que o paciente existe no banco. touch: este é o
    // ÚNICO fluxo em que o terapeuta grava hash/pwdTemp de propósito (a RPC 016
    // descarta essas chaves de qualquer sync rotineiro — C2/staleness).
    // onlyId: o touch vale p/ o batch INTEIRO na RPC — sem restringir ao paciente
    // deste reenvio, subiria hash/pwdTemp obsoletos dos OUTROS pacientes (podendo
    // matar a senha pessoal de alguém não relacionado). Revisão 09/07.
    // Falhou o sync → aborta com aviso honesto: sem o hash no servidor a paciente
    // não conseguiria logar via RPC e o gate de troca de senha nunca dispararia.
    var _okAcesso = await _supaSync_patients({ touch: ['portalPasswordHash', 'pwdTemp'], onlyId: p.id }).catch(() => false);
    if (_okAcesso !== true) {
      showToast('⚠ Não foi possível ativar o acesso agora (conexão?). Tente de novo em instantes — nada foi enviado.');
      return;
    }
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
          await supa.from('patient_users').update({ portal_active: true }).eq('patient_id', p.id).eq('therapist_id', _acc2.supa_id)
            .then((r) => { if (r && r.error) showToast('⚠ A reativação do portal pode não ter chegado ao servidor — se a paciente não conseguir entrar, use Reenviar acesso de novo.'); },
                  () => { showToast('⚠ A reativação do portal pode não ter chegado ao servidor — se a paciente não conseguir entrar, use Reenviar acesso de novo.'); }); // A8
        }
        p.portalRevogado = false;
        salvarPacientes();
      } else if (r.status === 409) {
        showToast('⚠ ' + result.error);
      } else {
        // Auditoria A4: falha do servidor seguia em frente EM SILÊNCIO — abria o
        // WhatsApp e enviava credenciais de uma conta que NÃO existe; a paciente
        // não conseguia logar. Agora avisa e ABORTA (nada é enviado).
        console.warn('[invite-patient]', result.error || result.warning);
        showToast('⚠ O servidor não conseguiu criar o acesso (' + (result.error || 'erro ' + r.status) + '). Nada foi enviado — tente novamente.');
        return;
      }
    } catch(e) {
      console.warn('[invite-patient] fetch error:', e.message);
      showToast('⚠ Sem resposta do servidor — o acesso NÃO foi criado e nada foi enviado. Verifique a conexão e tente de novo.');
      return;
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
  // A senha em claro vive SÓ durante o envio (é a promessa do F3.2 — o comentário
  // em js/03 já dizia isso, mas ela ficava em p.portalPassword e ia parar no
  // tf_patients do localStorage). Limpa: o próximo "Reenviar" cai no confirm e
  // gera senha NOVA em vez de rearmar a temporária antiga por cima da pessoal.
  p.portalPassword = null;
  salvarPacientes();
}

function _enviarWhatsAppAcesso(p, nome, senha) {
  var terapeuta = (typeof tfUserData !== 'undefined' && tfUserData.nome ? tfUserData.nome.split(' ')[0] : 'sua terapeuta');
  var portalLink = window.location.origin + '/paciente' + (p.email ? '?e=' + encodeURIComponent(p.email) : '');
  var msg = 'Olá, ' + nome + '! 🌿\n\n'
    + 'Criei seu acesso ao portal Teravia — um espaço só seu para registrar seu humor, fazer exercícios e acompanhar sua jornada terapêutica entre nossas sessões.\n\n'
    + '📱 *Acesse aqui:*\n'
    + portalLink + '\n\n'
    + '🔑 *Suas credenciais:*\n'
    + 'Email: ' + (p.email || 'seu email') + '\n'
    + 'Senha: ' + senha + '\n\n'
    + 'No primeiro acesso você criará uma senha pessoal. Depois é só abrir o link e entrar!\n\n'
    + 'Qualquer dúvida é só me chamar. Até a próxima sessão! 💚\n'
    + '— ' + terapeuta;
  // _wppLink normaliza o número (não duplica o 55 quando já vem com +55).
  // O window.open roda DEPOIS de confirms/fetches — o navegador pode bloquear o
  // popup (perdeu o gesto do clique) e o fluxo morria em silêncio ("cliquei OK e
  // nada aconteceu", print do fundador 15/07). Fallback: modal com o link.
  var _url = _wppLink(p.whatsapp, msg);
  var _win = null;
  try { _win = window.open(_url, '_blank'); } catch (e) {}
  if (!_win) {
    var _old = document.getElementById('modal-acesso-wpp'); if (_old) _old.remove();
    var _ov = document.createElement('div');
    _ov.id = 'modal-acesso-wpp';
    _ov.className = 'modal-overlay open';
    _ov.innerHTML = '<div class="modal" style="max-width:420px">'
      + '<div class="modal-header"><div class="modal-title">Acesso pronto — falta enviar</div>'
      + '<button class="modal-close" onclick="document.getElementById(\'modal-acesso-wpp\').remove()">✕</button></div>'
      + '<div class="modal-body">'
      + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6;margin-bottom:14px">O acesso de <strong>' + escHTML(nome) + '</strong> foi criado. O navegador bloqueou a abertura automática do WhatsApp — clique abaixo para abrir com a mensagem e a senha prontas:</div>'
      + '<a href="' + _url + '" target="_blank" rel="noopener" class="btn btn-primary" style="width:100%;justify-content:center;text-decoration:none" onclick="setTimeout(function(){var m=document.getElementById(\'modal-acesso-wpp\');if(m)m.remove()},400)">Abrir WhatsApp com as credenciais</a>'
      + '</div></div>';
    document.body.appendChild(_ov);
    _ov.addEventListener('click', function(e){ if (e.target === _ov) _ov.remove(); });
  } else {
    showToast('💬 WhatsApp aberto com as credenciais de ' + nome + ' — revise e envie.');
  }
}

async function revogarPortalPaciente(i) {
  var p = patients[i];
  if (!p) return;
  var nome = _firstName(p.name);
  if (!confirm('Desativar o acesso de ' + nome + ' ao portal?\n\nIndicado em alta, encerramento do vínculo ou por segurança (ex.: celular perdido). Nenhum dado é apagado — ' + nome + ' apenas deixa de conseguir entrar até você reenviar o acesso.')) return;
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    var therapistId = acc.supa_id;
    if (!therapistId) { showToast('Erro: terapeuta não identificado.'); return; }
    await supa
      .from('patient_users')
      .update({ portal_active: false })
      .eq('patient_id', p.id)
      .eq('therapist_id', therapistId);
    // portalRevogado sobe ao metadata (Lote 2 P4): a RPC 020 nega o login/chat/sync
    // do paciente RPC também — antes a revogação só valia p/ o caminho Auth (RLS).
    p.portalRevogado = true;
    salvarPacientes();
    if (typeof _supaSync_patients === 'function') { try { await _supaSync_patients({ onlyId: p.id }); } catch(_){} }
    showToast('Acesso de ' + nome + ' ao portal desativado.');
    if (typeof selectPatient === 'function') selectPatient(i); // atualiza o card do acesso
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

/* Sync de dados do paciente de volta para o Supabase (sessão do paciente).
   MERGE via RPC portal_patient_sync (migration 015): envia SÓ o que o paciente
   edita; o servidor mescla e PRESERVA os campos do terapeuta (prontuarioNotes,
   fin, forma_pagamento, portalDica/Mensagem…). Antes fazia UPDATE do metadata
   inteiro e, como o paciente carrega enxuto (F3.1), apagava o prontuário. */
// Banner honesto do portal do paciente (auditoria de confiança A1): o portal
// não tinha NENHUMA superfície de erro de sync — toda falha era silenciosa e o
// "✓ Salvo!" mentia. Alimentado pelo funil único (_supaPatientSync); some
// sozinho no próximo sync ok. Toque = tentar de novo.
function _pacSyncBanner(mostrar) {
  var b = document.getElementById('pac-sync-banner');
  if (!mostrar) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div');
  b.id = 'pac-sync-banner';
  b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:76px;z-index:9500;background:#fff8e6;border:1px solid #e0b25a;color:#7a5220;border-radius:12px;padding:10px 14px;font-size:12.5px;line-height:1.5;box-shadow:0 4px 16px rgba(43,42,38,.15);cursor:pointer;font-family:inherit';
  b.innerHTML = '<strong>Salvo neste aparelho, mas ainda não enviado.</strong><br>Verifique sua conexão — toque aqui para tentar de novo.';
  b.onclick = function() {
    b.innerHTML = 'Enviando…';
    if (typeof _supaPatientSync === 'function') {
      Promise.resolve(_supaPatientSync()).then(function(ok){
        if (ok === false) { b.remove(); _pacSyncBanner(true); }
        // ok → o próprio sync já removeu o banner
      });
    }
  };
  document.body.appendChild(b);
}

async function _supaPatientSync() {
  if (!_loggedPatientData) return; // Não executar no contexto do terapeuta
  const p = _loggedPatientData;
  if (!p || !p.id) return;
  var patch = {
    moodHistory: p.moodHistory || [],
    moodNotes: p.moodNotes || [],
    diary: p.diary || [],
    metas: p.metas || [],
    portalMetas: p.portalMetas || [],
    exercises: p.exercises || [],
    // P10: materials SAIU do patch — o paciente nunca o escreve (só marca leitura
    // em readMaterials); mandá-lo devolvia o array stale e apagava material novo
    // do terapeuta. A RPC 025 também o tirou da allowlist.
    mood: (p.mood != null ? p.mood : null),
    _moodLastDate: p._moodLastDate || null,
    checkInStreak: p.checkInStreak || 0,
    lastCheckInDate: p.lastCheckInDate || null,
    readMaterials: p.readMaterials || [],
    portalNota: p.portalNota || null,
    portalNotifHour: p.portalNotifHour || null,
    pwdTemp: p.pwdTemp || false, // troca de senha do paciente limpa a flag (F3.2)
  };
  // Só inclui se o paciente realmente tem o valor (não sobrescrever com vazio).
  if (p.portalPasswordHash) patch.portalPasswordHash = p.portalPasswordHash;
  if (p.anamnese != null) patch.anamnese = p.anamnese;
  // Autoriza por email+hash (login RPC) OU pela sessão Auth (a RPC aceita os dois).
  var _auth = (typeof _pacPortalAuth !== 'undefined' && _pacPortalAuth)
    ? _pacPortalAuth : { email: p.email || '', hash: null };
  // Retorna true/false: o supabase-js NÃO lança em erro de RPC ({error} no retorno),
  // então o catch sozinho era morto — falha de rede/403 passava como sucesso e os
  // fluxos de senha trocavam _pacPortalAuth sem o servidor ter recebido o hash novo.
  try {
    var _r = await supaPatient.rpc('portal_patient_sync', {
      p_email: _auth.email, p_hash: _auth.hash, p_patch: patch,
    });
    if (_r && _r.error) {
      console.warn('[supaPatient] sync recusado:', _r.error.message);
      _pacSyncBanner(true);
      return false;
    }
    _pacSyncBanner(false);
    return true;
  } catch(e) {
    console.warn('[supaPatient] sync falhou:', e.message);
    _pacSyncBanner(true);
    return false;
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
  // Subtítulo da página: antes só o dashboard o preenchia — quem entrava direto
  // em Pacientes via "—" para sempre (V4).
  var _pacSub = document.getElementById('pacientes-subtitle');
  if (_pacSub) {
    var _atv = patients.filter(function(p){ return p.status === 'Ativa' || p.status === 'Atenção'; }).length;
    var _nvs = patients.filter(function(p){ return p.status === 'Nova'; }).length;
    _pacSub.textContent = _atv + ' ativo' + (_atv !== 1 ? 's' : '') + (_nvs > 0 ? ' · ' + _nvs + ' em espera' : '');
  }
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
           <div style="font-size:13px;margin-bottom:20px">Adicione seu primeiro paciente para começar a usar o Teravia.</div>
           <button class="btn-primary" onclick="abrirModalNovoPaciente()">+ Novo paciente</button>
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
    return `<div class="list-item ${fi===0?'active':''}" data-idx="${p._i}" onclick="selectPatientFiltered(${p._i},this)" style="animation:itemStagger .3s ease both;animation-delay:${fi*45}ms">
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
  // Mantém o paciente ABERTO selecionado após re-render (editar/salvar voltava
  // sempre pro primeiro da lista — print do fundador 15/07). Se ele saiu do
  // filtro atual, aí sim cai no primeiro.
  var _aindaNaLista = filtered.some(function(p){ return p._i === currentPatientIdx; });
  var _selIdx = _aindaNaLista ? currentPatientIdx : filtered[0]._i;
  selectPatientFiltered(_selIdx, list.querySelector('.list-item[data-idx="' + _selIdx + '"]') || list.querySelector('.list-item'));
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
  else if (tabName === 'config')   renderPatientConfig(i);
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
    ['anamnese','Anamnese'],['briefing','Briefing IA'],
    ['config','Acesso & Config']
  ];
  var _bdot = (typeof _briefingDotHtml === 'function') ? _briefingDotHtml(p) : '';
  var tabBarHtml = '<div class="patient-tab-bar" id="ptab-bar">'
    + tabDefs.map(function(td){
        return '<button class="ptab'+(currentPatientTab===td[0]?' active':'')+'" data-tab="'+td[0]+'" onclick="selectPatientTab(\''+td[0]+'\')">'+td[1]+(td[0]==='briefing'?_bdot:'')+'</button>';
      }).join('')
    + '</div>';

  document.getElementById('patient-detail').innerHTML = `
    <div class="detail-header">
      <div class="detail-avatar" style="background:${p.colorGrad||p.color||'#4a7c59'}">${initials}</div>
      <div>
        <div class="detail-name">${escHTML(p.name)}</div>
        <div class="detail-meta">
          <span>🎂 ${p.age !== '—' && p.age ? p.age + ' anos' : '—'}</span>
          <span>📍 ${escHTML(p.cidade || '—')}</span>
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
        <button class="btn btn-purple btn-sm" onclick="selectPatientTab('briefing')">✦ Briefing IA${_bdot}</button>
        <button class="btn btn-primary btn-sm" onclick="_tfSetSessionPatient(${i});navigate('sessao')">▶ Sessão</button>
      </div>
    </div>
  ` + tabBarHtml + '<div id="patient-detail-tab-content" class="ptab-content"></div>';
}

/* Appointments do paciente por IDENTIDADE (patientId) com fallback índice/nome —
 * patientIdx desloca com exclusões (família do bug crítico de 12/07). */
function _apptsDoPaciente(p, i) {
  return (typeof appointments !== 'undefined' ? appointments : []).filter(function(a) {
    if (!a) return false;
    if (p && p.id && a.patientId) return String(a.patientId) === String(p.id);
    return a.patientIdx === i || (p && a.patientName === p.name);
  });
}

/* "Há X dias" amigável a partir de um timestamp (ms). */
function _diasAtras(ts) {
  if (!ts) return '';
  var d = Math.floor((Date.now() - ts) / 86400000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : 'há ' + d + ' dias';
}

/* ── Zona "Entre as sessões" (reorganização 14/07): o que o paciente trouxe do
 * PORTAL — check-in, diário, exercícios e nota pré-sessão. Antes essa informação
 * viva não aparecia em lugar NENHUM do painel (a nota pré-sessão ficava enterrada
 * na aba Notas; diário e exercícios só na prévia do Portal). ── */
function _zonaEntreSessoes(p, i) {
  var linhas = [];

  // Check-in de humor (moodHistory: number legado ou {value,emoji,date})
  var mh = (p.moodHistory || []).filter(function(v){ return v !== null && v !== undefined; });
  if (mh.length) {
    var ultimo = mh[mh.length - 1];
    var val = (typeof _normMoodVal === 'function') ? _normMoodVal(ultimo) : (typeof ultimo === 'object' ? ultimo.value : ultimo);
    var quando = (typeof ultimo === 'object' && ultimo.date) ? ultimo.date : (p.lastCheckInDate || '');
    var corMood = val >= 7 ? 'var(--sage)' : val >= 5 ? 'var(--amber)' : 'var(--red)';
    var notaHumor = '';
    if (p.moodNotes && p.moodNotes.length) {
      var mn = p.moodNotes[p.moodNotes.length - 1];
      if (mn && mn.nota) notaHumor = ' · <span style="font-style:italic">“' + escHTML(String(mn.nota).substring(0, 90)) + (String(mn.nota).length > 90 ? '…' : '') + '”</span>';
    }
    linhas.push('<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--line-2)">'
      + '<span style="font-size:11.5px;color:var(--muted);width:74px;flex-shrink:0">Check-in</span>'
      + '<span style="font-size:13px;color:var(--ink)"><strong style="color:' + corMood + '">' + val + '/10</strong>'
      + (quando ? ' <span style="color:var(--muted);font-size:12px">· ' + escHTML(String(quando)) + '</span>' : '') + notaHumor + '</span>'
      + '</div>');
  }

  // Diário (mais recente primeiro; entrada {tipo, texto|campos, date, hora, ts})
  var diary = p.diary || [];
  if (diary.length) {
    var d0 = diary[0];
    var trechoD = d0.tipo === 'esp' ? (d0.campos && d0.campos[0] ? d0.campos[0] : '') : (d0.texto || '');
    trechoD = String(trechoD).substring(0, 110) + (String(trechoD).length > 110 ? '…' : '');
    linhas.push('<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--line-2)">'
      + '<span style="font-size:11.5px;color:var(--muted);width:74px;flex-shrink:0">Diário</span>'
      + '<span style="font-size:13px;color:var(--ink-soft);line-height:1.5">'
      + (d0.ts ? '<span style="color:var(--muted);font-size:12px">' + _diasAtras(d0.ts) + ' · </span>' : '')
      + '<span style="font-style:italic">“' + escHTML(trechoD) + '”</span>'
      + ' <span style="color:var(--muted);font-size:11.5px">(' + diary.length + ' registro' + (diary.length !== 1 ? 's' : '') + ')</span>'
      + '</span></div>');
  }

  // Exercícios entre sessões
  var exs = p.exercises || [];
  if (exs.length) {
    var feitos = exs.filter(function(e){ return e.done || ((e.concluidos || 0) >= (e.total || 1)); }).length;
    var corEx = feitos === exs.length ? 'var(--sage)' : 'var(--ink)';
    linhas.push('<div style="display:flex;align-items:baseline;gap:8px;padding:7px 0;border-bottom:1px solid var(--line-2)">'
      + '<span style="font-size:11.5px;color:var(--muted);width:74px;flex-shrink:0">Exercícios</span>'
      + '<span style="font-size:13px;color:' + corEx + '"><strong>' + feitos + ' de ' + exs.length + '</strong> concluído' + (feitos !== 1 ? 's' : '') + '</span>'
      + '</div>');
  }

  // Nota pré-sessão (mudou da aba Notas para cá — é preparação, pertence ao panorama)
  var preHtml = '';
  if (p.portalNota && p.portalNota.trim()) {
    preHtml = '<div style="margin-top:10px;background:var(--amber-light);border-left:3px solid var(--amber);border-radius:0 8px 8px 0;padding:10px 12px">'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
      + '<span style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.4px">Nota para a próxima sessão</span>'
      + '<button onclick="_limparPortalNota(' + i + ');selectPatient(' + i + ')" style="margin-left:auto;background:none;border:none;font-size:11px;color:var(--muted);cursor:pointer;padding:0 4px">× limpar</button>'
      + '</div>'
      + '<div style="font-size:13px;color:var(--ink);line-height:1.6;font-style:italic">“' + escHTML(p.portalNota.trim()) + '”</div>'
      + '</div>';
  }

  var corpo;
  if (!linhas.length && !preHtml) {
    corpo = '<div style="font-size:12.5px;color:var(--muted);padding:6px 0">O portal ainda não trouxe registros — quando ' + escHTML(_firstName(p.name)) + ' fizer check-ins, diário ou exercícios, aparecem aqui.</div>';
  } else {
    corpo = linhas.join('') + preHtml;
  }

  return '<div style="margin-bottom:16px;padding:12px 14px;background:var(--white);border:1px solid var(--border);border-radius:12px">'
    + '<div style="display:flex;align-items:center;margin-bottom:4px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--sage-dark);text-transform:uppercase;letter-spacing:.5px">Entre as sessões — do portal</div>'
    + '<button onclick="currentPortalPatientIdx=' + i + ';navigate(\'portal\')" style="margin-left:auto;background:none;border:none;color:var(--sage);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;padding:0">Abrir portal →</button>'
    + '</div>'
    + corpo
    + '<div style="font-size:11px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--line-2)">Para falar com ' + escHTML(_firstName(p.name)) + ' entre as sessões: <strong>Mensagem da semana</strong> no Portal ou WhatsApp.</div>'
    + '</div>';
}

function renderPatientOverview(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  const moodColor = p.mood >= 7 ? 'var(--sage)' : p.mood >= 5 ? 'var(--amber)' : 'var(--red)';
  const moodTrendIcon = p.moodTrend === 'up' ? '↑' : p.moodTrend === 'down' ? '↓' : '→';
  const alertBlock = p.alert ? `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:var(--amber-light);border-radius:10px;border-left:3px solid var(--amber);margin-bottom:16px">
      <span style="font-size:16px">⚠</span>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Supervisão</div>
        <div style="font-size:13px;color:var(--ink-soft)">${p.alert}</div>
      </div>
      <button onclick="navigate('supervisao')" style="margin-left:auto;flex-shrink:0;background:none;border:1px solid var(--amber);color:var(--amber);padding:4px 10px;border-radius:6px;font-size:11.5px;cursor:pointer;font-family:inherit;white-space:nowrap">Ver análise →</button>
    </div>` : '';
  var moodSparkline = '';
  if (p.moodHistory && p.moodHistory.length >= 3) {
    var mh = p.moodHistory.slice(-10).filter(function(v){ return v !== null && v !== undefined; })
      .map(function(v){ return (typeof _normMoodVal === 'function') ? _normMoodVal(v) : (typeof v === 'object' ? v.value : v); });
    if (mh.length >= 2) {
      var spW = 56, spH = 20;
      var spPts = mh.map(function(v, ii){ return { x: (ii/(mh.length-1))*spW, y: spH - (v/10)*spH }; });
      var spLine = spPts.map(function(pt, ii){ return (ii===0?'M':'L')+pt.x.toFixed(1)+','+pt.y.toFixed(1); }).join(' ');
      moodSparkline = '<svg viewBox="0 0 '+spW+' '+spH+'" style="width:56px;height:20px" preserveAspectRatio="none">'
        + '<path d="'+spLine+'" fill="none" stroke="'+moodColor+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<circle cx="'+spPts[spPts.length-1].x.toFixed(1)+'" cy="'+spPts[spPts.length-1].y.toFixed(1)+'" r="2.5" fill="'+moodColor+'"/>'
        + '</svg>';
    }
  }

  // ── Strip de indicadores (reorganização 14/07): os números moram AQUI e só
  // aqui — Ficha e Plano repetiam sessões/humor/progresso/presença em 3 telas.
  var apptsP = _apptsDoPaciente(p, i);
  var comPresenca = apptsP.filter(function(a){ return a.presenca; });
  var compareceuN = comPresenca.filter(function(a){ return a.presenca === 'compareceu'; }).length;
  var taxaP = comPresenca.length >= 2 ? Math.round(compareceuN / comPresenca.length * 100) : null;
  var taxaCor = taxaP === null ? 'var(--muted)' : taxaP >= 80 ? 'var(--sage)' : taxaP >= 60 ? 'var(--amber)' : 'var(--red)';
  function _cell(label, valorHtml, sub) {
    return '<div style="flex:1;min-width:104px;padding:10px 12px">'
      + '<div class="stat-label" style="margin-bottom:2px">' + label + '</div>'
      + '<div style="font-family:\'Instrument Serif\',serif;font-size:21px;line-height:1.2">' + valorHtml + '</div>'
      + (sub ? '<div style="font-size:10.5px;color:var(--muted);margin-top:1px">' + sub + '</div>' : '')
      + '</div>';
  }
  var stripHtml = '<div style="display:flex;flex-wrap:wrap;background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:6px;overflow:hidden">'
    + _cell('Sessões', String(p.sessions || 0), p.lastSession ? 'última ' + escHTML(p.lastSession) : '')
    + _cell('Próxima', p.next && p.next !== '—' ? '<span style="font-size:16px">' + escHTML(p.next) + '</span>' : '<span style="font-size:13px;color:var(--muted)">não marcada</span>', '')
    + _cell('Humor', p.mood !== null && p.mood !== undefined
        ? '<span style="color:' + moodColor + '">' + p.mood + '<span style="font-size:12px;color:var(--muted)">/10</span></span> ' + moodSparkline
        : '<span style="font-size:13px;color:var(--muted)">—</span>',
        p.mood !== null && p.mood !== undefined ? moodTrendIcon + ' ' + (p.moodTrend==='up'?'melhorando':p.moodTrend==='down'?'em queda':'estável') : 'sem registro')
    + _cell('Presença', taxaP !== null ? '<span style="color:' + taxaCor + '">' + taxaP + '%</span>' : '<span style="font-size:13px;color:var(--muted)">—</span>', taxaP !== null ? compareceuN + '✓ de ' + comPresenca.length : 'poucos registros')
    + _cell('Financeiro', '<span class="tag ' + (p.finStatus==='ok'?'tag-green':p.finStatus==='overdue'?'tag-red':'tag-amber') + '" style="font-size:11px">' + (p.fin || '—') + '</span>', '')
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:0 2px">'
    + '<div class="progress-bar" style="flex:1;height:5px"><div class="progress-fill" style="width:' + (p.progress || 0) + '%;transition:width .6s"></div></div>'
    + '<div style="font-size:11px;font-weight:600;color:' + ((p.progress||0)>=60?'var(--sage)':(p.progress||0)>=30?'var(--amber)':'var(--muted)') + ';white-space:nowrap">plano ' + (p.progress || 0) + '%</div>'
    + '</div>';

  // ── Última sessão: trecho da nota + ESTADO do resumo da jornada (a Trajetória
  // completa, com editores, mudou para Notas & Timeline — aqui só o sinal).
  var passadosP = apptsP.filter(function(a){ return a.date <= hojeISO() && a.presenca; })
    .sort(function(a, b){ return b.date.localeCompare(a.date); });
  var ultAppt = passadosP[0] || null;
  var nRascunhos = passadosP.filter(function(a){ return a.resumoPendente && !a.resumoParaPaciente; }).length;
  var resumoChip = '';
  if (nRascunhos > 0) {
    resumoChip = '<button onclick="selectPatientTab(\'notas\')" style="background:var(--amber-light);border:1px solid rgba(184,118,42,.3);color:var(--amber);border-radius:8px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">🕓 ' + nRascunhos + ' resumo' + (nRascunhos !== 1 ? 's' : '') + ' da IA aguardando revisão →</button>';
  } else if (ultAppt && ultAppt.resumoParaPaciente) {
    resumoChip = '<span style="font-size:11.5px;color:var(--sage);font-weight:600">✓ resumo da jornada publicado</span>';
  }
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
          +'<button onclick="toggleTarefa(\''+t.id+'\');selectPatient('+i+')" aria-label="Concluir tarefa" title="Concluir tarefa" style="flex-shrink:0;padding:3px 9px;border-radius:20px;border:1.5px solid var(--sage);background:var(--sage-light);color:var(--sage);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.background=\'var(--sage)\';this.style.color=\'#fff\'" onmouseout="this.style.background=\'var(--sage-light)\';this.style.color=\'var(--sage)\'">✓</button>'
          +'<span style="flex:1;font-size:13px;color:var(--ink-soft)">'+escHTML(t.title)+dateLabel+'</span>'
          +'<button onclick="editarTarefa(\''+t.id+'\')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:5px" title="Editar">✏</button>'
          +'</div>';
      }).join('')}
    </div>`;

  content.innerHTML = `
    <div class="divider"></div>
    ${alertBlock}
    ${stripHtml}
    ${_zonaEntreSessoes(p, i)}

    ` + (function(){
      // Última sessão: trecho da última nota COM conteúdo (uma nota recém-criada
      // vazia não pode apagar o bloco) + estado do resumo da jornada.
      var ultNota = null;
      var _pn = p.prontuarioNotes || [];
      for (var k = _pn.length - 1; k >= 0; k--) {
        if (_pn[k] && String(_pn[k].text || '').trim()) { ultNota = _pn[k]; break; }
      }
      var texto = ultNota ? (ultNota.text || '') : (p.notes || '');
      if (!texto && !resumoChip) return '';
      var rotulo = ultNota ? 'Última sessão — ' + escHTML(ultNota.date || '') : 'Queixa inicial';
      var trecho = texto.length > 320 ? texto.substring(0, 320) + '…' : texto;
      return '<div class="card card-sm" style="background:var(--bg);margin-bottom:16px">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' + rotulo + '</div>'
        + (resumoChip ? '<div style="margin-left:auto">' + resumoChip + '</div>' : '')
        + '</div>'
        + (trecho ? '<div style="font-size:13.5px;color:var(--ink-soft);line-height:1.7;font-style:italic">"' + escHTML(trecho) + '"</div>' : '')
        + (ultNota ? '<button onclick="selectPatientTab(\'notas\')" style="margin-top:8px;background:none;border:none;color:var(--sage);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;padding:0">Ver todas as notas →</button>' : '')
        + '</div>';
    })() + `

    ${taskBlock}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="exportarExtratoPaciente(${i})">${_tfIcon('doc')} Extrato PDF</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center;background:rgba(37,211,102,.12);border-color:rgba(37,211,102,.3);color:var(--sage-dark)" onclick="enviarWhatsappLembrete(${i})">
        ${_tfIcon('wpp')} WhatsApp lembrete
      </button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="navigate('financeiro')">◈ Ver financeiro</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="currentPortalPatientIdx=${i};navigate('portal')">♡ Portal do paciente</button>
    </div>
    <div id="pac-chat-section-${i}" style="margin-top:16px">
      ${renderChatTerapeuta(i, _msgCache[p.id] || [])}
    </div>
  `;
}

// Aba "Acesso & Config" — bloco de acesso ao portal + link da sala + exclusão,
// que viviam misturados no fim da Visão Geral (config junto de clínica). V4.
function renderPatientConfig(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;
  content.innerHTML = `
    <div class="divider"></div>
    <!-- Redesign 14/07 (pedido do usuário): caixa azul + botão verde gigante + campo
         de link sempre exposto viravam ruído. Agora: card no tom da casa, status
         enxuto, ação compacta; o link EXTERNO (Zoom/Meet) fica recolhido — a sala
         nativa é criada sozinha ao iniciar a sessão e não precisa de configuração. -->
    <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:var(--sage-dark);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Acesso ao portal</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${p.portalPasswordHash ? 'var(--sage)' : 'var(--muted-2)'};flex-shrink:0"></span>
        <span style="font-size:13px;color:var(--ink);font-weight:600">${p.portalPasswordHash ? 'Ativo' : 'Ainda não enviado'}</span>
        <span style="font-size:12.5px;color:var(--muted)">· ${escHTML(p.email||'sem email cadastrado')}</span>
      </div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.5;margin-bottom:10px">${p.portalPasswordHash
        ? 'A senha é pessoal do paciente e não fica visível aqui — "Reenviar acesso" gera uma nova.'
        : 'O paciente recebe uma senha forte pelo WhatsApp e a troca no primeiro acesso.'}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="compartilharAcessoPortal(${i})" style="color:var(--sage-dark);border-color:rgba(37,211,102,.35);background:rgba(37,211,102,.08)">${_tfIcon('wpp')} ${p.portalPasswordHash ? 'Reenviar acesso (nova senha)' : 'Enviar acesso via WhatsApp'}</button>
        ${p.portalPasswordHash ? `<button onclick="revogarPortalPaciente(${i})" title="Para alta, encerramento do vínculo ou segurança (celular perdido). O paciente deixa de conseguir entrar até você reenviar o acesso — nenhum dado é apagado." style="margin-left:auto;background:none;border:none;color:var(--red);font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline;opacity:.6" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.6'">Desativar acesso</button>` : ''}
      </div>
      <details style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line-2)"${p.sessionLink ? ' open' : ''}>
        <summary style="font-size:12px;color:var(--muted);cursor:pointer;user-select:none;list-style-position:inside">Usa Zoom ou Meet? Adicionar link externo de sala</summary>
        <div style="font-size:11.5px;color:var(--muted);line-height:1.5;margin:8px 0 8px"><strong style="color:var(--sage-dark)">A sala do Teravia se cria sozinha ao clicar em "Iniciar sessão"</strong> — com captura dos dois lados, transcrição e nota por IA. Um link externo (Zoom/Meet) serve apenas de atalho para o paciente: vira o botão "Entrar na sessão" no portal e entra nos convites — mas a sessão acontece lá fora, <strong>sem transcrição nem nota automática</strong>.</div>
        <div style="display:flex;gap:6px;align-items:center">
          <input id="pac-session-link-${i}" type="url" placeholder="https://meet.google.com/…"
            value="${escHTML(p.sessionLink||'')}"
            style="flex:1;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:8px;font-family:inherit;color:var(--ink);background:var(--white);outline:none"
            onkeydown="if(event.key==='Enter')salvarSessionLink(${i})"
          />
          <button class="btn btn-secondary btn-sm" onclick="salvarSessionLink(${i})" style="white-space:nowrap">Salvar</button>
          ${p.sessionLink ? `<button onclick="limparSessionLink(${i})" title="Remover link" style="background:none;border:1px solid var(--border);color:var(--red);border-radius:8px;font-size:11px;padding:6px 9px;cursor:pointer;font-family:inherit">✕</button>` : ''}
        </div>
        ${p.sessionLink ? `<div style="font-size:11px;color:var(--sage);margin-top:5px">✓ Link externo ativo — o paciente vê o botão de entrar no portal</div>` : ''}
      </details>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="exportarProntuario()" title="PDF completo do prontuário deste paciente">${_tfIcon('csv')} Prontuário PDF</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="exportarRelatorioEvolucao()" title="PDF de evolução (humor, presença, progresso)">📈 Evolução PDF</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="abrirModalDeclaracao(${i},'convenio')" title="Declaração de atendimento para o paciente pedir reembolso ao plano de saúde">🧾 Declaração convênio</button>
      <button class="btn btn-secondary btn-sm" style="justify-content:center" onclick="abrirModalDeclaracao(${i},'ir')" title="Declaração anual de pagamentos para o Imposto de Renda do paciente">🧾 Relatório p/ IR</button>
    </div>
    <button class="btn btn-sm" style="color:var(--red);border-color:rgba(192,57,43,.25);background:var(--red-light);justify-content:center;width:100%" onclick="excluirPaciente(${i})">
      ✕ Excluir paciente
    </button>
  `;
}

function renderPatientNotas(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  // ── Notas clínicas ── (a nota pré-sessão do paciente mudou para o bloco
  // "Entre as sessões" da Visão Geral — reorganização 14/07)
  var notasHtml = '<div style="display:flex;flex-direction:column;gap:12px">';

  if (p.prontuarioNotes && p.prontuarioNotes.length > 0) {
    // Numeração de sessão só conta notas de sessão (registro avulso não é sessão)
    var _notasOrdem = p.prontuarioNotes.slice();
    var _numPorData = {};
    var _seq = 0;
    _notasOrdem.forEach(function(n){ if (!n.manual) { _seq++; _numPorData[n.date] = _seq; } });
    _notasOrdem.slice().reverse().forEach(function(n, ni) {
      var textoId = 'ptab-nota-' + i + '-' + ni;
      var titulo = n.manual ? 'Registro avulso — ' + escHTML(n.date) : 'Sessão ' + (_numPorData[n.date] || '?') + ' — ' + escHTML(n.date);
      notasHtml += '<div class="card card-sm" data-nota-date="' + escHTML(n.date) + '" style="border-left:3px solid ' + (n.manual ? 'var(--muted-2)' : 'var(--sage)') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
        + '<span style="font-weight:500">' + titulo + '</span>'
        + '<button onclick="editarNotaTab(\'' + textoId + '\',this,' + i + ',\'' + n.date + '\')" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:11px;padding:2px 8px;color:var(--muted)">✎ Editar</button>'
        + '</div>'
        + '<p id="' + textoId + '" style="font-size:13.5px;color:var(--ink-soft);line-height:1.7">' + escHTML(n.text) + '</p>'
        + '</div>';
    });
  } else {
    notasHtml += '<div style="padding:20px 0;color:var(--muted);font-size:13px;font-style:italic;text-align:center">Nenhuma nota clínica registrada ainda. As notas nascem das sessões — ou crie um registro avulso.</div>';
  }
  notasHtml += '</div>';

  // ── Linha do tempo ── (por identidade — patientIdx desloca com exclusões)
  var apptsPac = _apptsDoPaciente(p, i)
    .sort(function(a, b){ return (a.date + a.time) < (b.date + b.time) ? 1 : -1; });
  var notasIdx = (p.prontuarioNotes || []).reduce(function(m, n){ m[n.date] = n; return m; }, {});
  var timelineHtml;

  if (!apptsPac.length) {
    timelineHtml = '<div style="padding:20px 0;color:var(--muted);font-size:13px;font-style:italic;text-align:center">Nenhum agendamento registrado ainda.</div>';
  } else {
    var eventos = apptsPac.map(function(a, ai) {
      var nota = notasIdx[fmtDataBR(a.date)];
      var presencaLabel = a.presenca === 'faltou' ? 'Falta' : a.presenca === 'atrasou' ? 'Atrasou' : '';
      var statusLabel = a.status === 'cancelada' ? 'Cancelada' : (presencaLabel || 'Realizada');
      var dotColor = a.status === 'cancelada' ? 'var(--muted)' : a.presenca === 'faltou' ? 'var(--red)' : a.presenca === 'atrasou' ? 'var(--amber)' : 'var(--sage)';
      var tagHtml = a.status === 'cancelada'
        ? '<span class="tag tag-gray" style="font-size:10px">Cancelada</span>'
        : a.presenca === 'faltou' ? '<span class="tag tag-red" style="font-size:10px">Faltou</span>'
        : a.presenca === 'atrasou' ? '<span class="tag tag-amber" style="font-size:10px">Atrasou</span>'
        : nota ? '<span class="tag tag-green" style="font-size:10px">Com nota</span>' : '';
      var _tot = (typeof p.sessions === 'number' && p.sessions > 0) ? p.sessions : apptsPac.length;
      var numSessao = Math.max(1, _tot - ai);
      var dateBR = fmtDataBR(a.date);
      var moodHtml = '';
      if (p.moodHistory && p.moodHistory[apptsPac.length - ai - 1] !== undefined) {
        var mv = p.moodHistory[apptsPac.length - ai - 1];
        var mc = mv <= 3 ? 'var(--red)' : mv <= 6 ? 'var(--amber)' : 'var(--sage)';
        moodHtml = ' <span style="font-size:11px;color:' + mc + '">● ' + mv + '/10</span>';
      }
      // Linha do tempo só de EVENTOS: o texto da nota vive apenas nos cards de
      // "Notas clínicas" acima — repeti-lo aqui duplicava todo o conteúdo (V4).
      return '<div class="tl-item"><div class="tl-line"><div class="tl-dot" style="background:' + dotColor + '"></div>' + (ai < apptsPac.length - 1 ? '<div class="tl-bar"></div>' : '') + '</div>'
        + '<div class="tl-content"><div class="tl-date">' + dateBR + ' · Sessão ' + numSessao + ' · ' + escHTML(a.time) + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div class="tl-title">' + escHTML(statusLabel) + moodHtml + '</div>' + tagHtml + '</div>'
        + (a.motivoCancelamento ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">Motivo: ' + escHTML(a.motivoCancelamento) + '</div>' : '')
        + '</div></div>';
    });
    timelineHtml = '<div class="timeline">' + eventos.join('') + '</div>';
  }

  content.innerHTML = '<div class="divider"></div>'
    + '<div style="display:flex;align-items:center;margin-bottom:14px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Notas clínicas</div>'
    + '<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="novaNotaManual(' + i + ')">+ Nova nota</button>'
    + '</div>'
    + notasHtml
    + '<div style="margin-top:24px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px">Linha do tempo</div>'
    + timelineHtml
    + '<div style="margin-top:24px">' + renderTrajetoriaTerapeuta(i) + '</div>';
}

/* + Nova nota (reorganização 14/07): registro clínico fora de sessão — antes só
 * existia nota nascida do encerramento, sem como anotar um telefonema, um contato
 * da família etc. Uma nota por data (o sync 027 une por date); se já há nota de
 * hoje, abre a existente para completar. */
function novaNotaManual(i) {
  var p = patients[i];
  if (!p) return;
  var hojeBR = fmtDataBR(hojeISO());
  if (!p.prontuarioNotes) p.prontuarioNotes = [];
  var existente = p.prontuarioNotes.find(function(n){ return n.date === hojeBR; });
  if (!existente) {
    p.prontuarioNotes.push({ date: hojeBR, text: '', manual: true, _up: Date.now() });
    salvarPacientes();
  } else {
    showToast('Já existe nota de hoje — abrindo para completar.');
  }
  renderPatientNotas(i);
  // Abre o editor da nota de hoje direto
  setTimeout(function() {
    var card = document.querySelector('#patient-detail-tab-content [data-nota-date="' + hojeBR + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var btn = card.querySelector('button');
    if (btn) btn.click();
  }, 80);
}

// C11: o "Limpar" da nota pré-sessão só apagava localmente (sem sync) e
// portalNota é chave protegida (escrita da paciente) — a nota "limpa"
// ressuscitava do servidor no próximo login. O touch autoriza a limpeza
// intencional a propagar (mesmo mecanismo da anamnese).
function _limparPortalNota(i) {
  if (!confirm('Limpar nota da paciente?')) return;
  var p = patients[i]; if (!p) return;
  p.portalNota = '';
  salvarPacientes();
  if (typeof _supaSync_patients === 'function') _supaSync_patients({ touch: ['portalNota'], onlyId: p.id }).catch(function(){});
  if (typeof renderPatientNotas === 'function' && currentPatientTab === 'notas') renderPatientNotas(i);
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
  if (nota) { nota.text = novoTexto; nota._up = Date.now(); salvarPacientes(); } // _up: merge por elemento (027)
}

function renderPatientFicha(i) {
  var content = document.getElementById('patient-detail-tab-content');
  if (!content) return;
  var p = patients[i];
  if (!p) return;

  // (O bloco "Evolução do paciente" — 4 mini-stats + sparkline — saiu daqui:
  //  duplicava a strip da Visão Geral. Reorganização 14/07.)

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
      var tag = '<span style="font-size:10.5px;background:var(--line-2);color:var(--muted);padding:2px 7px;border-radius:10px;font-weight:500">' + escHTML(labelMap[m.tipo] || m.tipo) + '</span>';
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
    // Reorganização 14/07: o bloco "Evolução do paciente" saiu — era a 2ª cópia
    // dos números que moram na Visão Geral. A Ficha é DADOS clínicos + materiais.
    + '<div style="display:flex;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Dados clínicos</div>'
    + '<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="showEditarPaciente(' + i + ')">✎ Editar dados</button>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">'
    + '<div>'
    + '<div class="form-group"><label>CID principal</label><div style="font-size:14px;padding:9px 0">' + (p.cid && p.cid !== '—' ? escHTML(p.cid) : 'Não informado') + '</div></div>'
    + '<div class="form-group"><label>Abordagem</label><div style="font-size:14px;padding:9px 0">' + escHTML(p.abordagem || '—') + '</div></div>'
    + '</div>'
    + '<div>'
    + '<div class="form-group"><label>Queixa principal</label><div style="font-size:13.5px;line-height:1.6;color:var(--ink-soft);padding:9px 0">' + escHTML(p.notes || '—') + '</div></div>'
    + '</div>'
    + '</div>'
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
  var src = document.getElementById('tpl-anamnese');
  if (!src) return;
  content.innerHTML = '<div class="divider"></div>' + src.innerHTML;
  if (typeof _popularAnamnese === 'function') _popularAnamnese(i);
}

function _excluirMaterialFicha(pidx, mid) {
  if (!confirm('Remover este material?')) return;
  var p = patients[pidx];
  if (!p || !p.materials) return;
  p.materials = p.materials.filter(function(m){ return m.id !== mid; });
  _tfTombstone(p, 'materials', mid); // P10: cópia velha de outro device não ressuscita
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
    var unchanged = typeof _briefingCacheUnchanged === 'function' ? _briefingCacheUnchanged(cache, p) : true;
    bodyHtml = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:8px 12px;background:var(--sage-light);border-radius:8px;border:1px solid rgba(74,124,89,.15)">'
      + '<span style="font-size:18px">✦</span>'
      + '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--sage)">Gerado ' + (typeof _briefingQuando === 'function' ? _briefingQuando(cache) : '') + '</div>'
      + '<div style="font-size:11px;color:var(--muted)">' + (p.sessions||0) + ' sessões · ' + (unchanged ? 'sem alterações desde então' : 'há novas informações — vale atualizar') + '</div></div>'
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
  // Parser único com a página do briefing (_parseBriefingBlocks js/11) — só o
  // estilo compacto é daqui; perguntas vêm primeiro pela ordem das defs (V4).
  var cores = { question:'var(--amber)', priority:'var(--sage)', pattern:'var(--purple)', progress:'#2563eb', alert:'var(--red)' };
  var blocks = (typeof _parseBriefingBlocks === 'function') ? _parseBriefingBlocks(text) : [];
  var html = '';
  blocks.forEach(function(b) {
    if (!b.content) return;
    html += '<div style="margin-bottom:12px;padding:12px 14px;border-radius:10px;background:var(--bg);border-left:3px solid ' + (cores[b.type] || 'var(--sage)') + '">'
      + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">' + b.icon + ' ' + b.label + '</div>'
      + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.6">' + escHTML(b.content) + '</div>'
      + '</div>';
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


function selectPatient(i, el) {
  if (i < 0 || i >= patients.length) return;
  currentPatientIdx = i;
  const p = patients[i];

  // Sincroniza o DESTAQUE da lista com o painel aberto: vindo de fora (agenda →
  // "Ver paciente"), o painel abria a pessoa certa mas a lista continuava
  // destacando a primeira (print do fundador 15/07).
  try {
    var _alvo = document.querySelector('#patient-list .list-item[data-idx="' + i + '"]');
    if (_alvo && !_alvo.classList.contains('active')) {
      document.querySelectorAll('#patient-list .list-item').forEach(function(x){ x.classList.remove('active'); });
      _alvo.classList.add('active');
      _alvo.scrollIntoView({ block: 'nearest' });
    }
  } catch (_) {}

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

  // Chat removido (Lote 2 P3): carrega o histórico UMA vez (read-only) — sem poll,
  // já que a paciente não envia mais pelo app.
  (function() {
    var _pId = p.id;
    if (!_pId) return;
    _supaFetchMessages(_pId, supa).then(function(msgs) {
      var sec = document.getElementById('pac-chat-section-' + i);
      if (sec) sec.innerHTML = renderChatTerapeuta(i, msgs);
    }).catch(function(){});
  })();
}

function renderTrajetoriaTerapeuta(i) {
  var p = patients[i];
  if (!p) return '';
  // Filtra appointments passados deste paciente (por identidade), ordem DESC
  var hojeIso2 = hojeISO();
  var passados = _apptsDoPaciente(p, i).filter(function(a) {
    return a.date <= hojeIso2 && a.presenca;
  }).sort(function(a, b) { return b.date.localeCompare(a.date); });
  if (!passados.length) return '';

  var rows = passados.slice(0, 10).map(function(a, ai) {
    var dateObj = new Date(a.date + 'T12:00');
    var dateStr = dateObj.toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'short'});
    var statusColor = a.presenca === 'compareceu' ? 'var(--sage)' : a.presenca === 'faltou' ? 'var(--red)' : 'var(--amber)';
    var statusLabel = a.presenca === 'compareceu' ? 'Compareceu' : a.presenca === 'faltou' ? 'Faltou' : 'Cancelou';
    var resumo = a.resumoParaPaciente || '';
    // Rascunho da IA aguardando aprovação (gerado pós-sessão; NÃO visível ao
    // paciente até o terapeuta publicar) — prioridade p/ o publicado se ambos existem.
    var pendente = !resumo && a.resumoPendente ? a.resumoPendente : '';
    var pendenteBadge = pendente
      ? '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#fff8e6;color:#c97d2e;font-weight:600">🕓 rascunho da IA — não publicado</span>'
      : '';
    return '<div style="border-bottom:1px solid var(--border);padding:10px 0">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
      + '<span style="font-size:12px;font-weight:600;color:var(--ink)">' + dateStr + '</span>'
      + '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + (a.presenca==='compareceu'?'#e8f5ee':a.presenca==='faltou'?'#fdecea':'#fff8e6') + ';color:' + statusColor + '">' + statusLabel + '</span>'
      + pendenteBadge
      + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-bottom:5px">' + (pendente ? 'Revise o rascunho — o paciente só vê depois que você publicar:' : 'Resumo para o paciente (opcional):') + '</div>'
      + '<div style="display:flex;gap:6px;align-items:flex-start">'
      + '<textarea id="resumo-pac-' + a.id + '" placeholder="Escreva um resumo acessível desta sessão para o paciente ver na jornada…" '
      + 'style="flex:1;border:1.5px solid ' + (pendente ? '#f0d060' : 'var(--border)') + ';border-radius:8px;padding:7px 10px;font-size:12px;font-family:\'DM Sans\',sans-serif;outline:none;resize:none;min-height:52px;background:' + (pendente ? '#fffdf5' : 'var(--bg)') + ';color:var(--ink);line-height:1.5" '
      + 'onfocus="this.style.borderColor=\'var(--sage)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      + escHTML(resumo || pendente)
      + '</textarea>'
      + '<div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">'
      + '<button onclick="salvarResumoParaPaciente(' + i + ',\'' + escHTML(a.id) + '\')" style="background:var(--sage-light);border:1px solid var(--sage-100);color:var(--sage);border-radius:7px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">' + (pendente ? '✓ Publicar' : 'Salvar') + '</button>'
      + '<button onclick="regenerarResumoIA(' + i + ',\'' + escHTML(a.id) + '\')" style="background:var(--white);border:1px solid var(--border);color:var(--muted);border-radius:7px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">✨ IA</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  var _hasResumo = passados.some(function(a) { return a.resumoParaPaciente || a.resumoPendente; });
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
    delete appt.resumoPendente; // publicado (ou removido) → rascunho deixa de existir
    _salvarAppointments();
    _supaSync_appointments().catch(function(){});
  }
  // Atualiza no metadata do paciente (para sync via _supaSync_patients).
  // Cria a entrada se não existir — rascunhos não têm espelho (privacidade), então
  // na 1ª publicação de uma sessão antiga pode não haver entrada prévia.
  var p = patients[patientIdx];
  if (p && texto) {
    if (!p.appointments) p.appointments = [];
    var pa = p.appointments.find(function(a) { return String(a.id) === String(apptId); });
    if (pa) pa.resumoParaPaciente = texto;
    else if (appt) p.appointments.push({ id: appt.id, date: appt.date, presenca: appt.presenca || 'compareceu', resumoParaPaciente: texto });
    salvarPacientes();
  } else if (p && p.appointments) {
    var paDel = p.appointments.find(function(a) { return String(a.id) === String(apptId); });
    if (paDel) { paDel.resumoParaPaciente = ''; salvarPacientes(); }
  }
  showToast(texto ? '✓ Resumo publicado — visível na jornada do paciente' : '✓ Resumo removido');
  // Re-render: badge "rascunho" e botão "Publicar" saem na hora
  if (typeof currentPatientTab !== 'undefined' && currentPatientTab === 'overview') renderPatientOverview(patientIdx);
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
  // O chat bidirecional foi removido (Lote 2 P3, decisão do usuário): a paciente não
  // envia mais pelo app. Se houver histórico, mostra READ-ONLY; o canal ativo agora
  // é a "Mensagem da semana" (1-via, visível no portal) e o WhatsApp.
  // Sem histórico → nada (o card estático "foi descontinuado" era ruído permanente
  // na Visão Geral; a dica vive no bloco "Entre as sessões" — reorganização 14/07).
  if (!thread) return '';
  return '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)">'
    + '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Mensagens (histórico)</div>'
    + '<div class="chat-thread" id="chat-thread-t-'+i+'">'+thread+'</div>'
    + '<div style="font-size:11.5px;color:var(--muted);margin-top:10px;padding-top:10px;border-top:1px solid var(--border);line-height:1.5">O chat pelo app foi descontinuado — use a <strong>Mensagem da semana</strong> no Portal ou o WhatsApp.</div>'
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


// ── SESSÃO / TIMER ──
let timerInterval = null, sessionSeconds = 0;
let currentSessionPatientIdx = 0;
let currentSessionApptId = null; // ID do appointment que iniciou a sessão atual
let currentPortalPatientIdx = 0;
let currentPatientIdx = 0;
let currentPatientTab = 'overview';
let _editingExerciseId = null;