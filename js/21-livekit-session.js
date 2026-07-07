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
let _lkAnalyser = null;
let _lkMeterRAF = null;
let _lkLastTranscript = '';

// Medidor de áudio ao vivo — confirma visualmente que o mic está sendo captado.
function _lkStartMeter(sourceNode) {
  try {
    _lkAnalyser = _lkAudioCtx.createAnalyser();
    _lkAnalyser.fftSize = 1024;
    sourceNode.connect(_lkAnalyser); // paralelo ao mixDest — o que alimenta o medidor também vai pra gravação
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
    let sawSound = false;
    const tick = () => {
      if (!_lkAnalyser) return;
      _lkAnalyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const pct = Math.min(100, Math.round(rms * 900));
      const fill = document.getElementById('lk-mic-fill');
      const lbl = document.getElementById('lk-mic-label');
      if (fill) fill.style.width = pct + '%';
      if (rms > 0.01) sawSound = true;
      if (lbl) lbl.textContent = sawSound ? 'áudio ok ✓' : 'fale para testar…';
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
    sp.sessionLink = location.origin + '/sala?u=' + encodeURIComponent(window._lkUrl) +
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
    // Guardados para gerar o link real da paciente (sala.html) via showSessionLink().
    window._lkPatientToken = patientToken;
    window._lkUrl = url;
    // Parte 2/2 da entrada da paciente: publica o link no PORTAL automaticamente ao iniciar.
    // A paciente logada vê o convite "ao vivo" em tempo real (poll em js/13). Além do link
    // WhatsApp (que só salva se a terapeuta copiar/enviar), isto cobre a paciente já logada.
    // Guarda a referência: se o terapeuta navegar p/ outra ficha durante a sessão,
    // o encerrar limpa o link DESTA paciente (não a da ficha aberta no momento).
    window._lkSessionPatient = sp;
    _lkPublishPortalLink(sp);

    // 3) Conecta como host e prepara o mixer de áudio (para gravação efêmera)
    _lkRoom = new LK.Room({ adaptiveStream: true, dynacast: true });
    _lkAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // CRÍTICO: o AudioContext nasce "suspended" (foi criado após awaits, fora do gesto do
    // usuário) — sem resume() o MediaStreamDestination sai MUDO e o Whisper alucina. Resume aqui.
    try { if (_lkAudioCtx.state === 'suspended') await _lkAudioCtx.resume(); } catch (_) {}
    const mixDest = _lkAudioCtx.createMediaStreamDestination();
    let _lkMicMixed = false; // garante que o mic do terapeuta entrou no mix
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

    // Mic local no mixer + vídeo local no canto. O mic pode não estar pronto no mesmo tick
    // após setMicrophoneEnabled — tentamos algumas vezes até o track existir.
    for (let i = 0; i < 10 && !_lkMicMixed; i++) {
      const micPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
      const micTrack = micPub && micPub.track && micPub.track.mediaStreamTrack;
      if (micTrack && micTrack.readyState === 'live') {
        const micSource = _lkAudioCtx.createMediaStreamSource(new MediaStream([micTrack]));
        micSource.connect(mixDest);
        _lkStartMeter(micSource); // barrinha ao vivo: confirma que o mic está sendo captado
        _lkMicMixed = true;
        break;
      }
      await new Promise(r => setTimeout(r, 150));
    }
    if (!_lkMicMixed) {
      console.warn('[livekit] mic do terapeuta NAO entrou no mix — transcricao pode sair vazia');
      if (typeof showToast === 'function') showToast('⚠ Não consegui captar seu microfone. Verifique a permissão/dispositivo.');
    }
    const camPub = _lkRoom.localParticipant.getTrackPublication(LK.Track.Source.Camera);
    if (camPub && camPub.track) _lkMountLocalVideo(camPub.track.attach());

    // 4) Grava o áudio MIXADO (efêmero — só para transcrever; nada é enviado ao servidor até o fim)
    //    v2: no desktop, trocar esta gravação+/api/transcribe por Whisper ON-DEVICE (Web Worker/WebGPU).
    try { if (_lkAudioCtx.state === 'suspended') await _lkAudioCtx.resume(); } catch (_) {}
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
  _lkStopMeter();
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
  window._lkPatientToken = null; window._lkUrl = null; // link da paciente expira com a sessão
  _lkClearPortalLink(window._lkSessionPatient || patients[currentSessionPatientIdx] || patients[0]); // some o convite do portal
  window._lkSessionPatient = null;
  if (typeof timerInterval !== 'undefined' && timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }

  if (!audioBlob || audioBlob.size < 1200) {
    _lkShowPostSession({ transcript: '', note: '', empty: true });
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
    const transcript = (text || '').trim();
    _lkLastTranscript = transcript;

    // Guarda: sem fala real captada → NÃO gera nota (evita nota fabricada a partir de silêncio).
    if (transcript.replace(/[^\p{L}\p{N}]/gu, '').length < 8) {
      _lkShowPostSession({ transcript, note: '', empty: true });
      return;
    }

    // 2) Nota clínica (Claude, transcript pseudonimizado no servidor)
    const sp = patients[currentSessionPatientIdx] || patients[0];
    const nr = await fetch('/api/session-note', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ transcript, abordagem: sp && sp.abordagem }),
    });
    if (!nr.ok) throw new Error('session-note ' + nr.status);
    const { note } = await nr.json();

    const ta = document.getElementById('session-ai-note');
    if (ta) ta.value = note;
    _lkShowPostSession({ transcript, note });
    if (typeof showToast === 'function') showToast('Nota gerada ✓ Revise antes de salvar.');
  } catch (err) {
    console.error('[livekit] pós-sessão falhou', err);
    if (typeof showToast === 'function') showToast('⚠ Falha ao gerar a nota: ' + err.message);
  }
}

// Modal pós-sessão HONESTO — mostra a transcrição REAL e a nota REAL (sem conteúdo fabricado).
function _lkShowPostSession({ transcript, note, empty }) {
  const old = document.getElementById('lk-post-modal'); if (old) old.remove();
  const esc = (s) => (typeof escHTML === 'function' ? escHTML(s) : String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])));
  const sp = patients[currentSessionPatientIdx] || patients[0];
  const nome = sp ? sp.name : 'Paciente';

  const emptyBlock = `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;color:#9a3412;font-size:13px;line-height:1.55">
      <strong>⚠ Nenhuma fala foi captada nesta gravação.</strong><br/>
      O áudio saiu em silêncio, então <strong>não geramos nota</strong> (para não inventar conteúdo).
      Verifique se o microfone certo está ativo e sem mudo — durante a sessão, a barrinha 🎤 deve se mexer quando você fala.
    </div>`;

  const contentBlock = `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Transcrição da sessão (real)</div>
      <div style="background:#f8faf8;border:1px solid #e6efe9;border-radius:10px;padding:12px 14px;font-size:13px;color:#333;line-height:1.6;max-height:180px;overflow-y:auto;white-space:pre-wrap">${esc(transcript)}</div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#4a7c59;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">✦ Nota clínica — rascunho gerado pela IA</div>
      <textarea id="lk-post-note" style="width:100%;box-sizing:border-box;min-height:200px;border:1.5px solid #d1e7d9;border-radius:10px;padding:12px 14px;font-size:13px;font-family:'DM Sans',sans-serif;line-height:1.6;resize:vertical;outline:none">${esc(note)}</textarea>
      <div style="font-size:11px;color:#999;margin-top:6px">Revise e edite antes de salvar no prontuário. A gravação de áudio não foi armazenada.</div>
    </div>`;

  const modal = document.createElement('div');
  modal.id = 'lk-post-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3)">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:18px">${empty ? '⚠️' : '✅'}</div>
        <div><div style="font-weight:600;font-size:15px;color:#1a1a1a">Sessão encerrada · ${esc(nome)}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${empty ? 'Sem áudio para transcrever' : 'Transcrição e nota geradas a partir da sua fala'}</div></div>
      </div>
      <div style="padding:20px 24px">${empty ? emptyBlock : contentBlock}</div>
      <div style="padding:12px 24px 20px;display:flex;gap:8px;border-top:1px solid #f0f0f0;justify-content:flex-end">
        <button onclick="document.getElementById('lk-post-modal').remove()" style="padding:10px 16px;border:1px solid #e0e0e0;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:#555">Fechar</button>
        ${empty ? '' : `<button onclick="_lkSalvarNotaPostSessao()" style="padding:10px 18px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">✓ Salvar no prontuário</button>`}
      </div>
    </div>`;
  document.body.appendChild(modal);
}

// Salva a nota revisada no prontuário do paciente atual.
function _lkSalvarNotaPostSessao() {
  const ta = document.getElementById('lk-post-note');
  const texto = ta ? ta.value.trim() : '';
  if (!texto) { if (typeof showToast === 'function') showToast('⚠ A nota está vazia.'); return; }
  const sp = patients[currentSessionPatientIdx] || patients[0];
  if (sp) {
    sp.prontuarioNotes = sp.prontuarioNotes || [];
    const hoje = new Date();
    const data = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;
    sp.prontuarioNotes.unshift({ date: data, text: texto, source: 'sessao-ia' });
    if (typeof salvarPacientes === 'function') salvarPacientes();
  }
  const m = document.getElementById('lk-post-modal'); if (m) m.remove();
  if (typeof showToast === 'function') showToast('Nota salva no prontuário ✓');
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
