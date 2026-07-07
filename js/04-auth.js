// 04-auth.js — Login do terapeuta e do paciente

// ── Therapist login functions ──
function showLogin() {
  // Esconde o onboarding principal (primeiro filho direto do layer)
  const mainWrap = document.getElementById('tf-main-onboarding');
  if (mainWrap) mainWrap.style.display = 'none';
  document.getElementById('tf-login-screen').style.display = 'block';
  document.getElementById('tf-forgot-screen').style.display = 'none';
  setTimeout(() => document.getElementById('login-email')?.focus(), 80);
}

function hideLogin() {
  document.getElementById('tf-login-screen').style.display = 'none';
  document.getElementById('tf-forgot-screen').style.display = 'none';
  const mainWrap = document.getElementById('tf-main-onboarding');
  if (mainWrap) mainWrap.style.display = 'block';
}

function toggleLoginPassword() {
  const inp = document.getElementById('login-senha');
  const btn = document.getElementById('btn-toggle-pw');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function loginClearError() {
  document.getElementById('login-error').style.display = 'none';
}

function loginSubmit() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const btn = document.getElementById('btn-login-submit');
  const errEl = document.getElementById('login-error');

  if (!email || !senha) {
    errEl.textContent = '⚠ Preencha email e senha.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Entrando…';
  btn.disabled = true;
  errEl.style.display = 'none';

  supa.auth.signInWithPassword({ email, password: senha }).then(async ({ data, error }) => {
    btn.textContent = 'Entrar na minha conta →';
    btn.disabled = false;

    if (error) {
      // Fallback: tenta login local (modo offline/demo)
      let account = null;
      try { account = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
      if (account && account.email?.toLowerCase() === email.toLowerCase() && tfVerificaSenha(senha, account.senha)) {
        _proceedToApp(account);
        return;
      }
      errEl.textContent = '⚠ Email ou senha incorretos.';
      errEl.style.display = 'block';
      return;
    }

    // Login Supabase OK — verifica 2FA (se ativo) antes de carregar dados e entrar
    if (typeof _postAuthGate === 'function') {
      _postAuthGate(data.user);
    } else {
      await _supaLoadUserData(data.user.id);
      let account = null;
      try { account = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
      _proceedToApp(account);
    }
  });
}

function _proceedToApp(account) {
  if (account) {
    tfUserData.nome        = account.nome;
    tfUserData.crp         = account.crp || '';
    tfUserData.email       = account.email;
    tfUserData.abordagem   = account.abordagem || '';
    tfUserData.secundarias = account.secundarias || [];
    tfUserData.abordagemKey = account.abordagemKey || ABORDAGEM_KEY_MAP?.[account.abordagem] || 'tcc';
    try {
      if (window.posthog && account.supa_id) {
        posthog.identify(account.supa_id, {
          plano: account.plano || 'trial',
        });
      }
    } catch(e) {}
    tfTrack('user_logged_in', { plano: account.plano || 'trial' });
  }
  checkTermsAndProceed(function() {
    document.getElementById('tf-onboarding-layer').style.display = 'none';
    document.getElementById('tf-app-layer').style.display = 'flex';
    carregarPacientes();
    carregarAppointments();
    charges = carregarCharges();
    aplicarDadosNoApp();
    checkFirstPatientBanner();
    atualizarTrialUI();
    var lastPage = 'dashboard';
    try { lastPage = localStorage.getItem('tf_current_page') || 'dashboard'; } catch(e) {}
    if (lastPage === 'sessao') lastPage = 'dashboard';
    navigate(lastPage);
  });
}

function showForgotPassword() {
  document.getElementById('tf-login-screen').style.display = 'none';
  document.getElementById('tf-forgot-screen').style.display = 'block';
  document.getElementById('forgot-form-area').style.display = 'block';
  document.getElementById('forgot-success').style.display = 'none';
  setTimeout(() => document.getElementById('forgot-email')?.focus(), 80);
}

function hideForgotPassword() {
  document.getElementById('tf-forgot-screen').style.display = 'none';
  document.getElementById('tf-login-screen').style.display = 'block';
  setTimeout(() => document.getElementById('login-senha')?.focus(), 80);
}

async function sendForgotPassword() {
  const emailInput = document.getElementById('forgot-email');
  const email = emailInput.value.trim();
  if (!email) { showToast('⚠ Informe seu e-mail de cadastro.'); emailInput.focus(); emailInput.style.borderColor='#e74c3c'; return; }
  const btn = document.querySelector('#tf-forgot-screen button[onclick*="sendForgotPassword"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  const { error } = await supa.auth.resetPasswordForEmail(email).catch(() => ({ error: { message: 'Erro de rede' } }));
  if (btn) { btn.disabled = false; btn.textContent = 'Enviar link de recuperação'; }
  if (error) {
    const errEl = document.getElementById('forgot-error') || emailInput;
    // Mostra erro discretamente sem revelar se email existe ou não (segurança)
    document.getElementById('forgot-form-area').style.display = 'none';
    document.getElementById('forgot-success').style.display = 'block';
  } else {
    document.getElementById('forgot-form-area').style.display = 'none';
    document.getElementById('forgot-success').style.display = 'block';
  }
  // Auto-redirect para login após 4 segundos com contador.
  // Guard: clicar 2× criava dois setInterval paralelos (contador maluco). F4.5.
  if (window._forgotRedirectTimer) { clearInterval(window._forgotRedirectTimer); window._forgotRedirectTimer = null; }
  let secs = 4;
  const counter = document.getElementById('forgot-redirect-counter');
  if (counter) counter.textContent = secs;
  window._forgotRedirectTimer = setInterval(() => {
    secs--;
    if (counter) counter.textContent = secs;
    if (secs <= 0) { clearInterval(window._forgotRedirectTimer); window._forgotRedirectTimer = null; hideForgotPassword(); }
  }, 1000);
}


// ── sairDaConta ──
function sairDaConta() {
  if (window._tfDemo) {
    window._tfDemo = false;
    _tfPlanPro = false;
    _hideDemoBanner();
    // Remove conta demo do localStorage para não persistir plano entre sessões
    localStorage.removeItem('tf_account');
  }
  supa.auth.signOut().catch(() => {});
  document.getElementById('tf-app-layer').style.display        = 'none';
  document.getElementById('tf-onboarding-layer').style.display = 'flex';

  // Se existe conta salva → vai para o login (não apaga os dados)
  var hasAccount = false;
  try { hasAccount = !!JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}

  if (hasAccount) {
    document.getElementById('tf-main-onboarding').style.display = 'none';
    document.getElementById('tf-login-screen').style.display    = 'block';
    document.getElementById('tf-forgot-screen').style.display   = 'none';
    // Pré-preenche email
    try {
      var account = JSON.parse(localStorage.getItem('tf_account'));
      var loginEmail = document.getElementById('login-email');
      if (loginEmail && account.email) loginEmail.value = account.email;
    } catch(e) {}
    document.getElementById('login-senha').value = '';
    document.getElementById('login-error').style.display = 'none';
    setTimeout(function() { document.getElementById('login-senha')?.focus(); }, 80);
  } else {
    // Sem conta → volta para o onboarding
    document.getElementById('tf-main-onboarding').style.display = 'block';
    document.getElementById('tf-login-screen').style.display    = 'none';
    document.getElementById('tf-forgot-screen').style.display   = 'none';
  }

  // Reseta estado
  if (typeof currentScreen    !== 'undefined') currentScreen    = 1;
  if (typeof selectedAbordagem !== 'undefined') selectedAbordagem = null;
  if (typeof secundarias       !== 'undefined') secundarias       = [];
  if (typeof savedData !== 'undefined') {
    savedData.nome = ''; savedData.crp = ''; savedData.email = '';
    savedData.abordagem = ''; savedData.secundarias = [];
  }
  tfUserData = { nome: '', crp: '', email: '', abordagem: '', secundarias: [], abordagemKey: 'tcc' };

  // Restaura telas do onboarding
  var cardBody = document.querySelector('#tf-onboarding-layer .ob-card-body');
  if (cardBody && typeof screensHTML !== 'undefined' && screensHTML) {
    cardBody.innerHTML = screensHTML;
    ['nome','crp','email','senha'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function() {
        this.classList.remove('error');
        var err = document.getElementById('err-' + id);
        if (err) err.style.display = 'none';
      });
    });
  }

  document.querySelectorAll('#tf-onboarding-layer .ob-screen').forEach(function(s, i) {
    s.classList.toggle('active', i === 0);
  });
  if (typeof updateProgress === 'function') updateProgress();
  window.scrollTo(0, 0);
}


// ── Patient area auth (irParaLoginPaciente, loginPaciente, sairPaciente) ──
function irParaLoginPaciente() {
  document.getElementById('tf-onboarding-layer').style.display = 'none';
  document.getElementById('tf-patient-login-layer').classList.add('open');
  setTimeout(function(){ document.getElementById('pac-login-email').focus(); }, 100);
}

function voltarLoginTerapeuta() {
  document.getElementById('tf-patient-login-layer').classList.remove('open');
  document.getElementById('tf-onboarding-layer').style.display = 'flex';
}

function _verificarTermosPortal(patientId, callback) {
  var chave = 'tf_portal_terms_' + patientId;
  if (localStorage.getItem(chave) === '1') { callback(); return; }
  // Cria modal de aceite
  var existing = document.getElementById('modal-termos-portal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'modal-termos-portal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:480px;width:100%;padding:28px 24px;box-shadow:0 8px 40px rgba(0,0,0,.2)">'
    + '<div style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:8px">Termos de uso e privacidade</div>'
    + '<div style="font-size:13px;color:var(--ink-soft);line-height:1.7;margin-bottom:18px;max-height:200px;overflow-y:auto;padding-right:4px">'
    + '<b>TheraFlow — Portal do Paciente</b><br><br>'
    + 'Ao acessar este portal, você concorda com o uso dos seus dados clínicos (registros de humor, diário, tarefas e exercícios) pelo sistema TheraFlow para fins terapêuticos, em conformidade com a <b>LGPD (Lei 13.709/2018)</b>.<br><br>'
    + 'Seus dados são armazenados com segurança e acessados apenas por você e seu terapeuta. Você pode solicitar a exclusão dos seus dados a qualquer momento diretamente com seu terapeuta.<br><br>'
    + 'O uso do portal implica concordância com estes termos.'
    + '</div>'
    + '<button id="btn-aceitar-termos" style="width:100%;padding:13px;background:var(--sage);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Entendi e aceito os termos</button>'
  + '</div>';
  document.body.appendChild(modal);
  document.getElementById('btn-aceitar-termos').addEventListener('click', function() {
    try { localStorage.setItem(chave, '1'); } catch(e) {}
    // Registra o aceite no banco (LGPD) — só quando há UUID real do paciente
    if (typeof _logConsent === 'function' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) {
      _logConsent('portal_paciente', { patientId: patientId, versao: '1.0' });
    }
    modal.remove();
    callback();
  });
}

// Login do paciente via RPC portal_patient_login (hash da senha no metadata,
// SECURITY DEFINER — não precisa de sessão Auth). Reaproveitado em 2 situações:
// (a) o Supabase Auth falhou (paciente sem conta Auth); (b) o Auth autenticou
// numa conta SEM vínculo patient_users (ex.: colisão com o email do terapeuta).
// Retorna true se logou e abriu o portal; false caso contrário.
async function _pacTryRpcLogin(email, senha) {
  try {
    var senhaHash = await _portalHash(senha);
    var rpcResult = await supaPatient.rpc('portal_patient_login', { p_email: email, p_hash: senhaHash });
    if (!rpcResult.data) return false;
    var raw = rpcResult.data;
    var meta = raw.metadata || {};
    var pRpc = Object.assign({}, meta, {
      id: raw.id, name: raw.name, email: raw.email,
      whatsapp: raw.phone, age: raw.age, cidade: raw.cidade,
      abordagem: raw.abordagem, cid: raw.cid, notes: raw.notes,
      status: raw.status, sessions: raw.sessions_count,
      valorSessao: raw.valor_sessao, progress: raw.progress,
    });
    // Carrega appointments
    var apptRes = await supaPatient.from('appointments')
      .select('local_id,date,time,presenca,status,metadata')
      .eq('patient_id', raw.id).order('date', { ascending: false }).limit(60);
    if (apptRes.data && apptRes.data.length) {
      pRpc.appointments = apptRes.data.map(function(a) {
        return Object.assign({}, (a.metadata || {}), {
          id: a.local_id, date: a.date, time: a.time,
          presenca: a.presenca, status: a.status,
        });
      });
    }
    var pacsRpc = [pRpc];
    _loggedPatientIdx = 0;
    _loggedPatientData = pRpc;
    _pacSetPortalAuth(email, senhaHash); // sem sessão Auth → chat usa RPCs (migration 010)
    document.getElementById('tf-patient-login-layer').classList.remove('open');
    var _pLayer = document.getElementById('tf-patient-app-layer'); _pLayer.style.display = ''; _pLayer.classList.add('open');
    _verificarTermosPortal(pRpc.id, function(){ renderPatientApp(0, pacsRpc); });
    return true;
  } catch (_rpcErr) {}
  return false;
}

function loginPaciente() {
  var email = (document.getElementById('pac-login-email').value || '').trim().toLowerCase();
  var senha = (document.getElementById('pac-login-senha').value || '').trim();
  var errEl = document.getElementById('pac-login-error');
  var btn = document.getElementById('pac-login-btn');
  errEl.style.display = 'none';

  if (!email || !senha) {
    errEl.textContent = '⚠ Preencha email e senha.';
    errEl.style.display = '';
    return;
  }

  if (btn) { btn.textContent = 'Entrando…'; btn.disabled = true; }
  _pacClearPortalAuth(); // reset; só os caminhos SEM sessão Auth (RPC/local) voltam a setar

  supaPatient.auth.signInWithPassword({ email, password: senha }).then(async function({ data, error }) {
    if (btn) { btn.textContent = 'Acessar meu portal →'; btn.disabled = false; }

    if (error) {
      // Fallback: login local (funciona sem internet ou sem conta Supabase)
      var pacs = [];
      try { pacs = JSON.parse(localStorage.getItem('tf_patients') || '[]'); } catch(e2) {}
      var senhaHash = await _portalHash(senha);
      var idx = pacs.findIndex(function(p) {
        var pEmail = (p.email || '').trim().toLowerCase();
        if (pEmail !== email) return false;
        // Preferência: comparar hash (contas já migradas)
        if (p.portalPasswordHash) return p.portalPasswordHash === senhaHash;
        // Senha explícita salva — compara plaintext (migra para hash abaixo)
        if (p.portalPassword) return p.portalPassword === senha;
        // Sem senha definida: aceita primeiro nome em minúsculas como padrão
        var defaultPwd = (p.name || '').split(' ')[0].toLowerCase();
        return senha === defaultPwd;
      });
      // Migra automaticamente conta antiga para hash após login bem-sucedido
      if (idx !== -1 && !pacs[idx].portalPasswordHash) {
        pacs[idx].portalPasswordHash = senhaHash;
        try { localStorage.setItem('tf_patients', JSON.stringify(pacs)); } catch(_) {}
        if (typeof _supaSync_patients === 'function') _supaSync_patients().catch(() => {});
      }
      if (idx !== -1) {
        _loggedPatientIdx = idx;
        _loggedPatientData = pacs[idx];
        _pacSetPortalAuth(email, senhaHash); // login local, sem sessão Auth → chat usa RPCs
        document.getElementById('tf-patient-login-layer').classList.remove('open');
        var _pLayer1 = document.getElementById('tf-patient-app-layer'); _pLayer1.style.display = ''; _pLayer1.classList.add('open');
        _verificarTermosPortal(pacs[idx].id || 'local-' + idx, function(){ renderPatientApp(idx, pacs); });
        return;
      }

      // Fallback Supabase RPC — funciona em aba anônima / sem localStorage
      if (await _pacTryRpcLogin(email, senha)) return;

      errEl.textContent = '⚠ Email ou senha incorretos. Verifique com seu terapeuta.';
      errEl.style.display = '';
      document.getElementById('pac-login-senha').value = '';
      return;
    }

    // Login Supabase OK — carrega dados do paciente
    var userId = data.user.id;

    // Busca vínculo patient_users
    var linkResult = await supaPatient.from('patient_users')
      .select('patient_id')
      .eq('auth_user_id', userId)
      .single();

    if (!linkResult.data) {
      // Autenticou numa conta Auth sem vínculo de paciente (ex.: mesmo email do
      // terapeuta). Desloga dessa sessão e tenta o login de paciente via RPC,
      // que valida o hash da senha guardado em patients.metadata.
      await supaPatient.auth.signOut().catch(() => {});
      if (await _pacTryRpcLogin(email, senha)) return;
      errEl.textContent = '⚠ Acesso não configurado. Peça ao seu terapeuta para enviar o convite novamente.';
      errEl.style.display = '';
      return;
    }

    // Carrega dados do paciente
    var patResult = await supaPatient.from('patients')
      .select('*')
      .eq('id', linkResult.data.patient_id)
      .single();

    if (!patResult.data) {
      await supaPatient.auth.signOut().catch(() => {});
      if (await _pacTryRpcLogin(email, senha)) return;
      errEl.textContent = '⚠ Acesso ainda não configurado. Aguarde seu terapeuta concluir a configuração e tente novamente.';
      errEl.style.display = '';
      return;
    }

    // Mescla campos DB com metadata para ter estrutura completa
    var raw = patResult.data;
    var p = Object.assign({}, (raw.metadata || {}), {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      whatsapp: raw.phone,
      age: raw.age,
      cidade: raw.cidade,
      abordagem: raw.abordagem,
      cid: raw.cid,
      notes: raw.notes,
      status: raw.status,
      sessions: raw.sessions_count,
      valorSessao: raw.valor_sessao,
      progress: raw.progress,
    });

    // Carrega appointments do paciente para a "Minha jornada"
    var apptRes = await supaPatient
      .from('appointments')
      .select('local_id,date,time,presenca,status,metadata')
      .eq('patient_id', raw.id)
      .order('date', { ascending: false })
      .limit(60);
    if (apptRes.data && apptRes.data.length) {
      p.appointments = apptRes.data.map(function(a) {
        return {
          id: a.local_id,
          date: a.date,
          time: a.time,
          presenca: a.presenca,
          status: a.status,
          resumoParaPaciente: (a.metadata || {}).resumoParaPaciente || null,
          meuInsight: (a.metadata || {}).meuInsight || null,
        };
      });
    }

    _loggedPatientData = p;

    // Guarda cópia dos pacientes do terapeuta antes de substituir
    _therapistPatientsBackup = patients.slice();

    // Popula patients[] com os dados do paciente para que as funções do portal funcionem
    patients.splice(0, patients.length, p);
    _loggedPatientIdx = 0;
    currentPortalPatientIdx = 0;

    document.getElementById('tf-patient-login-layer').classList.remove('open');
    var _pLayer3 = document.getElementById('tf-patient-app-layer'); _pLayer3.style.display = ''; _pLayer3.classList.add('open');
    _verificarTermosPortal(p.id || userId, function(){ renderPatientApp(0, [p]); });
  });
}

// ── Auto-recuperação de senha do paciente ─────────────────────────────────────
// Mostra uma mensagem na caixa #pac-login-error, reaproveitada como info ou aviso.
function _pacShowLoginMsg(msg, tone) {
  var el = document.getElementById('pac-login-error');
  if (!el) { try { alert(msg); } catch(_) {} return; }
  el.textContent = msg;
  if (tone === 'info') {
    el.style.background = '#eef5f0'; el.style.border = '1px solid #cfe3d6'; el.style.color = '#2f6b46';
  } else {
    el.style.background = '#fff0f0'; el.style.border = '1px solid #fcc'; el.style.color = '#c0392b';
  }
  el.style.display = '';
}

// "Esqueci minha senha?" — pede o reset por email. Resposta sempre neutra
// (não revela se o email existe). Degrada em silêncio se /api não estiver no ar.
async function pacEsqueciSenha() {
  var emailEl = document.getElementById('pac-login-email');
  var email = ((emailEl && emailEl.value) || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    _pacShowLoginMsg('Digite seu email no campo acima e toque novamente em "Esqueci minha senha".', 'warn');
    if (emailEl) emailEl.focus();
    return;
  }
  _pacShowLoginMsg('Se houver uma conta com este email, enviamos um link para redefinir a senha. Confira sua caixa de entrada e o spam.', 'info');
  try {
    await fetch('/api/request-patient-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });
  } catch (e) {
    // Preview local (serve.js) não roda /api — a mensagem neutra já foi exibida.
    console.warn('[reset] request indisponível (ok em preview local):', e.message);
  }
}

// Tela /paciente?reset=TOKEN — grava a nova senha. Lê o token de window._pacResetToken.
async function pacConfirmarReset() {
  var novaEl  = document.getElementById('pac-reset-nova');
  var nova2El = document.getElementById('pac-reset-nova2');
  var nova  = ((novaEl  && novaEl.value)  || '').trim();
  var nova2 = ((nova2El && nova2El.value) || '').trim();
  var errEl = document.getElementById('pac-reset-error');
  var btn   = document.getElementById('pac-reset-btn');
  function _err(m) { if (errEl) { errEl.textContent = m; errEl.style.display = ''; } else { try { alert(m); } catch(_) {} } }
  if (errEl) errEl.style.display = 'none';

  if (!nova || nova.length < 6) return _err('A nova senha deve ter pelo menos 6 caracteres.');
  if (nova !== nova2) return _err('As senhas não coincidem.');

  var token = window._pacResetToken;
  if (!token) return _err('Link inválido ou expirado. Solicite uma nova redefinição.');

  if (btn) { btn.textContent = 'Salvando…'; btn.disabled = true; }
  try {
    var r = await fetch('/api/confirm-patient-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, newPassword: nova }),
    });
    var data = {};
    try { data = await r.json(); } catch(_) {}
    if (!r.ok || !data.ok) {
      if (btn) { btn.textContent = 'Salvar nova senha →'; btn.disabled = false; }
      return _err((data && data.error) || 'Não foi possível redefinir a senha. Tente novamente.');
    }
    _pacFinalizarReset();
  } catch (e) {
    if (btn) { btn.textContent = 'Salvar nova senha →'; btn.disabled = false; }
    _err('Erro de conexão. Verifique sua internet e tente novamente.');
  }
}

// Sucesso do reset → fecha a tela, limpa o token da URL e volta ao login.
function _pacFinalizarReset() {
  window._pacResetToken = null;
  try { history.replaceState(null, '', window.location.pathname); } catch(_) {}
  var resetLayer = document.getElementById('tf-patient-reset-layer');
  if (resetLayer) resetLayer.classList.remove('open');
  var loginLayer = document.getElementById('tf-patient-login-layer');
  if (loginLayer) loginLayer.classList.add('open');
  var senhaEl = document.getElementById('pac-login-senha');
  if (senhaEl) senhaEl.value = '';
  _pacShowLoginMsg('Senha alterada com sucesso! Faça login com a nova senha.', 'info');
  setTimeout(function(){ var s = document.getElementById('pac-login-senha'); if (s) s.focus(); }, 150);
}

function sairPaciente() {
  supaPatient.auth.signOut().catch(() => {});
  _loggedPatientIdx = null;
  _loggedPatientData = null;
  _pacClearPortalAuth();
  _stopMsgPoll();
  if (typeof _pacStopSessionPoll === 'function') _pacStopSessionPoll();
  _cancelarNotificacaoPac();

  // Restaura lista de pacientes do terapeuta
  if (_therapistPatientsBackup) {
    patients.splice(0, patients.length, ..._therapistPatientsBackup);
    _therapistPatientsBackup = null;
  }

  document.getElementById('tf-patient-app-layer').classList.remove('open');

  // Se o terapeuta está logado, retorna para o app dele
  var appLayer = document.getElementById('tf-app-layer');
  if (appLayer && appLayer.style.display === 'flex') {
    return; // terapeuta já está com o app aberto
  }

  // Caso contrário, vai para login do terapeuta
  document.getElementById('tf-onboarding-layer').style.display = 'flex';
  var hasAccount = false;
  try { hasAccount = !!JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
  if (hasAccount) {
    var mainOb = document.getElementById('tf-main-onboarding');
    if (mainOb) mainOb.style.display = 'none';
    document.getElementById('tf-login-screen').style.display = 'block';
  }
}

function pacToggleSolicitarSessao() {
  var form = document.getElementById('pac-solicitar-form');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') setTimeout(function(){ document.getElementById('pac-solicitar-msg').focus(); }, 80);
}

function pacEnviarSolicitacaoSessao(nomePaciente) {
  var msg = (document.getElementById('pac-solicitar-msg').value || '').trim();
  // Pega WhatsApp do terapeuta salvo em tf_account
  var wppTerapeuta = '';
  try { wppTerapeuta = JSON.parse(localStorage.getItem('tf_account') || '{}').whatsapp || ''; } catch(e) {}
  if (!wppTerapeuta) {
    showToast('WhatsApp do terapeuta não configurado. Peça para ele cadastrar em Perfil.');
    return;
  }
  var n = wppTerapeuta.replace(/\D/g, '');
  n = n.startsWith('55') ? n : '55' + n;
  var texto = 'Olá! Sou ' + nomePaciente + ', sua paciente pelo TheraFlow. 🌿\n\n'
    + 'Gostaria de solicitar o agendamento de uma nova sessão.'
    + (msg ? '\n\n' + msg : '') + '\n\nObrigado(a)!';
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(texto), '_blank');
  document.getElementById('pac-solicitar-form').style.display = 'none';
}

// ─── TÉCNICAS DO DIA por abordagem ──────────────────────────────────
var TECNICAS_DIA = {
  'TCC': [
    { icone:'🧠', titulo:'Registro de pensamento automático', instrucao:'Quando um pensamento negativo surgir, pergunte: qual a evidência a favor? E contra? Qual seria o pensamento mais equilibrado?' },
    { icone:'📊', titulo:'Escala de catastrofização', instrucao:'Numa escala de 0 a 100%, qual a probabilidade real do pior cenário? E se acontecer, o quanto você consegue lidar com isso?' },
    { icone:'🔬', titulo:'Experimento comportamental', instrucao:'Escolha uma crença que quer testar. Defina uma ação pequena para verificar se ela é verdadeira. Anote o resultado depois.' },
    { icone:'📅', titulo:'Programação de atividades', instrucao:'Liste 3 atividades que lhe dão prazer ou senso de realização. Comprometa-se com pelo menos uma para hoje.' },
    { icone:'🔄', titulo:'Reestruturação cognitiva', instrucao:'Identifique um pensamento disfuncional. Classifique a distorção (catastrofização, leitura mental…) e reescreva de forma mais realista.' },
    { icone:'🔧', titulo:'Resolução de problemas', instrucao:'1) Defina o problema claramente. 2) Liste todas as soluções possíveis. 3) Escolha a melhor. 4) Execute. 5) Avalie o resultado.' },
    { icone:'⏱', titulo:'Técnica 5-4-3-2-1 de aterramento', instrucao:'Nomeie 5 coisas que você vê, 4 que pode tocar, 3 sons que ouve, 2 cheiros que percebe, 1 sabor. Você está no presente.' },
  ],
  'Psicanálise': [
    { icone:'💭', titulo:'Associação livre', instrucao:'Reserve 10 minutos. Escreva sem censura tudo que surgir, sem julgar nem editar. Observe o que emerge livremente.' },
    { icone:'🌙', titulo:'Registro de sonhos', instrucao:'Ao acordar, escreva imediatamente o que lembrar do sonho — imagens, emoções, personagens. Não interprete, apenas registre.' },
    { icone:'🪞', titulo:'Atenção ao que evita', instrucao:'Observe hoje quais assuntos você desvia, quais conversas abrevia, quais lembranças afasta. Registre sem julgamento.' },
    { icone:'🔓', titulo:'Resistência e insight', instrucao:'Há algo difícil de trazer à sessão? Escreva livremente sobre esse assunto apenas para você. O que a resistência está protegendo?' },
    { icone:'🗣', titulo:'Atos falhos', instrucao:'Preste atenção em erros de fala, esquecimentos ou atos falhos ao longo do dia. O que o inconsciente pode estar comunicando?' },
  ],
  'ACT': [
    { icone:'☁️', titulo:'Desfusão cognitiva', instrucao:'Quando um pensamento perturbador surgir, diga: "Estou tendo o pensamento de que…". Observe-o como um objeto que passa, não como verdade.' },
    { icone:'⚓', titulo:'Aterramento no presente', instrucao:'Pause. 5 coisas que você vê, 4 que ouve, 3 que pode tocar, 2 que cheira, 1 que saboreia. Você está aqui, agora.' },
    { icone:'🧭', titulo:'Valores em ação', instrucao:'Escolha um valor seu (família, saúde, criatividade…). Identifique uma ação pequena e concreta que você pode fazer hoje alinhada a esse valor.' },
    { icone:'🌊', titulo:'Aceitação da emoção', instrucao:'Identifique uma emoção difícil. Em vez de lutar, imagine-a como uma onda: observe sua intensidade, onde você sente no corpo. Deixe-a passar.' },
    { icone:'👁', titulo:'Perspectiva do observador', instrucao:'Há uma parte de você que observa tudo sem julgar. O que esse observador interno nota em você agora, com curiosidade e sem crítica?' },
    { icone:'🚌', titulo:'Metáfora do ônibus', instrucao:'Você é o motorista do ônibus da sua vida. Passageiros (pensamentos) gritam para você desviar. Você pode ouvi-los sem obedecer.' },
  ],
  'Gestalt': [
    { icone:'⏱', titulo:'Experimento "Agora"', instrucao:'Complete 10 vezes a frase "Agora eu percebo…" incluindo sensações físicas, emoções, pensamentos. Fique apenas no momento presente.' },
    { icone:'💬', titulo:'Responsabilidade da linguagem', instrucao:'Por algumas horas, troque "não consigo" por "não quero" e "tenho que" por "escolho". Note o que muda na sua experiência.' },
    { icone:'🫀', titulo:'Contato com o corpo', instrucao:'Feche os olhos. Onde você sente tensão agora? Respire nesse lugar por 3 minutos. Se essa tensão tivesse voz, o que diria?' },
    { icone:'🪑', titulo:'Cadeira vazia', instrucao:'Imagine alguém com quem tem tensão sentado numa cadeira à sua frente. Fale em voz alta o que nunca disse. O que você sente ao fazer isso?' },
  ],
  'Humanista': [
    { icone:'🤍', titulo:'Autocompaixão', instrucao:'Pense em algo que te preocupa. Imagine um amigo querido contando isso a você. O que você diria a ele? Agora diga exatamente isso para si mesmo.' },
    { icone:'🪞', titulo:'Congruência', instrucao:'Em que situações você age diferente do que realmente sente? O que impede mais autenticidade nesses momentos? O que você ganharia sendo mais congruente?' },
    { icone:'🔺', titulo:'Necessidades presentes', instrucao:'Quais necessidades suas estão satisfeitas hoje? Quais estão em déficit? Que pequena ação poderia atender a uma delas agora?' },
  ],
};
TECNICAS_DIA['—'] = TECNICAS_DIA['default'] = [
  { icone:'🌬', titulo:'Respiração 4-4-4-4', instrucao:'Inspire por 4 tempos, segure 4, expire por 4, segure 4. Repita 4 ciclos. Simples e comprovado para reduzir ansiedade imediatamente.' },
  { icone:'🙏', titulo:'Registro de gratidão', instrucao:'Escreva 3 coisas pelas quais você é grato hoje — grandes ou pequenas. Estudos mostram que essa prática aumenta bem-estar em apenas 2 semanas.' },
  { icone:'🚶', titulo:'Movimento de 5 minutos', instrucao:'Levante e mova seu corpo por 5 minutos: caminhe, alongue, dance. O movimento físico é um dos reguladores emocionais mais efetivos.' },
  { icone:'👂', titulo:'Autoescuta', instrucao:'Pergunte a si mesmo: "O que estou sentindo agora?" Não resolva, não julgue — apenas nomeie a emoção. Nomear reduz a intensidade emocional.' },
  { icone:'📝', titulo:'Carta para si mesmo', instrucao:'Escreva uma carta curta para a versão de você de 5 anos atrás. O que você diria? O que aprendeu? O que essa pessoa precisaria ouvir?' },
  { icone:'⏸', titulo:'Pausa consciente', instrucao:'Coloque um alarme para 5 minutos. Fique sem tela, sem tarefa. Apenas observe o ambiente e sua própria respiração.' },
  { icone:'🎯', titulo:'Uma coisa de cada vez', instrucao:'Escolha uma tarefa. Feche o resto. Dê atenção plena por 25 minutos. Note a diferença na qualidade e na sensação ao terminar.' },
];

// ─── CONQUISTAS ──────────────────────────────────────────────────────
var BADGES_DEF = [
  { id:'primeira_sessao', icon:'🌱', name:'Primeiro passo',  desc:'1ª sessão realizada',          cond:function(p){ return (p.sessions||0)>=1; } },
  { id:'dez_sessoes',     icon:'🏆', name:'10 sessões',      desc:'Consistência é progresso',      cond:function(p){ return (p.sessions||0)>=10; } },
  { id:'mood_7',          icon:'🔥', name:'7 check-ins',     desc:'7 registros de humor',          cond:function(p){ return (p.moodHistory||[]).length>=7; } },
  { id:'mood_30',         icon:'💎', name:'Mestre do humor', desc:'30 registros de humor',         cond:function(p){ return (p.moodHistory||[]).length>=30; } },
  { id:'diario_1',        icon:'📓', name:'Diário aberto',   desc:'1ª entrada no diário',          cond:function(p){ return (p.diary||[]).length>=1; } },
  { id:'diario_7',        icon:'✍️', name:'Escritor(a)',     desc:'7 entradas no diário',          cond:function(p){ return (p.diary||[]).length>=7; } },
  { id:'ex_5',            icon:'⚡', name:'Em movimento',    desc:'5 exercícios concluídos',       cond:function(p){ return (p.exercises||[]).filter(function(e){return e.done;}).length>=5; } },
  { id:'streak_7',        icon:'🌟', name:'Semana perfeita', desc:'7 dias seguidos de check-in',  cond:function(p){ return (p.checkInStreak||0)>=7; } },
  { id:'streak_30',       icon:'🦋', name:'Transformação',   desc:'30 dias seguidos de check-in', cond:function(p){ return (p.checkInStreak||0)>=30; } },
];

function _calcStreak(p) {
  var hoje = new Date();
  var hojeStr = hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0')+'-'+String(hoje.getDate()).padStart(2,'0');
  var ontem = new Date(hoje); ontem.setDate(ontem.getDate()-1);
  var ontemStr = ontem.getFullYear()+'-'+String(ontem.getMonth()+1).padStart(2,'0')+'-'+String(ontem.getDate()).padStart(2,'0');
  if (!p.checkInStreak) p.checkInStreak = 0;
  if (p.lastCheckInDate === hojeStr) {
    // já registrou hoje — mantém
  } else if (p.lastCheckInDate === ontemStr) {
    p.checkInStreak = (p.checkInStreak||0) + 1;
  } else {
    p.checkInStreak = 1;
  }
  p.lastCheckInDate = hojeStr;
  return p;
}

function _getMoodInsights(p) {
  var notes = p.moodNotes || [];
  if (notes.length < 3) return '';
  var recent = notes.slice(-7).map(function(n){ return n.val||n; });
  var prev   = notes.slice(-14,-7).map(function(n){ return n.val||n; });
  var avgR = recent.reduce(function(a,b){ return a+b; },0)/recent.length;
  var avgP = prev.length ? prev.reduce(function(a,b){ return a+b; },0)/prev.length : null;
  var out = '';
  if (avgP !== null) {
    var diff = avgR - avgP;
    var arrow = diff > 0.3 ? '↑' : diff < -0.3 ? '↓' : '→';
    var cor   = diff > 0.3 ? '#4a7c59' : diff < -0.3 ? '#c0392b' : '#c97d2e';
    out += '<div style="font-size:12px;background:var(--bg);border-radius:8px;padding:6px 11px;display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      + '📊 Média 7 dias: <strong style="color:'+cor+'">'+avgR.toFixed(1)+' '+arrow+' '+(diff>0?'+':'')+diff.toFixed(1)+' vs semana anterior</strong></div>';
  }
  var diasN = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var byDay = [[],[],[],[],[],[],[]];
  notes.slice(-28).forEach(function(n){
    if (!n.date) return;
    var pts = n.date.split('/');
    if (pts.length < 3) return;
    try { var d = new Date(parseInt(pts[2]),parseInt(pts[1])-1,parseInt(pts[0])); byDay[d.getDay()].push(n.val||n); } catch(e){}
  });
  var bestDay = -1, bestAvg = -1;
  byDay.forEach(function(vals,i){
    if (vals.length < 2) return;
    var avg = vals.reduce(function(a,b){ return a+b; },0)/vals.length;
    if (avg > bestAvg) { bestAvg = avg; bestDay = i; }
  });
  if (bestDay >= 0) {
    out += '<div style="font-size:12px;background:var(--bg);border-radius:8px;padding:6px 11px;display:flex;align-items:center;gap:6px;margin-bottom:6px">'
      + '📅 Você tende a se sentir melhor às <strong>'+diasN[bestDay]+'s</strong></div>';
  }
  return out ? '<div style="margin-bottom:10px">'+out+'</div>' : '';
}

function _getTecnicaDia(abordagem) {
  var lista = TECNICAS_DIA[abordagem] || TECNICAS_DIA['default'];
  var dayIdx = Math.floor(Date.now() / 86400000) % lista.length;
  return lista[dayIdx];
}

// ─── EMERGÊNCIA ──────────────────────────────────────────────────────
function pacEmergencia() {
  var wppTerapeuta = '';
  try { wppTerapeuta = (JSON.parse(localStorage.getItem('tf_account')||'{}').whatsapp||'').replace(/\D/g,''); } catch(e){}
  if (wppTerapeuta && !wppTerapeuta.startsWith('55')) wppTerapeuta = '55'+wppTerapeuta;
  var overlay = document.createElement('div');
  overlay.className = 'pac-emergency-overlay';
  overlay.id = 'pac-emergency-overlay';
  overlay.onclick = function(e){ if (e.target===overlay) pacFecharEmergencia(); };
  overlay.innerHTML = '<div class="pac-emergency-panel">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
      + '<div style="font-size:18px;font-weight:700;color:var(--ink)">🌿 Estou aqui com você</div>'
      + '<button onclick="pacFecharEmergencia()" style="background:none;border:none;font-size:26px;cursor:pointer;color:var(--muted);padding:4px;line-height:1">×</button>'
    + '</div>'
    + '<div style="background:var(--bg);border-radius:14px;padding:20px 18px;margin-bottom:16px;text-align:center">'
      + '<div style="font-size:13.5px;font-weight:600;color:var(--ink);margin-bottom:16px">Vamos respirar juntos — box breathing 4×4</div>'
      + '<div class="breath-ring" id="emg-breath-ring"><div class="breath-inner"></div></div>'
      + '<div id="emg-breath-phase" style="font-size:16px;font-weight:600;color:var(--sage);text-align:center;margin-top:14px">Inspire…</div>'
      + '<div id="emg-breath-counter" style="font-size:36px;font-weight:700;color:var(--sage);text-align:center;margin:4px 0 12px">4</div>'
      + '<button id="emg-breath-btn" onclick="pacToggleRespiracao()" style="padding:9px 26px;background:var(--sage);color:#fff;border:none;border-radius:20px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit">▶ Iniciar</button>'
    + '</div>'
    + '<div style="background:#faf8ff;border:1px solid rgba(90,62,138,.12);border-radius:14px;padding:16px 18px;margin-bottom:16px">'
      + '<div style="font-size:13px;font-weight:700;color:var(--purple);margin-bottom:10px">⚓ Técnica 5-4-3-2-1 — aterramento</div>'
      + [['5','👀','coisas que você VÊ agora'],['4','🖐','coisas que pode TOCAR'],['3','👂','sons que OUVE'],['2','👃','cheiros que PERCEBE'],['1','👄','sabor que SENTE']]
        .map(function(r){
          return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;font-size:13px;color:var(--ink-soft)">'
            + '<div style="width:22px;height:22px;border-radius:50%;background:var(--purple);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+r[0]+'</div>'
            + '<span>'+r[1]+' '+r[2]+'</span></div>';
        }).join('')
    + '</div>'
    + (wppTerapeuta
        ? '<a href="https://wa.me/'+wppTerapeuta+'" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;background:#25D366;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;box-sizing:border-box">💬 Chamar minha terapeuta no WhatsApp</a>'
        : '<div style="text-align:center;font-size:13px;color:var(--muted);padding:8px 0">Entre em contato com sua terapeuta se precisar de apoio imediato.</div>')
    + '<button onclick="_revealEmgChat()" style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;background:#fff;border:1.5px solid var(--sage);border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;color:var(--sage)">💬 Conversar no chat</button>'
    + '<div id="pac-chat-block" style="display:none;margin-top:16px"></div>'
    + '</div>';
  document.body.appendChild(overlay);
  setTimeout(function(){ pacToggleRespiracao(); }, 600);
}

var _breathInterval = null, _breathRunning = false;
var _notifTimeoutId = null;

function pacFecharEmergencia() {
  pacPararRespiracao();
  var el = document.getElementById('pac-emergency-overlay');
  if (el) el.remove();
}

function pacToggleRespiracao() {
  if (_breathRunning) {
    pacPararRespiracao();
    var btn = document.getElementById('emg-breath-btn');
    if (btn) { btn.textContent = '▶ Iniciar'; btn.style.background = 'var(--sage)'; }
  } else {
    pacIniciarRespiracao();
    var btn2 = document.getElementById('emg-breath-btn');
    if (btn2) { btn2.textContent = '⏹ Parar'; btn2.style.background = '#777'; }
  }
}

function pacIniciarRespiracao() {
  _breathRunning = true;
  var fases = [
    { label:'Inspire…',  dur:4, cls:'expanding' },
    { label:'Segure…',   dur:4, cls:'expanding' },
    { label:'Expire…',   dur:4, cls:'contracting' },
    { label:'Segure…',   dur:4, cls:'contracting' },
  ];
  var fi = 0, ct = fases[0].dur, _cycles = 0;
  function aplicar() {
    var f = fases[fi];
    var ring = document.getElementById('emg-breath-ring');
    var ph   = document.getElementById('emg-breath-phase');
    var ctr  = document.getElementById('emg-breath-counter');
    if (!ring) { pacPararRespiracao(); return; }
    ring.className = 'breath-ring ' + f.cls;
    if (ph)  ph.textContent  = f.label;
    if (ctr) ctr.textContent = f.dur;
    ct = f.dur;
  }
  aplicar();
  _breathInterval = setInterval(function(){
    ct--;
    var ctr = document.getElementById('emg-breath-counter');
    if (ctr) ctr.textContent = ct;
    if (ct <= 0) {
      fi = (fi+1)%fases.length;
      if (fi === 0) { _cycles++; if (_cycles === 1) _revealEmgChat(); }
      aplicar();
    }
  }, 1000);
}

function pacPararRespiracao() {
  _breathRunning = false;
  if (_breathInterval) { clearInterval(_breathInterval); _breathInterval = null; }
  var ring = document.getElementById('emg-breath-ring');
  if (ring) ring.className = 'breath-ring';
  _revealEmgChat();
}

function _revealEmgChat() {
  var chatWrap = document.getElementById('pac-chat-block');
  if (!chatWrap || chatWrap.style.display !== 'none') return;
  chatWrap.style.display = '';
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData && typeof _pacInitChat === 'function') {
    _pacInitChat(_loggedPatientIdx, _loggedPatientData);
  }
}

// ─── MATERIAIS ───────────────────────────────────────────────────────
function pacMarcarMaterialLido(idx, mid) {
  // _pacGetP resolve o paciente também no login via RPC (fromLS:false → _loggedPatientData).
  // Antes lia só tf_patients e retornava em silêncio no caminho dominante (RPC). F4.3.
  var g = (typeof _pacGetP === 'function') ? _pacGetP(idx) : null; if (!g) return;
  var p = g.p;
  if (!p.readMaterials) p.readMaterials = [];
  var pos = p.readMaterials.indexOf(mid);
  if (pos >= 0) p.readMaterials.splice(pos, 1); else p.readMaterials.push(mid);
  if (g.fromLS) localStorage.setItem('tf_patients', JSON.stringify(g.pacs));
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) _loggedPatientData.readMaterials = p.readMaterials;
  if (typeof patients !== 'undefined' && patients[idx]) patients[idx].readMaterials = p.readMaterials;
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
  renderPatientApp(g.idx, g.pacs);
}

// ─── NOTA PRÉ-SESSÃO ─────────────────────────────────────────────────
function pacSalvarNotaPreSessao(idx) {
  var texto = (document.getElementById('pac-nota-pre-text')?.value || '').trim();
  var g = (typeof _pacGetP === 'function') ? _pacGetP(idx) : null; if (!g) return; // F4.3: cobre login RPC
  var p = g.p;
  p.portalNota = texto;
  if (g.fromLS) localStorage.setItem('tf_patients', JSON.stringify(g.pacs));
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) _loggedPatientData.portalNota = texto;
  if (typeof patients !== 'undefined' && patients[idx]) patients[idx].portalNota = texto;
  var el = document.getElementById('pac-nota-saved');
  if (el) { el.style.display=''; setTimeout(function(){ el.style.display='none'; }, 2500); }
  showToast('Nota salva! Sua terapeuta verá antes da sessão. ✓');
  try { localStorage.setItem('tf_portal_new_data', '1'); } catch(e){}
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
}

// ─── NOTIFICAÇÕES PWA ────────────────────────────────────────────────
function pacAtivarNotificacoes(idx) {
  if (!('Notification' in window)) { alert('Seu navegador não suporta notificações.'); return; }
  var hora = document.getElementById('pac-notif-hora')?.value || '20';
  Notification.requestPermission().then(function(perm){
    var el = document.getElementById('pac-notif-status');
    if (perm !== 'granted') { if (el) el.textContent = 'Permissão negada — verifique as configurações do navegador'; return; }
    var g = (typeof _pacGetP === 'function') ? _pacGetP(idx) : null; if (!g) return; // F4.3: cobre login RPC
    var p = g.p;
    p.portalNotifHour = hora;
    if (g.fromLS) localStorage.setItem('tf_patients', JSON.stringify(g.pacs));
    if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) _loggedPatientData.portalNotifHour = hora;
    if (el) el.textContent = 'Lembrete ativado para as '+hora+'h ✓';
    _agendarNotificacaoPac(hora);
  });
}

function _agendarNotificacaoPac(hora) {
  if (_notifTimeoutId) { clearTimeout(_notifTimeoutId); _notifTimeoutId = null; }
  var agora = new Date();
  var alvo  = new Date(); alvo.setHours(parseInt(hora),0,0,0);
  if (alvo <= agora) alvo.setDate(alvo.getDate()+1);
  _notifTimeoutId = setTimeout(function(){
    _notifTimeoutId = null;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('TheraFlow 🌿', { body:'Como você está se sentindo hoje? Registre seu humor!', tag:'tf-mood-reminder' });
    }
    _agendarNotificacaoPac(hora);
  }, alvo - agora);
}

function _cancelarNotificacaoPac() {
  if (_notifTimeoutId) { clearTimeout(_notifTimeoutId); _notifTimeoutId = null; }
}

function _checkNotifPortal(p) {
  if (!p || !p.portalNotifHour) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  _agendarNotificacaoPac(p.portalNotifHour);
}

// ─── ANAMNESE — TERAPEUTA ─────────────────────────────────────────────

function _popularAnamnese(idx) {
  if (idx == null || idx === undefined) return;
  var p = (typeof patients !== 'undefined') ? patients[idx] : null;
  var ana = (p && p.anamnese) ? p.anamnese : {};

  function _set(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val || '';
  }

  _set('ana-queixa',          ana.queixaPrincipal);
  _set('ana-inicio',          ana.inicioSintomas);
  _set('ana-fatores',         ana.fatoresDesencadeantes);
  _set('ana-tentativas',      ana.tentativasAnteriores);
  _set('ana-terapia-ant',     ana.terapiaAnterior);
  _set('ana-terapia-ant-desc',ana.terapiaAnteriorDesc);
  _set('ana-psiquiatra',      ana.psiquiatra);
  _set('ana-psiquiatra-desc', ana.psiquiatraDesc);
  _set('ana-doencas',         ana.doencasCronicas);
  _set('ana-medicacoes',      ana.medicacoes);
  _set('ana-hist-familiar',   ana.historicoFamiliarSaudeMental);
  _set('ana-estado-civil',    ana.estadoCivil);
  _set('ana-sit-prof',        ana.situacaoProfissional);
  _set('ana-filhos',          ana.filhos);
  _set('ana-suporte',         ana.suporteAfetivo);
  _set('ana-objetivos',       ana.objetivosTerapia);
  _set('ana-obs',             ana.observacoesLivres);

  // Atualiza status bar
  var bar = document.getElementById('anamnese-status-bar');
  var txt = document.getElementById('anamnese-status-text');
  if (bar && txt) {
    if (ana.dataCriacao) {
      var quem = ana.preenchidoPor === 'paciente' ? 'pelo paciente' : ana.preenchidoPor === 'conjunto' ? 'em conjunto' : 'pelo terapeuta';
      var dt = new Date(ana.dataCriacao).toLocaleDateString('pt-BR');
      txt.textContent = '✓ Anamnese preenchida ' + quem + ' em ' + dt;
      bar.style.display = '';
    } else {
      bar.style.display = 'none';
    }
  }
}

function salvarAnamnese(idx) {
  if (idx == null || idx === undefined) return;
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx]; if (!p) return;

  function _get(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : (el.value || '').trim();
  }

  var existing = p.anamnese || {};
  p.anamnese = {
    dataCriacao:                existing.dataCriacao || new Date().toISOString(),
    preenchidoPor:              existing.preenchidoPor === 'paciente' ? 'conjunto' : 'terapeuta',
    queixaPrincipal:            _get('ana-queixa'),
    inicioSintomas:             _get('ana-inicio'),
    fatoresDesencadeantes:      _get('ana-fatores'),
    tentativasAnteriores:       _get('ana-tentativas'),
    terapiaAnterior:            _get('ana-terapia-ant'),
    terapiaAnteriorDesc:        _get('ana-terapia-ant-desc'),
    psiquiatra:                 _get('ana-psiquiatra'),
    psiquiatraDesc:             _get('ana-psiquiatra-desc'),
    doencasCronicas:            _get('ana-doencas'),
    medicacoes:                 _get('ana-medicacoes'),
    historicoFamiliarSaudeMental: _get('ana-hist-familiar'),
    estadoCivil:                _get('ana-estado-civil'),
    situacaoProfissional:       _get('ana-sit-prof'),
    filhos:                     _get('ana-filhos'),
    suporteAfetivo:             _get('ana-suporte'),
    objetivosTerapia:           _get('ana-objetivos'),
    observacoesLivres:          _get('ana-obs'),
  };

  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof patients !== 'undefined' && patients[idx]) patients[idx].anamnese = p.anamnese;

  // Feedback visual
  var msg = document.getElementById('anamnese-save-msg');
  if (msg) { msg.style.display='flex'; setTimeout(function(){ msg.style.display='none'; }, 2500); }

  // Atualiza status bar
  _popularAnamnese(idx);

  // Sync terapeuta
  if (typeof _supaSync_patients === 'function') _supaSync_patients().catch(function(){});
}

function ativarAnamnesePaciente(idx) {
  if (idx == null || idx === undefined) return;
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx]; if (!p) return;
  // Salva a anamnese atual antes de enviar
  salvarAnamnese(idx);
  // Re-ler após salvar
  pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  p = pacs[idx]; if (!p) return;
  p.portalAnamneseAtiva = true;
  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof patients !== 'undefined' && patients[idx]) patients[idx].portalAnamneseAtiva = true;
  if (typeof showToast === 'function') showToast('📤 Anamnese enviada! O paciente verá no portal.');
  // Sync com Supabase para que o portal do paciente receba a flag
  if (typeof _supaSync_patients === 'function') _supaSync_patients().catch(function(){});
}

// ─── ANAMNESE — PACIENTE (portal) ────────────────────────────────────

function pacSalvarAnamnese(idx) {
  var pacs = []; try { pacs = JSON.parse(localStorage.getItem('tf_patients')||'[]'); } catch(e){}
  var p = pacs[idx]; if (!p) return;

  function _gp(id) {
    var el = document.getElementById(id);
    if (!el) return '';
    return el.type === 'checkbox' ? el.checked : (el.value || '').trim();
  }

  var existing = p.anamnese || {};
  // Preserva TODOS os campos do terapeuta; o paciente só substitui o que ele preencheu
  p.anamnese = Object.assign({}, existing, {
    dataCriacao: existing.dataCriacao || new Date().toISOString(),
    // preenchidoPor: 'terapeuta'→'conjunto', vazio/paciente→'paciente'
    preenchidoPor: existing.preenchidoPor === 'terapeuta' ? 'conjunto' : 'paciente',
    queixaPrincipal:              _gp('pac-ana-queixa'),
    inicioSintomas:               _gp('pac-ana-inicio'),
    terapiaAnterior:              _gp('pac-ana-terapia-ant'),
    terapiaAnteriorDesc:          _gp('pac-ana-terapia-ant-desc'),
    psiquiatra:                   _gp('pac-ana-psiquiatra'),
    psiquiatraDesc:               _gp('pac-ana-psiquiatra-desc'),
    doencasCronicas:              _gp('pac-ana-doencas'),
    medicacoes:                   _gp('pac-ana-medicacoes'),
    historicoFamiliarSaudeMental: _gp('pac-ana-hist-familiar'),
    objetivosTerapia:             _gp('pac-ana-objetivos'),
    // Campos só visíveis no terapeuta são preservados via Object.assign acima
  });
  p.portalAnamneseAtiva = false; // Some do portal após envio

  localStorage.setItem('tf_patients', JSON.stringify(pacs));
  if (typeof _loggedPatientData !== 'undefined' && _loggedPatientData) {
    _loggedPatientData.anamnese = p.anamnese;
    _loggedPatientData.portalAnamneseAtiva = false;
  }
  if (typeof patients !== 'undefined' && patients[idx]) {
    patients[idx].anamnese = p.anamnese;
    patients[idx].portalAnamneseAtiva = false;
  }

  // Confirmação visual
  var secao = document.getElementById('pac-anamnese-secao');
  if (secao) {
    secao.innerHTML = '<div style="text-align:center;padding:24px 0">'
      + '<div style="font-size:36px;margin-bottom:10px">✅</div>'
      + '<div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">Formulário enviado!</div>'
      + '<div style="font-size:13px;color:var(--muted)">Sua terapeuta receberá as informações antes da próxima sessão.</div>'
      + '</div>';
  }
  if (typeof _supaPatientSync === 'function') _supaPatientSync().catch(function(){});
}
