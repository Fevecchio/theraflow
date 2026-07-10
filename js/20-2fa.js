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
    _tfaRenderBackupRow();
  } else {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">Desativado.</span> Adicione uma camada extra de segurança ao seu acesso.';
    if (btnAtivar) btnAtivar.style.display = 'inline-flex';
    if (btnDesativar) btnDesativar.style.display = 'none';
    const row = document.getElementById('tfa-backup-row');
    if (row) row.style.display = 'none';
    const area = document.getElementById('tfa-backup-area');
    if (area) area.style.display = 'none';
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
    // qr_code é um data URI (data:image/svg+xml;utf-8,<svg…>) — como innerHTML
    // o prefixo vira texto e o svg renderiza sem tamanho; tem que ser src de <img>.
    if (qrEl) {
      qrEl.innerHTML = '';
      const q = (data.totp && data.totp.qr_code) || '';
      if (q) {
        const img = document.createElement('img');
        img.src = q;
        img.alt = 'QR code do 2FA';
        img.style.cssText = 'width:100%;height:100%;display:block';
        qrEl.appendChild(img);
      }
    }
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
    // Gera os códigos de backup na hora (a sessão acabou de virar aal2) — sem
    // eles, perder o celular = perder a conta (T-A8).
    gerarBackupCodes(null);
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

/* ── CÓDIGOS DE BACKUP (T-A8) ──
 * Gerados no servidor (/api/2fa-recovery, service role) e mostrados UMA vez.
 * Usar um código no login desenrola o TOTP — a conta não morre com o celular. */

async function _tfaBackupStatus() {
  try {
    const r = await fetchWithTimeout('/api/2fa-recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ action: 'status' }),
    }, 15000);
    const d = await r.json();
    return (r.ok && d.ok) ? Number(d.remaining || 0) : null;
  } catch (e) { return null; }
}

/* Linha "Códigos de backup: N restantes" no card do Perfil (2FA ativo). */
async function _tfaRenderBackupRow() {
  const row = document.getElementById('tfa-backup-row');
  const info = document.getElementById('tfa-backup-info');
  if (!row || !info) return;
  row.style.display = 'flex';
  info.textContent = 'Códigos de backup: verificando…';
  const n = await _tfaBackupStatus();
  if (n === null) { info.textContent = 'Códigos de backup: indisponível no momento.'; return; }
  if (n === 0) {
    info.innerHTML = '<span style="color:#c0392b;font-weight:600">Nenhum código de backup.</span> Gere agora — sem eles, perder o celular = perder o acesso.';
  } else {
    info.textContent = 'Códigos de backup: ' + n + ' restante' + (n === 1 ? '' : 's') + '.';
  }
}

/* Gera (ou regenera) os 10 códigos e os exibe no card. Exige sessão aal2. */
async function gerarBackupCodes(btn) {
  const area = document.getElementById('tfa-backup-area');
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  try {
    const r = await fetchWithTimeout('/api/2fa-recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ action: 'generate' }),
    }, 15000);
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok || !d.ok || !Array.isArray(d.codes)) {
      showToast('⚠ ' + (d.error || 'Não foi possível gerar os códigos. Tente novamente.'));
      return;
    }
    tfTrack('2fa_backup_codes_generated');
    if (area) {
      const grid = d.codes.map(function (c) {
        return '<div style="font-family:monospace;font-size:15px;font-weight:600;letter-spacing:1px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px;text-align:center">' + c + '</div>';
      }).join('');
      area.innerHTML =
        '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:8px">🔑 Seus códigos de backup</div>' +
        '<div style="font-size:12.5px;color:#c0392b;margin-bottom:12px">Guarde-os em um lugar seguro (gerenciador de senhas, papel). Eles aparecem <strong>só esta vez</strong> — cada um funciona uma única vez e substitui o código do app se você perder o celular.</div>' +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">' + grid + '</div>' +
        '<button class="btn btn-secondary btn-sm" onclick="_tfaCopyBackupCodes(this)">📋 Copiar códigos</button>';
      area.dataset.codes = d.codes.join('\n');
      area.style.display = 'block';
    }
    _tfaRenderBackupRow();
  } catch (e) {
    showToast('⚠ Erro de conexão ao gerar os códigos.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Gerar novos códigos'; }
  }
}

function _tfaCopyBackupCodes(btn) {
  const area = document.getElementById('tfa-backup-area');
  const txt = (area && area.dataset.codes) || '';
  if (!txt) return;
  navigator.clipboard.writeText('Códigos de backup TheraFlow (uso único):\n' + txt).then(function () {
    if (btn) { btn.textContent = '✓ Copiado'; setTimeout(function () { btn.textContent = '📋 Copiar códigos'; }, 2000); }
  }).catch(function () { showToast('⚠ Não foi possível copiar. Anote manualmente.'); });
}

/* ── RESGATE NO LOGIN (perdi o celular) ── */
function _toggleBackupLogin() {
  const box = document.getElementById('tfa-backup-login');
  if (!box) return;
  const aberto = box.style.display !== 'none';
  box.style.display = aberto ? 'none' : 'block';
  if (!aberto) {
    const inp = document.getElementById('tfa-backup-code');
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 100); }
  }
}

async function _verifyBackupLogin() {
  const inp = document.getElementById('tfa-backup-code');
  const err = document.getElementById('tfa-login-error');
  const btn = document.getElementById('btn-tfa-backup');
  const code = ((inp && inp.value) || '').trim();
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) {
    if (err) { err.textContent = '⚠ O código de backup tem 8 caracteres (ex.: ABCD-2345).'; err.style.display = 'block'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
  if (err) err.style.display = 'none';
  try {
    const r = await fetchWithTimeout('/api/2fa-recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await _apiAuthHeader()) },
      body: JSON.stringify({ action: 'redeem', code: code }),
    }, 15000);
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok || !d.ok) {
      if (err) { err.textContent = '⚠ ' + (d.error || 'Código inválido ou já usado.'); err.style.display = 'block'; }
      if (inp) { inp.value = ''; inp.focus(); }
      return;
    }
    tfTrack('2fa_backup_code_redeemed');
    showToast('✓ Código aceito. O 2FA foi desativado — reative no Perfil com o novo dispositivo.');
    const uid = _tfaPendingUid; _tfaPendingUid = null;
    _finishLogin(uid);
  } catch (e) {
    if (err) { err.textContent = '⚠ Erro de conexão. Tente novamente.'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Usar código de backup →'; }
  }
}
