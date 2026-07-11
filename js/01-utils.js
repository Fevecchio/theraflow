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
    <span style="flex:1;line-height:1.4">${escHTML ? escHTML(msg) : msg}</span>
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
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// URL segura para usar em href: só aceita http(s) (bloqueia javascript:, data:, etc.)
// e escapa aspas para não quebrar o atributo. Retorna '' se inválida.
function safeURL(u) {
  var s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s.replace(/"/g, '%22') : '';
}

function _firstName(name) {
  return (name || 'Paciente').split(' ')[0] || 'Paciente';
}

/* ── DATE HELPERS (hora local, não UTC — evita bug às 21h BRT) ── */
function localDateISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function hojeISO() { return localDateISO(new Date()); }

/* Normaliza a data de uma cobrança para YYYY-MM-DD (aceita ISO, DD/MM/YYYY e DD/MM). */
function _chargeDateISO(d) {
  if (!d) return null;
  var s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  var m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/); // DD/MM sem ano → assume ano atual
  if (m2) return (new Date().getFullYear()) + '-' + m2[2].padStart(2, '0') + '-' + m2[1].padStart(2, '0');
  return null;
}

/* Uma cobrança está VENCIDA se está explicitamente 'overdue' OU é 'pending' com vencimento
   já passado. No fluxo real o status nunca vira 'overdue' sozinho (nenhum código faz essa
   transição) — este helper torna a inadimplência visível em todo o app sem migração de dados.
   Auditoria 07/07 (crítico: inadimplência invisível). */
function _chargeVencida(c) {
  if (!c || c.deleted) return false;
  if (c.status === 'overdue') return true;
  if (c.status !== 'pending') return false;
  var iso = _chargeDateISO(c.date);
  return !!iso && iso < hojeISO();
}

/* ── MOEDA (única fonte de formatação — F5.1) ──
 * fmtMoeda(1234.5)        → "R$ 1.234,50"  (completo: recibos, relatórios, totais)
 * fmtMoedaInt(1234.5)     → "R$1.235"      (inteiro: listas, toasts, cards)
 * fmtMoedaCompact(1234.5) → "R$1,2k"       (compacto: dashboard, stats) */
function fmtMoeda(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoedaInt(v) {
  return 'R$' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
}
function fmtMoedaCompact(v) {
  v = Number(v) || 0;
  return v >= 1000 ? 'R$' + (v / 1000).toFixed(1).replace('.', ',') + 'k' : fmtMoedaInt(v);
}

/* Data para exibição: ISO (YYYY-MM-DD…) → DD/MM/YYYY; outros formatos passam
 * intactos (muita data legada já vem em BR); vazio → '—'. */
function fmtDataBR(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10).split('-').reverse().join('/');
  return d || '—';
}

/* Formata número para WhatsApp. Retorna null para números inválidos (0800, 0300). */
function _wppNumero(phone) {
  var n = (phone || '').replace(/\D/g, '');
  if (!n || n.startsWith('0800') || n.startsWith('0300') || n.startsWith('0500')) return null;
  return n.startsWith('55') ? n : '55' + n;
}

/* Link wa.me pronto (normaliza o número via _wppNumero; sem número → wa.me/?text=). */
function _wppLink(phone, texto) {
  var n = _wppNumero(phone);
  return 'https://wa.me/' + (n || '') + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

/* Contexto de abordagem do TERAPEUTA para os prompts de IA (decisão do usuário:
 * terapeutas integrativos usam abordagens secundárias). Retorna algo como
 * " O terapeuta também integra: Psicanálise, ACT." ou '' se não houver. As
 * secundárias vêm do onboarding (tf_account.secundarias, nomes display). */
function _abordagemSecundariasIA() {
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    var sec = acc.secundarias;
    if (Array.isArray(sec) && sec.length) {
      return ' O terapeuta também integra elementos de: ' + sec.join(', ') + '.';
    }
  } catch(_) {}
  return '';
}

/* Link de sala de vídeo (/sala) — aceita o formato novo com FRAGMENT (/sala#u=…,
 * que não vaza token em logs/Referer — F3.3) e o antigo com query (/sala?u=…,
 * links já enviados a pacientes). Única fonte de verdade p/ "é link de sala?". */
function _isSalaLink(link) {
  return !!link && /\/sala[?#]/.test(String(link));
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


/* A7: gravação de tf_patients nos fluxos clínicos do portal — quota cheia
 * abortava o handler SEM aviso (diferente de salvarPacientes, que avisa). */
function _tfSetPatientsLS(pacs) {
  try { localStorage.setItem('tf_patients', JSON.stringify(pacs)); return true; }
  catch (e) {
    if (typeof showToast === 'function') showToast('⚠ Armazenamento cheio — o registro pode não ter sido salvo neste aparelho.');
    return false;
  }
}

/* ── PREFERÊNCIAS DA IA (item 2 dos desligados, LIGADO 11/07) ──
 * O terapeuta controla ONDE a IA opina. Default: tudo ligado (opt-out).
 * Chaves: nota (nota clínica automática) · briefing (mostrar cache ao abrir)
 * · risco (palavras de risco nas notas) · reflexao (prompt pós-sessão). */
function _iaPrefOn(key) {
  try {
    var p = JSON.parse(localStorage.getItem('tf_account') || '{}').ia_prefs || {};
    return p[key] !== false;
  } catch (e) { return true; }
}
function _salvarIaPref(key, ligado) {
  try {
    var acc = JSON.parse(localStorage.getItem('tf_account') || '{}');
    acc.ia_prefs = acc.ia_prefs || {};
    acc.ia_prefs[key] = !!ligado;
    localStorage.setItem('tf_account', JSON.stringify(acc));
    if (typeof showToast === 'function') showToast(ligado ? '✓ Recurso de IA ligado.' : 'Recurso de IA desligado — você está no controle.');
  } catch (e) {}
}

// ── Tracking stubs and badge functions ──
/* ── TRACKING STUBS (PostHog / Mixpanel) ── */
function tfTrack(event, props) {
  try {
    if (window.posthog) window.posthog.capture(event, props || {});
    // Descomentar para depuração: console.log('[TF Track]', event, props);
  } catch(e) {}
}

/* ── REGISTRO DE CONSENTIMENTO (LGPD) ──
 * Best-effort: nunca bloqueia a UI nem lança erro — o localStorage continua
 * destravando o fluxo. Roteia por identidade (F3.5):
 *  - PACIENTE logado via RPC/local (tem _pacPortalAuth, sem sessão Auth): grava
 *    pela RPC portal_log_consent (migration 014), autenticada por email+hash —
 *    não dá para forjar com um UUID qualquer.
 *  - TERAPEUTA (ou termos_plataforma): POST /api/consent com o JWT. */
async function _logConsent(tipo, opts) {
  opts = opts || {};
  try {
    if (typeof _pacPortalAuth !== 'undefined' && _pacPortalAuth && typeof supaPatient !== 'undefined') {
      await supaPatient.rpc('portal_log_consent', {
        p_email: _pacPortalAuth.email, p_hash: _pacPortalAuth.hash,
        p_tipo: tipo, p_versao: opts.versao || '1.0',
      });
      return;
    }
    var body = { tipo: tipo, versao: opts.versao || '1.0' };
    if (opts.patientId) body.patientId = opts.patientId;
    var headers = { 'Content-Type': 'application/json' };
    try { Object.assign(headers, await _apiAuthHeader()); } catch(e) {}
    await fetchWithTimeout('/api/consent', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    }, 8000);
  } catch(e) {
    // Sem backend (preview local) ou offline: o aceite já está no localStorage.
    if (window.console && console.debug) console.debug('[consent] não registrado no banco:', e.message);
  }
}



/* ── P10: tombstone de exclusão ──
 * Excluir elemento de array de escrita dupla (exercises/portalMetas/materials)
 * grava {id: quando} em p._tombs[array] — o merge por elemento no servidor
 * (migration 025) usa isso para a cópia velha de outro device não ressuscitar
 * o item. O _tombs viaja no metadata do sync do terapeuta (js/03). */
function _tfTombstone(p, arrKey, id) {
  if (!p || id == null) return;
  p._tombs = p._tombs || {};
  p._tombs[arrKey] = p._tombs[arrKey] || {};
  p._tombs[arrKey][String(id)] = Date.now();
}