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
let _lkRecorder = null;      // gravador da faixa do TERAPEUTA (mic local)
let _lkMicDest = null;       // destino WebAudio com o mic do terapeuta
let _lkChunks = [];
let _lkPacDest = null;       // destino WebAudio só com o áudio da PACIENTE
let _lkPacRecorder = null;   // gravador da faixa da paciente (inicia quando ela entra)
let _lkPacChunks = [];
let _lkRecStartMs = 0;       // início da gravação do terapeuta (base dos timestamps)
let _lkPacRecStartMs = 0;    // início da gravação da paciente (alinha os segmentos)
let _lkAudioCtx = null;
let _lkAnalyser = null;
let _lkMeterRAF = null;
let _lkRetry = null;          // { audioBlob, pacBlob, pacOffsetSec } p/ reprocessar sem regravar

// Avisa antes de fechar/recarregar a aba durante a sessão (a gravação vive em memória —
// um F5 a perderia). Registrado quando a gravação começa, removido ao encerrar.
function _lkGuardUnload(e) {
  e.preventDefault();
  e.returnValue = 'A sessão está em andamento. Se sair agora, a gravação e a nota serão perdidas.';
  return e.returnValue;
}

// Rascunho de recuperação: grava transcrição+nota assim que existem, para não perder o
// trabalho se o navegador fechar entre gerar e salvar. Limpo ao salvar no prontuário.
function _lkSaveDraft(sp, transcript, note) {
  try {
    localStorage.setItem('tf_lk_draft', JSON.stringify({
      patientId: sp && sp.id, patientName: sp && sp.name,
      at: new Date().toISOString(), transcript: transcript || '', note: note || '',
    }));
  } catch (_) {}
}
function _lkClearDraft() { try { localStorage.removeItem('tf_lk_draft'); } catch (_) {} }

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

    // 3) Conecta como host. Qualidade de vídeo: 540p — meio-termo testado. 720p forçado
    //    (1,7 Mbps) TRAVAVA o vídeo em conexão residencial/celular; 540p (~0,8 Mbps) fica
    //    nítido e fluido, e o simulcast + adaptiveStream degradam sozinhos se a rede cair.
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
    _lkChunks = []; _lkPacChunks = []; _lkRecStartMs = 0; _lkPacRecStartMs = 0;

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
        micSource.connect(_lkMicDest);
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

    // 4) GRAVAÇÃO SÓ COMEÇA QUANDO A PACIENTE ENTRA (_lkStartTherRecorder via
    //    ParticipantConnected/TrackSubscribed): mic aberto antes disso captava conversa
    //    alheia à consulta e sujava a transcrição/nota. O medidor 🎤 roda desde já
    //    (testar o mic antes), mas nada é gravado até ela chegar.
    //    v2: no desktop, trocar gravação+/api/transcribe por Whisper ON-DEVICE (Web Worker/WebGPU).
    try { if (_lkAudioCtx.state === 'suspended') await _lkAudioCtx.resume(); } catch (_) {}
    // Cobre o caso raro de a paciente já estar na sala quando o host conecta (reconexão).
    try { if (_lkRoom.remoteParticipants && _lkRoom.remoteParticipants.size > 0) _lkStartTherRecorder(); } catch (_) {}
    _lkShowWaitingRemote(); // "aguardando a paciente" até o vídeo dela chegar

    // Timer NÃO começa aqui: dispara em _lkStartTherRecorder, quando a paciente entra —
    // o tempo exibido é o da CONSULTA, não o da espera do terapeuta na sala (F6).
    if (typeof showToast === 'function') showToast('Sessão iniciada · a nota será gerada ao encerrar.');
  } catch (err) {
    console.error('[livekit] start falhou', err);
    if (typeof showToast === 'function') showToast('⚠ Não foi possível iniciar a sessão: ' + err.message);
  }
}

// Gravador da faixa do TERAPEUTA — só inicia quando a paciente ENTRA na sala.
// Antes disso o mic fica aberto (vídeo/medidor) mas NADA é gravado: evita captar
// conversa alheia à consulta e sujar a transcrição/nota (pedido do usuário 07/07).
function _lkStartTherRecorder() {
  if (_lkRecorder || !_lkMicDest) return;
  try {
    // 32 kbps mono: voz é inteligível para o Whisper com folga e o arquivo fica ~4× menor
    // (o default do Chrome ~128 kbps estourava o limite de 4,5 MB de corpo da Vercel em poucos min).
    _lkRecorder = new MediaRecorder(_lkMicDest.stream, { mimeType: _pickAudioMime(), audioBitsPerSecond: 32000 });
    _lkRecorder.ondataavailable = (e) => { if (e.data && e.data.size) _lkChunks.push(e.data); };
    _lkRecorder.start(1000);
    _lkRecStartMs = Date.now();
    window.addEventListener('beforeunload', _lkGuardUnload); // avisa se fechar/recarregar gravando
    if (typeof _iniciarTimerSessao === 'function') _iniciarTimerSessao(); // timer conta a partir da entrada da paciente
    if (typeof showToast === 'function') showToast('🔴 Paciente entrou — gravação e transcrição iniciadas.');
  } catch (e) { console.warn('[livekit] ther recorder', e); }
}

// Gravador da faixa da paciente — criado quando o primeiro áudio dela chega.
// O offset (vs início da gravação do terapeuta) alinha os timestamps na intercalação.
function _lkStartPacRecorder() {
  if (_lkPacRecorder || !_lkPacDest) return;
  try {
    _lkPacRecorder = new MediaRecorder(_lkPacDest.stream, { mimeType: _pickAudioMime(), audioBitsPerSecond: 32000 });
    _lkPacRecorder.ondataavailable = (e) => { if (e.data && e.data.size) _lkPacChunks.push(e.data); };
    _lkPacRecorder.start(1000);
    _lkPacRecStartMs = Date.now();
  } catch (e) { console.warn('[livekit] pac recorder', e); }
}

// Placeholder na área de vídeo enquanto a paciente não entra (substitui o pré-estado).
function _lkShowWaitingRemote() {
  const main = document.querySelector('#page-sessao .video-main') || document.querySelector('.video-main');
  if (!main || document.getElementById('lk-wait-remote')) return;
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

// Intercala os segmentos das duas faixas por tempo → diálogo "Terapeuta:/Paciente:".
// Usa 'Paciente' (não o nome real): o transcript segue pseudonimizado até o Claude (LGPD).
function _lkMergeTranscripts(ther, pac, pacOffsetSec) {
  const rows = [];
  const push = (r, who, off) => {
    ((r && r.segments) || []).forEach((s) => {
      const t = (s.text || '').trim();
      if (!t) return;
      if (typeof s.no_speech_prob === 'number' && s.no_speech_prob > 0.85) return; // anti-alucinação em silêncio
      rows.push({ at: (s.start || 0) + off, who, t });
    });
  };
  push(ther, 'Terapeuta', 0);
  push(pac, 'Paciente', pacOffsetSec || 0);
  if (!rows.length) return ((ther && ther.text) || '').trim();
  rows.sort((a, b) => a.at - b.at);
  // Junta falas consecutivas do mesmo falante num parágrafo só
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.who === r.who) last.t += ' ' + r.t;
    else out.push({ who: r.who, t: r.t });
  }
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
    <div style="background:#fff;border-radius:16px;width:100%;max-width:430px;box-shadow:0 24px 80px rgba(0,0,0,.3);padding:26px 28px">
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

async function endLiveKitSession() {
  _lkStopMeter();
  _lkShowProcessing();
  _lkProcStep('s1', 'doing');
  // Para as gravações e coleta os blobs (faixa do terapeuta + faixa da paciente)
  let audioBlob = null, pacBlob = null;
  try {
    if (_lkRecorder && _lkRecorder.state !== 'inactive') {
      await new Promise((resolve) => { _lkRecorder.onstop = resolve; _lkRecorder.stop(); });
    }
    if (_lkChunks.length) audioBlob = new Blob(_lkChunks, { type: (_lkChunks[0] && _lkChunks[0].type) || 'audio/webm' });
  } catch (e) { console.warn('[livekit] stop recorder', e); }
  try {
    if (_lkPacRecorder && _lkPacRecorder.state !== 'inactive') {
      await new Promise((resolve) => { _lkPacRecorder.onstop = resolve; _lkPacRecorder.stop(); });
    }
    if (_lkPacChunks.length) pacBlob = new Blob(_lkPacChunks, { type: (_lkPacChunks[0] && _lkPacChunks[0].type) || 'audio/webm' });
  } catch (e) { console.warn('[livekit] stop pac recorder', e); }
  const pacOffsetSec = (_lkPacRecStartMs && _lkRecStartMs) ? (_lkPacRecStartMs - _lkRecStartMs) / 1000 : 0;
  const noPatient = !_lkRecStartMs; // paciente nunca entrou → nada foi gravado (by design)
  _lkChunks = []; _lkPacChunks = [];

  try { if (_lkRoom) await _lkRoom.disconnect(); } catch (_) {}
  try { document.querySelectorAll('[data-lk-remote-audio]').forEach(function (el) { el.remove(); }); } catch (_) {}
  _lkResetVideoArea();
  try { if (_lkAudioCtx) _lkAudioCtx.close(); } catch (_) {}
  _lkRoom = null; _lkAudioCtx = null; _lkRecorder = null; _lkMicDest = null;
  _lkPacRecorder = null; _lkPacDest = null; _lkRecStartMs = 0; _lkPacRecStartMs = 0;
  window._lkPatientToken = null; window._lkUrl = null; // link da paciente expira com a sessão
  _lkClearPortalLink(window._lkSessionPatient || patients[currentSessionPatientIdx] || patients[0]); // some o convite do portal
  window._lkSessionPatient = null;
  window.removeEventListener('beforeunload', _lkGuardUnload); // gravação terminou — libera a saída
  if (typeof timerInterval !== 'undefined' && timerInterval !== null) { clearInterval(timerInterval); timerInterval = null; }

  _lkProcStep('s1', 'done');

  if (!audioBlob || audioBlob.size < 1200) {
    _lkHideProcessing();
    _lkShowPostSession({ transcript: '', note: '', empty: true, noPatient });
    return;
  }

  // Guarda os blobs para permitir reprocessar (botão "tentar de novo") sem regravar.
  _lkRetry = { audioBlob, pacBlob, pacOffsetSec };
  await _lkProcessSession();
}

// Transcreve as 2 faixas → intercala → gera a nota. Reutilizável no retry (usa _lkRetry).
// Falha aqui NÃO perde nada: os blobs ficam em _lkRetry e o modal oferece "tentar de novo".
async function _lkProcessSession() {
  if (!_lkRetry || !_lkRetry.audioBlob) return;
  const { audioBlob, pacBlob, pacOffsetSec } = _lkRetry;
  const sp = patients[currentSessionPatientIdx] || patients[0];

  // Guard de tamanho: a Vercel rejeita corpo > ~4,5 MB. A 32 kbps isso ~= 18 min por faixa.
  // Acima disso, avisa com clareza em vez de estourar num 413 silencioso (a nota fica pendente
  // p/ reprocessar — a segmentação por tempo, que remove esse teto, é o próximo passo do plano).
  const LIMITE = 4.4 * 1024 * 1024;
  if (audioBlob.size > LIMITE || (pacBlob && pacBlob.size > LIMITE)) {
    _lkHideProcessing();
    _lkShowPostSession({ tooLong: true });
    return;
  }

  _lkShowProcessing(); _lkProcStep('s1', 'done'); _lkProcStep('s2', 'doing');
  try {
    // 1) Transcrição das 2 faixas EM PARALELO (Groq, com timestamps).
    const therP = _lkTranscribe(audioBlob);
    const pacP = (pacBlob && pacBlob.size > 1200)
      ? _lkTranscribe(pacBlob).catch((e) => { console.warn('[livekit] transcrição da faixa da paciente falhou', e); return null; })
      : Promise.resolve(null);
    const ther = await therP;
    const pac = await pacP;
    const transcript = pac
      ? _lkMergeTranscripts(ther, pac, pacOffsetSec)
      : _lkCleanSingle(ther); // fallback: 1 faixa, mas ainda filtra alucinação de silêncio
    _lkProcStep('s2', 'done');

    // Sem fala real captada → NÃO gera nota (evita nota fabricada a partir de silêncio).
    if (transcript.replace(/[^\p{L}\p{N}]/gu, '').length < 8) {
      _lkHideProcessing();
      _lkShowPostSession({ transcript, note: '', empty: true });
      return;
    }

    // 2) Nota clínica (Claude, transcript pseudonimizado no servidor).
    _lkProcStep('s3', 'doing');
    const nr = await fetch('/api/session-note', {
      method: 'POST',
      headers: await _lkAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ transcript, abordagem: sp && sp.abordagem }),
    });
    if (!nr.ok) throw new Error('session-note ' + nr.status);
    let { note } = await nr.json();
    // Descarta recusa do Claude (não deve virar nota clínica). Mantém a transcrição real.
    if (_lkIsRefusal(note)) note = '';
    _lkProcStep('s3', 'done');

    _lkSaveDraft(sp, transcript, note); // rascunho: sobrevive a fechar o navegador antes de salvar
    _lkRetry = null;                    // deu certo — não precisa mais reprocessar
    const ta = document.getElementById('session-ai-note');
    if (ta && note) ta.value = note;
    _lkHideProcessing();
    _lkShowPostSession({ transcript, note });
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

// Transcrição de faixa única com o mesmo filtro anti-alucinação do merge (no_speech_prob).
function _lkCleanSingle(r) {
  if (r && Array.isArray(r.segments) && r.segments.length) {
    return r.segments
      .filter((s) => !(typeof s.no_speech_prob === 'number' && s.no_speech_prob > 0.85))
      .map((s) => (s.text || '').trim()).filter(Boolean).join(' ').trim();
  }
  return ((r && r.text) || '').trim();
}

// Detecta recusa/desculpa do modelo para não gravar isso como nota clínica.
function _lkIsRefusal(t) {
  return /^\s*(desculpe|não (é )?poss[ií]vel|não (posso|consigo)|infelizmente não|unable to|i (cannot|can't|am unable))/i.test(String(t || ''));
}

// Modal pós-sessão HONESTO — mostra a transcrição REAL e a nota REAL (sem conteúdo fabricado).
// Estados: default (transcrição+nota) · empty (silêncio) · noPatient · tooLong (áudio > limite) · retry (falhou).
function _lkShowPostSession({ transcript, note, empty, noPatient, tooLong, retry, errMsg }) {
  const old = document.getElementById('lk-post-modal'); if (old) old.remove();
  const esc = (s) => (typeof escHTML === 'function' ? escHTML(s) : String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])));
  const sp = patients[currentSessionPatientIdx] || patients[0];
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
      <strong>⚠ Esta sessão ficou longa demais para transcrever de uma vez.</strong><br/>
      O áudio excedeu o limite de envio atual. Nada foi perdido do seu lado — mas ainda não conseguimos
      gerar a nota automaticamente para sessões muito longas. Anote os pontos principais manualmente por ora;
      o suporte a sessões longas (transcrição em partes) é o próximo passo já planejado.
    </div>`;

  const retryBlock = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;color:#991b1b;font-size:13px;line-height:1.55">
      <strong>⚠ Não consegui concluir a transcrição/nota.</strong><br/>
      A gravação desta sessão <strong>ainda está guardada nesta aba</strong> — você pode tentar de novo sem regravar.
      ${errMsg ? `<div style="margin-top:6px;font-size:11px;opacity:.8">Detalhe técnico: ${esc(errMsg)}</div>` : ''}
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
    <div style="background:#fff;border-radius:16px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.3)">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:50%;background:#f0fdf4;display:flex;align-items:center;justify-content:center;font-size:18px">${icon}</div>
        <div><div style="font-weight:600;font-size:15px;color:#1a1a1a">Sessão encerrada · ${esc(nome)}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${subtitle}</div></div>
      </div>
      <div style="padding:20px 24px">${bodyHTML}</div>
      <div style="padding:12px 24px 20px;display:flex;gap:8px;border-top:1px solid #f0f0f0;justify-content:flex-end">
        <button onclick="${closeGuard}" style="padding:10px 16px;border:1px solid #e0e0e0;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:#555">Fechar</button>
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
  const sp = patients[currentSessionPatientIdx] || patients[0];
  // indexPostSession lê a nota de #session-ai-note — injeta o texto revisado lá.
  const sideTa = document.getElementById('session-ai-note');
  if (sideTa) sideTa.value = texto;
  const m = document.getElementById('lk-post-modal'); if (m) m.remove();
  _lkClearDraft(); _lkRetry = null; // salvo com sucesso — descarta rascunho de recuperação
  if (typeof indexPostSession === 'function') indexPostSession();

  // Resumo acessível p/ a paciente ler no portal ("Minha jornada") — no fluxo clássico
  // era gerado pelo modal legado; aqui geramos direto e salvamos no appointment que o
  // indexPostSession marcou (_pendingResumoApptId).
  if (sp && typeof _gerarResumoPortalIA === 'function') {
    _gerarResumoPortalIA(sp, texto).then(function (resumo) {
      if (!resumo || typeof _pendingResumoApptId === 'undefined' || !_pendingResumoApptId) return;
      var appt = (typeof appointments !== 'undefined' ? appointments : [])
        .find(function (a) { return String(a.id) === String(_pendingResumoApptId); });
      if (appt) {
        appt.resumoParaPaciente = resumo;
        if (typeof _salvarAppointments === 'function') _salvarAppointments();
        if (!sp.appointments) sp.appointments = [];
        var i = sp.appointments.findIndex(function (a) { return String(a.id) === String(appt.id); });
        if (i >= 0) sp.appointments[i].resumoParaPaciente = resumo;
        else sp.appointments.push({ id: appt.id, date: appt.date, presenca: 'compareceu', resumoParaPaciente: resumo });
        if (typeof salvarPacientes === 'function') salvarPacientes();
      }
      _pendingResumoApptId = null;
    }).catch(function () {});
  }
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
