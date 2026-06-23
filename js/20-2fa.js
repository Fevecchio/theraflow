// 20-2fa.js — Autenticação em dois fatores (TOTP) via Supabase Auth (MFA / AAL2)
// Sem bibliotecas externas: o Supabase devolve o QR code (SVG) pronto no enroll.

var _tfaEnrollFactorId = null;
var _tfaPendingUid = null;

/* Há sessão Supabase ativa? MFA exige login online (não funciona em demo/offline). */
async function _tfaHasSession() {
  try {
    const { data } = await supa.auth.getSession();
    return !!(data && data.session);
  } catch (e) { return false; }
}

/* Retorna o fator TOTP já verificado, se houver. */
async function _tfaVerifiedFactor() {
  try {
    const { data, error } = await supa.auth.mfa.listFactors();
    if (error || !data) return null;
    const all = data.all || data.totp || [];
    return all.find(function (f) { return f.factor_type === 'totp' && f.status === 'verified'; }) || null;
  } catch (e) { return null; }
}

/* ── GATE PÓS-LOGIN ──
 * Chamado após signInWithPassword OK. Se a conta tem 2FA ativo, exige o código
 * antes de entrar; caso contrário, conclui o login normalmente. */
async function _postAuthGate(user) {
  try {
    const { data } = await supa.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.nextLevel === 'aal2' && data.currentLevel === 'aal1') {
      _showMfaChallenge(user.id);
      return;
    }
  } catch (e) { /* MFA indisponível → segue direto */ }
  _finishLogin(user.id);
}

/* Conclui o login: carrega dados do banco e entra no app. */
async function _finishLogin(uid) {
  await _supaLoadUserData(uid);
  let account = null;
  try { account = JSON.parse(localStorage.getItem('tf_account') || 'null'); } catch (e) {}
  _proceedToApp(account);
}

/* ── DESAFIO NO LOGIN ── */
function _showMfaChallenge(uid) {
  _tfaPendingUid = uid;
  const fields = document.getElementById('login-form-fields');
  const chal = document.getElementById('tfa-challenge');
  if (fields) fields.style.display = 'none';
  if (chal) chal.style.display = 'block';
  const err = document.getElementById('tfa-login-error');
  if (err) err.style.display = 'none';
  const inp = document.getElementById('tfa-login-code');
  if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 100); }
}

function _cancelMfaChallenge() {
  // A sessão está em aal1 (sem 2FA confirmado) — encerra para não deixar acesso parcial.
  supa.auth.signOut().catch(function () {});
  _tfaPendingUid = null;
  const fields = document.getElementById('login-form-fields');
  const chal = document.getElementById('tfa-challenge');
  if (chal) chal.style.display = 'none';
  if (fields) fields.style.display = 'block';
}

async function _verifyMfaLogin() {
  const inp = document.getElementById('tfa-login-code');
  const err = document.getElementById('tfa-login-error');
  const btn = document.getElementById('btn-tfa-verify');
  const code = (inp && inp.value || '').replace(/\D/g, '').trim();
  if (code.length !== 6) {
    if (err) { err.textContent = '⚠ Digite o código de 6 dígitos.'; err.style.display = 'block'; }
    return;
  }
  const factor = await _tfaVerifiedFactor();
  if (!factor) { _finishLogin(_tfaPendingUid); return; } // sem fator → não bloqueia o acesso
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
  if (err) err.style.display = 'none';
  try {
    const { error } = await supa.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code });
    if (error) {
      if (err) { err.textContent = '⚠ Código inválido. Tente novamente.'; err.style.display = 'block'; }
      if (inp) { inp.value = ''; inp.focus(); }
      return;
    }
    tfTrack('2fa_login_verified');
    const uid = _tfaPendingUid; _tfaPendingUid = null;
    _finishLogin(uid);
  } catch (e) {
    if (err) { err.textContent = '⚠ Erro ao verificar. Tente novamente.'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Verificar e entrar →'; }
  }
}

/* ── PERFIL: ATIVAR / DESATIVAR 2FA ── */
async function _init2FACard() {
  const wrap = document.getElementById('tfa-card');
  if (!wrap) return;
  const statusEl = document.getElementById('tfa-status');
  const btnAtivar = document.getElementById('btn-tfa-ativar');
  const btnDesativar = document.getElementById('btn-tfa-desativar');
  const enrollArea = document.getElementById('tfa-enroll-area');
  if (enrollArea) enrollArea.style.display = 'none';

  if (!(await _tfaHasSession())) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">Disponível apenas com login online (conta Supabase).</span>';
    if (btnAtivar) btnAtivar.style.display = 'none';
    if (btnDesativar) btnDesativar.style.display = 'none';
    return;
  }
  const factor = await _tfaVerifiedFactor();
  if (factor) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--sage);font-weight:600">✓ Ativado</span> — seu login pede um código do app autenticador.';
    if (btnAtivar) btnAtivar.style.display = 'none';
    if (btnDesativar) btnDesativar.style.display = 'inline-flex';
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">Desativado.</span> Adicione uma camada extra de segurança ao seu acesso.';
    if (btnAtivar) btnAtivar.style.display = 'inline-flex';
    if (btnDesativar) btnDesativar.style.display = 'none';
  }
}

async function ativar2FA() {
  const enrollArea = document.getElementById('tfa-enroll-area');
  const qrEl = document.getElementById('tfa-qr');
  const secretEl = document.getElementById('tfa-secret');
  const err = document.getElementById('tfa-enroll-error');
  if (err) err.style.display = 'none';
  // Remove fatores TOTP não verificados pendentes (evita erro "factor already exists")
  try {
    const { data } = await supa.auth.mfa.listFactors();
    const stale = ((data && data.all) || []).filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; });
    for (const f of stale) { await supa.auth.mfa.unenroll({ factorId: f.id }).catch(function () {}); }
  } catch (e) {}
  try {
    const { data, error } = await supa.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'TheraFlow' });
    if (error) { showToast('⚠ ' + (error.message || 'Não foi possível iniciar o 2FA.')); return; }
    _tfaEnrollFactorId = data.id;
    if (qrEl) qrEl.innerHTML = (data.totp && data.totp.qr_code) || '';
    if (secretEl) secretEl.textContent = (data.totp && data.totp.secret) || '';
    if (enrollArea) enrollArea.style.display = 'block';
    const inp = document.getElementById('tfa-enroll-code');
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 150); }
  } catch (e) {
    showToast('⚠ Erro ao iniciar 2FA. Verifique sua conexão.');
  }
}

async function confirmar2FA() {
  const inp = document.getElementById('tfa-enroll-code');
  const err = document.getElementById('tfa-enroll-error');
  const code = (inp && inp.value || '').replace(/\D/g, '').trim();
  if (code.length !== 6) {
    if (err) { err.textContent = '⚠ Digite o código de 6 dígitos do app.'; err.style.display = 'block'; }
    return;
  }
  if (!_tfaEnrollFactorId) {
    if (err) { err.textContent = '⚠ Reinicie a ativação.'; err.style.display = 'block'; }
    return;
  }
  if (err) err.style.display = 'none';
  try {
    const { error } = await supa.auth.mfa.challengeAndVerify({ factorId: _tfaEnrollFactorId, code: code });
    if (error) {
      if (err) { err.textContent = '⚠ Código inválido. Confira o horário do dispositivo e tente de novo.'; err.style.display = 'block'; }
      if (inp) { inp.value = ''; inp.focus(); }
      return;
    }
    _tfaEnrollFactorId = null;
    tfTrack('2fa_enabled');
    showToast('✓ Autenticação em dois fatores ativada!');
    _init2FACard();
  } catch (e) {
    if (err) { err.textContent = '⚠ Erro ao confirmar. Tente novamente.'; err.style.display = 'block'; }
  }
}

function cancelar2FAEnroll() {
  const enrollArea = document.getElementById('tfa-enroll-area');
  if (enrollArea) enrollArea.style.display = 'none';
  // Remove o fator não verificado criado neste enroll
  if (_tfaEnrollFactorId) {
    supa.auth.mfa.unenroll({ factorId: _tfaEnrollFactorId }).catch(function () {});
    _tfaEnrollFactorId = null;
  }
}

async function desativar2FA() {
  if (!confirm('Desativar a autenticação em dois fatores? Seu login deixará de pedir o código.')) return;
  const factor = await _tfaVerifiedFactor();
  if (!factor) { _init2FACard(); return; }
  try {
    const { error } = await supa.auth.mfa.unenroll({ factorId: factor.id });
    if (error) { showToast('⚠ ' + (error.message || 'Erro ao desativar.')); return; }
    tfTrack('2fa_disabled');
    showToast('✓ Autenticação em dois fatores desativada.');
    _init2FACard();
  } catch (e) {
    showToast('⚠ Erro ao desativar. Tente novamente.');
  }
}
