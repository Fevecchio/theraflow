// 01-utils.js — Date helpers, fetch utilities, showToast, escHTML, _firstName

function showToast(msg, type) {
  const existing = document.getElementById('tf-toast-el');
  if (existing) existing.remove();
  const t = type || 'success';
  const iconMap   = { success:'✓', error:'✕', info:'i', warning:'!' };
  const colorMap  = { success:'#25D366', error:'#c0392b', info:'#2c5f8a', warning:'#c97d2e' };
  const icon  = iconMap[t]  || '✓';
  const color = colorMap[t] || '#25D366';
  const toast = document.createElement('div');
  toast.id = 'tf-toast-el';
  toast.className = 'tf-toast';
  toast.innerHTML = `
    <span style="width:22px;height:22px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:#fff">${icon}</span>
    <span style="flex:1;line-height:1.4">${msg}</span>
    <div class="tf-toast-bar" style="background:${color}40"></div>
  `;
  document.body.appendChild(toast);
  const timer = setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
  }, 3000);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    toast.classList.add('hiding');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
  });
}

function escHTML(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _firstName(name) {
  return (name || 'Paciente').split(' ')[0] || 'Paciente';
}

/* ── DATE HELPERS (hora local, não UTC — evita bug às 21h BRT) ── */
function localDateISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function hojeISO() { return localDateISO(new Date()); }

/* Formata número para WhatsApp. Retorna null para números inválidos (0800, 0300). */
function _wppNumero(phone) {
  var n = (phone || '').replace(/\D/g, '');
  if (!n || n.startsWith('0800') || n.startsWith('0300') || n.startsWith('0500')) return null;
  return n.startsWith('55') ? n : '55' + n;
}

/* ── FETCH COM TIMEOUT ── */
async function _apiAuthHeader() {
  try {
    const { data: { session } } = await supa.auth.getSession();
    return session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {};
  } catch(e) { return {}; }
}

async function fetchWithTimeout(url, opts, ms = 15000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch(e) {
    if (e.name === 'AbortError') throw new Error('Tempo esgotado. Verifique sua conexão e tente novamente.');
    throw e;
  } finally {
    clearTimeout(id);
  }
}


// ── Tracking stubs and badge functions ──
/* ── TRACKING STUBS (PostHog / Mixpanel) ── */
function tfTrack(event, props) {
  try {
    if (window.posthog) window.posthog.capture(event, props || {});
    // Descomentar para depuração: console.log('[TF Track]', event, props);
  } catch(e) {}
}

