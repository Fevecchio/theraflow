// 18-main.js — Inicialização do app: abrirApp, _lancarApp, aplicarDadosNoApp

function abrirApp() {
  if (typeof savedData !== 'undefined') {
    tfUserData.nome        = savedData.nome        || '';
    tfUserData.crp         = savedData.crp         || '';
    tfUserData.email       = savedData.email       || '';
    tfUserData.abordagem   = savedData.abordagem   || '';
    tfUserData.secundarias = savedData.secundarias || [];
    // Abordagem escrita à mão (opção "Outra") ganha a chave 'outra' — a calibragem
    // mostra o texto honesto genérico em vez de fingir que a pessoa é de TCC.
    tfUserData.abordagemKey = ABORDAGEM_KEY_MAP[tfUserData.abordagem] || (tfUserData.abordagem ? 'outra' : 'tcc');
  }

  // Persiste conta no localStorage para login futuro
  try {
    localStorage.setItem('tf_account', JSON.stringify({
      nome:        tfUserData.nome,
      crp:         tfUserData.crp,
      email:       tfUserData.email,
      abordagem:   tfUserData.abordagem,
      secundarias: tfUserData.secundarias,
      abordagemKey: tfUserData.abordagemKey,
      senha:       savedData.senha ? tfHashSenha(savedData.senha) : ''
    }));
  } catch(e) { console.warn('[TF] Erro ao salvar conta no localStorage:', e.message); }

  // Cadastro real no Supabase Auth (silencioso — não bloqueia o app)
  if (savedData.email && savedData.senha) {
    supa.auth.signUp({
      email: savedData.email,
      password: savedData.senha,
      options: { data: { nome: tfUserData.nome, crp: tfUserData.crp, abordagem: tfUserData.abordagem } }
    }).then(({ data, error }) => {
      if (error && !error.message.includes('already registered')) {
        console.warn('[Supa] signup:', error.message);
      }
      // Atualiza perfil no banco se criou com sucesso
      if (data?.user) {
        tfTrack('conta_criada', { abordagem: tfUserData.abordagem || '' });
        const refId = localStorage.getItem('tf_referral');
        supa.from('users').update({
          nome: tfUserData.nome,
          crp: tfUserData.crp || null,
          abordagem: tfUserData.abordagem || null,
          ...(refId ? { referred_by: refId } : {}),
        }).eq('id', data.user.id).then(() => {
          if (refId) localStorage.removeItem('tf_referral');
          // Secundárias do onboarding sobem já no cadastro (users.settings)
          if (typeof _supaSync_settings === 'function') _supaSync_settings();
        });
      }
    }).catch(() => {});
  }

  // Verifica aceite dos termos (uma vez por versão)
  if (!termsAlreadyAccepted()) {
    showTermsModal(function() { _lancarApp(); });
    return;
  }
  _lancarApp();
}

function _lancarApp() {
  document.getElementById('tf-onboarding-layer').style.display = 'none';
  document.getElementById('tf-app-layer').style.display        = 'flex';

  // Migração 15/07: quem salvou o template PADRÃO antigo de lembrete (sem a linha
  // do portal, com emojis que viravam "�") volta pro padrão novo — só quando o
  // texto é o default intocado; personalização de verdade nunca é sobrescrita.
  try {
    var _accMig = JSON.parse(localStorage.getItem('tf_account') || '{}');
    if (_accMig.wpp_template) {
      var _norm = _accMig.wpp_template.replace(/[\u{1F300}-\u{1FAFF}�]/gu, '').replace(/\s+/g, ' ').trim();
      var _oldDefault = 'Olá [Nome]! Lembrete da sua sessão de psicoterapia [dia] às [hora]. Qualquer imprevisto, é só me avisar por aqui. Até logo! — [Terapeuta]';
      if (_norm === _oldDefault) {
        delete _accMig.wpp_template; // campo vazio = usa o novo padrão (com a linha do portal)
        localStorage.setItem('tf_account', JSON.stringify(_accMig));
      }
    }
  } catch (e) {}

  carregarPacientes();
  carregarAppointments();
  charges = carregarCharges();
  // Planos mensais: gera a cobrança do mês corrente no boot (sem cron) — o
  // gancho pós-login (js/00) cobre o restore; este cobre o app já logado.
  try { if (typeof _gerarCobrancasDosPlanos === 'function') _gerarCobrancasDosPlanos(); } catch(e) {}
  aplicarDadosNoApp();
  checkFirstPatientBanner();
  atualizarTrialUI();
  // Restaura última página visitada (exceto sessao ao vivo)
  var lastPage = 'dashboard';
  try { lastPage = localStorage.getItem('tf_current_page') || 'dashboard'; } catch(e) {}
  if (lastPage === 'sessao') lastPage = 'dashboard';
  navigate(lastPage);
}

function abrirReferral() {
  var existing = document.getElementById('modal-referral');
  if (existing) existing.remove();
  var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
  var refId = acc.supa_id || '';
  // Domínio oficial (15/07: o link ainda saía theraflow-one.vercel.app na mensagem)
  var refLink = refId ? ('https://teravia.com.br/app?ref=' + refId) : 'https://teravia.com.br/app';
  var refCount = acc.referral_count || 0;
  var refRewarded = acc.referral_rewarded || false;
  var msg = 'Olá! Estou usando o Teravia para gestão do meu consultório — agenda, prontuários e IA calibrada pela minha abordagem. É muito bom! Você pode testar com 20 sessões gratuitas: ' + refLink;
  var overlay = document.createElement('div');
  overlay.id = 'modal-referral';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:480px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.25)">
      <div style="font-size:18px;font-weight:700;color:var(--ink);margin-bottom:6px">🎁 Indicar um colega</div>
      <div style="background:#f0f7f0;border-radius:10px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">🎉</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--ink)">Ganhe 1 mês grátis</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.5">Quando seu indicado assinar o Pro, você recebe 1 mês grátis automaticamente${refRewarded ? ' <span style="color:#5a8a6a;font-weight:600">(já resgatado ✓)</span>' : ''}</div>
        </div>
      </div>
      ${refCount > 0 ? `<div style="font-size:12px;color:var(--sage);font-weight:600;margin-bottom:12px">✓ ${refCount} indicação${refCount > 1 ? 'ões' : ''} realizada${refCount > 1 ? 's' : ''}</div>` : ''}
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">SEU LINK PERSONALIZADO</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="referral-link-input" value="${escHTML(refLink)}" readonly style="flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--ink-soft);background:var(--bg);font-family:inherit">
          <button onclick="copiarLinkReferral()" style="padding:9px 14px;background:var(--sage);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Copiar</button>
        </div>
      </div>
      <div style="background:var(--sage-light);border-radius:10px;padding:14px 16px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--sage);margin-bottom:8px">MENSAGEM PRONTA</div>
        <div id="referral-msg-text" style="font-size:13px;color:var(--ink-soft);line-height:1.6">${escHTML(msg)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="copiarReferral()" style="width:100%;padding:11px;background:var(--sage);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${_tfIcon('clip')} Copiar mensagem</button>
        <div style="display:flex;gap:8px">
          <button onclick="compartilharWhatsApp()" style="flex:1;padding:10px;background:var(--white);color:var(--ink-soft);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">${_tfIcon('wpp')} WhatsApp</button>
          <button onclick="compartilharEmail()" style="flex:1;padding:10px;background:var(--white);color:var(--ink-soft);border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✉ Email</button>
        </div>
        <button onclick="document.getElementById('modal-referral').remove()" style="width:100%;padding:10px;border:1px solid var(--border);background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;color:var(--muted)">Fechar</button>
      </div>
    </div>`;
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function copiarLinkReferral() {
  var input = document.getElementById('referral-link-input');
  if (!input) return;
  navigator.clipboard?.writeText(input.value).catch(() => { input.select(); document.execCommand('copy'); });
  showToast('✓ Link copiado!');
}

function copiarReferral() {
  var msg = document.getElementById('referral-msg-text')?.textContent || '';
  navigator.clipboard?.writeText(msg).then(function(){ showToast('✓ Mensagem copiada!'); }).catch(function(){
    // Fallback para browsers antigos
    var ta = document.createElement('textarea');
    ta.value = msg; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    showToast('✓ Mensagem copiada!');
  });
}

function compartilharWhatsApp() {
  var msg = document.getElementById('referral-msg-text')?.textContent || '';
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  tfTrack('referral_shared', { channel: 'whatsapp' });
}

function compartilharEmail() {
  var msg = document.getElementById('referral-msg-text')?.textContent || '';
  window.location.href = 'mailto:?subject=Teravia — Gestão clínica para psicólogos&body=' + encodeURIComponent(msg);
  tfTrack('referral_shared', { channel: 'email' });
}

function _hideDemoBanner() {
  var b = document.getElementById('tf-demo-banner');
  if (b) b.style.display = 'none';
  document.body.style.paddingTop = '';
  var s = document.getElementById('main-sidebar');
  if (s) s.style.top = '';
}


// ── Aplicar dados no app ──
function aplicarDadosNoApp() {
  // Carregar dark mode
  var isDark = localStorage.getItem('tf_dark_mode') === '1';
  if (isDark) document.documentElement.setAttribute('data-theme','dark');
  var dmToggle = document.getElementById('toggle-dark-mode');
  if (dmToggle) dmToggle.checked = isDark;

  var nome        = tfUserData.nome        || '';
  var crp         = tfUserData.crp         || '';
  var email       = tfUserData.email       || '';
  var abordagem   = tfUserData.abordagem   || 'TCC';
  var secundarias = Array.isArray(tfUserData.secundarias) ? tfUserData.secundarias : [];
  var abordKey    = tfUserData.abordagemKey || 'tcc';

  var parts     = nome.trim().split(' ').filter(function(w){ return w.length > 0; });
  var firstName = parts[0] || nome;
  var initials  = parts.map(function(w){ return w[0].toUpperCase(); }).slice(0,2).join('');
  var secsStr   = secundarias.join(', ');
  var abordFull = abordagem + (secsStr ? ' + ' + secsStr : '');

  var h    = new Date().getHours();
  var saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  var app = document.getElementById('tf-app-layer');
  if (!app) return;

  // ── 1. SIDEBAR ──
  app.querySelectorAll('.therapist-name').forEach(function(el){ el.textContent = nome; });
  app.querySelectorAll('.therapist-role').forEach(function(el){
    el.textContent = 'Psicólogo(a) · CRP ' + crp;
  });
  app.querySelectorAll('.avatar').forEach(function(el){ el.textContent = initials; });

  // ── 2. DASHBOARD ──
  var dashTitle = document.getElementById('dash-greeting');
  if (dashTitle) dashTitle.textContent = saud + ', ' + firstName;

  // ── 3. PERFIL — hero ──
  var heroNome   = document.getElementById('perfil-hero-nome');
  var heroAvatar = document.getElementById('perfil-hero-avatar');
  var heroCrp    = document.getElementById('perfil-hero-crp');
  if (heroNome)   heroNome.textContent   = nome;
  if (heroAvatar) heroAvatar.textContent = initials;
  if (heroCrp)    heroCrp.textContent    = '🪪 CRP ' + crp; // sem "— ativo": status nunca é verificado (B4)

  // ── 4. PERFIL — campos do formulário ──
  var fNome = document.getElementById('perfil-nome');
  var fCrp  = document.getElementById('perfil-crp');
  if (fNome) fNome.value = nome;
  if (fCrp)  fCrp.value  = crp;
  var fEmailSup = document.getElementById('perfil-email-suporte');
  if (fEmailSup) {
    try { var _accE = JSON.parse(localStorage.getItem('tf_account')||'{}'); fEmailSup.value = _accE.email_suporte || ''; } catch(e){}
  }
  var fWpp = document.getElementById('perfil-whatsapp');
  if (fWpp) {
    try { var _accW = JSON.parse(localStorage.getItem('tf_account')||'{}'); fWpp.value = _accW.whatsapp || ''; } catch(e){}
  }
  var fWppTpl = document.getElementById('perfil-wpp-template');
  if (fWppTpl) {
    try { var _accT = JSON.parse(localStorage.getItem('tf_account')||'{}'); fWppTpl.value = _accT.wpp_template || ''; } catch(e){}
  }
  var fLembreteQuando = document.getElementById('perfil-lembrete-quando');
  if (fLembreteQuando) {
    try { var _accLq = JSON.parse(localStorage.getItem('tf_account')||'{}'); if (_accLq.lembrete_quando) fLembreteQuando.value = _accLq.lembrete_quando; } catch(e){}
  }
  var fPix = document.getElementById('perfil-pix-key');
  if (fPix) {
    try { var _accPix = JSON.parse(localStorage.getItem('tf_account')||'{}'); fPix.value = _accPix.pix_key || ''; } catch(e){}
  }

  // Pré-seleciona abordagem no perfil
  profileAbordagem = abordKey;
  document.querySelectorAll('#abordagem-list .abordagem-card').forEach(function(card) {
    var nameEl = card.querySelector('.abordagem-name');
    if (!nameEl) return;
    var cardAbord = nameEl.textContent.split('—')[0].trim().split('/')[0].trim().toUpperCase();
    var userAbord = abordagem.toUpperCase();
    card.classList.toggle('selected',
      cardAbord === userAbord ||
      (abordKey === 'tcc'        && cardAbord === 'TCC') ||
      (abordKey === 'psicanalise' && cardAbord === 'PSICANÁLISE') ||
      (abordKey === 'humanista'   && cardAbord === 'HUMANISTA') ||
      (abordKey === 'sistemica'   && cardAbord === 'SISTÊMICA') ||
      (abordKey === 'act'         && (cardAbord === 'ACT' || cardAbord === 'ACT / DBT')) ||
      (abordKey === 'junguiana'   && cardAbord === 'JUNGUIANA') ||
      (abordKey === 'gestalt'     && cardAbord === 'GESTALT-TERAPIA') ||
      (abordKey === 'emdr'        && cardAbord === 'EMDR') ||
      (abordKey === 'outra'       && card.id === 'perfil-abordagem-outra-card')
    );
  });
  // Abordagem escrita à mão: o campo do card "Outra" mostra o texto real dela.
  var _outraInput = document.getElementById('perfil-abordagem-outra-input');
  if (_outraInput && abordKey === 'outra') _outraInput.value = abordagem;

  // ── 5. CALIBRAÇÃO DA IA (perfil) ──
  var cal = (typeof abordagemCalibration !== 'undefined') ? abordagemCalibration[abordKey] : null;
  if (cal) {
    var cNotas = document.getElementById('calib-notas');
    var cBrief = document.getElementById('calib-briefing');
    var cSup   = document.getElementById('calib-supervisao');
    var cPlano = document.getElementById('calib-plano');
    if (cNotas) cNotas.textContent = cal.notas;
    if (cBrief) cBrief.textContent = cal.briefing;
    if (cSup)   cSup.textContent   = cal.supervisao;
    if (cPlano) cPlano.textContent = cal.plano;
  }
  // Subtítulo da calibração: mostra abordagem + secundárias
  app.querySelectorAll('.ia-calibration-value').forEach(function(el, i){
    if (i === 0 && cal) el.textContent = cal.notas;
  });

  // ── 6. FINANCEIRO — recibo ──
  var receipt = document.getElementById('receipt-profissional');
  if (receipt) receipt.textContent = nome + ' · CRP ' + crp;

  // ── 7. PORTAL DO PACIENTE — labels "X verá na sessão" ──
  app.querySelectorAll('.therapist-label-first').forEach(function(el){
    el.textContent = '✓ ' + firstName + ' verá na sessão';
  });

  // ── 8. PERFIL — avatares grandes ──
  app.querySelectorAll('.perfil-avatar-lg').forEach(function(el){ el.textContent = initials; });
}
