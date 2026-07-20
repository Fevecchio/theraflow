// 21-livekit-session.js — Sessão de vídeo LiveKit + captura de áudio → transcrição → nota clínica IA.
//
// STATUS: ATIVO EM PRODUÇÃO (pipeline E2E validado 06/07/2026; padrão desde 07/07 — flag abaixo).
// O HTML carrega o SDK via CDN (window.LivekitClient) e os botões da sessão roteiam para
// startLiveKitSession/endLiveKitSession via js/09 (startWherebySession/endWherebySession).
// Env no Vercel: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, GROQ_API_KEY (+ ANTHROPIC).

// FEATURE FLAG — default ON desde 07/07/2026 (pipeline E2E validado em produção 06/07).
// O LiveKit (vídeo integrado + transcrição + nota IA) é o fluxo PADRÃO de sessão.
// Desligar (volta ao fluxo legado de link externo): ?livekit=0 na URL, ou
// localStorage.setItem('tf_livekit','0') — sem precisar de novo deploy.
// Exceção: modo DEMO (window._tfDemo) usa o fluxo legado — sem backend real p/ criar sala
// (checado nos pontos de roteamento, pois _tfDemo é setado depois deste script carregar).
window._TF_LIVEKIT_ENABLED = (function () {
  try {
    if (localStorage.getItem('tf_livekit') === '0') return false;
    if (/[?&]livekit=0\b/.test(location.search)) return false;
    if (/[?&]livekit=1\b/.test(location.search)) return true; // compat c/ links antigos de teste
  } catch (_) {}
  return true;
})();

// Consentimento LGPD por sessão (in-memory). Gate obrigatório antes de iniciar o LiveKit.
window._tfSessionConsent = window._tfSessionConsent || null;

// Chamado pelo botão "Iniciar" quando o LiveKit está ligado: exige consentimento antes de conectar.
function _startSessionWithConsent() {
  const sp = _tfSessionPatient();
  const pid = sp && sp.id;
  if (window._tfSessionConsent && window._tfSessionConsent.patientId === pid) {
    return startLiveKitSession();
  }
  window._tfPendingSessionStart = true;
  if (typeof showModal === 'function') showModal('modal-consent');
}

// Confirmação do modal de consentimento (LGPD Art.11 + CFP Res.13/2022).
function confirmarConsentimentoSessao() {
  const chk = document.getElementById('consent-checkbox');
  if (chk && !chk.checked) {
    if (typeof showToast === 'function') showToast('⚠ Marque a confirmação de consentimento para continuar.');
    return;
  }
  const sp = _tfSessionPatient();
  const pid = sp && sp.id;
  window._tfSessionConsent = { patientId: pid, at: Date.now() };
  if (typeof _logConsent === 'function' && /^[0-9a-f-]{36}$/i.test(pid || '')) {
    _logConsent('gravacao_sessao', { patientId: pid });
  }
  if (typeof _updateConsentStatus === 'function') _updateConsentStatus(sp); // tag no topo da sessão
  if (typeof closeModal === 'function') closeModal('modal-consent');
  if (chk) chk.checked = false;
  if (window._tfPendingSessionStart) {
    window._tfPendingSessionStart = false;
    if (typeof startLiveKitSession === 'function') startLiveKitSession();
  } else if (typeof showToast === 'function') {
    showToast('Consentimento registrado ✓');
  }
}

let _lkRoom = null;
let _lkRecorder = null;      // gravador do SEGMENTO ATUAL da faixa do terapeuta
let _lkMicDest = null;       // destino WebAudio com o mic do terapeuta
let _lkMicSource = null;     // fonte WebAudio do mic (guardada p/ religar na troca de dispositivo)
let _lkPacDest = null;       // destino WebAudio só com o áudio da PACIENTE
let _lkPacRecorder = null;   // gravador do segmento atual da faixa da paciente
let _lkRecStartMs = 0;       // início da gravação do terapeuta (base de TODOS os offsets)
let _lkAudioCtx = null;
let _lkAnalyser = null;
let _lkMeterRAF = null;
let _lkRetry = null;          // { segsTher, segsPac } p/ reprocessar sem regravar

// ── SEGMENTAÇÃO POR TEMPO (remove o teto de ~18min do upload único) ──
// Cada faixa grava em segmentos de ~4min: o MediaRecorder do segmento é parado
// (blob AUTOCONTIDO, com header — o Whisper transcreve cada um sozinho) e outro
// começa imediatamente. A 32kbps, 4min ≈ 0,96MB — folga ampla no limite de
// ~4,5MB da Vercel. Offset de cada segmento = (início dele − _lkRecStartMs):
// os timestamps do Whisper (relativos ao segmento) viram tempo absoluto da
// sessão na intercalação. Perda entre stop→start: alguns ms a cada 4min.
// Override p/ teste: localStorage.setItem('tf_seg_ms','40000') → segmentos de 40s
// (validar a rotação sem uma sessão de 20min). Mínimo 15s; remover a chave volta ao padrão.
const _LK_SEG_MS = (function () {
  try { const v = parseInt(localStorage.getItem('tf_seg_ms') || '', 10); if (v >= 15000) return v; } catch (_) {}
  return 4 * 60 * 1000;
})();
let _lkSegsTher = [];        // segmentos fechados: { blob, offsetSec }
let _lkSegsPac = [];
let _lkTherRotTimer = null;  // timers da rotação (limpos no encerrar)
let _lkPacRotTimer = null;
let _lkEnding = false;       // encerrando → a rotação não abre novo segmento

/* Indicador de captura AO VIVO (revisão 10/07): o terapeuta via a gravação
 * funcionar só NO FIM — sessão irrecuperável se algo falhasse. Este status
 * mostra em tempo real que o áudio está fluindo e quantos trechos já estão
 * seguros em memória. Honesto: a transcrição acontece ao encerrar. */
function _lkLiveStatus() {
  var el = document.getElementById('sess-capture-status');
  var txt = document.getElementById('sess-capture-text');
  if (!el || !txt) return;
  if (_lkEnding || (!_lkRecorder && !_lkPacRecorder)) { el.style.display = 'none'; return; }
  var fechados = _lkSegsTher.length + _lkSegsPac.length;
  var lados = _lkPacDest ? 'ambos os lados' : 'seu áudio';
  txt.textContent = 'Capturando ' + lados + ' para transcrição'
    + (fechados > 0 ? ' · ' + fechados + (fechados === 1 ? ' trecho seguro' : ' trechos seguros') : '')
    + ' · transcreve ao encerrar';
  el.style.display = 'flex';
}

// Cria o gravador de UM segmento da faixa e agenda a rotação para o próximo.
function _lkStartSegRec(which) {
  const isTher = which === 'ther';
  const dest = isTher ? _lkMicDest : _lkPacDest;
  if (!dest || _lkEnding) return;
  const chunks = [];
  const startMs = Date.now();
  // 32 kbps mono: voz inteligível p/ o Whisper e arquivo ~4× menor que o default.
  const rec = new MediaRecorder(dest.stream, { mimeType: _pickAudioMime(), audioBitsPerSecond: 32000 });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
    // Segmento minúsculo (ex.: rotação logo antes do encerrar) não vale transcrição.
    if (blob.size < 1200) return;
    (isTher ? _lkSegsTher : _lkSegsPac).push({ blob, offsetSec: Math.max(0, (startMs - _lkRecStartMs) / 1000) });
    _lkLiveStatus();
  };
  rec.start(1000);
  _lkLiveStatus();
  const timer = setTimeout(() => {
    if (_lkEnding) return;
    try { if (rec.state !== 'inactive') rec.stop(); } catch (_) {}
    _lkStartSegRec(which); // próximo segmento, sem interromper a consulta
  }, _LK_SEG_MS);
  if (isTher) { _lkRecorder = rec; _lkTherRotTimer = timer; }
  else { _lkPacRecorder = rec; _lkPacRotTimer = timer; }
}

// Avisa antes de fechar/recarregar a aba durante a sessão (a gravação vive em memória —
// um F5 a perderia). Registrado quando a gravação começa, removido ao encerrar.
function _lkGuardUnload(e) {
  e.preventDefault();
  e.returnValue = 'A sessão está em andamento. Se sair agora, a gravação e a nota serão perdidas.';
  return e.returnValue;
}

// Rascunho de recuperação: grava transcrição+nota assim que existem, para não perder o
// trabalho se o navegador fechar entre gerar e salvar. Limpo ao salvar no prontuário.
function _lkSaveDraft(sp, transcript, note, notasManuais) {
  try {
    localStorage.setItem('tf_lk_draft', JSON.stringify({
      patientId: sp && sp.id, patientName: sp && sp.name,
      at: new Date().toISOString(), transcript: transcript || '', note: note || '',
      notasManuais: notasManuais || '',
    }));
  } catch (_) {}
}
function _lkClearDraft() { try { localStorage.removeItem('tf_lk_draft'); } catch (_) {} }

// Recuperação do rascunho (T-A4): o draft era salvo e NUNCA lido — se o navegador
// fechava entre gerar a nota e salvar, o trabalho sumia. No boot do app, se houver
// rascunho, oferece recuperá-lo (reabre o modal pós-sessão com a nota). Uma vez/sessão.
var _lkDraftChecked = false;
function _lkCheckDraftOnBoot() {
  if (_lkDraftChecked) return;
  _lkDraftChecked = true;
  var draft;
  try { draft = JSON.parse(localStorage.getItem('tf_lk_draft') || 'null'); } catch (_) { draft = null; }
  if (!draft || (!draft.note && !draft.transcript)) return;
  var quando = '';
  try { quando = new Date(draft.at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch(_) {}
  var bar = document.createElement('div');
  bar.id = 'lk-draft-recover';
  bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9997;background:#1a2a1e;color:#fff;border-radius:12px;padding:14px 18px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;align-items:center;gap:14px;max-width:92vw;font-size:13px';
  bar.innerHTML = '<span>📝 Há uma nota de sessão não salva'
    + (draft.patientName ? ' de <strong>' + (typeof escHTML==='function'?escHTML(draft.patientName):draft.patientName) + '</strong>' : '')
    + (quando ? ' (' + quando + ')' : '') + '.</span>'
    + '<button id="lk-draft-open" style="background:var(--sage,#4a7c59);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">Recuperar</button>'
    + '<button id="lk-draft-dismiss" style="background:transparent;border:none;color:rgba(255,255,255,.6);font-size:18px;cursor:pointer;padding:0 4px">×</button>';
  document.body.appendChild(bar);
  document.getElementById('lk-draft-open').onclick = function() {
    bar.remove();
    if (typeof _lkShowPostSession === 'function') {
      _lkShowPostSession({ transcript: draft.transcript || '', note: draft.note || '', notasManuais: draft.notasManuais || '' });
    }
  };
  document.getElementById('lk-draft-dismiss').onclick = function() {
    bar.remove(); _lkClearDraft();
  };
}

// ── SALA ATIVA SOBREVIVE A TRAVAMENTO/RELOAD (co-teste 13/07) ──
// Cada "Iniciar" criava uma sala NOVA: se o app travasse ou recarregasse com a
// paciente ainda na sala antiga, os dois nunca mais se encontravam (ela esperando
// lá, o terapeuta numa sala vazia — lido como "sala ocupada"). Guardamos url+tokens
// da sala em andamento; reentrar RETOMA a MESMA sala e o link dela continua valendo.
// TTL 2h30 (< 3h dos tokens); amarrado à conta (tf_owner_uid). Limpo no encerrar oficial.
function _lkSaveRoomInfo(sp) {
  try {
    localStorage.setItem('tf_lk_room', JSON.stringify({
      url: window._lkUrl, hostToken: window._lkHostToken,
      patientToken: window._lkPatientToken, patientCode: window._lkPatientCode,
      patientId: (sp && sp.id) || null,
      owner: localStorage.getItem('tf_owner_uid') || null,
      at: Date.now(),
    }));
  } catch (_) {}
}
function _lkLoadRoomInfo() {
  try {
    const r = JSON.parse(localStorage.getItem('tf_lk_room') || 'null');
    if (!r || !r.url || !r.hostToken) return null;
    if (Date.now() - (r.at || 0) > 2.5 * 60 * 60 * 1000) { _lkClearRoomInfo(); return null; }
    const owner = localStorage.getItem('tf_owner_uid') || null;
    if (r.owner && owner && r.owner !== owner) { _lkClearRoomInfo(); return null; } // sala de OUTRA conta
    return r;
  } catch (_) { return null; }
}
function _lkClearRoomInfo() { try { localStorage.removeItem('tf_lk_room'); } catch (_) {} }

// Medidor de áudio ao vivo — confirma visualmente que o mic está sendo captado.
function _lkStartMeter(sourceNode) {
  try {
    _lkAnalyser = _lkAudioCtx.createAnalyser();
    _lkAnalyser.fftSize = 1024;
    sourceNode.connect(_lkAnalyser); // paralelo ao _lkMicDest — o mesmo sinal do medidor alimenta a gravação
    // injeta a UI do medidor sobre o vídeo
    let bar = document.getElementById('lk-mic-meter');
    if (!bar) {
      const wrap = document.querySelector('#page-sessao .video-main') || document.body;
      bar = document.createElement('div');
      bar.id = 'lk-mic-meter';
      bar.style.cssText = 'position:absolute;bottom:14px;left:14px;z-index:4;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.55);border-radius:20px;padding:6px 12px;font-size:12px;color:#fff';
      bar.innerHTML = '🎤 <div style="width:90px;height:8px;background:rgba(255,255,255,.2);border-radius:4px;overflow:hidden"><div id="lk-mic-fill" style="width:0%;height:100%;background:#4ade80;transition:width .06s"></div></div><span id="lk-mic-label" style="opacity:.85">captando…</span>';
      wrap.appendChild(bar);
    }
    const buf = new Float32Array(_lkAnalyser.fftSize);
    // B7: o rótulo travava em "áudio ok ✓" no 1º som — mic mudo/caído no meio
    // da sessão continuava "ok". Janela deslizante: sem som há 4s, avisa.
    let lastSoundTs = 0;
    const tick = () => {
      if (!_lkAnalyser) return;
      _lkAnalyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const pct = Math.min(100, Math.round(rms * 900));
      const fill = document.getElementById('lk-mic-fill');
      const lbl = document.getElementById('lk-mic-label');
      if (fill) fill.style.width = pct + '%';
      if (rms > 0.01) lastSoundTs = Date.now();
      // Mic SILENCIADO de propósito (botão mudo): avisa isso em vez do alarme
      // "verifique o microfone" — o silêncio é intencional.
      if (lbl) lbl.textContent = !_lkMicOn ? 'microfone silenciado'
        : !lastSoundTs ? 'fale para testar…'
        : (Date.now() - lastSoundTs < 4000) ? 'áudio ok ✓'
        : 'sem áudio agora — verifique o microfone';
      _lkMeterRAF = requestAnimationFrame(tick);
    };
    _lkMeterRAF = requestAnimationFrame(tick);
  } catch (e) { console.warn('[livekit] meter', e); }
}
function _lkStopMeter() {
  if (_lkMeterRAF) { cancelAnimationFrame(_lkMeterRAF); _lkMeterRAF = null; }
  _lkAnalyser = null;
  const bar = document.getElementById('lk-mic-meter'); if (bar) bar.remove();
}

// _apiAuthHeader é ASYNC (js/01-utils.js) — precisa de await, senão espalha uma Promise
// e a requisição vai sem o Bearer do Supabase → 401.
async function _lkAuthHeaders(extra) {
  let base = {};
  try { if (typeof _apiAuthHeader === 'function') base = (await _apiAuthHeader()) || {}; } catch (_) {}
  return Object.assign({}, base, extra || {});
}

function _pickAudioMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  for (const m of opts) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}

// Publica o link real da sala no registro do paciente (portal) + sincroniza.
// O carimbo sessionLinkAt permite ao portal mostrar o convite só enquanto o token
// está fresco (TTL 3h) e removê-lo depois. Mesmo formato do link do WhatsApp.
function _lkPublishPortalLink(sp) {
  if (!sp || !window._lkUrl || !window._lkPatientToken) return;
  try {
    const first = (sp.name || 'Paciente').split(' ')[0];
    // FRAGMENT (#): token fora da query → não vaza em logs/Referer (F3.3).
    sp.sessionLink = location.origin + '/sala#u=' + encodeURIComponent(window._lkUrl) +
      '&t=' + encodeURIComponent(window._lkPatientToken) + '&n=' + encodeURIComponent(first);
    sp.sessionLinkAt = new Date().toISOString();
    // salvarPacientes já sincroniza com o Supabase (debounce 1,5s) — suficiente vs poll de 20s.
    if (typeof salvarPacientes === 'function') salvarPacientes();
  } catch (e) { console.warn('[livekit] publicar link no portal', e); }
}

// Remove o link/convite do portal ao encerrar a sessão (o token já expira, mas isto
// tira o botão "Entrar" da paciente imediatamente).
function _lkClearPortalLink(sp) {
  if (!sp) return;
  try {
    if (!sp.sessionLink && !sp.sessionLinkAt) return;
    sp.sessionLink = null;
    sp.sessionLinkAt = null;
    if (typeof salvarPacientes === 'function') salvarPacientes();
  } catch (e) { console.warn('[livekit] limpar link do portal', e); }
}

// SDK LiveKit sob demanda (~540 KB): só quem inicia sessão baixa — o app não paga esse
// peso em toda visita (F7). Mesmo pin+SRI do carregamento estático anterior (F5.5) —
// ao atualizar a versão, recalcular o integrity.
const _LK_SDK = {
  src: 'https://cdn.jsdelivr.net/npm/livekit-client@2.20.0/dist/livekit-client.umd.min.js',
  integrity: 'sha384-s/eoT8qpr81c6c9MG5V7GA5xi5IzfEUQLyk3liFfzu9seBzZ3beFVjsD3pXTRmUc',
};
let _lkSdkPromise = null;
function _lkLoadSdk() {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (_lkSdkPromise) return _lkSdkPromise;
  _lkSdkPromise = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = _LK_SDK.src;
    s.integrity = _LK_SDK.integrity;
    s.crossOrigin = 'anonymous';
    s.onload = function () {
      if (window.LivekitClient) resolve(window.LivekitClient);
      else reject(new Error('SDK carregou sem expor LivekitClient'));
    };
    s.onerror = function () {
      _lkSdkPromise = null; // permite tentar de novo no próximo clique
      reject(new Error('falha ao baixar a biblioteca de vídeo'));
    };
    document.head.appendChild(s);
  });
  return _lkSdkPromise;
}

async function startLiveKitSession() {
  // Já há sessão ativa E conectada: re-iniciar descartaria os segmentos gravados e
  // abriria uma segunda sala sem desconectar a primeira. Lote 1. Se a sala existe
  // mas a conexão MORREU (travamento/queda — co-teste 13/07), reconecta em vez de
  // bloquear ("sala ocupada" sem saída).
  if (_lkRoom) {
    var _st = ''; try { _st = String(_lkRoom.state || ''); } catch (_) {}
    if (_st === 'disconnected') return _lkReconnect();
    if (typeof showToast === 'function') showToast('⚠ Já existe uma sessão em andamento — encerre no ✕ ou use ↻ Reconectar se ela travou.');
    return;
  }
  let LK;
  try { LK = await _lkLoadSdk(); } catch (e) {
    if (typeof showToast === 'function') showToast('⚠ Não foi possível carregar a biblioteca de vídeo. Verifique a conexão e tente de novo.');
    return;
  }
  const sp = _tfSessionPatient();

  try {
    // Consentimento já foi registrado pelo gate (_startSessionWithConsent → modal-consent →
    // confirmarConsentimentoSessao → _logConsent). Aqui apenas conectamos.

    // RETOMADA: há sala recente DESTE paciente ainda válida (o app travou/recarregou
    // sem encerramento oficial). Reusa a MESMA sala e os MESMOS tokens: a paciente que
    // ficou esperando lá (ou com o link antigo no WhatsApp/portal) é reencontrada.
    const saved = _lkLoadRoomInfo();
    if (saved && sp && saved.patientId && String(saved.patientId) === String(sp.id)) {
      window._lkUrl = saved.url; window._lkHostToken = saved.hostToken;
      window._lkPatientToken = saved.patientToken || null;
      window._lkPatientCode = saved.patientCode || null;
      window._lkSessionPatient = sp;
      _lkPublishPortalLink(sp);
      await _lkConnectRoom(LK, saved.url, saved.hostToken, true);
      if (typeof showToast === 'function') showToast('↻ Sessão retomada na MESMA sala — o link da paciente continua valendo.');
      return;
    }
    if (saved) _lkClearRoomInfo(); // sala pendente era de OUTRO paciente — não misturar

    // Cria a sala + tokens no backend
    const resp = await fetch('/api/create-session-room', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ patientId: sp && sp.id, patientFirst: sp ? (sp.name || '').split(' ')[0] : null }),
    });
    if (!resp.ok) throw new Error('create-session-room ' + resp.status);
    const { url, hostToken, patientToken, patientCode } = await resp.json();
    // Guardados para gerar o link real da paciente (sala.html) via showSessionLink().
    window._lkPatientToken = patientToken;
    window._lkPatientCode = patientCode || null; // código curto (/sala?c=…) — null se 018 ausente
    window._lkUrl = url;
    window._lkHostToken = hostToken; // permite reconectar à mesma sala (↻)
    // Parte 2/2 da entrada da paciente: publica o link no PORTAL automaticamente ao iniciar.
    // A paciente logada vê o convite "ao vivo" em tempo real (poll em js/13). Além do link
    // WhatsApp (que só salva se a terapeuta copiar/enviar), isto cobre a paciente já logada.
    // Guarda a referência: se o terapeuta navegar p/ outra ficha durante a sessão,
    // o encerrar limpa o link DESTA paciente (não a da ficha aberta no momento).
    window._lkSessionPatient = sp;
    _lkPublishPortalLink(sp);
    _lkSaveRoomInfo(sp); // sala sobrevive a travamento/reload até o encerrar oficial

    await _lkConnectRoom(LK, url, hostToken, false);

    // Timer NÃO começa aqui: dispara em _lkStartTherRecorder, quando a paciente entra —
    // o tempo exibido é o da CONSULTA, não o da espera do terapeuta na sala (F6).
    if (typeof showToast === 'function') showToast('Sessão iniciada · a nota será gerada ao encerrar.');
  } catch (err) {
    console.error('[livekit] start falhou', err);
    // Conexão que falhou no meio deixa _lkRoom "morto" — limpa para o próximo clique
    // não cair no guard de sessão em andamento.
    try { if (_lkRoom && String(_lkRoom.state || '') === 'disconnected') await _lkTeardownMedia(true); } catch (_) {}
    if (typeof showToast === 'function') showToast('⚠ Não foi possível iniciar a sessão: ' + err.message);
  }
}

// Conecta e "cabeia" a sala: eventos, mixer das 2 faixas, medidor, vídeos. Usado
// pelo início normal E pela retomada/reconexão (resume=true preserva os segmentos
// já gravados e a base de offsets — a nota final costura tudo).
async function _lkConnectRoom(LK, url, hostToken, resume) {
  // Qualidade de vídeo: 540p — meio-termo testado. 720p forçado (1,7 Mbps) TRAVAVA
  // o vídeo em conexão residencial/celular; 540p (~0,8 Mbps) fica nítido e fluido,
  // e o simulcast + adaptiveStream degradam sozinhos se a rede cair.
  const _roomOpts = { adaptiveStream: true, dynacast: true };
  try {
    if (LK.VideoPresets && LK.VideoPresets.h540) {
      _roomOpts.videoCaptureDefaults = { resolution: LK.VideoPresets.h540.resolution };
      _roomOpts.publishDefaults = {
        videoEncoding: LK.VideoPresets.h540.encoding,
        videoSimulcastLayers: [LK.VideoPresets.h360, LK.VideoPresets.h180],
      };
    }
  } catch (_) {}
  _lkRoom = new LK.Room(_roomOpts);
  _lkAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // CRÍTICO: o AudioContext nasce "suspended" (foi criado após awaits, fora do gesto do
  // usuário) — sem resume() o MediaStreamDestination sai MUDO e o Whisper alucina. Resume aqui.
  try { if (_lkAudioCtx.state === 'suspended') await _lkAudioCtx.resume(); } catch (_) {}
  // DUAS faixas separadas (não um mix): terapeuta e paciente gravados à parte →
  // transcritos à parte → intercalados por timestamp = transcrição com RÓTULO DE FALANTE.
  _lkMicDest = _lkAudioCtx.createMediaStreamDestination();
  _lkPacDest = _lkAudioCtx.createMediaStreamDestination();
  let _lkMicMixed = false; // garante que o mic do terapeuta entrou na gravação
  if (!resume) { _lkSegsTher = []; _lkSegsPac = []; _lkRecStartMs = 0; }
  _lkEnding = false;

  // Áudio + vídeo do paciente ao serem assinados
  _lkRoom.on(LK.RoomEvent.TrackSubscribed, (track) => {
    try {
      if (track.kind === 'video') { _lkMountRemoteVideo(track.attach()); }
      if (track.kind === 'audio') {
        // 1) PLAYBACK: sem attach() o terapeuta NÃO OUVE a paciente. E no Chrome o áudio
        //    remoto só flui para o WebAudio (mix da transcrição) se também estiver tocando
        //    num elemento de mídia — este attach destrava os dois de uma vez.
        const audioEl = track.attach();
        audioEl.setAttribute('data-lk-remote-audio', '1');
        document.body.appendChild(audioEl);
        // 2) FAIXA DA PACIENTE (gravação efêmera → transcrição com rótulo de falante).
        if (track.mediaStreamTrack) {
          _lkAudioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(_lkPacDest);
          _lkStartTherRecorder(); // gravação SÓ começa com a paciente presente (privacidade)
          _lkStartPacRecorder();
        }
      }
    } catch (e) { console.warn('[livekit] track subscribe', e); }
  });
  // Paciente entrou (mesmo que de mic mudo): inicia a gravação do terapeuta.
  _lkRoom.on(LK.RoomEvent.ParticipantConnected, () => { _lkStartTherRecorder(); });

  // Auditoria B1: queda de rede no meio da consulta deixava "AO VIVO ·
  // capturando" na tela PARA SEMPRE, sem captar mais nada (a sala.html da
  // paciente já tratava desconexão; o lado do terapeuta não). O indicador
  // agora conta a verdade em cada estado da conexão.
  _lkRoom.on(LK.RoomEvent.Reconnecting, () => {
    var txt = document.getElementById('sess-capture-text');
    if (txt) txt.textContent = '⚠ Conexão instável — reconectando…';
    if (typeof showToast === 'function') showToast('⚠ Conexão instável na sessão — tentando reconectar…');
  });
  _lkRoom.on(LK.RoomEvent.Reconnected, () => {
    _lkLiveStatus(); // volta ao status real de captura
    if (typeof showToast === 'function') showToast('✓ Conexão restabelecida — a captura continua.');
  });
  _lkRoom.on(LK.RoomEvent.Disconnected, () => {
    if (_lkEnding) return; // encerramento normal pelo botão — sem alarme
    var el = document.getElementById('sess-capture-status');
    var txt = document.getElementById('sess-capture-text');
    if (el && txt) {
      txt.innerHTML = '⚠ A conexão da sessão caiu — os trechos já gravados estão seguros. '
        + '<button onclick="_lkReconnect()" style="margin-left:6px;background:var(--sage,#4a7c59);color:#fff;border:none;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">↻ Reconectar</button>';
      el.style.display = 'flex';
    }
    if (typeof showToast === 'function') showToast('⚠ A conexão da sessão caiu. Use ↻ Reconectar para voltar SEM perder nada, ou encerre (✕) para transcrever o que já foi gravado.');
  });

  // "Parar compartilhamento" da barrinha do NAVEGADOR (fora da nossa UI) também
  // encerra o share — o botão precisa refletir isso.
  _lkRoom.on(LK.RoomEvent.LocalTrackUnpublished, (pub) => {
    try {
      if (pub && pub.source === LK.Track.Source.ScreenShare) { _lkScreenOn = false; _lkSyncCallCtrls(); }
    } catch (_) {}
  });

  await _lkRoom.connect(url, hostToken);
  await _lkRoom.localParticipant.setCameraEnabled(true);
  await _lkRoom.localParticipant.setMicrophoneEnabled(true);
  // Estados dos controles da chamada voltam ao padrão (mic/câmera ligados, sem
  // share/blur) — vale para início normal E retomada (tracks novos, sem processador).
  _lkMicOn = true; _lkCamOn = true; _lkScreenOn = false; _lkBlurOn = false;
  _lkSyncCallCtrls();

  // Mic local no mixer + vídeo local no canto. O mic pode não estar pronto no mesmo tick
  // após setMicrophoneEnabled — tentamos algumas vezes até o track existir.
  for (let i = 0; i < 10 && !_lkMicMixed; i++) {
    const micPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
    const micTrack = micPub && micPub.track && micPub.track.mediaStreamTrack;
    if (micTrack && micTrack.readyState === 'live') {
      _lkMicSource = _lkAudioCtx.createMediaStreamSource(new MediaStream([micTrack]));
      _lkMicSource.connect(_lkMicDest);
      _lkStartMeter(_lkMicSource); // barrinha ao vivo: confirma que o mic está sendo captado
      _lkMicMixed = true;
      break;
    }
    await new Promise(r => setTimeout(r, 150));
  }
  if (!_lkMicMixed) {
    console.warn('[livekit] mic do terapeuta NAO entrou no mix — transcricao pode sair vazia');
    if (typeof showToast === 'function') showToast('⚠ Não consegui captar seu microfone. Confira em ⚙ Dispositivos se o fone/mic certo está selecionado.');
  }
  const camPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
  if (camPub && camPub.track) _lkMountLocalVideo(camPub.track.attach());

  // 4) GRAVAÇÃO SÓ COMEÇA QUANDO A PACIENTE ENTRA (_lkStartTherRecorder via
  //    ParticipantConnected/TrackSubscribed): mic aberto antes disso captava conversa
  //    alheia à consulta e sujava a transcrição/nota. O medidor 🎤 roda desde já
  //    (testar o mic antes), mas nada é gravado até ela chegar.
  //    v2: no desktop, trocar gravação+/api/transcribe por Whisper ON-DEVICE (Web Worker/WebGPU).
  try { if (_lkAudioCtx.state === 'suspended') await _lkAudioCtx.resume(); } catch (_) {}
  // Cobre o caso de a paciente JÁ estar na sala quando o host conecta (retomada/reconexão).
  try { if (_lkRoom.remoteParticipants && _lkRoom.remoteParticipants.size > 0) _lkStartTherRecorder(); } catch (_) {}
  _lkShowWaitingRemote(); // "aguardando a paciente" até o vídeo dela chegar
}

// Reconecta à MESMA sala sem encerrar (travamento/queda no meio da consulta —
// pedido do usuário 13/07): os segmentos já gravados são PRESERVADOS e a
// transcrição/nota/exercícios continuam acontecendo SÓ no encerramento oficial.
let _lkReconnecting = false;
async function _lkReconnect() {
  if (_lkReconnecting) return;
  const saved = _lkLoadRoomInfo();
  const url = window._lkUrl || (saved && saved.url);
  const hostToken = window._lkHostToken || (saved && saved.hostToken);
  if (!url || !hostToken) {
    if (typeof showToast === 'function') showToast('⚠ Não há sessão recente para reconectar — inicie a sessão normalmente.');
    return;
  }
  _lkReconnecting = true;
  if (typeof showToast === 'function') showToast('↻ Reconectando à sala — os trechos já gravados estão preservados…');
  try {
    const LK = await _lkLoadSdk();
    await _lkTeardownMedia(true); // derruba a conexão morta; segmentos e offsets ficam
    window._lkUrl = url; window._lkHostToken = hostToken;
    if (saved) { // reload zera a memória — restaura o link da paciente do storage
      if (!window._lkPatientToken) window._lkPatientToken = saved.patientToken || null;
      if (!window._lkPatientCode) window._lkPatientCode = saved.patientCode || null;
    }
    const sp = window._lkSessionPatient || _tfSessionPatient();
    window._lkSessionPatient = sp;
    _lkPublishPortalLink(sp); // convite volta ao portal (o encerrar não rodou)
    await _lkConnectRoom(LK, url, hostToken, true);
    if (typeof showToast === 'function') showToast('✓ Reconectado — a captura recomeçou. Encerre no ✕ apenas no fim oficial.');
  } catch (err) {
    console.error('[livekit] reconexao falhou', err);
    if (typeof showToast === 'function') showToast('⚠ Não foi possível reconectar: ' + (err && err.message || err) + '. Os trechos gravados continuam seguros — você pode encerrar para transcrever.');
  } finally { _lkReconnecting = false; }
}

// Gravador da faixa do TERAPEUTA — só inicia quando a paciente ENTRA na sala.
// Antes disso o mic fica aberto (vídeo/medidor) mas NADA é gravado: evita captar
// conversa alheia à consulta e sujar a transcrição/nota (pedido do usuário 07/07).
function _lkStartTherRecorder() {
  if (_lkRecorder || !_lkMicDest) return;
  try {
    // Base de todos os offsets de segmento (as 2 faixas). Numa RECONEXÃO a base é
    // preservada — os segmentos novos continuam na mesma linha do tempo da sessão.
    if (!_lkRecStartMs) _lkRecStartMs = Date.now();
    _lkStartSegRec('ther');
    window.addEventListener('beforeunload', _lkGuardUnload); // avisa se fechar/recarregar gravando
    if (typeof _iniciarTimerSessao === 'function') _iniciarTimerSessao(); // timer conta a partir da entrada da paciente
    if (typeof showToast === 'function') showToast('🔴 Paciente entrou — gravação e transcrição iniciadas.');
  } catch (e) { console.warn('[livekit] ther recorder', e); }
}

// Gravador da faixa da paciente — criado quando o primeiro áudio dela chega.
// O offset de cada segmento (vs início da gravação do terapeuta) alinha os
// timestamps na intercalação — inclusive o atraso da entrada dela.
function _lkStartPacRecorder() {
  if (_lkPacRecorder || !_lkPacDest) return;
  try {
    if (!_lkRecStartMs) _lkRecStartMs = Date.now(); // segurança: base sempre existe
    _lkStartSegRec('pac');
  } catch (e) { console.warn('[livekit] pac recorder', e); }
}

// Placeholder na área de vídeo enquanto a paciente não entra (substitui o pré-estado).
function _lkShowWaitingRemote() {
  const main = document.querySelector('#page-sessao .video-main') || document.querySelector('.video-main');
  if (!main || document.getElementById('lk-wait-remote')) return;
  // Reconexão/retomada: se a paciente JÁ está na sala (ou o vídeo dela já montou),
  // o aviso não deve aparecer — antes ele ficava desenhado POR CIMA do vídeo dela,
  // porque o TrackSubscribed dispara durante o connect(), antes desta chamada (bug 15/07).
  if (document.querySelector('[data-lk-remote-video]')) return;
  try { if (_lkRoom && _lkRoom.remoteParticipants && _lkRoom.remoteParticipants.size > 0) return; } catch (_) {}
  const ph = document.getElementById('whereby-prestate'); if (ph) ph.style.display = 'none';
  const d = document.createElement('div');
  d.id = 'lk-wait-remote';
  d.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#7a8a7d;z-index:1;text-align:center;padding:24px';
  d.innerHTML = '<div style="font-size:34px">⏳</div><div style="font-size:14px">Aguardando a paciente entrar…</div><div style="font-size:12px;opacity:.75">O convite já está no portal dela — ou envie o link pelo 🔗 abaixo.</div><div style="font-size:12px;opacity:.75;display:flex;align-items:center;gap:5px">🔒 A gravação e a transcrição só começam quando ela entrar.</div>';
  main.appendChild(d);
}

// Transcreve um blob de áudio com timestamps por trecho ({ text, segments }).
async function _lkTranscribe(blob) {
  const tr = await fetch('/api/transcribe?segments=1', {
    method: 'POST',
    headers: await _lkAuthHeaders({ 'Content-Type': blob.type || 'audio/webm' }),
    body: blob,
  });
  if (!tr.ok) throw new Error('transcribe ' + tr.status);
  return tr.json();
}

// Intercala os trechos de TODOS os segmentos das duas faixas por tempo absoluto
// (offset do segmento + timestamp do Whisper dentro dele) → diálogo
// "Terapeuta:/Paciente:". Usa 'Paciente' (não o nome real): o transcript segue
// pseudonimizado até o Claude (LGPD). Exportada p/ unit-test node.
function _lkMergeSegments(therResults, therSegs, pacResults, pacSegs) {
  const rows = [];
  const push = (results, segs, who) => {
    (results || []).forEach((r, i) => {
      if (!r) return; // segmento tolerado que falhou (faixa da paciente)
      const off = (segs && segs[i] && segs[i].offsetSec) || 0;
      const segList = (r.segments && r.segments.length) ? r.segments
        : (r.text ? [{ start: 0, text: r.text }] : []); // fallback sem timestamps
      segList.forEach((s) => {
        const t = (s.text || '').trim();
        if (!t) return;
        if (typeof s.no_speech_prob === 'number' && s.no_speech_prob > 0.85) return; // anti-alucinação em silêncio
        rows.push({ at: off + (s.start || 0), who, t });
      });
    });
  };
  push(therResults, therSegs, 'Terapeuta');
  push(pacResults, pacSegs, 'Paciente');
  if (!rows.length) return '';
  rows.sort((a, b) => a.at - b.at);
  const temPac = rows.some((r) => r.who === 'Paciente');
  // Junta falas consecutivas do mesmo falante num parágrafo só
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.who === r.who) last.t += ' ' + r.t;
    else out.push({ who: r.who, t: r.t });
  }
  // Só 1 falante captado → sem rótulo (era o comportamento do fallback de faixa única)
  if (!temPac) return out.map((r) => r.t).join(' ');
  return out.map((r) => r.who + ': ' + r.t).join('\n\n');
}

// ── Modal de processamento pós-sessão ──
// O terapeuta clicava em Encerrar e ficava sem feedback até a nota chegar (10–60s).
// Este modal mostra as etapas + cronômetro: a plataforma está trabalhando.
let _lkProcTimer = null;
function _lkShowProcessing() {
  _lkHideProcessing();
  if (!document.getElementById('lk-proc-css')) {
    const s = document.createElement('style');
    s.id = 'lk-proc-css';
    s.textContent = '@keyframes lkspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  const modal = document.createElement('div');
  modal.id = 'lk-proc-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:430px;box-shadow:0 24px 80px rgba(0,0,0,.3);padding:26px 28px">
      <div style="text-align:center;margin-bottom:18px">
        <div style="width:44px;height:44px;margin:0 auto 12px;border-radius:50%;border:3px solid #e6efe9;border-top-color:#4a7c59;animation:lkspin .9s linear infinite"></div>
        <div style="font-weight:600;font-size:15px;color:#1a1a1a">Preparando sua nota clínica…</div>
        <div style="font-size:12px;color:#888;margin-top:3px">Costuma levar menos de 1 minuto · pode deixar esta tela aberta</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:13px">
        <div id="lk-proc-s1" style="display:flex;gap:8px;align-items:center;color:#999"><span>○</span><span>Encerrando a gravação</span></div>
        <div id="lk-proc-s2" style="display:flex;gap:8px;align-items:center;color:#999"><span>○</span><span>Transcrevendo a conversa</span></div>
        <div id="lk-proc-s3" style="display:flex;gap:8px;align-items:center;color:#999"><span>○</span><span>Gerando a nota clínica com IA</span></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px">
        <span id="lk-proc-elapsed" style="font-size:12px;color:#888">⏱ 0s</span>
        <span style="font-size:11px;color:#999">🔒 áudio processado e descartado</span>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const t0 = Date.now();
  _lkProcTimer = setInterval(() => {
    const el = document.getElementById('lk-proc-elapsed');
    if (el) el.textContent = '⏱ ' + Math.round((Date.now() - t0) / 1000) + 's';
  }, 1000);
}
function _lkProcStep(id, state) { // 'doing' | 'done'
  const row = document.getElementById('lk-proc-' + id);
  if (!row) return;
  const ic = row.firstElementChild;
  if (state === 'doing') { row.style.color = '#3a6248'; row.style.fontWeight = '600'; if (ic) ic.textContent = '⏳'; }
  else { row.style.color = '#4a7c59'; row.style.fontWeight = ''; if (ic) ic.textContent = '✓'; }
}
function _lkHideProcessing() {
  if (_lkProcTimer) { clearInterval(_lkProcTimer); _lkProcTimer = null; }
  const m = document.getElementById('lk-proc-modal'); if (m) m.remove();
}

// Para um MediaRecorder aguardando o blob final — com teto de 4s: um gravador
// TRAVADO (aba congelada, dispositivo removido) não pode travar o encerramento.
function _lkStopRec(rec) {
  return new Promise((resolve) => {
    if (!rec || rec.state === 'inactive') return resolve();
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    try { rec.addEventListener('stop', fin, { once: true }); rec.stop(); } catch (_) { fin(); }
    setTimeout(fin, 4000);
  });
}

// Desmonta a parte de MÍDIA da sessão (gravadores, sala, mixer, vídeos).
// keepSegments=true (reconexão): os blobs gravados e a base de offsets FICAM —
// nada de nota/exercícios aqui; isso é papel do encerramento oficial.
async function _lkTeardownMedia(keepSegments) {
  _lkStopMeter();
  // Fecha o vídeo flutuante e zera os controles da chamada (mudo/câmera/tela/fundo).
  try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (_) {}
  _lkMicOn = true; _lkCamOn = true; _lkScreenOn = false; _lkBlurOn = false;
  _lkSyncCallCtrls();
  _lkEnding = true; // a rotação não abre novo segmento durante o stop
  if (_lkTherRotTimer) { clearTimeout(_lkTherRotTimer); _lkTherRotTimer = null; }
  if (_lkPacRotTimer) { clearTimeout(_lkPacRotTimer); _lkPacRotTimer = null; }
  try { await _lkStopRec(_lkRecorder); } catch (e) { console.warn('[livekit] stop recorder', e); }
  try { await _lkStopRec(_lkPacRecorder); } catch (e) { console.warn('[livekit] stop pac recorder', e); }
  try { if (_lkRoom) await _lkRoom.disconnect(); } catch (_) {}
  try { document.querySelectorAll('[data-lk-remote-audio]').forEach(function (el) { el.remove(); }); } catch (_) {}
  _lkResetVideoArea();
  try { if (_lkAudioCtx) _lkAudioCtx.close(); } catch (_) {}
  _lkRoom = null; _lkAudioCtx = null; _lkRecorder = null; _lkMicDest = null; _lkMicSource = null;
  _lkPacRecorder = null; _lkPacDest = null;
  if (!keepSegments) { _lkSegsTher = []; _lkSegsPac = []; _lkRecStartMs = 0; }
  _lkEnding = false;
}

async function endLiveKitSession() {
  _lkShowProcessing();
  _lkProcStep('s1', 'doing');
  // Fecha os segmentos em andamento (a rotação não abre mais nenhum) e derruba a
  // sala. O onstop de cada gravador empurra o blob autocontido para _lkSegsTher/Pac.
  await _lkTeardownMedia(true);
  const segsTher = _lkSegsTher, segsPac = _lkSegsPac;
  const noPatient = !_lkRecStartMs; // paciente nunca entrou → nada foi gravado (by design)
  _lkSegsTher = []; _lkSegsPac = []; _lkRecStartMs = 0;

  window._lkPatientToken = null; window._lkUrl = null; window._lkPatientCode = null; window._lkHostToken = null; // link expira com a sessão
  _lkClearRoomInfo(); // encerramento oficial — a sala não é mais retomável
  _lkClearPortalLink(window._lkSessionPatient || _tfSessionPatient()); // some o convite do portal
  window._lkSessionPatient = null;
  window.removeEventListener('beforeunload', _lkGuardUnload); // gravação terminou — libera a saída
  if (typeof timerInterval !== 'undefined' && timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; } if (typeof _setSessionLiveUI === 'function') _setSessionLiveUI(false);

  _lkProcStep('s1', 'done');

  const totalBytes = segsTher.reduce((s, x) => s + x.blob.size, 0);
  if (!segsTher.length || totalBytes < 1200) {
    _lkHideProcessing();
    _lkShowPostSession({ transcript: '', note: '', empty: true, noPatient });
    return;
  }

  // Guarda os segmentos para permitir reprocessar (botão "tentar de novo") sem regravar.
  _lkRetry = { segsTher, segsPac };
  await _lkProcessSession();
}

// Transcreve os segmentos das 2 faixas → intercala → gera a nota. Reutilizável no
// retry (usa _lkRetry). Falha NÃO perde nada: os segmentos ficam em _lkRetry.
async function _lkProcessSession() {
  if (!_lkRetry || !_lkRetry.segsTher || !_lkRetry.segsTher.length) return;
  const { segsTher, segsPac } = _lkRetry;
  const sp = _tfSessionPatient();

  // Anotações que o terapeuta digitou ao vivo em #session-ai-note (campo não é
  // tocado até o sucesso da geração, então segue intacto aqui — inclusive num
  // retry). Filtra o template não editado (_notaTemplateTexto) para não mandar
  // pra IA um texto igual "[relato do paciente...]" como se fosse conteúdo real.
  const _notasRaw = (document.getElementById('session-ai-note')?.value || '').trim();
  let _notasManuais = '';
  if (_notasRaw) {
    let _tpl = '';
    try { if (sp && typeof _notaTemplateTexto === 'function') _tpl = _notaTemplateTexto(sp).trim(); } catch (_) {}
    if (_notasRaw !== _tpl) _notasManuais = _notasRaw.slice(0, 4000);
  }

  // Guard defensivo por SEGMENTO (não deveria disparar: 4min a 32kbps ≈ 1MB).
  const LIMITE = 4.4 * 1024 * 1024;
  if (segsTher.concat(segsPac || []).some((s) => s.blob.size > LIMITE)) {
    _lkHideProcessing();
    _lkShowPostSession({ tooLong: true });
    return;
  }

  _lkShowProcessing(); _lkProcStep('s1', 'done'); _lkProcStep('s2', 'doing');
  try {
    // 1) Transcrição de TODOS os segmentos, concorrência 2 (respeita o rate-limit
    //    do /api/transcribe e não satura a conexão). Segmento do TERAPEUTA que
    //    falhar → erro (retry preserva tudo); da PACIENTE → tolerado (vira null,
    //    mesma política de antes com a faixa inteira dela).
    const totalSegs = segsTher.length + (segsPac || []).length;
    let doneSegs = 0;
    const _tick = () => {
      doneSegs++;
      const row = document.getElementById('lk-proc-s2');
      const sp2 = row && row.querySelectorAll('span')[1];
      if (sp2) sp2.textContent = 'Transcrevendo a conversa (' + doneSegs + '/' + totalSegs + ')';
    };
    async function _transcribeAll(segs, tolerante) {
      const out = new Array(segs.length);
      let i = 0;
      async function worker() {
        while (i < segs.length) {
          const k = i++;
          try { out[k] = await _lkTranscribe(segs[k].blob); }
          catch (e) {
            if (!tolerante) throw e;
            console.warn('[livekit] segmento da paciente falhou', e);
            out[k] = null;
          }
          _tick();
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, segs.length) }, worker));
      return out;
    }
    const therRes = await _transcribeAll(segsTher, false);
    const pacRes = (segsPac && segsPac.length) ? await _transcribeAll(segsPac, true) : [];
    const transcript = _lkMergeSegments(therRes, segsTher, pacRes, segsPac || []);
    _lkProcStep('s2', 'done');

    // Sem fala real captada → NÃO gera nota (evita nota fabricada a partir de silêncio).
    if (transcript.replace(/[^\p{L}\p{N}]/gu, '').length < 8) {
      _lkHideProcessing();
      _lkShowPostSession({ transcript, note: '', empty: true });
      return;
    }

    // Funil do diferencial-núcleo: transcrição ok mas nota falhando aparece aqui
    if (typeof tfTrack === 'function') tfTrack('transcricao_concluida');

    // 2) Nota clínica (Claude, transcript pseudonimizado no servidor).
    // Preferência da IA "nota" desligada → só transcrição, sem rascunho de IA
    // (autonomia do terapeuta — item 2 dos desligados).
    let note = '';
    if (typeof _iaPrefOn === 'function' && !_iaPrefOn('nota')) {
      _lkProcStep('s3', 'done');
      if (typeof showToast === 'function') showToast('Nota automática desligada nas Preferências da IA — transcrição pronta para sua escrita.');
    } else {
      _lkProcStep('s3', 'doing');
      var _secArr = []; try { _secArr = (JSON.parse(localStorage.getItem('tf_account')||'{}').secundarias) || []; } catch(_) {}
      const nr = await fetch('/api/session-note', {
        method: 'POST',
        headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ transcript, abordagem: sp && sp.abordagem, abordagemSecundarias: _secArr, notasTerapeuta: _notasManuais }),
      });
      if (!nr.ok) throw new Error('session-note ' + nr.status);
      const _nj = await nr.json();
      note = _nj.note;
      // Medição de custo (16/07): só números p/ o PostHog — nada de conteúdo clínico (regra nº 3).
      try { if (_nj.usage) tfTrack('ia_consumo', { fluxo: 'nota_sessao', tokens_in: _nj.usage.input || 0, tokens_out: _nj.usage.output || 0 }); } catch(_) {}
      // Descarta recusa do Claude (não deve virar nota clínica). Mantém a transcrição real.
      if (_lkIsRefusal(note)) note = '';
      _lkProcStep('s3', 'done');
    }

    // Pré-gera o resumo da jornada JÁ AQUI, em paralelo com a revisão da nota
    // (feedback 13/07: a etapa Jornada demorava porque a IA só começava depois do
    // "Salvar"). Se o terapeuta editar a nota, o salvar regenera; senão o rascunho
    // chega pronto na sequência nota → exercícios → jornada.
    window._lkResumoBase = note || '';
    window._lkResumoPromise = (note && sp && typeof _gerarResumoPortalIA === 'function')
      ? _gerarResumoPortalIA(sp, note).catch(function () { return null; })
      : null;

    _lkSaveDraft(sp, transcript, note, _notasManuais); // rascunho: sobrevive a fechar o navegador antes de salvar
    _lkRetry = null;                    // deu certo — não precisa mais reprocessar
    const ta = document.getElementById('session-ai-note');
    if (ta && note) ta.value = note;
    _lkHideProcessing();
    // O evento do negócio: o pitch inteiro é "nota em 2 min" (só metadado, nunca o texto)
    if (note && typeof tfTrack === 'function') tfTrack('nota_ia_gerada', { origem: 'sessao_ao_vivo' });
    _lkShowPostSession({ transcript, note, notasManuais: _notasManuais });
    if (typeof showToast === 'function') showToast(note ? 'Nota gerada ✓ Revise antes de salvar.' : 'Transcrição pronta ✓ (nota não gerada)');
  } catch (err) {
    console.error('[livekit] pós-sessão falhou', err);
    _lkHideProcessing();
    _lkShowPostSession({ retry: true, errMsg: err.message }); // blobs preservados em _lkRetry
  }
}

// Reprocessa a partir dos blobs guardados (chamado pelo botão do modal de erro).
function _lkRetryProcess() {
  const m = document.getElementById('lk-post-modal'); if (m) m.remove();
  _lkProcessSession();
}

// Detecta recusa/desculpa do modelo para não gravar isso como nota clínica.
function _lkIsRefusal(t) {
  return /^\s*(desculpe|não (é )?poss[ií]vel|não (posso|consigo)|infelizmente não|unable to|i (cannot|can't|am unable))/i.test(String(t || ''));
}

// Modal pós-sessão HONESTO — mostra a transcrição REAL e a nota REAL (sem conteúdo fabricado).
// Estados: default (transcrição+nota) · empty (silêncio) · noPatient · tooLong (áudio > limite) · retry (falhou).
function _lkShowPostSession({ transcript, note, empty, noPatient, tooLong, retry, errMsg, notasManuais }) {
  const old = document.getElementById('lk-post-modal'); if (old) old.remove();
  const esc = (s) => (typeof escHTML === 'function' ? escHTML(s) : String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])));
  const sp = _tfSessionPatient();
  const nome = sp ? sp.name : 'Paciente';
  const isContent = !empty && !tooLong && !retry;

  const emptyBlock = noPatient ? `
    <div style="background:#f0f7f3;border:1px solid #cfe3d6;border-radius:10px;padding:14px 16px;color:#3a6248;font-size:13px;line-height:1.55">
      <strong>A paciente não chegou a entrar na sessão.</strong><br/>
      Por privacidade, <strong>nada foi gravado ou transcrito</strong> — a gravação só começa quando a paciente entra na sala.
    </div>` : `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;color:#9a3412;font-size:13px;line-height:1.55">
      <strong>⚠ Nenhuma fala foi captada nesta gravação.</strong><br/>
      O áudio saiu em silêncio, então <strong>não geramos nota</strong> (para não inventar conteúdo).
      Verifique se o microfone certo está ativo e sem mudo — durante a sessão, a barrinha 🎤 deve se mexer quando você fala.
    </div>`;

  const tooLongBlock = `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;color:#9a3412;font-size:13px;line-height:1.55">
      <strong>⚠ Um trecho da gravação excedeu o limite de envio.</strong><br/>
      Isso não deveria acontecer (a gravação é dividida em partes pequenas automaticamente).
      A gravação continua guardada nesta aba — tente encerrar de novo ou anote os pontos principais
      manualmente e nos avise deste caso.
    </div>`;

  const retryBlock = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;color:var(--red);font-size:13px;line-height:1.55">
      <strong>⚠ Não consegui concluir a transcrição/nota.</strong><br/>
      A gravação desta sessão <strong>ainda está guardada nesta aba</strong> — você pode tentar de novo sem regravar.
      ${errMsg ? `<div style="margin-top:6px;font-size:11px;opacity:.8">Detalhe técnico: ${esc(errMsg)}</div>` : ''}
    </div>`;

  // Aviso de cobrança AUSENTE (pedido do usuário 12/07): sem valor de sessão na
  // ficha nem no Perfil, salvar NÃO cria cobrança — avisar aqui, onde o olho está.
  let chargeWarn = '';
  try {
    const _accW = JSON.parse(localStorage.getItem('tf_account') || '{}');
    if (!(parseFloat((sp && sp.valorSessao) || _accW.valor_sessao) > 0)) {
      chargeWarn = `
    <div style="margin-top:12px;background:#fff8e6;border:1px solid #f0d060;border-radius:10px;padding:10px 14px;color:#8a5a1a;font-size:12.5px;line-height:1.5">
      ◈ <strong>Sem cobrança automática:</strong> a ficha de ${esc(nome)} não tem valor de sessão (nem o Perfil).
      Ao salvar, <strong>nenhuma cobrança será criada</strong> — defina o valor em Pacientes → ✎ Editar para as próximas.
    </div>`;
    }
  } catch (_) {}

  // Anotações que o terapeuta digitou ao vivo — NUNCA descartadas: mostradas aqui
  // intactas (mesmo padrão do modal demo) para conferência, junto com o aviso de
  // que elas já foram incorporadas ao rascunho da IA (api/session-note recebe
  // notasTerapeuta e funde as duas fontes — não é mais "a IA sobrescreve").
  const manualBlock = notasManuais ? `
    <div style="margin-bottom:14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:10px 14px">
      <div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:4px">📝 Suas anotações durante a sessão</div>
      <div style="font-size:12.5px;color:#6b4a12;white-space:pre-wrap;line-height:1.5">${esc(notasManuais)}</div>
    </div>` : '';

  const contentBlock = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Transcrição da sessão (real)</div>
      <div style="background:#f8faf8;border:1px solid #e6efe9;border-radius:10px;padding:12px 14px;font-size:13px;color:#333;line-height:1.6;max-height:180px;overflow-y:auto;white-space:pre-wrap">${esc(transcript)}</div>
    </div>
    ${manualBlock}
    <div>
      <div style="font-size:11px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">✦ Nota clínica — rascunho gerado pela IA</div>
      <textarea id="lk-post-note" style="width:100%;box-sizing:border-box;min-height:200px;border:1.5px solid #d1e7d9;border-radius:10px;padding:12px 14px;font-size:13px;font-family:'DM Sans',sans-serif;line-height:1.6;resize:vertical;outline:none">${esc(note)}</textarea>
      <div style="font-size:11px;color:#999;margin-top:6px">Revise e edite antes de salvar no prontuário. A gravação de áudio não foi armazenada.${notasManuais ? ' Suas anotações acima já foram incorporadas ao rascunho — confira.' : ''}</div>${chargeWarn}
    </div>`;

  const bodyHTML = isContent ? contentBlock : tooLong ? tooLongBlock : retry ? retryBlock : emptyBlock;
  const icon = isContent ? '✅' : retry ? '⚠️' : tooLong ? '⏱️' : (noPatient ? '🔒' : '⚠️');
  const subtitle = isContent ? 'Transcrição e nota geradas a partir da conversa'
    : retry ? 'A gravação está guardada — dá para tentar de novo'
    : tooLong ? 'Sessão longa demais para a transcrição automática'
    : (noPatient ? 'A paciente não entrou — nada foi gravado' : 'Sem áudio para transcrever');

  // Botões: Salvar (só no conteúdo) · Tentar de novo (só no retry) · Fechar (com confirmação se há nota não salva)
  const closeGuard = isContent
    ? `if(confirm('Fechar sem salvar? A nota desta sessão não será guardada no prontuário.')){document.getElementById('lk-post-modal').remove();}`
    : `document.getElementById('lk-post-modal').remove();`;

  const modal = document.createElement('div');
  modal.id = 'lk-post-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3)">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:18px">${icon}</div>
        <div><div style="font-weight:600;font-size:15px;color:#1a1a1a">Sessão encerrada · ${esc(nome)}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${subtitle}</div></div>
      </div>
      <div style="padding:20px 24px">${bodyHTML}</div>
      <div style="padding:12px 24px 20px;display:flex;gap:8px;border-top:1px solid #f0f0f0;justify-content:flex-end">
        <button onclick="${closeGuard}" style="padding:10px 16px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555">Fechar</button>
        ${retry ? `<button onclick="_lkRetryProcess()" style="padding:10px 18px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">↻ Tentar de novo</button>` : ''}
        ${isContent ? `<button onclick="_lkSalvarNotaPostSessao()" style="padding:10px 18px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">✓ Salvar no prontuário</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// Salva a nota revisada e NUTRE a plataforma inteira — delega ao indexPostSession
// (o mesmo motor do fluxo clássico): prontuário + contador de sessões + presença no
// agendamento + "Minha jornada" do portal + cobrança no financeiro + registro de
// sessão (trial) + etapa de exercícios + evidências da Supervisão.
function _lkSalvarNotaPostSessao() {
  const ta = document.getElementById('lk-post-note');
  const texto = ta ? ta.value.trim() : '';
  if (!texto) { if (typeof showToast === 'function') showToast('⚠ A nota está vazia.'); return; }
  const sp = _tfSessionPatient();
  // indexPostSession lê a nota de #session-ai-note — injeta o texto revisado lá.
  const sideTa = document.getElementById('session-ai-note');
  if (sideTa) sideTa.value = texto;
  const m = document.getElementById('lk-post-modal'); if (m) m.remove();
  _lkClearDraft(); _lkRetry = null; // salvo com sucesso — descarta rascunho de recuperação
  if (typeof indexPostSession === 'function') indexPostSession();

  // Resumo acessível p/ a paciente ler no portal ("Minha jornada") — no fluxo clássico
  // era gerado pelo modal legado; aqui salvamos no appointment que o indexPostSession
  // marcou (_pendingResumoApptId). O resumo foi PRÉ-GERADO junto com a nota
  // (_lkResumoPromise): se a nota não mudou, chega pronto; se mudou (ou a pré-geração
  // falhou), regenera a partir do texto revisado.
  if (sp && typeof _gerarResumoPortalIA === 'function') {
    var _pre = (window._lkResumoPromise && String(window._lkResumoBase || '').trim() === texto)
      ? window._lkResumoPromise : null;
    window._lkResumoPromise = null; window._lkResumoBase = '';
    (_pre || Promise.resolve(null)).then(function (pronto) {
      return pronto || _gerarResumoPortalIA(sp, texto);
    }).then(function (resumo) {
      if (!resumo || typeof _pendingResumoApptId === 'undefined' || !_pendingResumoApptId) return;
      var appt = (typeof appointments !== 'undefined' ? appointments : [])
        .find(function (a) { return String(a.id) === String(_pendingResumoApptId); });
      if (appt) {
        // RASCUNHO, não publicação: nada chega ao paciente sem aprovação do
        // terapeuta. Por isso também NÃO espelha em sp.appointments (payload do
        // portal). A revisão agora abre AQUI, como última etapa do fluxo
        // pós-sessão (pedido do usuário 12/07): transcrição → nota → exercícios
        // → jornada. "Deixar para depois" preserva o pendente na Trajetória.
        appt.resumoPendente = resumo;
        if (typeof _salvarAppointments === 'function') _salvarAppointments();
        _lkAbrirRevisaoJornada(String(appt.id));
      }
      _pendingResumoApptId = null;
    }).catch(function () {});
  }
}

// Última etapa do pós-sessão: revisão do resumo da jornada da paciente na mesma
// sentada. Espera os modais anteriores do fluxo fecharem (nota/exercícios) e abre
// o rascunho para editar + publicar; publicar reaproveita salvarResumoParaPaciente
// (js/06 — o mesmo caminho da Trajetória, que espelha no payload do portal).
function _lkAbrirRevisaoJornada(apptId) {
  var tent = 0;
  var iv = setInterval(function () {
    // Espera TODA a sequência anterior: nota (lk-post-modal), exercícios
    // (modal-exercise-pos) e qualquer modal clássico aberto — a Jornada é a última etapa.
    var ocupado = document.querySelector('.modal-overlay.open')
      || document.getElementById('lk-post-modal')
      || document.getElementById('modal-exercise-pos');
    if (ocupado && ++tent < 150) return; // espera até ~2,5min; depois desiste (fica na Trajetória)
    clearInterval(iv);
    if (ocupado) return;
    var appt = (typeof appointments !== 'undefined' ? appointments : [])
      .find(function (a) { return String(a.id) === String(apptId); });
    if (!appt || !appt.resumoPendente || document.getElementById('lk-jornada-modal')) return;
    var sp = _tfSessionPatient();
    var primeiro = sp && sp.name ? sp.name.split(' ')[0] : 'a paciente';
    var m = document.createElement('div');
    m.id = 'lk-jornada-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    m.innerHTML = '<div style="background:var(--white);border-radius:16px;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3)">'
      + '<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">'
      + '<div style="width:38px;height:38px;border-radius:50%;background:#f3f0ff;display:flex;align-items:center;justify-content:center;font-size:18px">📅</div>'
      + '<div><div style="font-weight:600;font-size:15px;color:#1a1a1a">Resumo da jornada · para ' + escHTML(primeiro) + '</div>'
      + '<div style="font-size:12px;color:#888;margin-top:2px">Última etapa da sessão — só chega ao portal depois que você publicar</div></div></div>'
      + '<div style="padding:18px 22px">'
      + '<textarea id="resumo-pac-' + escHTML(String(appt.id)) + '" style="width:100%;box-sizing:border-box;min-height:150px;border:1.5px solid #f0d060;background:#fffdf5;border-radius:10px;padding:12px 14px;font-size:13px;font-family:\'DM Sans\',sans-serif;line-height:1.6;resize:vertical;outline:none">' + escHTML(appt.resumoPendente) + '</textarea>'
      + '<div style="font-size:11px;color:#999;margin-top:6px">Linguagem acessível, sem jargão — é o que aparece em "Minha jornada" no portal.</div>'
      + '</div>'
      + '<div style="padding:12px 22px 18px;display:flex;gap:8px;border-top:1px solid #f0f0f0;justify-content:flex-end">'
      + '<button onclick="document.getElementById(\'lk-jornada-modal\').remove();if(typeof showToast===\'function\')showToast(\'🕓 Rascunho guardado — publique quando quiser em Pacientes → Visão Geral → Trajetória.\')" style="padding:10px 16px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555">Deixar para depois</button>'
      + '<button onclick="_lkPublicarJornada(\'' + escHTML(String(appt.id)) + '\')" style="padding:10px 18px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">✓ Publicar para ' + escHTML(primeiro) + '</button>'
      + '</div></div>';
    document.body.appendChild(m);
  }, 1000);
}

function _lkPublicarJornada(apptId) {
  var sp = _tfSessionPatient();
  var pIdx = (typeof patients !== 'undefined') ? patients.indexOf(sp) : -1;
  if (pIdx < 0) pIdx = (typeof currentSessionPatientIdx !== 'undefined') ? currentSessionPatientIdx : 0;
  salvarResumoParaPaciente(pIdx, apptId); // publica + espelha no portal + toast
  var m = document.getElementById('lk-jornada-modal'); if (m) m.remove();
}

// Montagem de vídeo — dentro do card da sessão (.video-main), SEM quebrar o layout:
// elementos ABSOLUTOS (fora do fluxo — antes o vídeo em retrato do celular da paciente
// estourava o card e desalinhava a página inteira) + object-fit:contain (mostra o rosto
// inteiro com barras laterais, sem cortar).
function _lkMountRemoteVideo(el) {
  const main = document.querySelector('#page-sessao .video-main') || document.querySelector('.video-main');
  if (!main) return;
  const ph = document.getElementById('whereby-prestate'); if (ph) ph.style.display = 'none';
  const wait = document.getElementById('lk-wait-remote'); if (wait) wait.remove();
  document.querySelectorAll('[data-lk-remote-video]').forEach((v) => v.remove()); // troca de track → sem duplicar
  el.setAttribute('data-lk-remote-video', '1');
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0a0f0b;z-index:1';
  main.appendChild(el);
}
function _lkMountLocalVideo(el) {
  document.querySelectorAll('[data-lk-local-video]').forEach((v) => v.remove()); // troca de câmera → sem duplicar
  el.muted = true;
  el.setAttribute('data-lk-local-video', '1');
  el.style.cssText = 'position:absolute;bottom:14px;right:14px;width:150px;aspect-ratio:4/3;object-fit:cover;border-radius:10px;z-index:3;box-shadow:0 4px 12px rgba(0,0,0,.4);background:#111';
  const main = document.querySelector('#page-sessao .video-main') || document.querySelector('.video-main');
  if (main) main.appendChild(el);
}
// Restaura a área de vídeo ao encerrar (remove vídeos/espera e devolve o pré-estado).
function _lkResetVideoArea() {
  try {
    document.querySelectorAll('[data-lk-remote-video],[data-lk-local-video]').forEach((v) => v.remove());
    const wait = document.getElementById('lk-wait-remote'); if (wait) wait.remove();
    const ph = document.getElementById('whereby-prestate'); if (ph) ph.style.display = '';
  } catch (_) {}
}

// ── DISPOSITIVOS (mic/câmera/saída) — feedback do co-teste 13/07: o fone no
// notebook "custou a ser detectado" e não havia onde escolher. Painel simples
// para trocar AO VIVO, sem derrubar a sessão. ──
async function _lkAbrirDispositivos() {
  const old = document.getElementById('lk-dev-modal'); if (old) { old.remove(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    if (typeof showToast === 'function') showToast('⚠ Este navegador não permite listar dispositivos.');
    return;
  }
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (_) {}
  const esc = (s) => (typeof escHTML === 'function' ? escHTML(String(s || '')) : String(s || '').replace(/[<>&"]/g, ''));
  const kinds = [
    { kind: 'audioinput', label: '🎤 Microfone' },
    { kind: 'videoinput', label: '📷 Câmera' },
    { kind: 'audiooutput', label: '🔊 Saída de som' },
  ];
  const wrap = document.createElement('div');
  wrap.id = 'lk-dev-modal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px';
  wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
  const rows = kinds.map(function (k) {
    const list = devs.filter(function (d) { return d.kind === k.kind; });
    if (!list.length) return '';
    let active = null;
    try { active = _lkRoom ? _lkRoom.getActiveDevice(k.kind) : null; } catch (_) {}
    return '<label style="display:block;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.4px;margin:12px 0 5px">' + k.label + '</label>'
      + '<select onchange="_lkTrocarDispositivo(\'' + k.kind + '\', this.value)" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d1e7d9;border-radius:10px;font-size:13px;font-family:inherit;background:var(--white);outline:none">'
      + list.map(function (d, i) {
          return '<option value="' + esc(d.deviceId) + '"' + (active && active === d.deviceId ? ' selected' : '') + '>'
            + esc(d.label || (k.label.replace(/^\S+\s/, '') + ' ' + (i + 1))) + '</option>';
        }).join('')
      + '</select>';
  }).join('');
  wrap.innerHTML = '<div style="background:var(--white);border-radius:16px;width:100%;max-width:400px;box-shadow:0 24px 80px rgba(0,0,0,.3);padding:22px 24px">'
    + '<div style="font-weight:600;font-size:15px;color:#1a1a1a">Dispositivos de áudio e vídeo</div>'
    + '<div style="font-size:12px;color:#888;margin-top:2px">A troca vale na hora — a sessão não cai. Fale e confira a barrinha 🎤.</div>'
    + rows
    + (!_lkRoom ? '<div style="margin-top:12px;background:#fff8e6;border:1px solid #f0d060;border-radius:10px;padding:9px 12px;color:#8a5a1a;font-size:12px;line-height:1.5">A sessão ainda não começou — a troca é aplicada quando a sala estiver aberta.</div>' : '')
    + '<button onclick="document.getElementById(\'lk-dev-modal\').remove()" style="margin-top:16px;width:100%;padding:11px;background:#4a7c59;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>'
    + '</div>';
  document.body.appendChild(wrap);
}

async function _lkTrocarDispositivo(kind, deviceId) {
  if (!_lkRoom) {
    if (typeof showToast === 'function') showToast('▶ Inicie a sessão para aplicar a troca de dispositivo.');
    return;
  }
  try {
    await _lkRoom.switchActiveDevice(kind, deviceId);
    if (kind === 'audioinput') {
      // Religa o MIXER da transcrição: a gravação capta o _lkMicDest, que estava
      // ligado ao track ANTIGO — sem isto o fone novo sai no vídeo mas NÃO entra na nota.
      try { if (_lkMicSource) _lkMicSource.disconnect(); } catch (_) {}
      _lkStopMeter();
      const LK = window.LivekitClient;
      for (let i = 0; i < 10; i++) {
        const pub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
        const trk = pub && pub.track && pub.track.mediaStreamTrack;
        if (trk && trk.readyState === 'live' && _lkAudioCtx && _lkMicDest) {
          _lkMicSource = _lkAudioCtx.createMediaStreamSource(new MediaStream([trk]));
          _lkMicSource.connect(_lkMicDest);
          _lkStartMeter(_lkMicSource);
          break;
        }
        await new Promise(function (r) { setTimeout(r, 150); });
      }
    }
    if (kind === 'videoinput') {
      const LK2 = window.LivekitClient;
      const camPub = _lkRoom.localParticipant.getTrackPublication(LK2.Track.Source.Camera);
      if (camPub && camPub.track) _lkMountLocalVideo(camPub.track.attach());
      _lkReapplyBlur(); // câmera nova = track novo — o desfoque não migra sozinho
    }
    if (typeof showToast === 'function') showToast('✓ Dispositivo alterado.');
  } catch (e) {
    console.warn('[livekit] trocar dispositivo', e);
    if (typeof showToast === 'function') showToast('⚠ Não consegui trocar o dispositivo: ' + (e && e.message || e));
  }
}

// ── CONTROLES DA CHAMADA (pedido do fundador 15/07): mudo, câmera, compartilhar
// tela, fundo desfocado e vídeo flutuante (PiP). Botões em .video-controls
// (app.html, ids lk-btn-*). Tudo exige sala ativa; fora dela, toast honesto. ──
var _lkMicOn = true, _lkCamOn = true, _lkScreenOn = false, _lkBlurOn = false;
var _lkProcsPromise = null; // @livekit/track-processors sob demanda (só quem usa o blur baixa)

function _lkSyncCallCtrls() {
  var st = [['lk-btn-mic', !_lkMicOn, 'off'], ['lk-btn-cam', !_lkCamOn, 'off'],
            ['lk-btn-screen', _lkScreenOn, 'sharing'], ['lk-btn-blur', _lkBlurOn, 'sharing']];
  st.forEach(function (s) {
    var b = document.getElementById(s[0]);
    if (b) { b.classList.remove('off', 'sharing'); if (s[1]) b.classList.add(s[2]); }
  });
}

function _lkExigeSala() {
  if (_lkRoom) return true;
  if (typeof showToast === 'function') showToast('▶ Inicie a sessão para usar este controle.');
  return false;
}

async function _lkToggleMic() {
  if (!_lkExigeSala()) return;
  var alvo = !_lkMicOn;
  try {
    await _lkRoom.localParticipant.setMicrophoneEnabled(alvo);
    _lkMicOn = alvo;
    if (_lkMicOn) {
      // Religa o MIXER da transcrição no track ATUAL (mesmo caminho comprovado da
      // troca de dispositivo): se o navegador recriou o track no unmute, o mixer
      // antigo apontaria para um track morto e a nota sairia sem a sua voz.
      try { if (_lkMicSource) _lkMicSource.disconnect(); } catch (_) {}
      _lkStopMeter();
      var LK = window.LivekitClient;
      for (var i = 0; i < 10; i++) {
        var pub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
        var trk = pub && pub.track && pub.track.mediaStreamTrack;
        if (trk && trk.readyState === 'live' && _lkAudioCtx && _lkMicDest) {
          _lkMicSource = _lkAudioCtx.createMediaStreamSource(new MediaStream([trk]));
          _lkMicSource.connect(_lkMicDest);
          _lkStartMeter(_lkMicSource);
          break;
        }
        await new Promise(function (r) { setTimeout(r, 150); });
      }
    }
    _lkSyncCallCtrls();
    // Honestidade: o mudo silencia a chamada E a transcrição (o mixer recebe silêncio).
    if (typeof showToast === 'function') showToast(_lkMicOn
      ? '🎤 Microfone reativado.'
      : '🔇 Microfone silenciado — sua voz não entra na chamada nem na transcrição.');
  } catch (e) {
    console.warn('[livekit] toggle mic', e);
    if (typeof showToast === 'function') showToast('⚠ Não consegui alterar o microfone: ' + (e && e.message || e));
  }
}

async function _lkToggleCam() {
  if (!_lkExigeSala()) return;
  var alvo = !_lkCamOn;
  try {
    await _lkRoom.localParticipant.setCameraEnabled(alvo);
    _lkCamOn = alvo;
    if (_lkCamOn) {
      // Religar cria um track NOVO: remonta a prévia local e reaplica o desfoque.
      var LK = window.LivekitClient;
      var pub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
      if (pub && pub.track) _lkMountLocalVideo(pub.track.attach());
      _lkReapplyBlur();
    } else {
      document.querySelectorAll('[data-lk-local-video]').forEach(function (v) { v.remove(); });
    }
    _lkSyncCallCtrls();
    if (typeof showToast === 'function') showToast(_lkCamOn ? '📷 Câmera ligada.' : 'Câmera desligada — a paciente não vê sua imagem.');
  } catch (e) {
    console.warn('[livekit] toggle cam', e);
    if (typeof showToast === 'function') showToast('⚠ Não consegui alterar a câmera: ' + (e && e.message || e));
  }
}

async function _lkToggleScreen() {
  if (!_lkExigeSala()) return;
  try {
    if (_lkScreenOn) {
      await _lkRoom.localParticipant.setScreenShareEnabled(false);
      _lkScreenOn = false;
      if (typeof showToast === 'function') showToast('Compartilhamento de tela encerrado.');
    } else {
      await _lkRoom.localParticipant.setScreenShareEnabled(true);
      _lkScreenOn = true;
      if (typeof showToast === 'function') showToast('🖥 Tela compartilhada — a paciente está vendo sua tela. Pare no mesmo botão ou na barrinha do navegador.');
    }
    _lkSyncCallCtrls();
  } catch (e) {
    // Cancelar o seletor de tela do navegador NÃO é erro — sem alarde.
    if (!/NotAllowed|Permission denied|cancel/i.test(String(e && e.message || e))) {
      console.warn('[livekit] screen share', e);
      if (typeof showToast === 'function') showToast('⚠ Não consegui compartilhar a tela: ' + (e && e.message || e));
    }
  }
}

function _lkLoadProcs() {
  if (!_lkProcsPromise) {
    _lkProcsPromise = import('https://cdn.jsdelivr.net/npm/@livekit/track-processors@0.7.2/+esm')
      .catch(function (e) { _lkProcsPromise = null; throw e; });
  }
  return _lkProcsPromise;
}

async function _lkToggleBlur() {
  if (!_lkExigeSala()) return;
  var LK = window.LivekitClient;
  var pub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
  if (!pub || !pub.track) {
    if (typeof showToast === 'function') showToast('⚠ Ligue a câmera para desfocar o fundo.');
    return;
  }
  try {
    if (typeof showToast === 'function' && !_lkBlurOn) showToast('Preparando o desfoque…');
    var mod = await _lkLoadProcs();
    if (typeof mod.supportsBackgroundProcessors === 'function' && !mod.supportsBackgroundProcessors()) {
      if (typeof showToast === 'function') showToast('⚠ Este navegador não suporta o fundo desfocado (funciona no Chrome/Edge recentes).');
      return;
    }
    if (_lkBlurOn) {
      await pub.track.stopProcessor();
      _lkBlurOn = false;
      if (typeof showToast === 'function') showToast('Fundo desfocado desligado.');
    } else {
      await pub.track.setProcessor(mod.BackgroundBlur(10));
      _lkBlurOn = true;
      if (typeof showToast === 'function') showToast('✓ Fundo desfocado ativo.');
    }
    _lkSyncCallCtrls();
  } catch (e) {
    console.warn('[livekit] blur', e);
    if (typeof showToast === 'function') showToast('⚠ Não consegui aplicar o desfoque: ' + (e && e.message || e));
  }
}

// Track de câmera NOVO (religar/troca de dispositivo) não herda o processador —
// reaplica em silêncio se o desfoque estava ligado.
async function _lkReapplyBlur() {
  if (!_lkBlurOn || !_lkRoom) return;
  try {
    var LK = window.LivekitClient;
    var pub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
    if (pub && pub.track) {
      var mod = await _lkLoadProcs();
      await pub.track.setProcessor(mod.BackgroundBlur(10));
    }
  } catch (e) {
    console.warn('[livekit] reapply blur', e);
    _lkBlurOn = false;
    _lkSyncCallCtrls();
  }
}

async function _lkTogglePip() {
  var v = document.querySelector('[data-lk-remote-video]');
  if (!v) {
    if (typeof showToast === 'function') showToast('⚠ O vídeo da paciente ainda não chegou — o flutuante abre a imagem dela.');
    return;
  }
  try {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
    if (v.requestPictureInPicture) {
      await v.requestPictureInPicture();
      if (typeof showToast === 'function') showToast('✓ Vídeo flutuante aberto — ele te acompanha em outras telas e apps.');
    } else if (v.webkitSetPresentationMode) {
      v.webkitSetPresentationMode('picture-in-picture');
    } else if (typeof showToast === 'function') {
      showToast('⚠ Este navegador não suporta o vídeo flutuante.');
    }
  } catch (e) {
    console.warn('[livekit] pip', e);
    if (typeof showToast === 'function') showToast('⚠ Não consegui abrir o vídeo flutuante: ' + (e && e.message || e));
  }
}

// PiP AUTOMÁTICO ao navegar (pedido 15/07): com sessão ativa, sair da página
// Sessão abre o vídeo flutuante (estamos dentro do gesto de clique — o navegador
// permite); voltar fecha. Envelopa o navigate global SEM tocar no js/02 — os
// guards de sessão de lá continuam valendo (o original roda primeiro).
(function () {
  var orig = window.navigate;
  if (typeof orig !== 'function') return;
  window.navigate = function (page) {
    var r = orig.apply(this, arguments);
    try {
      if (_lkRoom && String(_lkRoom.state || '') === 'connected' && document.pictureInPictureEnabled) {
        var v = document.querySelector('[data-lk-remote-video]');
        if (page !== 'sessao' && v && !document.pictureInPictureElement) {
          v.requestPictureInPicture().catch(function () {});
        } else if (page === 'sessao' && document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(function () {});
        }
      }
    } catch (_) {}
    return r;
  };
})();
