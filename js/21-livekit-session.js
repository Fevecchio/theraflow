// 21-livekit-session.js — Sessão de vídeo LiveKit + captura de áudio → transcrição → nota clínica IA.
//
// STATUS: FUNDAÇÃO (escrita antes das chaves). A ATIVAÇÃO final (ligar os botões + carregar o
// <script> do LiveKit + teste E2E) acontece na fase de teste, com LIVEKIT_*/GROQ_API_KEY no Vercel.
// Este arquivo é DORMENTE até ser adicionado ao HTML e os botões apontarem para startLiveKitSession/
// endLiveKitSession — por isso não altera o comportamento atual do app.
//
// Requer no HTML (adicionar na fase de wiring):
//   <script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js" defer></script>
//   → expõe o global window.LivekitClient
// Requer env no Vercel: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, GROQ_API_KEY.

// FEATURE FLAG — default OFF. Enquanto false, o app usa o fluxo de sessão atual (Whereby/simulado)
// e NADA aqui roda em produção. Ligar para a fase de teste E2E (com as chaves LIVEKIT_*/GROQ no Vercel):
//   • ?livekit=1 na URL, ou  • localStorage.setItem('tf_livekit','1')  — sem precisar de novo deploy.
window._TF_LIVEKIT_ENABLED = (function () {
  try {
    if (localStorage.getItem('tf_livekit') === '1') return true;
    if (/[?&]livekit=1\b/.test(location.search)) return true;
  } catch (_) {}
  return false;
})();

// Consentimento LGPD por sessão (in-memory). Gate obrigatório antes de iniciar o LiveKit.
window._tfSessionConsent = window._tfSessionConsent || null;

// Chamado pelo botão "Iniciar" quando o LiveKit está ligado: exige consentimento antes de conectar.
function _startSessionWithConsent() {
  const sp = patients[currentSessionPatientIdx] || patients[0];
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
  const sp = patients[currentSessionPatientIdx] || patients[0];
  const pid = sp && sp.id;
  window._tfSessionConsent = { patientId: pid, at: Date.now() };
  if (typeof _logConsent === 'function' && /^[0-9a-f-]{36}$/i.test(pid || '')) {
    _logConsent('gravacao_sessao', { patientId: pid });
  }
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
let _lkRecorder = null;
let _lkChunks = [];
let _lkAudioCtx = null;

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

async function startLiveKitSession() {
  const LK = window.LivekitClient;
  if (!LK) { if (typeof showToast === 'function') showToast('⚠ Biblioteca de vídeo (LiveKit) não carregada.'); return; }
  const sp = patients[currentSessionPatientIdx] || patients[0];

  try {
    // Consentimento já foi registrado pelo gate (_startSessionWithConsent → modal-consent →
    // confirmarConsentimentoSessao → _logConsent). Aqui apenas conectamos.

    // Cria a sala + tokens no backend
    const resp = await fetch('/api/create-session-room', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ patientId: sp && sp.id }),
    });
    if (!resp.ok) throw new Error('create-session-room ' + resp.status);
    const { url, hostToken, patientToken } = await resp.json();
    window._lkPatientToken = patientToken; // usado para o paciente entrar (portal / link)

    // 3) Conecta como host e prepara o mixer de áudio (para gravação efêmera)
    _lkRoom = new LK.Room({ adaptiveStream: true, dynacast: true });
    _lkAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const mixDest = _lkAudioCtx.createMediaStreamDestination();
    _lkChunks = [];

    // Áudio + vídeo do paciente ao serem assinados
    _lkRoom.on(LK.RoomEvent.TrackSubscribed, (track) => {
      try {
        if (track.kind === 'video') { _lkMountRemoteVideo(track.attach()); }
        if (track.kind === 'audio' && track.mediaStreamTrack) {
          _lkAudioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(mixDest);
        }
      } catch (e) { console.warn('[livekit] track subscribe', e); }
    });

    await _lkRoom.connect(url, hostToken);
    await _lkRoom.localParticipant.setCameraEnabled(true);
    await _lkRoom.localParticipant.setMicrophoneEnabled(true);

    // Mic local no mixer + vídeo local no canto
    const micPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
    const micTrack = micPub && micPub.track && micPub.track.mediaStreamTrack;
    if (micTrack) _lkAudioCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(mixDest);
    const camPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
    if (camPub && camPub.track) _lkMountLocalVideo(camPub.track.attach());

    // 4) Grava o áudio MIXADO (efêmero — só para transcrever; nada é enviado ao servidor até o fim)
    //    v2: no desktop, trocar esta gravação+/api/transcribe por Whisper ON-DEVICE (Web Worker/WebGPU).
    _lkRecorder = new MediaRecorder(mixDest.stream, { mimeType: _pickAudioMime() });
    _lkRecorder.ondataavailable = (e) => { if (e.data && e.data.size) _lkChunks.push(e.data); };
    _lkRecorder.start(1000);

    if (typeof _iniciarTimerSessao === 'function') _iniciarTimerSessao();
    if (typeof showToast === 'function') showToast('Sessão iniciada · a nota será gerada ao encerrar.');
  } catch (err) {
    console.error('[livekit] start falhou', err);
    if (typeof showToast === 'function') showToast('⚠ Não foi possível iniciar a sessão: ' + err.message);
  }
}

async function endLiveKitSession() {
  // Para a gravação e coleta o blob
  let audioBlob = null;
  try {
    if (_lkRecorder && _lkRecorder.state !== 'inactive') {
      await new Promise((resolve) => { _lkRecorder.onstop = resolve; _lkRecorder.stop(); });
    }
    if (_lkChunks.length) audioBlob = new Blob(_lkChunks, { type: (_lkChunks[0] && _lkChunks[0].type) || 'audio/webm' });
  } catch (e) { console.warn('[livekit] stop recorder', e); }
  _lkChunks = [];

  try { if (_lkRoom) await _lkRoom.disconnect(); } catch (_) {}
  try { if (_lkAudioCtx) _lkAudioCtx.close(); } catch (_) {}
  _lkRoom = null; _lkAudioCtx = null; _lkRecorder = null;
  if (typeof timerInterval !== 'undefined' && timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }

  if (!audioBlob) {
    if (typeof showToast === 'function') showToast('Sessão encerrada (sem áudio para transcrever).');
    if (typeof showPostSessionFlow === 'function') showPostSessionFlow();
    return;
  }

  // Pós-sessão: transcreve → nota clínica
  try {
    if (typeof showToast === 'function') showToast('Transcrevendo e gerando a nota…');
    // 1) Transcrição (v1: Groq cloud; v2: substituída por on-device no desktop)
    const tr = await fetch('/api/transcribe', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': audioBlob.type || 'audio/webm' }),
      body: audioBlob,
    });
    if (!tr.ok) throw new Error('transcribe ' + tr.status);
    const { text } = await tr.json();

    // 2) Nota clínica (Claude, transcript pseudonimizado no servidor)
    const sp = patients[currentSessionPatientIdx] || patients[0];
    const nr = await fetch('/api/session-note', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ transcript: text, abordagem: sp && sp.abordagem }),
    });
    if (!nr.ok) throw new Error('session-note ' + nr.status);
    const { note } = await nr.json();

    const ta = document.getElementById('session-ai-note');
    if (ta) ta.value = note;
    if (typeof showPostSessionFlow === 'function') showPostSessionFlow();
    if (typeof showToast === 'function') showToast('Nota gerada ✓ Revise antes de salvar no prontuário.');
  } catch (err) {
    console.error('[livekit] pós-sessão falhou', err);
    if (typeof showToast === 'function') showToast('⚠ Falha ao gerar a nota: ' + err.message);
  }
}

// Montagem de vídeo — adaptar aos containers reais (#video-main / #whereby-wrapper) na fase de wiring
function _lkMountRemoteVideo(el) {
  const wrap = document.getElementById('whereby-wrapper') || document.querySelector('.video-main');
  if (!wrap) return;
  const ph = document.getElementById('whereby-prestate'); if (ph) ph.style.display = 'none';
  el.style.cssText = 'width:100%;height:100%;object-fit:cover';
  wrap.appendChild(el);
}
function _lkMountLocalVideo(el) {
  el.muted = true;
  el.style.cssText = 'position:absolute;bottom:14px;right:14px;width:120px;border-radius:10px;z-index:3;box-shadow:0 4px 12px rgba(0,0,0,.4)';
  const main = document.querySelector('.video-main');
  if (main) main.appendChild(el);
}
