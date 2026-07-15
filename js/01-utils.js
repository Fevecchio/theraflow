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

/* ── MENSAGENS AO PACIENTE (revisão 14/07 — tom único: acolhedor, completo e
 * assinado; antes cada tela improvisava a sua, algumas sem dia/hora) ── */

/* Primeiro nome da terapeuta sem título (Dra./Dr./Prof.) para assinar mensagens. */
function _wppNomeTerapeuta() {
  var nome = '';
  try { nome = (JSON.parse(localStorage.getItem('tf_account') || '{}').nome) || ''; } catch (e) {}
  if (!nome && typeof tfUserData !== 'undefined' && tfUserData) nome = tfUserData.nome || '';
  var partes = String(nome).split(' ').filter(function (w) { return w && !/^(Dr|Dra|Prof|Profa|Me)\.?$/i.test(w); });
  return partes[0] || 'sua terapeuta';
}

/* Template do Perfil ([Nome] [dia] [hora] [Terapeuta]) com fallback padrão.
 * (Morava em js/07 e só o disparo em lote usava — agora é o caminho único.) */
function _wppInterpolate(tpl, nome, dia, hora, terapeuta) {
  // Default SEM emoji + com a informação do portal (pedido 15/07: a paciente
  // precisa saber que a sala fica disponível no portal dela; e os emojis do
  // template antigo chegavam como "�" no wa.me — print do fundador).
  var base = tpl && tpl.trim()
    ? tpl
    : 'Olá [Nome]!\n\nLembrete da sua sessão de psicoterapia [dia] às [hora].\n\nNo horário da sessão, a sala de vídeo estará disponível no seu portal.\n\nQualquer imprevisto, é só me avisar por aqui. Até logo!\n— [Terapeuta]';
  // Se o template já usa [hora] explicitamente, [dia] vira só a data (evita duplicar a hora).
  // Caso contrário (templates antigos só com [dia]), embute "às [hora]" no [dia] como antes.
  var temHora = /\[hora\]/.test(base);
  return base
    .replace(/\[Nome\]/g, nome)
    .replace(/\[dia\]/g, (hora && !temHora) ? dia + ' às ' + hora : dia)
    .replace(/\[hora\]/g, hora || '')
    .replace(/\[Terapeuta\]/g, terapeuta)
    .replace(/�/g, ''); // template salvo com bytes corrompidos não vaza "�" pro paciente
}

/* Próxima sessão do paciente por IDENTIDADE (patientId) — patientIdx é derivado
 * e desloca com exclusões (a mensagem saía SEM dia/hora por índice trocado). */
function _proximaSessaoDoPaciente(p, idx) {
  if (typeof appointments === 'undefined' || !appointments.length) return null;
  var hoje = (typeof hojeISO === 'function') ? hojeISO() : '';
  return appointments.filter(function (a) {
    if (!a || a.status === 'cancelada' || !a.date || a.date < hoje) return false;
    if (p && p.id && a.patientId) return String(a.patientId) === String(p.id);
    return a.patientIdx === idx; // fallback demo/legado sem ids
  }).sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); })[0] || null;
}

/* Lembrete de sessão pronto para wa.me. Com appt usa o template do Perfil com a
 * data real ("hoje" quando for hoje); sem appt, versão genérica honesta. */
function _wppMsgLembreteSessao(p, appt) {
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account') || '{}'); } catch (e) {}
  var nomeT = _wppNomeTerapeuta();
  if (appt && appt.date) {
    var hojeStr = (typeof hojeISO === 'function') ? hojeISO() : '';
    var dia;
    if (appt.date === hojeStr) { dia = 'hoje'; }
    else {
      var d = new Date(appt.date + 'T12:00');
      dia = isNaN(d.getTime()) ? appt.date : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    }
    return _wppInterpolate(acc.wpp_template || '', _firstName(p.name), dia, appt.time || '', nomeT);
  }
  return 'Olá ' + _firstName(p.name) + '!\n\nLembrete da sua sessão de psicoterapia.\n\nNo horário da sessão, a sala de vídeo estará disponível no seu portal.\n\nQualquer imprevisto, é só me avisar por aqui. Até breve!\n— ' + nomeT;
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

/* ── ÍCONES DE UI (Fase C: micro-emojis de botão → SVG de traço, Lucide-like) ──
 * Uso: _tfIcon('wpp') dentro de innerHTML/template. Herda a cor do texto
 * (stroke currentColor) e alinha à linha de base. Emojis de TOASTS/feedback
 * ficam — a troca é só no chrome (botões/ações). */
var _TF_ICON_PATHS = {
  wpp:   '<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>',
  doc:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  csv:   '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  gear:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  link:  '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>',
  cal:   '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clip:  '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
  send:  '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>'
};
function _tfIcon(name, size) {
  var s = size || 14;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">'
    + (_TF_ICON_PATHS[name] || '') + '</svg>';
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
// ── Paciente da SESSÃO AO VIVO por IDENTIDADE (id), não por posição ──────────
// O array patients é SUBSTITUÍDO por restores/sync (ordem pode mudar) — um índice
// capturado ao entrar na sessão pode apontar para OUTRA pessoa no encerramento
// (bug real 12/07 no co-teste: nota clínica salvou no paciente errado).
// A tela de sessão fixa window._tfSessionPatientId ao abrir; toda leitura passa
// por aqui, que re-ancora o índice pela identidade antes de devolver o paciente.
function _tfSessionPatient() {
  try {
    var id = window._tfSessionPatientId;
    if (id && typeof patients !== 'undefined') {
      for (var i = 0; i < patients.length; i++) {
        if (patients[i] && patients[i].id === id) {
          currentSessionPatientIdx = i;
          return patients[i];
        }
      }
    }
  } catch (e) {}
  return patients[currentSessionPatientIdx] || patients[0];
}

// Setter da identidade da sessão — chamar NO CLIQUE (síncrono), antes do
// navigate('sessao'): startSession() é async e fixar lá deixa janela de corrida.
function _tfSetSessionPatient(idx, optId) {
  try {
    var p = null, i;
    if (optId) {
      for (i = 0; i < patients.length; i++) {
        if (patients[i] && patients[i].id === optId) { p = patients[i]; idx = i; break; }
      }
    }
    if (!p) p = patients[idx];
    currentSessionPatientIdx = idx;
    window._tfSessionPatientId = (p && p.id) || null;
  } catch (e) { currentSessionPatientIdx = idx; window._tfSessionPatientId = null; }
}

// Variante para botões de AGENDAMENTO: resolve pelo patientId (uuid) do
// appointment — a.patientIdx é derivado e pode estar velho (CLAUDE.md).
function _tfSetSessionPatientAppt(apptId) {
  var a = (typeof appointments !== 'undefined' ? appointments : [])
    .find(function (x) { return x && String(x.id) === String(apptId); });
  if (a && a.patientId) {
    for (var i = 0; i < patients.length; i++) {
      if (patients[i] && patients[i].id === a.patientId) { _tfSetSessionPatient(i); return; }
    }
  }
  _tfSetSessionPatient(a ? a.patientIdx : (typeof currentSessionPatientIdx !== 'undefined' ? currentSessionPatientIdx : 0));
}
