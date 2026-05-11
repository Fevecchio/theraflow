// 05-onboarding.js — Fluxo de onboarding, validação de telas, seleção de abordagem, DOMContentLoaded

/* ── ONBOARDING JS ── */
/* ONBOARDING JS */

let currentScreen = 1;
let selectedAbordagem = null;
const completed = { 1: false, 2: false };
const savedData = {};

// Salva o HTML original das telas para poder restaurar se o usuário voltar após confirmação
let screensHTML = '';



const PILL_LABELS = { 1: 'Seu perfil', 2: 'Abordagem', 3: 'Pronto' };

function updateProgress() {
  [1,2,3].forEach(i => {
    const pill = document.getElementById('pill-' + i);
    pill.classList.remove('active', 'done', 'pending');
    if (i < currentScreen) {
      pill.classList.add('done');
      pill.querySelector('.pill-num').textContent = '✓';
      pill.style.pointerEvents = 'auto';
    } else if (i === currentScreen) {
      pill.classList.add('active');
      pill.querySelector('.pill-num').textContent = i;
      pill.style.pointerEvents = 'none';
    } else {
      pill.classList.add('pending');
      pill.querySelector('.pill-num').textContent = i;
      pill.style.pointerEvents = 'none';
    }
  });

  // Footer
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');
  const footer  = document.getElementById('ob-footer');
  const footerLeft = document.getElementById('footer-left');

  footer.style.display = 'flex';
  footerLeft.style.display = currentScreen === 1 ? '' : 'none';
  if (currentScreen === 3) {
    btnBack.style.display = '';
    btnNext.style.display = 'none';
  } else {
    btnBack.style.display = currentScreen > 1 ? '' : 'none';
    btnNext.style.display = '';
  }
}

/* Navega direto para um passo já concluído (pills clicáveis) */
function jumpTo(target) {
  if (target >= currentScreen) return;

  // Se o goToPlatform já substituiu o innerHTML, restaura as telas antes de navegar
  const screenExists = document.getElementById('screen-' + currentScreen);
  if (!screenExists) {
    restoreScreens();
  } else {
    screenExists.classList.remove('active');
  }

  currentScreen = target;
  document.getElementById('screen-' + currentScreen).classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restoreScreens() {
  document.querySelector('.ob-card-body').innerHTML = screensHTML;

  // Repopula campos
  if (savedData.nome)  document.getElementById('nome').value  = savedData.nome;
  if (savedData.crp)   document.getElementById('crp').value   = savedData.crp;
  if (savedData.email) document.getElementById('email').value = savedData.email;

  // Reseleciona abordagem primária
  if (savedData.abordagem) {
    const cards = document.querySelectorAll('.abordagem-card');
    let found = false;
    cards.forEach(card => {
      if (card.querySelector('.ab-name').textContent === savedData.abordagem) {
        card.classList.add('selected'); found = true;
      }
    });
    if (!found) {
      document.getElementById('outra-card').classList.add('selected');
      document.getElementById('outra-input').value = savedData.abordagem;
    }
    // Restaura secundárias e reconstrói chips
    secundarias = savedData.secundarias ? [...savedData.secundarias] : [];
    buildSecundarias();
    document.getElementById('secundarias-wrap').style.display = '';
  }

  // Rebinda listeners
  ['nome','crp','email','senha'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      this.classList.remove('error');
      const err = document.getElementById('err-' + id);
      if (err) err.style.display = 'none';
    });
  });
}

function goNext() {
  if (currentScreen === 1) {
    if (!validateScreen1()) return;
    completed[1] = true;
    const nome = document.getElementById('nome').value.trim().split(' ')[0];
    document.getElementById('nome-display').textContent = nome;
  }
  if (currentScreen === 2) {
    if (!validateScreen2()) return;
    completed[2] = true;
  }

  document.getElementById('screen-' + currentScreen).classList.remove('active');
  currentScreen++;
  document.getElementById('screen-' + currentScreen).classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  // Se as telas foram substituídas por goToPlatform(), recarrega o onboarding na tela 2
  if (!document.getElementById('screen-' + currentScreen)) {
    location.reload();
    return;
  }
  document.getElementById('screen-' + currentScreen).classList.remove('active');
  currentScreen--;
  document.getElementById('screen-' + currentScreen).classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── VALIDAÇÃO TELA 1 ── */
function formatarCRP(input) {
  // Remove tudo que não for número ou barra
  let v = input.value.replace(/[^\d\/]/g, '');
  // Insere a barra automaticamente após 2 dígitos
  if (v.length === 2 && !v.includes('/') && input.value.length > input._prev?.length) {
    v = v + '/';
  }
  input._prev = v;
  input.value = v;
}

function toggleSenhaOb() {
  const inp = document.getElementById('senha');
  const btn = document.getElementById('btn-toggle-ob-pw');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function validateScreen1() {
  let ok = true;

  const nome = document.getElementById('nome');
  const errNome = document.getElementById('err-nome');
  if (!nome.value.trim()) {
    nome.classList.add('error'); errNome.style.display = 'block'; ok = false;
  } else { nome.classList.remove('error'); errNome.style.display = 'none'; }

  const crp = document.getElementById('crp');
  const errCrp = document.getElementById('err-crp');
  const crpOk = /^\d{2}\/\d{4,6}$/.test(crp.value.trim());
  if (!crpOk) {
    crp.classList.add('error');
    errCrp.textContent = crp.value.trim() ? 'Formato inválido — use XX/XXXXXX (ex: 06/123456).' : 'Informe seu CRP.';
    errCrp.style.display = 'block'; ok = false;
  } else { crp.classList.remove('error'); errCrp.style.display = 'none'; }

  const email = document.getElementById('email');
  const errEmail = document.getElementById('err-email');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  if (!emailOk) {
    email.classList.add('error'); errEmail.style.display = 'block'; ok = false;
  } else { email.classList.remove('error'); errEmail.style.display = 'none'; }

  const senha = document.getElementById('senha');
  const errSenha = document.getElementById('err-senha');
  if (!senha || senha.value.length < 8) {
    if (senha) senha.classList.add('error');
    if (errSenha) errSenha.style.display = 'block';
    ok = false;
  } else { senha.classList.remove('error'); if (errSenha) errSenha.style.display = 'none'; }

  return ok;
}

/* ── VALIDAÇÃO TELA 2 ── */
function validateScreen2() {
  const errAb = document.getElementById('err-abordagem');
  if (!selectedAbordagem) {
    errAb.style.display = 'block'; return false;
  }
  errAb.style.display = 'none';
  return true;
}

/* ── SELEÇÃO DE ABORDAGEM ── */
const ABORDAGENS_LIST = [
  { val: 'TCC',        icon: '🧩' },
  { val: 'Psicanálise',icon: '🛋️' },
  { val: 'Humanista',  icon: '🌱' },
  { val: 'Sistêmica',  icon: '🔗' },
  { val: 'ACT',        icon: '🎯' },
  { val: 'EMDR',       icon: '👁️' },
];

let secundarias = []; // array de strings

function selectAbordagem(el, val) {
  document.querySelectorAll('.abordagem-card, .abordagem-outra').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  if (val === '__outra__') {
    const input = document.getElementById('outra-input');
    selectedAbordagem = input.value.trim() || '__outra__';
    setTimeout(() => input.focus(), 50);
  } else {
    selectedAbordagem = val;
    document.getElementById('err-abordagem').style.display = 'none';
  }

  // Remove a primária das secundárias se estava lá
  secundarias = secundarias.filter(s => s !== selectedAbordagem);

  // Popula e revela o painel de secundárias
  buildSecundarias();
  document.getElementById('secundarias-wrap').style.display = '';
}

function buildSecundarias() {
  const grid = document.getElementById('secundarias-grid');
  if (!grid) return;
  const primaria = selectedAbordagem && selectedAbordagem !== '__outra__'
    ? selectedAbordagem
    : (document.getElementById('outra-input')?.value.trim() || '');

  grid.innerHTML = '';
  ABORDAGENS_LIST.forEach(ab => {
    if (ab.val === primaria) return; // oculta a primária
    const selected = secundarias.includes(ab.val);
    const chip = document.createElement('div');
    chip.className = 'sec-chip' + (selected ? ' selected' : '');
    chip.innerHTML = `<span>${ab.icon} ${ab.val}</span><span class="chip-check">✓</span>`;
    chip.onclick = () => toggleSecundaria(ab.val, chip);
    grid.appendChild(chip);
  });
}

function toggleSecundaria(val, el) {
  if (secundarias.includes(val)) {
    secundarias = secundarias.filter(s => s !== val);
    el.classList.remove('selected');
  } else {
    secundarias.push(val);
    el.classList.add('selected');
  }
}

function onSecOutraInput(input) {
  // Chip livre para secundária digitada — adiciona ao pressionar Enter ou vírgula
  const raw = input.value;
  if (raw.endsWith(',') || raw.endsWith('\n')) {
    const val = raw.replace(/[,\n]/g, '').trim();
    if (val && !secundarias.includes(val) && val !== selectedAbordagem) {
      secundarias.push(val);
      // Adiciona chip visual
      const grid = document.getElementById('secundarias-grid');
      const chip = document.createElement('div');
      chip.className = 'sec-chip selected';
      chip.innerHTML = `<span>✏️ ${val}</span><span class="chip-check">✓</span>`;
      chip.onclick = () => {
        secundarias = secundarias.filter(s => s !== val);
        chip.remove();
      };
      grid.appendChild(chip);
    }
    input.value = '';
  }
}

function onOutraInput(input) {
  if (input.value.trim()) {
    selectedAbordagem = input.value.trim();
    document.getElementById('err-abordagem').style.display = 'none';
    buildSecundarias();
    document.getElementById('secundarias-wrap').style.display = '';
  } else {
    selectedAbordagem = '__outra__';
  }
}

/* ── AÇÃO FINAL ── */
function goToPlatform(cadastrarPaciente) {
  const nome = document.getElementById('nome').value.trim().split(' ')[0];

  // Salva tudo antes de substituir o DOM
  savedData.nome          = document.getElementById('nome').value.trim();
  savedData.crp           = document.getElementById('crp').value.trim();
  savedData.email         = document.getElementById('email').value.trim();
  savedData.senha         = document.getElementById('senha')?.value || '';
  savedData.abordagem     = selectedAbordagem !== '__outra__' ? selectedAbordagem : document.getElementById('outra-input').value.trim();
  savedData.secundarias   = [...secundarias];

  const body = document.querySelector('.ob-card-body');

  body.innerHTML = `
    <div style="text-align:center;padding:12px 0 24px">
      <div style="width:64px;height:64px;border-radius:18px;background:var(--sage-light);
        display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 20px">✅</div>
      <div style="font-family:'Instrument Serif',serif;font-size:28px;margin-bottom:8px">
        Cadastro concluído, ${nome}!
      </div>
      <div style="font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:32px;max-width:380px;margin-left:auto;margin-right:auto">
        Seu perfil foi configurado. Agora abra o TheraFlow para começar.
      </div>

      <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:20px 24px;text-align:left;margin-bottom:20px">
        <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:14px">
          Seus dados salvos
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span style="color:var(--muted)">Nome</span>
            <span style="font-weight:500">${document.getElementById('nome').value.trim()}</span>
          </div>
          <div style="height:1px;background:var(--border)"></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span style="color:var(--muted)">CRP</span>
            <span style="font-weight:500">${document.getElementById('crp').value.trim()}</span>
          </div>
          <div style="height:1px;background:var(--border)"></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span style="color:var(--muted)">Abordagem</span>
            <span style="font-weight:500">${savedData.abordagem || '—'}</span>
          </div>
          <div style="height:1px;background:var(--border)"></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;align-items:flex-start;gap:16px">
            <span style="color:var(--muted);flex-shrink:0">Secundárias</span>
            <span style="font-weight:500;text-align:right">${savedData.secundarias && savedData.secundarias.length ? savedData.secundarias.join(', ') : '—'}</span>
          </div>
          <div style="height:1px;background:var(--border)"></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span style="color:var(--muted)">Trial</span>
            <span style="font-weight:500;color:var(--sage)">20 sessões gratuitas</span>
          </div>
        </div>
      </div>

      ${cadastrarPaciente ? `
      <div style="background:var(--amber-light);border:1px solid rgba(201,125,46,.2);border-radius:12px;
        padding:14px 18px;text-align:left;margin-bottom:20px;display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:18px">💡</span>
        <div style="font-size:13px;color:var(--ink-soft);line-height:1.6">
          <strong>Lembre-se:</strong> ao abrir o TheraFlow, clique em <strong>"+ Novo Paciente"</strong> na tela de Pacientes para cadastrar seu primeiro paciente.
        </div>
      </div>` : ''}

      <button class="btn btn-primary btn-full btn-lg" onclick="abrirApp()">
        Abrir o TheraFlow →
      </button>
    </div>`;

  document.getElementById('ob-footer').style.display = 'flex';
  document.getElementById('btn-back').style.display = '';
  document.getElementById('btn-next').style.display = 'none';
  document.getElementById('footer-left').style.display = 'none';
}



// Init — executa após o DOM estar pronto
document.addEventListener('DOMContentLoaded', function() {
  // Gera dots do trial
  (function() {
    var wrap = document.getElementById('trial-dots');
    for (let i = 0; i < 20; i++) {
      const d = document.createElement('div');
      d.className = 'trial-dot' + (i === 0 ? ' used' : '');
      wrap.appendChild(d);
    }
  })();

  // Salva HTML das telas
  var cardBody = document.querySelector('.ob-card-body');
  if (cardBody) screensHTML = cardBody.innerHTML;
  updateProgress();

  // Remove erro ao digitar
  ['nome','crp','email','senha'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function() {
      this.classList.remove('error');
      var err = document.getElementById('err-' + id);
      if (err) err.style.display = 'none';
    });
  });

  // Modo demo: ?demo=1 entra no app sem cadastro, com dados fictícios
  if (new URLSearchParams(window.location.search).has('demo')) {
    history.replaceState({}, '', window.location.pathname);
    window._tfDemo = true;
    _tfPlanPro = true;
    _proceedToApp({ nome:'Dra. Ana Meireles', crp:'06/123456', email:'demo@theraflow.com.br', abordagem:'TCC', abordagemKey:'tcc', secundarias:['ACT','Humanista'], plano:'pro', sessoes_usadas:5 });
    setTimeout(function() {
      var b = document.getElementById('tf-demo-banner');
      if (b) { b.style.display='flex'; document.body.style.paddingTop='40px'; var s=document.getElementById('main-sidebar'); if(s) s.style.top='40px'; }
    }, 150);
    document.querySelectorAll('.modal-overlay').forEach(function(m) {
      m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
    });
    return;
  }

  // Se já existe conta salva → vai direto para o login
  try {
    var account = JSON.parse(localStorage.getItem('tf_account') || 'null');
    if (account && account.email) {
      document.getElementById('tf-main-onboarding').style.display = 'none';
      document.getElementById('tf-login-screen').style.display = 'block';
      var loginEmail = document.getElementById('login-email');
      if (loginEmail) loginEmail.value = account.email;
      setTimeout(function() {
        document.getElementById('login-senha')?.focus();
      }, 80);
    }
  } catch(e) {}

  // Renovação automática de token — sincroniza plano se sessão mudar
  supa.auth.onAuthStateChange(function(event, session) {
    if (event === 'TOKEN_REFRESHED' && session) {
      _supaLoadUserData(session.user.id).catch(function() {});
    }
    if (event === 'SIGNED_OUT') {
      // Limpa estado Pro se sessão expirar sem renovação
      _tfPlanPro = false;
    }
  });

  // Verificar sessão Supabase ativa — se válida, restaura dados e entra sem re-digitar senha
  supa.auth.getSession().then(async function({ data: { session } }) {
    if (!session || !session.user) return;
    var acc = null;
    try { acc = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
    if (!acc) return; // Sem conta local configurada, aguarda login manual
    // Já tem sessão — restaura dados frescos do Supabase e entra no app
    try { await _supaLoadUserData(session.user.id); } catch(e) { console.warn('[Supa] Auto-restore:', e.message); }
    try { acc = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch(e) {}
    if (acc) _proceedToApp(acc);
  }).catch(function() {});

  // Click fora do modal fecha
  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('open'); });
  });

  // Captura parâmetro de referral e salva em localStorage
  (function() {
    const ref = new URLSearchParams(window.location.search).get('ref');
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (ref && uuidRe.test(ref)) { localStorage.setItem('tf_referral', ref); history.replaceState({}, '', window.location.pathname); }
  })();

  // Retorno do Stripe Checkout — ativa Pro apenas se há sessão Supabase válida
  if (window.location.search.includes('checkout=success')) {
    history.replaceState({}, '', window.location.pathname);
    supa.auth.getUser().then(function({ data: { user } }) {
      if (!user) return; // sem sessão autenticada — ignora param
      _tfPlanPro = true;
      tfTrack('checkout_completed', { plano: 'pro' });
      setTimeout(function() { showToast('Assinatura ativa! Bem-vindo ao TheraFlow Pro 🎉', 6000); }, 1500);
    }).catch(function() {});
  }
});
