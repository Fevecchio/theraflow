// 14-supervisao.js — Supervisão (análise automática local), alertas, reflexões, autoconhecimento

function _limparBadgePortal() {
  try {
    localStorage.removeItem('tf_portal_new_data');
    var b = document.getElementById('nav-portal-badge');
    if (b) b.style.display = 'none';
  } catch(e) {}
}

function _atualizarBadgePortal() {
  try {
    var b = document.getElementById('nav-portal-badge');
    if (!b) return;
    b.style.display = localStorage.getItem('tf_portal_new_data') === '1' ? 'inline-block' : 'none';
  } catch(e) {}
}

function _atualizarBadgeSupervisao() {
  try {
    var badge = document.getElementById('nav-supervisao-badge');
    if (!badge) return;
    var alertas = gerarAlertasReais ? gerarAlertasReais() : [];
    if (alertas.length > 0) {
      badge.textContent = alertas.length > 9 ? '9+' : alertas.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch(e) {}
}

/* ── ALERTAS & SUPERVISÃO (análise automática) ── */
function gerarAlertasReais() {
  var alertas = [];
  var hoje = new Date();
  var isoHoje = localDateISO(hoje);

  patients.forEach(function(p, i) {
    // ── 1. HUMOR DECLÍNIO (3+ check-ins em queda) ──────────────────────────
    // _normMoodVal: o portal grava {value, emoji, date} — comparar o objeto cru
    // fazia este alerta-núcleo NUNCA disparar com check-ins reais. Lote 1.
    if (p.moodHistory && p.moodHistory.length >= 3) {
      var ult = p.moodHistory.slice(-3).map(function(v){ return _normMoodVal(v); });
      var emQueda = ult[0] > ult[1] && ult[1] > ult[2];
      var baixo   = ult[2] <= 4;
      if (emQueda || baixo) {
        alertas.push({
          tipo: 'risk',
          icon: _tfIcon('trendDown',15),
          label: emQueda && baixo ? 'Risco clínico · Atenção imediata' : 'Humor · Queda detectada',
          titulo: escHTML(p.name) + ': humor em declínio',
          texto: 'Últimos registros de humor: ' + ult.join(' → ') + '/10. '
            + (baixo ? 'Nível atual abaixo de 5 — avaliar estado emocional na próxima sessão.' : 'Tendência de queda nas últimas 3 medições.')
            + (p.sessions ? ' Sessão ' + (p.sessions+1) + ' próxima.' : ''),
          paciente: p.name,
          idx: i,
          prioridade: baixo ? 0 : 1
        });
      }
    }

    // ── 2. GAP DE SESSÃO (> 21 dias sem sessão agendada) ───────────────────
    if (p.next && p.next !== '—') {
      var parts = p.next.split('/');
      if (parts.length >= 2) {
        var proxData = new Date(
          (parts.length >= 3 ? parseInt(parts[2]) : hoje.getFullYear()),
          parseInt(parts[1])-1,
          parseInt(parts[0])
        );
        var diffDias = Math.round((proxData - hoje) / (1000*60*60*24));
        if (diffDias > 21) {
          alertas.push({
            tipo: 'pattern',
            icon: '📆',
            label: 'Frequência · Intervalo longo',
            titulo: escHTML(p.name) + ': próxima sessão em ' + diffDias + ' dias',
            texto: 'Intervalo superior a 3 semanas pode comprometer a continuidade terapêutica. Considere verificar disponibilidade ou enviar mensagem de contato.',
            paciente: p.name,
            idx: i,
            prioridade: 2
          });
        }
      }
    } else if (p.sessions > 0) {
      // Paciente com sessões mas sem próxima agendada
      alertas.push({
        tipo: 'reflection',
        icon: _tfIcon('cal',15),
        label: 'Agenda · Sem próxima sessão',
        titulo: escHTML(p.name) + ': próxima sessão não agendada',
        texto: 'Paciente com ' + p.sessions + ' sessão(ões) não possui próxima sessão marcada. Risco de evasão.',
        paciente: p.name,
        idx: i,
        prioridade: 2
      });
    }

    // ── 3. EXERCÍCIOS — BAIXA CONCLUSÃO ────────────────────────────────────
    if (p.exercises && p.exercises.length >= 2) {
      var done = p.exercises.filter(function(e){ return e.done; }).length;
      var pct  = done / p.exercises.length;
      if (pct < 0.35) {
        alertas.push({
          tipo: 'reflection',
          icon: _tfIcon('clip',15),
          label: 'Engajamento · Exercícios',
          titulo: escHTML(p.name) + ': baixa adesão às tarefas (' + Math.round(pct*100) + '%)',
          texto: done + ' de ' + p.exercises.length + ' exercícios concluídos. Considere revisar a dificuldade, relevância ou motivação do paciente para tarefas entre sessões.',
          paciente: p.name,
          idx: i,
          prioridade: 3
        });
      }
    }

    // ── 4. PALAVRAS-CHAVE DE RISCO NAS NOTAS ───────────────────────────────
    // Respeita a Preferência da IA "risco" (autonomia clínica — item 2)
    var riskWords = _iaPrefOn('risco')
      ? ['não vejo saída','cansado de tudo','sem sentido','desistir','acabar com tudo','não aguento mais','não quer viver']
      : [];
    var notasTexto = (p.prontuarioNotes||[]).map(function(n){ return (n.text||'').toLowerCase(); }).join(' ');
    var found = riskWords.filter(function(w){ return notasTexto.includes(w); });
    if (found.length > 0) {
      alertas.push({
        tipo: 'risk',
        icon: _tfIcon('alert',15),
        label: 'Risco clínico · Alta prioridade',
        titulo: escHTML(p.name) + ': linguagem de risco nas notas',
        texto: 'Expressões detectadas nas notas clínicas que requerem atenção imediata: "' + found.slice(0,2).join('", "') + '". Avalie protocolo de risco na próxima sessão.',
        paciente: p.name,
        idx: i,
        prioridade: 0
      });
    }

    // ── 5. PROGRESSO POSITIVO ───────────────────────────────────────────────
    if (p.progress >= 70 && p.sessions >= 8) {
      alertas.push({
        tipo: 'positive',
        icon: '🌱',
        label: 'Evolução positiva · Destaque',
        titulo: escHTML(p.name) + ': evolução consistente (' + p.progress + '%)',
        texto: 'Progresso terapêutico acima de 70% após ' + p.sessions + ' sessões. Pode ser momento de discutir objetivos de alta ou plano de manutenção.',
        paciente: p.name,
        idx: i,
        prioridade: 5
      });
    }
  });

  // ── 6. FALTAS REITERADAS ────────────────────────────────────────────────
  patients.forEach(function(p, i) {
    // Identidade segura (patientId), não patientIdx cru — índice desloca com
    // exclusões e já gravou falta no paciente errado (CLAUDE.md, campo minado do sync).
    var faltasRecentes = _apptsDoPaciente(p, i).filter(function(a){
      return a.presenca === 'faltou';
    });
    // Considera apenas as últimas 30 dias
    var limite = new Date(isoHoje); limite.setDate(limite.getDate() - 30);
    var limiteIso = localDateISO(limite);
    var faltasRecentes30 = faltasRecentes.filter(function(a){ return a.date >= limiteIso; });
    if (faltasRecentes30.length >= 2) {
      alertas.push({
        tipo: 'risk',
        icon: '🚫',
        label: 'Frequência · Faltas reiteradas',
        titulo: escHTML(p.name) + ': ' + faltasRecentes30.length + ' faltas nos últimos 30 dias',
        texto: 'Padrão de ausências pode indicar resistência, sobrecarga ou desvinculação. Considere abordar o tema na próxima sessão ou entrar em contato via WhatsApp.',
        paciente: p.name,
        idx: i,
        prioridade: 1
      });
    }
  });

  // ── 7. PADRÃO ENTRE PACIENTES — temas recorrentes ──────────────────────
  var temasTodos = {};
  patients.forEach(function(p){
    var notas = (p.prontuarioNotes||[]).map(function(n){ return (n.text||'').toLowerCase(); }).join(' ');
    ['ansiedade','luto','relacionamento','autonomia','família','trabalho','autoestima','insônia','procrastinação'].forEach(function(tema){
      if (notas.includes(tema)) {
        if (!temasTodos[tema]) temasTodos[tema] = [];
        temasTodos[tema].push(p.name);
      }
    });
  });
  Object.keys(temasTodos).forEach(function(tema){
    if (temasTodos[tema].length >= 2) {
      alertas.push({
        tipo: 'pattern',
        icon: _tfIcon('refresh',15),
        label: 'Padrão da carteira · ' + temasTodos[tema].length + ' pacientes',
        titulo: 'Tema "' + tema + '" emergindo na carteira',
        texto: temasTodos[tema].map(escHTML).join(', ') + ' trouxeram variações deste tema nas notas recentes. Vale refletir se ressoa com algo em sua prática clínica no momento.',
        paciente: null,
        idx: null,
        prioridade: 4
      });
    }
  });

  // Ordena por prioridade (menor = mais urgente)
  alertas.sort(function(a,b){ return a.prioridade - b.prioridade; });
  return alertas;
}

function renderAlertasSupervisao() {
  var container = document.getElementById('sup-ai-content');
  if (!container) return;

  var alertas = gerarAlertasReais();

  if (alertas.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--muted)">'
      + '<div style="font-size:32px;margin-bottom:12px">✅</div>'
      + '<div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">Nenhum alerta no momento</div>'
      + '<div style="font-size:13px;line-height:1.6">Todos os pacientes estão com frequência, humor e engajamento dentro do esperado. Continue assim!</div>'
      + '</div>';
    return;
  }

  // Mantém banner de nova sessão se existir
  var bannerExist = document.getElementById('sup-new-session-banner');
  var bannerHtml  = bannerExist ? bannerExist.outerHTML : '';

  container.innerHTML = bannerHtml + alertas.map(function(a){
    var acoes = a.idx !== null
      ? '<div class="sup-alert-actions">'
          + '<button class="btn btn-sm btn-secondary" onclick="currentBriefingPatientIdx='+a.idx+';navigate(\'briefing\')">✦ Briefing IA</button>'
          // abre o prontuário DO paciente do alerta (antes ia sempre no 1º). B15/Lote 4.
          + '<button class="btn btn-sm btn-secondary" onclick="selectPatient('+a.idx+');navigate(\'prontuarios\')">'+_tfIcon('clip',12)+' Prontuário</button>'
        + '</div>'
      : '';
    var pacBadge = a.paciente
      ? '<div class="sup-alert-patient"><span>'+escHTML(a.paciente)+'</span></div>'
      : '';
    return '<div class="sup-alert-card '+a.tipo+'">'
      + '<div class="sup-alert-icon">'+a.icon+'</div>'
      + '<div><div class="sup-alert-type">'+a.label+'</div>'
        + '<div class="sup-alert-title">'+a.titulo+'</div>'
        + '<div class="sup-alert-text">'+a.texto+'</div>'
        + pacBadge
        + acoes
      + '</div>'
    + '</div>';
  }).join('');
}

function showCalendarSync() {
  const existing = document.getElementById('modal-cal-sync');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-cal-sync';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.25)">
      <div style="padding:28px 28px 0">
        <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:6px">${_tfIcon('link',15)} Sincronizar agenda</div>
        <div style="font-size:13px;color:#888;margin-bottom:24px">Conecte sua agenda profissional. Sessões criadas no Teravia aparecerão automaticamente — e bloqueios da sua agenda pessoal serão respeitados.</div>

        <!-- Google Calendar -->
        <div id="gcal-card" style="border:1px solid #e0e0e0;border-radius:12px;padding:16px;margin-bottom:12px;cursor:pointer;transition:all .2s" onclick="connectCalendar('google')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--white);border:1px solid #e0e0e0;display:flex;align-items:center;justify-content:center;color:var(--sage)">${_tfIcon('cal',20)}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px;color:#1a1a1a">Google Calendar</div>
              <div style="font-size:12px;color:#888">Sincronização bidirecional via OAuth</div>
            </div>
            <div id="gcal-status" style="font-size:12px;color:#888;background:#f5f5f5;padding:4px 10px;border-radius:20px">Conectar</div>
          </div>
        </div>

        <!-- Outlook -->
        <div id="outlook-card" style="border:1px solid #e0e0e0;border-radius:12px;padding:16px;margin-bottom:24px;cursor:pointer;transition:all .2s" onclick="connectCalendar('outlook')">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:10px;background:#0078d4;display:flex;align-items:center;justify-content:center;font-size:20px">📧</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px;color:#1a1a1a">Outlook / Microsoft 365</div>
              <div style="font-size:12px;color:#888">Sincronização via Microsoft Graph API</div>
            </div>
            <div id="outlook-status" style="font-size:12px;color:#888;background:#f5f5f5;padding:4px 10px;border-radius:20px">Conectar</div>
          </div>
        </div>

        <!-- O que sincroniza -->
        <div style="background:#f8faf8;border-radius:10px;padding:14px 16px;margin-bottom:24px">
          <div style="font-size:12px;font-weight:700;color:#4a7c59;margin-bottom:10px">O que será sincronizado <span style="font-size:10px;background:#eee;color:#888;padding:1px 6px;border-radius:6px;font-weight:600">em breve</span></div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <div style="font-size:12px;color:#555;display:flex;gap:8px"><span>◦</span><span>Sessões criadas no Teravia → aparecerão na sua agenda</span></div>
            <div style="font-size:12px;color:#555;display:flex;gap:8px"><span>◦</span><span>Bloqueios pessoais → respeitados no Teravia</span></div>
            <div style="font-size:12px;color:#555;display:flex;gap:8px"><span>◦</span><span>Convite automático ao paciente com link da sala</span></div>
            <div style="font-size:12px;color:#555;display:flex;gap:8px"><span>◦</span><span>Lembretes 24h e 1h antes por email</span></div>
            <div style="font-size:12px;color:#aaa;display:flex;gap:8px"><span>❌</span><span>Conteúdo clínico nunca é enviado à agenda</span></div>
          </div>
        </div>
      </div>
      <div style="padding:0 28px 24px;display:flex;justify-content:flex-end">
        <button onclick="document.getElementById('modal-cal-sync').remove()" style="padding:10px 20px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555;font-family:inherit">Fechar</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function connectCalendar(provider) {
  var label = provider === 'google' ? 'Google Calendar' : 'Outlook';
  showToast('⏳ Sincronização com ' + label + ' em breve — disponível na próxima atualização.');
}

function showAgendarModal(preData, preHora, prePacienteIdx) {
  const existing = document.getElementById('modal-agendar');
  if (existing) existing.remove();

  const defaultData = preData || hojeISO();
  const defaultHora = preHora || '09:00';
  // Usa duração configurada no perfil
  var defaultDuracao = 50;
  try { var _acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); defaultDuracao = parseInt(_acc.duracao_sessao||50)||50; } catch(e){}

  const overlay = document.createElement('div');
  overlay.id = 'modal-agendar';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';

  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;width:100%;max-width:440px;box-shadow:0 24px 80px rgba(0,0,0,.25)">
      <div style="padding:28px">
        <div style="font-size:17px;font-weight:700;color:#1a1a1a;margin-bottom:20px">+ Nova sessão</div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Paciente</label>
            <select id="agendar-paciente-select" onchange="agendarPacienteChange(this)" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;color:#1a1a1a">
              <option value="">Selecionar paciente...</option>
              ${patients.map((p,i) => `<option value="${i}"${(prePacienteIdx!==undefined && prePacienteIdx!==null && String(prePacienteIdx)===String(i))?' selected':''}>${escHTML(p.name)}</option>`).join('')}
              <option value="novo" style="font-weight:600;color:#4a7c59">+ Novo paciente</option>
            </select>
            <!-- Campos para novo paciente -->
            <div id="agendar-novo-paciente" style="display:none;margin-top:10px;flex-direction:column;gap:8px">
              <input id="novo-paciente-nome" type="text" placeholder="Nome completo" style="width:100%;padding:9px 12px;border:1px solid #d0e8d8;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none">
              <input id="novo-paciente-email" type="email" placeholder="Email (para envio do convite)" style="width:100%;padding:9px 12px;border:1px solid #d0e8d8;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none">
              <div style="font-size:11px;color:#888">O paciente receberá o convite por email e será cadastrado automaticamente.</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Data</label>
              <input type="date" id="agendar-data" value="${defaultData}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Horário</label>
              <input type="time" id="agendar-hora" value="${defaultHora}" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;box-sizing:border-box">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Duração</label>
              <select id="agendar-duracao" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit">
                ${[45,50,60,90].map(function(v){ return '<option value="'+v+'"'+(v===defaultDuracao?' selected':'')+'>'+v+' minutos</option>'; }).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px">Recorrência</label>
              <select id="agendar-recorrencia" style="width:100%;padding:9px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit">
                <option value="nenhuma">Sem recorrência</option>
                <option value="semanal">Semanal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          </div>

          <!-- Convites -->
          <div style="background:#f8faf8;border-radius:10px;padding:14px">
            <div style="font-size:12px;font-weight:700;color:#4a7c59;margin-bottom:10px">📨 Notificações automáticas</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#555;cursor:pointer">
                <input type="checkbox" id="agendar-chk-invite" checked style="accent-color:var(--sage)"> Enviar convite por email ao paciente (com link da sala)
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#999;cursor:not-allowed" title="Integração com calendário em breve">
                <input type="checkbox" disabled style="accent-color:var(--sage)"> Adicionar ao Google Calendar / Outlook <span style="font-size:10px;background:#eee;color:#888;padding:1px 6px;border-radius:6px">em breve</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#555;cursor:pointer">
                <input type="checkbox" id="agendar-chk-reminder" checked style="accent-color:var(--sage)"> Lembretes 24h e 15 min antes (email ao paciente)
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#555;cursor:pointer">
                <input type="checkbox" id="agendar-chk-wpp" style="accent-color:var(--sage)"> Enviar link pelo WhatsApp também
              </label>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:20px">
          <button onclick="document.getElementById('modal-agendar').remove()" style="flex:1;padding:11px;border:1px solid #e0e0e0;background:var(--white);border-radius:8px;font-size:13px;cursor:pointer;color:#555;font-family:inherit">Cancelar</button>
          <button onclick="confirmarAgendamento()" style="flex:1;padding:11px;background:#4a7c59;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✓ Agendar e enviar</button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', _agendarEscHandler); } });
  function _agendarEscHandler(e) { if (e.key === 'Escape') { var el = document.getElementById('modal-agendar'); if (el) el.remove(); document.removeEventListener('keydown', _agendarEscHandler); } }
  document.addEventListener('keydown', _agendarEscHandler);
  document.body.appendChild(overlay);
}

function agendarPacienteChange(select) {
  const novoDiv = document.getElementById('agendar-novo-paciente');
  if (!novoDiv) return;
  if (select.value === 'novo') {
    novoDiv.style.display = 'flex';
    novoDiv.style.flexDirection = 'column';
    setTimeout(() => document.getElementById('novo-paciente-nome')?.focus(), 50);
  } else {
    novoDiv.style.display = 'none';
  }
}

function enviarLembreteAgenda(nomeCompleto) {
  // Encontra o appointment mais próximo para este paciente
  var hojeIso = hojeISO();
  var appt = appointments.filter(function(a){
    return a.patientName === nomeCompleto && a.status !== 'cancelada' && a.date >= hojeIso;
  }).sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); })[0];
  // Encontra paciente pelo nome para pegar o WhatsApp
  var pidx = patients.findIndex(function(p){ return p.name === nomeCompleto; });
  var p = patients[pidx];
  if (!p?.whatsapp) {
    showToast('⚠ ' + nomeCompleto.split(' ')[0] + ' não tem WhatsApp cadastrado — não foi possível enviar. Adicione o número na ficha do paciente.', 'warning');
    return false; // _lembrarConfirmacao não marca confirmada sem lembrete enviado
  }
  var n = _wppNumero(p.whatsapp);
  if (!n) { showToast('Número de WhatsApp inválido.'); return false; }
  // Mensagem única (template do Perfil) com dia/hora reais — revisão 14/07.
  var msg = _wppMsgLembreteSessao(p, appt);
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(msg), '_blank');
  showToast('📨 Lembrete enviado para ' + _firstName(p.name) + '!');
  return true;
}

// ── /AGENDA ──────────────────────────────────────────────────────────────────

// ── PRONTUÁRIO — ABA PLANO DE TRATAMENTO ─────────────────────────────────────
function renderPlanoProntuario(idx) {
  var p = patients[idx !== undefined ? idx : currentPatientIdx];
  var _painel = document.getElementById('patient-detail-tab-content');
  var el = (_painel && _painel.querySelector('#tab-plano-content')) || document.getElementById('tab-plano-content');
  if (!p || !el) return;

  var metas = (p.portalMetas || []);
  var metasDone = metas.filter(function(m){ return m.done; }).length;
  var progresso = p.progress || 0;
  var abord = p.abordagem || '—';
  var cid = p.cid !== '—' ? p.cid : '—';
  var sessoes = p.sessions || 0;
  var moodMedia = (p.moodHistory && p.moodHistory.length)
    ? (p.moodHistory.reduce(function(a,b){ return a + _normMoodVal(b); }, 0) / p.moodHistory.length).toFixed(1)
    : null; // _normMoodVal: portal grava {value,emoji} — soma crua dava NaN (Lote 1)
  var queixa = p.notes || '';
  var hoje = new Date().toLocaleDateString('pt-BR');

  // Seção de objetivos/metas com edição inline
  var metasHtml = metas.length ? metas.map(function(m) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:' + (m.done ? 'var(--sage-light)' : 'var(--bg)') + ';border:1px solid ' + (m.done ? 'rgba(74,122,99,.25)' : 'var(--border)') + '">'
      + '<input type="checkbox" ' + (m.done ? 'checked' : '') + ' onchange="_toggleMetaPlano(' + m.id + ',this)" style="width:16px;height:16px;accent-color:var(--sage);flex-shrink:0">'
      + '<span style="flex:1;font-size:13.5px;' + (m.done ? 'text-decoration:line-through;color:var(--muted)' : 'color:var(--ink-soft)') + '">' + escHTML(m.text) + '</span>'
      + '<button onclick="_excluirMetaPlano(' + m.id + ')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:0 4px">✕</button>'
      + '</div>';
  }).join('') : '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px 0">Nenhum objetivo definido ainda.</div>';

  el.innerHTML = ''
    // Reorganização 14/07: os 3 stat cards (progresso/sessões/humor) saíram —
    // eram a 3ª cópia dos números que moram na strip da Visão Geral. O Plano é
    // OBJETIVOS + EVOLUÇÃO; uma linha de contexto compacta basta.
    + '<div style="font-size:12px;color:var(--muted)">Progresso geral <strong style="color:var(--sage)">' + progresso + '%</strong> · ' + sessoes + ' sessões' + (moodMedia ? ' · humor médio ' + moodMedia : '') + ' — números completos na <a onclick="selectPatientTab(\'overview\')" style="color:var(--sage);font-weight:600;cursor:pointer">Visão Geral</a>; abordagem, CID e queixa na <a onclick="selectPatientTab(\'ficha\')" style="color:var(--sage);font-weight:600;cursor:pointer">Ficha Clínica</a>.</div>'
    // Objetivos terapêuticos
    + '<div>'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
    +     '<div><div style="font-size:14px;font-weight:600">Objetivos terapêuticos</div><div style="font-size:12px;color:var(--muted);margin-top:1px">' + metasDone + ' de ' + metas.length + ' concluído' + (metas.length !== 1 ? 's' : '') + '</div></div>'
    +     '<button onclick="_adicionarMetaPlano()" class="btn btn-primary btn-sm">+ Objetivo</button>'
    +   '</div>'
    +   '<div style="display:flex;flex-direction:column;gap:8px" id="plano-metas-list">' + metasHtml + '</div>'
    + '</div>'
    // Campo de evolução
    + '<div>'
    +   '<div style="font-size:14px;font-weight:600;margin-bottom:8px">Evolução e observações</div>'
    +   '<textarea id="plano-evolucao-text" class="note-area" style="min-height:90px;font-size:13.5px" placeholder="Registre a evolução do tratamento, mudanças de objetivo ou pontos de atenção…" onblur="_salvarEvolucaoPlano(this.value)">' + escHTML(p.planoEvolucao || '') + '</textarea>'
    +   '<div style="font-size:11px;color:var(--muted);margin-top:4px">Última atualização: ' + (p.planoEvolucaoDate || 'nunca') + '</div>'
    + '</div>';
}

function _toggleMetaPlano(id, cb) {
  var p = patients[currentPatientIdx];
  if (!p || !p.portalMetas) return;
  var m = p.portalMetas.find(function(x){ return x.id === id; });
  if (m) { m.done = cb.checked; salvarPacientes(); }
  renderPlanoProntuario(currentPatientIdx);
}

function _excluirMetaPlano(id) {
  var p = patients[currentPatientIdx];
  if (!p || !p.portalMetas) return;
  p.portalMetas = p.portalMetas.filter(function(x){ return x.id !== id; });
  // Tombstone (C6): sem ele a cópia do portal da paciente ressuscitava a meta
  // no próximo merge — o lado dela já gravava; este lado não.
  if (typeof _tfTombstone === 'function') _tfTombstone(p, 'portalMetas', id);
  salvarPacientes();
  renderPlanoProntuario(currentPatientIdx);
  showToast('Objetivo removido.');
}

function _adicionarMetaPlano() {
  var texto = prompt('Novo objetivo terapêutico:');
  if (!texto || !texto.trim()) return;
  var p = patients[currentPatientIdx];
  if (!p) return;
  if (!p.portalMetas) p.portalMetas = [];
  p.portalMetas.push({ id: Date.now(), text: texto.trim(), done: false, _up: Date.now() }); // _up: desempate de conflito no merge (C7)
  salvarPacientes();
  renderPlanoProntuario(currentPatientIdx);
  showToast('✓ Objetivo adicionado!');
}

function _salvarEvolucaoPlano(texto) {
  var p = patients[currentPatientIdx];
  if (!p) return;
  p.planoEvolucao = texto;
  p.planoEvolucaoDate = new Date().toLocaleDateString('pt-BR');
  p.planoEvolucaoUp = Date.now(); // desempate LWW no servidor (027): cópia velha não reverte
  salvarPacientes();
}

// ── PACIENTES — EXPORTAR CSV ─────────────────────────────────────────────────
function exportarListaPacientesCSV() {
  if (!patients.length) { showToast('Nenhum paciente para exportar.'); return; }
  const cabecalho = ['Nome','Status','Abordagem','CID','Cidade','Sessões','Progresso(%)','Humor Médio','Próxima Sessão','Financeiro'];
  const linhas = patients.map(function(p) {
    const moodMedia = (p.moodHistory && p.moodHistory.length)
      ? (p.moodHistory.reduce(function(a,b){ return a + _normMoodVal(b); }, 0) / p.moodHistory.length).toFixed(1)
      : '—';
    return [
      '"' + (p.name || '').replace(/"/g,'""') + '"',
      '"' + (p.status || '—') + '"',
      '"' + (p.abordagem || '—') + '"',
      '"' + (p.cid || '—') + '"',
      '"' + (p.cidade || '—') + '"',
      p.sessions || 0,
      p.progress || 0,
      moodMedia,
      '"' + (p.next || '—') + '"',
      '"' + (p.fin || '—') + '"'
    ].join(',');
  });
  const csv = [cabecalho.join(',')].concat(linhas).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const hoje = hojeISO();
  a.href = url; a.download = 'teravia-pacientes-' + hoje + '.csv';
  a.click(); URL.revokeObjectURL(url);
  showToast('📊 Lista exportada com sucesso!');
}

// ── PRONTUÁRIOS ──────────────────────────────────────────────────────────────
function exportarExtratoPaciente(idx) {
  var p = patients[idx];
  if (!p) { showToast('Selecione um paciente primeiro.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var nomeT = acc.nome || '—';
  var crpT  = acc.crp  || '';
  var hoje  = new Date().toLocaleDateString('pt-BR');

  var cobPac = charges.filter(function(c){ return !c.deleted && c.patient === p.name; })
    .sort(function(a,b){ return (a.date||'') < (b.date||'') ? -1 : 1; });

  if (!cobPac.length) { showToast('Nenhuma cobrança registrada para ' + _firstName(p.name) + '.'); return; }

  // Agrupa por mês
  var grupos = {};
  var ordemMeses = [];
  cobPac.forEach(function(c) {
    var key = typeof _chargeMonthKey === 'function' ? _chargeMonthKey(c) : (c.date||'').substring(0,7);
    if (!grupos[key]) { grupos[key] = []; ordemMeses.push(key); }
    grupos[key].push(c);
  });
  // Remove duplicados mantendo ordem
  ordemMeses = ordemMeses.filter(function(v,i,a){ return a.indexOf(v)===i; });

  var totalPago = 0, totalPendente = 0, totalAtraso = 0;
  cobPac.forEach(function(c){
    var v = parseFloat(c.value)||0;
    if (c.status==='paid') totalPago+=v;
    else if (c.status==='overdue') totalAtraso+=v;
    else totalPendente+=v;
  });
  var totalGeral = totalPago+totalPendente+totalAtraso;

  function statusLabel(s){ return s==='paid'?'Pago':s==='overdue'?'Em atraso':'Pendente'; }
  function statusColor(s){ return s==='paid'?'#2e7d4f':s==='overdue'?'#c0392b':'#c97d2e'; }
  var dataBR = fmtDataBR;
  function mesLabel(key){
    if (!key) return '—';
    var meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var parts = key.split('-');
    return (meses[parseInt(parts[1]||1)-1]||'') + ' ' + (parts[0]||'');
  }

  var tabelasHtml = ordemMeses.map(function(mes) {
    var itens = grupos[mes];
    var subTotal = itens.reduce(function(s,c){ return s+(parseFloat(c.value)||0); }, 0);
    var rows = itens.map(function(c){
      return '<tr><td>'+dataBR(c.date)+'</td><td>'+(c.desc||c.session||'—')+'</td><td>'+(c.method||'PIX')+'</td>'
        +'<td style="color:'+statusColor(c.status)+'">'+statusLabel(c.status)+'</td>'
        +'<td style="text-align:right;font-weight:500">'+fmtMoeda(parseFloat(c.value)||0)+'</td></tr>';
    }).join('');
    return '<h2>'+mesLabel(mes)+'</h2>'
      +'<table><tr><th>Data</th><th>Descrição</th><th>Método</th><th>Status</th><th style="text-align:right">Valor</th></tr>'
      +rows
      +'<tr style="background:#f4f8f4;font-weight:700"><td colspan="4">Subtotal</td><td style="text-align:right">'+fmtMoeda(subTotal)+'</td></tr>'
      +'</table>';
  }).join('');

  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>'
    +'<title>Extrato — '+escHTML(p.name)+'</title>'
    +'<style>body{font-family:Arial,sans-serif;margin:40px;color:#1a2a1e;line-height:1.6}h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#5a8a6a;margin:24px 0 6px;border-bottom:1.5px solid #c8ddc8;padding-bottom:3px}.meta{font-size:12px;color:#666;margin-bottom:28px}.resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}.resumo-item{background:#f4f8f4;border-radius:6px;padding:10px;text-align:center}.resumo-val{font-size:18px;font-weight:700}.resumo-label{font-size:10px;color:#888;margin-top:2px}table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}th{background:#f4f8f4;padding:7px 9px;text-align:left}td{padding:6px 9px;border-bottom:1px solid #e8f0eb}.footer{margin-top:36px;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:10px}@media print{body{margin:20px}}</style></head><body>'
    +'<h1>Extrato Financeiro — '+escHTML(p.name)+'</h1>'
    +'<div class="meta">Terapeuta: '+escHTML(nomeT)+(crpT?' · CRP '+escHTML(crpT):'')+'  &nbsp;·&nbsp;  Gerado em '+hoje+'</div>'
    +'<div class="resumo">'
      +'<div class="resumo-item"><div class="resumo-val" style="color:#2e7d4f">'+fmtMoeda(totalPago)+'</div><div class="resumo-label">Pago</div></div>'
      +'<div class="resumo-item"><div class="resumo-val" style="color:#c97d2e">'+fmtMoeda(totalPendente)+'</div><div class="resumo-label">Pendente</div></div>'
      +'<div class="resumo-item"><div class="resumo-val" style="color:#c0392b">'+fmtMoeda(totalAtraso)+'</div><div class="resumo-label">Em atraso</div></div>'
      +'<div class="resumo-item"><div class="resumo-val">'+fmtMoeda(totalGeral)+'</div><div class="resumo-label">Total geral</div></div>'
    +'</div>'
    +tabelasHtml
    +'<div class="footer">Extrato gerado em '+hoje+' via Teravia · Uso exclusivo do profissional · LGPD</div>'
    +'</body></html>';

  var win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function(){ win.print(); }, 400);
}

function exportarRelatorioEvolucao() {
  var p = patients[currentPatientIdx] || patients[0];
  if (!p) { showToast('Selecione um paciente primeiro.'); return; }
  var acc = {}; try { acc = JSON.parse(localStorage.getItem('tf_account')||'{}'); } catch(e){}
  var nomeT = acc.nome || '—';
  var crpT  = acc.crp || '';
  var hoje  = new Date().toLocaleDateString('pt-BR');

  // Sparkline SVG (_normMoodVal: entradas do portal são {value,emoji} — Lote 1)
  var mh = (p.moodHistory||[]).filter(function(v){return v!=null;}).map(function(v){ return _normMoodVal(v); });
  var sparkSvg = '';
  if (mh.length >= 2) {
    var W=360, H=70, pad=8;
    var stepX = (W-pad*2)/(mh.length-1);
    var pts = mh.map(function(v,i){ return (pad+i*stepX).toFixed(1)+','+(H-pad-((v-1)/9)*(H-pad*2)).toFixed(1); }).join(' ');
    var trend = mh[mh.length-1]-mh[0];
    var cor = trend>0.5?'#4a7c59':trend<-0.5?'#c0392b':'#c97d2e';
    sparkSvg = '<svg width="'+W+'" height="'+H+'" style="display:block"><polyline points="'+pts+'" fill="none" stroke="'+cor+'" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  // Presença — identidade segura (patientId), não patientIdx/currentPatientIdx
  // cru: se p caiu no fallback patients[0] acima, currentPatientIdx nem
  // corresponde a p (documento exportado viria com sessões de outro paciente).
  var apptsPac = (typeof _apptsDoPaciente === 'function') ? _apptsDoPaciente(p, patients.indexOf(p)) : [];
  var compareceu = apptsPac.filter(function(a){ return a.presenca==='compareceu'; }).length;
  var faltou = apptsPac.filter(function(a){ return a.presenca==='faltou'; }).length;
  var taxaPresenca = apptsPac.filter(function(a){return a.presenca;}).length
    ? Math.round(compareceu/(apptsPac.filter(function(a){return a.presenca;}).length)*100)+'%' : '—';

  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>'
    + '<title>Relatório de Evolução — ' + (p.name||'') + '</title>'
    + '<style>body{font-family:Georgia,serif;margin:40px;color:#1a2a1e;line-height:1.7}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#5a8a6a;margin:24px 0 8px;border-bottom:1.5px solid #c8ddc8;padding-bottom:4px}.meta{font-size:13px;color:#666;margin-bottom:32px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.stat{background:#f4f8f4;border-radius:8px;padding:12px;text-align:center}.stat-val{font-size:22px;font-weight:700;color:#4a7c59}.stat-label{font-size:11px;color:#888}table{width:100%;border-collapse:collapse;font-size:12.5px}th{background:#f4f8f4;padding:8px 10px;text-align:left;font-weight:600}td{padding:7px 10px;border-bottom:1px solid #e8f0eb}.footer{margin-top:40px;font-size:11px;color:#aaa;border-top:1px solid #ddd;padding-top:12px}@media print{body{margin:20px}}</style></head><body>'
    + '<h1>Relatório de Evolução Clínica</h1>'
    + '<div class="meta">Paciente: <strong>' + escHTML(p.name||'—') + '</strong> &nbsp;·&nbsp; Terapeuta: ' + escHTML(nomeT) + (crpT?' (CRP '+escHTML(crpT)+')':'') + ' &nbsp;·&nbsp; Gerado em ' + hoje + '</div>'
    + '<h2>Resumo de Evolução</h2>'
    + '<div class="grid">'
      + '<div class="stat"><div class="stat-val">' + (p.sessions||0) + '</div><div class="stat-label">Sessões realizadas</div></div>'
      + '<div class="stat"><div class="stat-val">' + (p.progress||0) + '%</div><div class="stat-label">Progresso terapêutico</div></div>'
      + '<div class="stat"><div class="stat-val">' + taxaPresenca + '</div><div class="stat-label">Taxa de presença</div></div>'
      + '<div class="stat"><div class="stat-val">' + (mh.length ? mh[mh.length-1]+'/10' : '—') + '</div><div class="stat-label">Humor atual</div></div>'
    + '</div>'
    + '<h2>Histórico de Humor</h2>'
    + (sparkSvg ? '<div style="background:#f9fcf9;border-radius:8px;padding:16px;margin-bottom:12px">'+sparkSvg+'</div>' : '<p style="color:#999">Sem registros de humor.</p>')
    + '<h2>Presença</h2>'
    + '<table><tr><th>Data</th><th>Horário</th><th>Status</th></tr>'
    + apptsPac.slice().reverse().slice(0,20).map(function(a){
        var status = a.presenca==='compareceu'?'Compareceu':a.presenca==='faltou'?'Faltou':a.presenca==='atrasou'?'Atrasou':a.status==='cancelada'?'Cancelada':'Agendada';
        var cor = a.presenca==='compareceu'?'#2e7d4f':a.presenca==='faltou'?'#c0392b':a.presenca==='atrasou'?'#c97d2e':'#888';
        var dataBR = fmtDataBR(a.date);
        return '<tr><td>'+dataBR+'</td><td>'+(a.time||'—')+'</td><td style="color:'+cor+';font-weight:600">'+status+'</td></tr>';
      }).join('')
    + '</table>'
    + '<div class="footer">Documento gerado em ' + hoje + ' via Teravia · Uso exclusivo do profissional · LGPD</div>'
    + '</body></html>';

  var win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function(){ win.print(); }, 400);
}

// Número de 5 dígitos ESTÁVEL por paciente (mesmo id → mesmo número sempre).
// Hash simples só para exibição — não é identificador criptográfico/legal.
function _prontuarioNumDeterministico(p) {
  var s = String((p && (p.id || p.name)) || 'x');
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return String(10000 + (h % 90000));
}

function exportarProntuario() {
  const p = patients[currentPatientIdx] || patients[0];
  if (!p) { showToast('Selecione um paciente primeiro.'); return; }

  const terapeuta = tfUserData || {};
  const notas = (p.prontuarioNotes || []);
  const hoje = new Date().toLocaleDateString('pt-BR');
  const hojeLong = new Date().toLocaleDateString('pt-BR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const initials = (p.name||'').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);

  // Recuperar email de suporte do terapeuta
  var emailSup = '';
  try { emailSup = JSON.parse(localStorage.getItem('tf_account')||'{}').email_suporte || ''; } catch(e){}

  // Sessões agendadas deste paciente (histórico) — identidade segura (patientId),
  // não patientIdx cru: este é um documento clínico exportado, o pior lugar
  // possível pra vir com o histórico de outro paciente.
  var sessoesPaciente = [];
  try {
    sessoesPaciente = _apptsDoPaciente(p, patients.indexOf(p)).filter(function(a){ return a.status !== 'cancelada'; })
      .sort(function(a,b){ return a.date < b.date ? -1 : 1; });
  } catch(e) {}

  // Humor médio (moodHistory pode ser number[] antigo ou {value,emoji,date}[] novo)
  var moodMedia = '';
  if (p.moodHistory && p.moodHistory.length) {
    var mh = p.moodHistory
      .filter(function(v){ return v !== null && v !== undefined; })
      .map(function(v){ return _normMoodVal(v); });
    if (mh.length) { moodMedia = (mh.reduce(function(s,v){return s+v;},0)/mh.length).toFixed(1) + '/10'; }
  }

  // Exercícios concluídos
  var exConc = (p.exercises||[]).filter(function(e){return e.done||((e.concluidos||0)>=(e.total||1));}).length;
  var exTotal = (p.exercises||[]).length;

  var htmlOut = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8"/>\n' +
    '<title>Prontuário — ' + escHTML(p.name) + '</title>\n<style>\n' +
    '* { box-sizing: border-box; margin: 0; padding: 0; }\n' +
    'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #1a1f1c; background:var(--white); }\n' +
    '.page { max-width: 760px; margin: 0 auto; padding: 48px 48px 60px; }\n' +
    '.letterhead { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #4a7c59; margin-bottom: 28px; }\n' +
    '.lh-left h1 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4a7c59; margin-bottom: 4px; }\n' +
    '.lh-left h2 { font-size: 26px; font-weight: 700; color: #1a1f1c; margin-bottom: 2px; }\n' +
    '.lh-left .crp { font-size: 12px; color: #6a7a70; }\n' +
    '.lh-right { text-align: right; font-size: 12px; color: #6a7a70; line-height: 1.7; }\n' +
    '.patient-header { display: flex; align-items: center; gap: 20px; background: #f0f5f1; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }\n' +
    '.patient-avatar { width: 56px; height: 56px; border-radius: 50%; background: #4a7c59; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; flex-shrink: 0; }\n' +
    '.patient-name { font-size: 22px; font-weight: 700; color: #1a1f1c; margin-bottom: 4px; }\n' +
    '.patient-meta { font-size: 12px; color: #6a7a70; display: flex; gap: 16px; flex-wrap: wrap; }\n' +
    '.section { margin-bottom: 28px; }\n' +
    '.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: #8a9490; border-bottom: 1px solid #dde3de; padding-bottom: 5px; margin-bottom: 12px; }\n' +
    '.field-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px 20px; margin-bottom: 10px; }\n' +
    '.field label { font-size: 10px; color: #8a9490; display: block; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .4px; }\n' +
    '.field span { font-size: 13px; font-weight: 500; }\n' +
    '.nota { border: 1px solid #dde3de; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; break-inside: avoid; }\n' +
    '.nota-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }\n' +
    '.nota-num { background: #4a7c59; color: #fff; border-radius: 5px; font-size: 11px; font-weight: 700; padding: 1px 7px; }\n' +
    '.nota-date { font-size: 11px; color: #8a9490; }\n' +
    '.nota-ia { background: #f0ecfa; color: #5a3e8a; border-radius: 4px; font-size: 10px; padding: 1px 6px; font-weight: 600; }\n' +
    '.nota-text { line-height: 1.75; white-space: pre-wrap; font-size: 13px; color: #2a2f2c; }\n' +
    '.stat-row { display: flex; gap: 12px; margin-bottom: 12px; }\n' +
    '.stat-box { flex: 1; background: #f7f8f6; border: 1px solid #dde3de; border-radius: 8px; padding: 12px 14px; text-align: center; }\n' +
    '.stat-num { font-size: 26px; font-weight: 700; color: #4a7c59; line-height: 1; margin-bottom: 4px; }\n' +
    '.stat-label { font-size: 10px; color: #8a9490; text-transform: uppercase; letter-spacing: .5px; }\n' +
    '.session-list { display: flex; flex-direction: column; gap: 6px; }\n' +
    '.session-item { display: flex; align-items: center; gap: 10px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }\n' +
    '.session-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a7c59; flex-shrink: 0; }\n' +
    '.sign-area { margin-top: 48px; display: flex; gap: 48px; }\n' +
    '.sign-box { flex: 1; }\n' +
    '.sign-line { height: 1px; background: #1a1f1c; margin-bottom: 6px; }\n' +
    '.sign-label { font-size: 11px; color: #6a7a70; }\n' +
    '.footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #dde3de; font-size: 10px; color: #8a9490; display: flex; justify-content: space-between; }\n' +
    '@media print { .page { padding: 24px; } body { font-size: 12px; } }\n' +
    '</style>\n</head>\n<body>\n<div class="page">\n' +

    // Cabeçalho
    '<div class="letterhead">' +
      '<div class="lh-left">' +
        '<h1>Prontuário Clínico</h1>' +
        '<h2>' + escHTML(terapeuta.nome || '—') + '</h2>' +
        '<div class="crp">CRP ' + escHTML(terapeuta.crp || '—') + ' · ' + escHTML(terapeuta.abordagem || 'Psicologia Clínica') + '</div>' +
        (emailSup ? '<div class="crp">' + escHTML(emailSup) + '</div>' : '') +
      '</div>' +
      '<div class="lh-right">' +
        'Documento gerado em<br/><strong>' + hojeLong + '</strong><br/>' +
        'Teravia · Uso exclusivamente clínico' +
      '</div>' +
    '</div>' +

    // Dados do paciente — header
    '<div class="patient-header">' +
      '<div class="patient-avatar">' + initials + '</div>' +
      '<div>' +
        '<div class="patient-name">' + escHTML(p.name||'—') + '</div>' +
        '<div class="patient-meta">' +
          (p.age ? '<span>🎂 ' + escHTML(p.age) + ' anos</span>' : '') +
          (p.cidade && p.cidade !== '—' ? '<span>📍 ' + escHTML(p.cidade) + '</span>' : '') +
          (p.abordagem ? '<span>⚕ ' + escHTML(p.abordagem) + '</span>' : '') +
          (p.cid && p.cid !== '—' ? '<span>🏷 CID: ' + escHTML(p.cid) + '</span>' : '') +
          '<span>'+_tfIcon('chart',11)+' Status: ' + escHTML(p.status||'—') + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Stats resumo
    '<div class="stat-row">' +
      '<div class="stat-box"><div class="stat-num">' + (p.sessions||0) + '</div><div class="stat-label">Sessões realizadas</div></div>' +
      '<div class="stat-box"><div class="stat-num">' + notas.length + '</div><div class="stat-label">Notas clínicas</div></div>' +
      (moodMedia ? '<div class="stat-box"><div class="stat-num">' + moodMedia + '</div><div class="stat-label">Humor médio</div></div>' : '') +
      (exTotal > 0 ? '<div class="stat-box"><div class="stat-num">' + exConc + '/' + exTotal + '</div><div class="stat-label">Exercícios concluídos</div></div>' : '') +
    '</div>' +

    // Queixa principal
    '<div class="section">' +
      '<div class="section-title">Queixa principal</div>' +
      '<p style="line-height:1.75;color:#2a2f2c;white-space:pre-wrap">' + escHTML(p.notes||'Não informado') + '</p>' +
    '</div>' +

    // Histórico de sessões agendadas
    (sessoesPaciente.length ? '<div class="section"><div class="section-title">Histórico de sessões (' + sessoesPaciente.length + ')</div><div class="session-list">' +
      sessoesPaciente.slice(-20).map(function(a,i){
        var d = fmtDataBR(a.date);
        return '<div class="session-item"><div class="session-dot"></div><span style="font-weight:500;min-width:80px">' + d + '</span><span style="color:#6a7a70">' + escHTML(a.time||'') + (a.abordagem ? ' · ' + escHTML(a.abordagem) : '') + '</span></div>';
      }).join('') +
    '</div></div>' : '') +

    // Notas clínicas
    '<div class="section">' +
      '<div class="section-title">Notas clínicas (' + notas.length + ' registros)</div>' +
      (notas.length === 0
        ? '<p style="color:#8a9490;font-style:italic">Nenhuma nota clínica registrada.</p>'
        : notas.map(function(n,i){
            return '<div class="nota">' +
              '<div class="nota-header">' +
                '<span class="nota-num">Sessão ' + (i+1) + '</span>' +
                '<span class="nota-date">' + (n.date||'—') + '</span>' +
                (n.ia ? '<span class="nota-ia">IA assistida</span>' : '') +
              '</div>' +
              '<div class="nota-text">' + (n.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' +
            '</div>';
          }).join('')
      ) +
    '</div>' +

    // Humor ao longo do tempo
    (p.moodHistory && p.moodHistory.length >= 2
      ? '<div class="section">' +
          '<div class="section-title">Humor ao longo do tempo (últimos ' + Math.min(p.moodHistory.length, 12) + ' registros)</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<tr style="background:#f7f8f6">' +
            p.moodHistory.slice(-12).map(function(v,i){ return '<th style="padding:5px 8px;border:1px solid #dde3de;text-align:center;font-weight:600;color:#4a7c59">' + _normMoodEmoji(v) + ' ' + _normMoodVal(v) + '/10</th>'; }).join('') +
          '</tr></table>' +
          '<div style="font-size:11px;color:#8a9490;margin-top:6px">Valores mais recentes à direita · Escala 1 (muito mal) a 10 (muito bem)</div>' +
        '</div>'
      : '') +

    // Exercícios
    (exTotal > 0
      ? '<div class="section">' +
          '<div class="section-title">Exercícios entre sessões (' + exConc + ' de ' + exTotal + ' concluídos)</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
          (p.exercises||[]).map(function(e){
            var feito = e.done || ((e.concluidos||0) >= (e.total||1));
            return '<div style="display:flex;align-items:flex-start;gap:10px;padding:7px 10px;border-radius:6px;background:' + (feito?'#f0f5f1':'#fafafa') + ';border:1px solid ' + (feito?'#c8dece':'#dde3de') + '">'
              + '<span style="font-size:14px;flex-shrink:0">' + (feito?'✅':'⬜') + '</span>'
              + '<div><div style="font-size:12.5px;font-weight:500;' + (feito?'text-decoration:line-through;color:#8a9490':'') + '">' + e.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>'
              + (e.desc ? '<div style="font-size:11px;color:#8a9490">' + e.desc.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' : '')
              + '</div></div>';
          }).join('') +
          '</div></div>'
      : '') +

    // Número do prontuário — determinístico a partir do id do paciente (antes
    // era Math.random() a cada exportação: reexportar o MESMO prontuário duas
    // vezes dava dois "números de protocolo" diferentes pro mesmo conteúdo).
    '<div style="background:#f0f5f1;border-radius:8px;padding:10px 14px;margin-bottom:24px;font-size:11px;color:#4a7c59;font-weight:600;letter-spacing:.5px">' +
      'Nº PRN-' + new Date().getFullYear() + '-' + _prontuarioNumDeterministico(p) +
      '<span style="font-weight:400;color:#8a9490;margin-left:12px">Gerado em ' + hoje + ' via Teravia</span>' +
    '</div>' +

    // Área de assinatura
    '<div class="sign-area">' +
      '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">' + escHTML(terapeuta.nome||'Terapeuta') + ' · CRP ' + escHTML(terapeuta.crp||'—') + '</div></div>' +
      '<div class="sign-box"><div class="sign-line"></div><div class="sign-label">Data e local</div></div>' +
    '</div>' +

    '<div class="footer"><span>Teravia — Plataforma clínica para psicólogos</span><span>Documento confidencial · Sigilo profissional CFP · LGPD Art. 11</span></div>' +
    '</div></body></html>';

  const win = window.open('', '_blank');
  if (!win) { showToast('Permita pop-ups para exportar o prontuário.'); return; }
  win.document.write(htmlOut);
  win.document.close();
  win.focus();
  setTimeout(function() { win.print(); }, 500);
  try { localStorage.setItem('tf_first_export', '1'); verificarMarcos(); } catch(e2){}
}

function editarNota(textoId, btn) {
  const el = document.getElementById(textoId);
  if (!el) return;
  if (el.tagName === 'TEXTAREA') {
    const div = document.createElement('p');
    div.id = textoId;
    div.style.cssText = 'font-size:13.5px;color:var(--ink-soft);line-height:1.7';
    div.textContent = el.value;
    el.replaceWith(div);
    btn.innerHTML = '✎ Editar';
    showToast('Nota atualizada.');
    return;
  }
  const ta = document.createElement('textarea');
  ta.id = textoId;
  ta.className = 'note-area';
  ta.style.minHeight = '90px';
  ta.value = el.textContent.trim();
  el.replaceWith(ta);
  ta.focus();
  btn.innerHTML = '✓ Salvar';
}

// ── MATERIAIS ────────────────────────────────────────────────────────────────
var _materialPatientIdx = null;

var MATERIAL_ICONS = { link:_tfIcon('link',15), artigo:_tfIcon('doc',15), video:_tfIcon('video',15), exercicio:_tfIcon('clip',15), texto:_tfIcon('doc',15) };
var MATERIAL_LABELS = { link:'Link', artigo:'Artigo', video:'Vídeo', exercicio:'Exercício', texto:'Anotação' };

function abrirModalMaterial() {
  document.getElementById('mat-titulo').value = '';
  document.getElementById('mat-url').value = '';
  document.getElementById('mat-desc').value = '';
  document.getElementById('mat-tipo').value = 'link';
  materialTipoChange();
  showModal('modal-material');
  setTimeout(function(){ document.getElementById('mat-titulo').focus(); }, 100);
}

function materialTipoChange() {
  var tipo = document.getElementById('mat-tipo').value;
  var urlGroup = document.getElementById('mat-url-group');
  urlGroup.style.display = tipo === 'texto' ? 'none' : '';
}

function salvarMaterial() {
  var titulo = (document.getElementById('mat-titulo').value || '').trim();
  if (!titulo) { document.getElementById('mat-titulo').style.borderColor='#e74c3c'; document.getElementById('mat-titulo').focus(); return; }
  var tipo = document.getElementById('mat-tipo').value;
  var url  = (document.getElementById('mat-url').value || '').trim();
  var desc = (document.getElementById('mat-desc').value || '').trim();
  if (_materialPatientIdx === null) return;
  var p = patients[_materialPatientIdx];
  if (!p) return;
  if (!p.materials) p.materials = [];
  var hoje = new Date();
  var dateStr = String(hoje.getDate()).padStart(2,'0')+'/'+String(hoje.getMonth()+1).padStart(2,'0')+'/'+hoje.getFullYear();
  p.materials.unshift({ id: Date.now(), tipo: tipo, titulo: titulo, url: url, desc: desc, date: dateStr, _up: Date.now() });
  salvarPacientes();
  closeModal('modal-material');
  if (typeof currentPatientTab !== 'undefined' && currentPatientTab === 'ficha') {
    renderPatientFicha(_materialPatientIdx);
  }
  showToast('Material adicionado!');
}


// ── Supervisão: init e funções de reflexão/autoconhecimento ──
function initSupervisao() {
  // Sincroniza o toggle com o estado persistido
  const supToggle = document.getElementById('sup-toggle');
  if (supToggle) supToggle.checked = !!supActivated;
  // Se desativado, mostra o onboarding (estado desativado) e não o dashboard.
  if (!supActivated) {
    document.getElementById('sup-dashboard').style.display = 'none';
    document.getElementById('sup-onboarding').style.display = 'flex';
    return;
  }
  // Ativado: dashboard visível, onboarding escondido
  document.getElementById('sup-onboarding').style.display = 'none';
  document.getElementById('sup-dashboard').style.display = 'block';
  // Garante abas corretas
  const alertasTab = document.getElementById('sup-tab-alertas');
  const carteiraTab = document.getElementById('sup-tab-carteira');
  const reflexoesTab = document.getElementById('sup-tab-reflexoes');
  const autoTab = document.getElementById('sup-tab-autoconhecimento');
  if (alertasTab) alertasTab.style.display = '';
  if (carteiraTab) carteiraTab.style.display = 'none';
  if (reflexoesTab) reflexoesTab.style.display = 'none';
  if (autoTab) autoTab.style.display = 'none';
  document.querySelectorAll('.sup-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  const loading = document.getElementById('sup-ai-loading');
  const content = document.getElementById('sup-ai-content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
  atualizarMetricasSupervisao();
  renderAlertasSupervisao();
  renderReflectionsList();
  // Atualiza pergunta de reflexão com dados reais
  var qDisplay = document.getElementById('reflection-question-display');
  if (qDisplay) {
    var qs = _gerarReflexoesDinamicas();
    qDisplay.textContent = '"' + qs[Math.floor(Math.random()*qs.length)] + '"';
  }
}

/* V1 (revisão 10/07): "Temas mais frequentes" era 100% fabricado no HTML —
 * agora conta keywords nas notas clínicas reais (mesma família do alerta de
 * temas). Estado vazio honesto quando não há notas suficientes. */
function _renderSupTemas() {
  var el = document.getElementById('sup-temas-list');
  if (!el) return;
  var kw = ['ansiedade','relacionamento','autoestima','trabalho','família','luto','sono','depressão','estresse','medo','raiva','autonomia','controle','abandono'];
  var contagem = {};
  (typeof patients !== 'undefined' ? patients : []).forEach(function(p) {
    (p.prontuarioNotes || []).forEach(function(n) {
      var txt = (n.text || '').toLowerCase();
      kw.forEach(function(t) { if (txt.includes(t)) contagem[t] = (contagem[t] || 0) + 1; });
    });
  });
  var top = Object.keys(contagem).map(function(t){ return { t: t, n: contagem[t] }; })
    .sort(function(a,b){ return b.n - a.n; }).slice(0, 7);
  if (!top.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">Os temas aparecem aqui conforme suas notas clínicas se acumulam.</div>';
    return;
  }
  var max = top[0].n;
  el.innerHTML = top.map(function(x) {
    var nome = x.t.charAt(0).toUpperCase() + x.t.slice(1);
    var pct = Math.max(8, Math.round(x.n / max * 100));
    return '<div class="sup-theme-row"><span class="sup-theme-name">' + nome + '</span><div class="sup-theme-bar-wrap"><div class="sup-theme-bar" style="width:' + pct + '%"></div></div><span class="sup-theme-count">' + x.n + ' nota' + (x.n === 1 ? '' : 's') + '</span></div>';
  }).join('');
}

function atualizarMetricasSupervisao() {
  _renderSupTemas();
  const ativos = patients.filter(p => p.status === 'Ativa' || p.status === 'Nova');
  const totalSessoes = patients.reduce((s, p) => s + (p.sessions || 0), 0);
  // Card "Alertas de risco": conta só alertas tipo 'risk' (humor em declínio /
  // palavras de risco nas notas). 'pattern'/'reflection' são organizacionais e já
  // entram em "Casos em atenção" — contá-los aqui inflava o número vermelho.
  var _alertasRiscoIds = new Set(gerarAlertasReais().filter(function(a){ return a.tipo === 'risk' && a.idx !== null; }).map(function(a){ return a.idx; }));
  const comAlerta = _alertasRiscoIds.size;
  // comAtencao: pacientes com humor baixo (<5) ou em queda ou com falta recente
  // (_normMoodVal: entradas do portal são {value,emoji} — comparação crua nunca batia. Lote 1)
  const comAtencao = patients.filter(function(p, i) {
    var moodBaixo = p.moodHistory && p.moodHistory.length > 0 && _normMoodVal(p.moodHistory[p.moodHistory.length-1]) < 5;
    var emQueda   = p.moodTrend === 'down';
    return moodBaixo || emQueda || p.status === 'Atenção';
  }).length;
  // emEvolucao: pacientes com >= 3 sessões e humor estável ou crescente
  const emEvolucao = patients.filter(function(p) {
    if ((p.sessions||0) < 3) return false;
    var mh = (p.moodHistory||[]).filter(function(v){ return v !== null && v !== undefined; })
      .map(function(v){ return _normMoodVal(v); });
    if (mh.length >= 2) {
      var trend = mh[mh.length-1] - mh[0];
      return trend >= 0;
    }
    return p.sessions >= 5; // fallback: 5+ sessões = em evolução
  }).length;
  const taxaEvolucao = patients.length > 0 ? Math.round(emEvolucao / patients.length * 100) : 0;

  // Hero
  const heroSub = document.querySelector('.sup-hero-sub');
  if (heroSub) heroSub.textContent = `Análise baseada em ${totalSessoes} ${totalSessoes !== 1 ? 'sessões' : 'sessão'} realizadas · ${ativos.length} ${ativos.length !== 1 ? 'pacientes' : 'paciente'} ${ativos.length !== 1 ? 'ativos' : 'ativo'}`;

  // Métricas
  const metCards = document.querySelectorAll('.sup-metric-value');
  if (metCards[0]) metCards[0].textContent = taxaEvolucao + '%';
  if (metCards[1]) metCards[1].textContent = comAtencao;
  if (metCards[2]) metCards[2].textContent = comAlerta;
  // Reflexões: conta a partir de localStorage (persistente)
  const reflCount = _loadReflections().length;
  if (metCards[3]) metCards[3].textContent = reflCount;
  // Atualiza deltas dinamicamente (evita valores hardcoded no HTML)
  const metDeltas = document.querySelectorAll('.sup-metric-delta');
  if (metDeltas[0]) {
    metDeltas[0].textContent = taxaEvolucao >= 60 ? 'Evolução saudável da carteira' : taxaEvolucao >= 30 ? 'Em progresso' : 'Poucos dados ainda';
    metDeltas[0].className = 'sup-metric-delta' + (taxaEvolucao >= 60 ? ' up' : '');
  }
  if (metDeltas[1]) {
    metDeltas[1].textContent = comAtencao > 0 ? '⚠ Atenção recomendada' : '✓ Sem alertas';
    metDeltas[1].className = 'sup-metric-delta' + (comAtencao > 0 ? ' warn' : '');
  }
  if (metDeltas[2]) {
    metDeltas[2].textContent = comAlerta > 0 ? 'Ver alertas abaixo' : '✓ Nenhum risco';
    metDeltas[2].className = 'sup-metric-delta' + (comAlerta > 0 ? ' down' : '');
  }
  if (metDeltas[3]) {
    metDeltas[3].textContent = reflCount > 0 ? 'Este mês' : 'Nenhuma ainda';
    metDeltas[3].className = 'sup-metric-delta' + (reflCount > 0 ? ' up' : '');
  }

  // Distribuição de estágios (Carteira)
  const iniciais    = patients.filter(p => p.sessions <= 4).length;
  const ativos2     = patients.filter(p => p.sessions >= 5 && p.sessions <= 20).length;
  const consolid    = patients.filter(p => p.sessions > 20).length;
  const total       = patients.length || 1;
  const barras = document.querySelectorAll('#sup-tab-carteira .progress-fill');
  if (barras[0]) { barras[0].style.width = Math.round(iniciais/total*100)+'%'; barras[0].style.background='var(--blue)'; }
  if (barras[1]) { barras[1].style.width = Math.round(ativos2/total*100)+'%'; }
  if (barras[2]) { barras[2].style.width = Math.round(consolid/total*100)+'%'; barras[2].style.background='var(--purple)'; }
  if (barras[3]) { barras[3].style.width = Math.round(comAtencao/total*100)+'%'; barras[3].style.background='var(--amber)'; }
  const distLabels = document.querySelectorAll('#sup-tab-carteira .progress-fill + * + *');
  // Atualiza contagens nos spans
  const stageSpans = document.querySelectorAll('#sup-tab-carteira .progress-bar');
  stageSpans.forEach((bar, i) => {
    const label = bar.previousElementSibling?.querySelector('span:last-child');
    if (label) {
      if (i === 0) label.textContent = iniciais + ' paciente' + (iniciais!==1?'s':'');
      if (i === 1) label.textContent = ativos2 + ' paciente' + (ativos2!==1?'s':'');
      if (i === 2) label.textContent = consolid + ' paciente' + (consolid!==1?'s':'');
      if (i === 3) label.textContent = comAtencao + ' paciente' + (comAtencao!==1?'s':'');
    }
  });

  // Tabela "Pacientes que merecem atenção" — quando não há ninguém real na lista,
  // o tbody tinha 3 pacientes FICTÍCIOS hardcoded em app.html (Rafael Andrade,
  // Pedro Alves, Juliana Costa, com linguagem de risco) que nunca eram limpos.
  // Mesma classe de bug das sessões-fantasma (17/07) — corrigido aqui com um
  // estado vazio honesto, no padrão já usado em _renderContratransferencia.
  const tbody = document.querySelector('#sup-tab-carteira table tbody');
  if (tbody) {
    const atentos = patients
      .map((p, i) => ({...p, _i: i}))
      .filter(p => p.alert || p.status === 'Atenção' || (p.mood !== null && p.mood < 6))
      .slice(0, 5);
    if (atentos.length > 0) {
      tbody.innerHTML = atentos.map(p => {
        const moodColor = p.mood === null ? 'tag-gray' : p.mood >= 7 ? 'tag-green' : p.mood >= 5 ? 'tag-amber' : 'tag-red';
        const moodVal = p.mood !== null ? p.mood + '/10' : '—';
        const obs = p.alert || (p.status === 'Atenção' ? 'Status de atenção — revisar plano.' : 'Humor baixo — monitorar.');
        return `<tr>
          <td><div class="patient-info"><div class="patient-avatar" style="background:${p.colorGrad||p.color||'#4a7c59'};color:#fff">${escHTML(p.initials||(p.name?p.name.trim().split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase():'?'))}</div><div><div class="patient-name">${escHTML(p.name)}</div><div class="patient-meta">${escHTML(p.abordagem||'')}</div></div></div></td>
          <td>Sessão ${p.sessions}</td>
          <td><span class="tag ${moodColor}">${moodVal}</span></td>
          <td style="font-size:13px;color:var(--ink-soft)">${escHTML(obs.length > 60 ? obs.slice(0,60)+'…' : obs)}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="currentBriefingPatientIdx=${p._i};navigate('briefing')">✦ Briefing</button></td>
        </tr>`;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px;font-size:13px">🌱 Nenhum paciente precisa de atenção especial esta semana.</td></tr>';
    }
  }
}

let supHasNewData = false;

function injectNewEvidenceIntoSupervisao() {
  // ⚠️ Este bloco injeta TRECHOS HARDCODED ("Camila · Sessão 12 · Crença nuclear") como
  // ilustração — só faz sentido no modo DEMO (cujo paciente fictício é a Camila). No uso
  // REAL, injetar essas citações em alertas de pacientes reais seria fabricar evidência
  // clínica. Gate obrigatório: fora do demo, não faz nada. (Auditoria 07/07 — crítico.)
  if (!window._tfDemo) return;

  // Inject a new alert card with real transcript evidence into supervisão
  const content = document.getElementById('sup-ai-content');
  if (!content) return;

  // Add "new session indexed" banner at top
  const existingBanner = document.getElementById('sup-new-session-banner');
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement('div');
  banner.id = 'sup-new-session-banner';
  banner.className = 'fade-in';
  banner.style.cssText = 'background:var(--purple-light);border:1px solid rgba(90,62,138,.2);border-radius:12px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;';
  banner.innerHTML = `
    <span style="font-size:18px">✦</span>
    <div style="flex:1">
      <div style="font-size:13.5px;font-weight:600;color:var(--purple)">${(() => { const sp = _tfSessionPatient(); return `Sessão ${sp.sessions} de ${escHTML(sp.name)} indexada agora`; })()}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">2 trechos sinalizados · nota clínica aprovada · análise atualizada</div>
    </div>
    <span class="sup-new-badge">✦ Novo</span>`;
  content.insertBefore(banner, content.firstChild);

  // Inject enriched evidence into the "Camila" positive alert
  const positiveAlert = content.querySelector('.sup-alert-card.positive');
  if (positiveAlert) {
    const existingEvidence = positiveAlert.querySelector('.evidence-quote');
    if (!existingEvidence) {
      const evidenceHtml = `
        <div style="margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">✦ Trechos da sessão 12</div>
          <div class="evidence-quote" onclick="navigate('sessao')" title="Clique para ver sessão">
            <div class="evidence-quote-text">"Fica mais leve. Mas na hora é difícil lembrar… acho que preciso de prática."</div>
            <div class="evidence-quote-meta">Camila · Sessão 12 · 24/03 · <a onclick="event.stopPropagation();navigate('sessao')">Ver contexto completo →</a></div>
          </div>
          <div class="evidence-quote" onclick="navigate('sessao')" title="Clique para ver sessão">
            <div class="evidence-quote-text">"Acho que vou travar, que vão me julgar, que não sei o suficiente… É muito intenso."</div>
            <div class="evidence-quote-meta">Camila · Sessão 12 · 24/03 · <span class="tag tag-purple" style="font-size:10px;padding:1px 6px">Crença nuclear</span> · <a onclick="event.stopPropagation();navigate('sessao')">Ver contexto →</a></div>
          </div>
        </div>`;
      positiveAlert.querySelector('.sup-alert-actions').insertAdjacentHTML('beforebegin', evidenceHtml);
    }
  }

  // Also inject evidence into the pattern alert (autonomia)
  const patternAlert = content.querySelector('.sup-alert-card.pattern');
  if (patternAlert) {
    const existingEvidence = patternAlert.querySelector('.evidence-quote');
    if (!existingEvidence) {
      const evidenceHtml = `
        <div style="margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">✦ Evidência mais recente</div>
          <div class="evidence-quote" onclick="navigate('sessao')">
            <div class="evidence-quote-text">"Usei quase todo dia. Percebi que fico ansiosa antes de apresentações no trabalho."</div>
            <div class="evidence-quote-meta">Camila · Sessão 12 · 24/03 · <a onclick="event.stopPropagation();navigate('sessao')">Ver contexto →</a></div>
          </div>
        </div>`;
      patternAlert.querySelector('.sup-alert-actions').insertAdjacentHTML('beforebegin', evidenceHtml);
    }
  }
}

function deactivateSupervisao() {
  // Substitui confirm() por modal inline — confirm() é bloqueado em iframes
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '400';
  overlay.innerHTML = `
    <div class="modal fade-in" style="max-width:400px">
      <div class="modal-title">Desativar Supervisão?</div>
      <div class="modal-body">Suas reflexões salvas serão mantidas. Você pode reativar a qualquer momento.</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-purple" onclick="confirmDeactivateSupervisao(this)">Desativar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function confirmDeactivateSupervisao(btn) {
  btn.closest('.modal-overlay').remove();
  supActivated = false;
  _salvarSupActivated();
  const toggle = document.getElementById('sup-toggle');
  if (toggle) toggle.checked = false;
  document.getElementById('sup-dashboard').style.display = 'none';
  document.getElementById('sup-onboarding').style.display = 'flex';
  showToast('Supervisão desativada. Você pode reativar a qualquer momento.');
}

function toggleSupervisao(checked) {
  supActivated = checked;
  _salvarSupActivated();
  if (checked) {
    document.getElementById('sup-onboarding').style.display = 'none';
    const dashboard = document.getElementById('sup-dashboard');
    dashboard.style.display = 'block';
    // Garante que a aba ativa está visível
    const alertasTab = document.getElementById('sup-tab-alertas');
    const carteiraTab = document.getElementById('sup-tab-carteira');
    const reflexoesTab = document.getElementById('sup-tab-reflexoes');
    if (alertasTab) alertasTab.style.display = '';
    if (carteiraTab) carteiraTab.style.display = 'none';
    if (reflexoesTab) reflexoesTab.style.display = 'none';
    // Garante tab ativa correta
    document.querySelectorAll('.sup-tab').forEach((t, i) => {
      t.classList.toggle('active', i === 0);
    });
    // Mostra conteúdo direto, sem loading
    const loading = document.getElementById('sup-ai-loading');
    const content = document.getElementById('sup-ai-content');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
    // CRÍTICO: renderiza os dados REAIS por cima do HTML demo estático — sem isto,
    // ativar o toggle numa conta real exibia o dossiê fabricado ("Rafael Andrade"
    // com citações inventadas, métricas 71%, reflexões falsas). Lote 4 (T-A11).
    if (typeof atualizarMetricasSupervisao === 'function') atualizarMetricasSupervisao();
    if (typeof renderAlertasSupervisao === 'function') renderAlertasSupervisao();
    if (typeof renderReflectionsList === 'function') renderReflectionsList();
  } else {
    document.getElementById('sup-dashboard').style.display = 'none';
    document.getElementById('sup-onboarding').style.display = 'flex';
  }
}

function switchSupTab(el, tabId) {
  el.closest('.sup-tab-bar').querySelectorAll('.sup-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['sup-tab-alertas','sup-tab-carteira','sup-tab-reflexoes','sup-tab-autoconhecimento'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = id === tabId ? '' : 'none';
  });
  if (tabId === 'sup-tab-autoconhecimento') renderAutoconhecimento();
}

function runSupAnalysis() {
  const loading = document.getElementById('sup-ai-loading');
  const content = document.getElementById('sup-ai-content');
  if (!content) return;
  // A análise é síncrona e local (gerarAlertasReais) — renderiza direto, sem o
  // loading encenado de 1,8s que fingia processamento (F4.6 #10a).
  if (loading) loading.style.display = 'none';
  content.style.display = 'block';
  var alertas = gerarAlertasReais();
  var bannerExist = document.getElementById('sup-new-session-banner');
  var bannerHtml = bannerExist ? bannerExist.outerHTML : '';
  if (alertas.length === 0) {
    content.innerHTML = bannerHtml + '<div style="text-align:center;padding:40px 20px;color:var(--muted)">'
      + '<div style="font-size:32px;margin-bottom:12px">🌿</div>'
      + '<div style="font-weight:600;margin-bottom:6px">Tudo certo por aqui!</div>'
      + '<div style="font-size:13px">Nenhum alerta clínico identificado esta semana.</div>'
      + '</div>';
  } else {
    content.innerHTML = bannerHtml + alertas.map(function(a){
      var acoes = a.idx !== null
        ? '<div class="sup-alert-actions">'
            + '<button class="btn btn-sm btn-secondary" onclick="currentBriefingPatientIdx='+a.idx+';navigate(\'briefing\')">✦ Briefing IA</button>'
            + '<button class="btn btn-sm btn-secondary" onclick="navigate(\'prontuarios\')">'+_tfIcon('clip',12)+' Prontuário</button>'
          + '</div>'
        : '';
      var pacBadge = a.paciente
        ? '<div class="sup-alert-patient"><span>'+escHTML(a.paciente)+'</span></div>'
        : '';
      return '<div class="sup-alert-card '+a.tipo+'">'
        + '<div class="sup-alert-icon">'+a.icon+'</div>'
        + '<div><div class="sup-alert-type">'+a.label+'</div>'
          + '<div class="sup-alert-title">'+a.titulo+'</div>'
          + '<div class="sup-alert-text">'+a.texto+'</div>'
          + pacBadge + acoes
        + '</div>'
        + '</div>';
    }).join('');
  }
  content.classList.add('fade-in');
  showToast('✦ Análise clínica atualizada.');
}

function _gerarReflexoesDinamicas() {
  // Gera perguntas de reflexão usando dados reais da carteira
  var qs = [
    "Em quais momentos você sentiu maior presença esta semana? Em quais se sentiu mais distante?",
    "O que você evitou abordar em alguma das sessões desta semana? O que impediu?",
    "Qual paciente ocupou mais espaço na sua mente fora das sessões? O que isso diz sobre o vínculo?",
    "Houve um momento de impasse ou silêncio que te desconfortou? O que esse desconforto revela?",
    "Como você está cuidando do seu próprio estado emocional enquanto acompanha casos difíceis?"
  ];
  // Personaliza com nomes reais
  var ativos = patients.filter(function(p){ return p.status === 'Ativa' && p.sessions >= 1; });
  if (ativos.length >= 2) {
    var p1 = ativos[0].name.split(' ')[0];
    var p2 = ativos[Math.min(1, ativos.length-1)].name.split(' ')[0];
    qs.push('Quando '+p1+' progride, o que você sente? Quando regride, o que muda em você?');
    qs.push('O que ficou inacabado na última sessão com '+p2+'? Você evitou algum tema?');
  }
  if (ativos.length >= 1) {
    var pA = ativos[0].name.split(' ')[0];
    qs.push('Quando você pensa em '+pA+', qual emoção aparece primeiro? O que essa emoção te diz sobre o processo?');
  }
  // Detecta tema emergente nas notas
  var temas = {};
  patients.forEach(function(p){
    (p.prontuarioNotes||[]).forEach(function(n){
      ['autonomia','limite','abandono','controle','raiva','ansiedade','luto','dependência'].forEach(function(t){
        if ((n.text||'').toLowerCase().includes(t)) temas[t] = (temas[t]||0)+1;
      });
    });
  });
  var temaTop = Object.entries(temas).sort(function(a,b){return b[1]-a[1];})[0];
  if (temaTop && temaTop[1] >= 2) {
    qs.push(temaTop[1]+' pacientes trouxeram o tema de '+temaTop[0]+' nas últimas notas. O que esse tema desperta em você como terapeuta?');
  }
  return qs;
}

function showReflectionModal(context) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.zIndex = '300';

  var qs = _gerarReflexoesDinamicas();
  let q = qs[Math.floor(Math.random() * qs.length)];

  overlay.innerHTML = `
    <div class="sup-reflection-modal fade-in">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--purple-light);display:flex;align-items:center;justify-content:center;color:var(--purple)">${_tfIcon('eye',17)}</div>
        <div>
          <div style="font-family:'Instrument Serif',serif;font-size:18px">Reflexão pós-sessão</div>
          <div style="font-size:12px;color:var(--muted)">Registrada apenas para você · não compartilhada</div>
        </div>
      </div>
      <div class="sup-reflection-q">"${q}"</div>
      <textarea class="sup-reflection-area" id="modal-reflection-text" placeholder="Escreva o que vier à mente, sem julgamento…"></textarea>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-purple" onclick="saveModalReflection(this, '${q}')">Salvar reflexão</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('textarea').focus(), 100);
}

// ── Reflexões: persistência em localStorage ──
function _loadReflections() {
  try { return JSON.parse(localStorage.getItem('tf_reflections') || '[]'); } catch(e) { return []; }
}
function _saveReflections(arr) {
  try { localStorage.setItem('tf_reflections', JSON.stringify(arr)); } catch(e) {}
}
function _pushReflection(entry) {
  var arr = _loadReflections();
  arr.unshift(entry);
  _saveReflections(arr.slice(0, 50)); // máx 50 reflexões
}
function _renderReflectionCard(r) {
  var tagClass = r.tag === 'Ponto cego' ? 'tag-amber' : r.tag === 'Evolução positiva' ? 'tag-green' : 'tag-purple';
  return '<div class="card card-sm fade-in">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
      + '<span class="tag '+tagClass+'">'+(r.tag||'Questão aberta')+'</span>'
      + '<span style="font-size:12px;color:var(--muted)">'+escHTML(r.date)+'</span>'
    + '</div>'
    + (r.question ? '<div style="font-size:12px;color:var(--muted);font-style:italic;margin-bottom:6px">"'+escHTML(r.question.substring(0,70))+(r.question.length>70?'…':'')+'"</div>' : '')
    + '<div style="font-size:13.5px;color:var(--ink-soft);line-height:1.7">'+escHTML(r.text)+'</div>'
    + '</div>';
}
function renderReflectionsList() {
  var list = document.getElementById('reflections-list');
  if (!list) return;
  _atualizarBadgeConsistencia();
  var arr = _loadReflections();
  if (!arr.length) {
    list.innerHTML = '<div style="text-align:center;padding:28px 16px;color:var(--muted);font-size:13px;font-style:italic">Nenhuma reflexão registrada ainda. Use o botão acima para começar.</div>';
    return;
  }
  // Análise de padrões emocionais nas próprias reflexões
  var padroes = _analisarPadroesReflexoes();
  var padroesHtml = '';
  if (padroes) {
    var termos = padroes.map(function(p){ return '"' + p[0] + '" (' + p[1] + 'x)'; }).join(', ');
    padroesHtml = '<div style="background:var(--purple-light);border:1px solid rgba(90,62,138,.15);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13px;line-height:1.6">'
      + '<span style="font-size:11px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Padrão nas suas reflexões</span>'
      + 'Você usa com frequência: ' + termos + '. Esses temas recorrentes podem merecer atenção em sua própria supervisão.'
    + '</div>';
  }
  list.innerHTML = padroesHtml + arr.map(_renderReflectionCard).join('');
}

function saveModalReflection(btn, question) {
  const text = document.getElementById('modal-reflection-text').value.trim();
  if (!text) { showToast('Escreva algo antes de salvar.'); return; }
  btn.closest('.modal-overlay').remove();
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+' · '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  _pushReflection({ date: dateStr, tag: 'Questão aberta', question: question, text: text });
  renderReflectionsList();
  showToast('Reflexão salva.');
  atualizarMetricasSupervisao();
}

function saveReflection() {
  const text = document.getElementById('new-reflection-text')?.value.trim();
  const tag = document.getElementById('reflection-tag-select')?.value || 'Reflexão';
  if (!text) { showToast('Escreva algo antes de salvar.'); return; }
  const now = new Date();
  const dateStr = String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+' · '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  _pushReflection({ date: dateStr, tag: tag, text: text });
  const textEl = document.getElementById('new-reflection-text');
  if (textEl) textEl.value = '';
  renderReflectionsList();
  atualizarMetricasSupervisao();
  // Rotaciona pergunta com dados reais
  const qEl = document.getElementById('reflection-question-display');
  if (qEl) {
    var qs = _gerarReflexoesDinamicas();
    qEl.textContent = '"'+qs[Math.floor(Math.random()*qs.length)]+'"';
  }
  showToast('Reflexão salva.');
}

// ═══════════════════════════════════════════════
// REFLEXÕES — consistência, padrões, exportação e prompt pós-sessão
// ═══════════════════════════════════════════════

function _calcConsistenciaReflexoes() {
  var arr = _loadReflections();
  // Verifica quantas das últimas 4 semanas tiveram ao menos 1 reflexão
  var semanas = 0;
  for (var w = 0; w < 4; w++) {
    var start = new Date(); start.setDate(start.getDate() - start.getDay() - w * 7); start.setHours(0,0,0,0);
    var end   = new Date(start); end.setDate(end.getDate() + 7);
    var startIso = localDateISO(start);
    var endIso   = localDateISO(end);
    // reflexões têm date no formato "DD/MM · HH:MM" — tentar converter
    var temReflexao = arr.some(function(r) {
      if (!r.date) return false;
      var parts = r.date.split('/');
      if (parts.length < 2) return false;
      var day = parseInt(parts[0]); var mon = parseInt(parts[1]);
      var year = new Date().getFullYear();
      var iso = year + '-' + String(mon).padStart(2,'0') + '-' + String(day).padStart(2,'0');
      return iso >= startIso && iso < endIso;
    });
    if (temReflexao) semanas++;
  }
  return { semanas: semanas, de: 4 };
}

function _atualizarBadgeConsistencia() {
  var badge = document.getElementById('reflexoes-consistencia-badge');
  if (!badge) return;
  var c = _calcConsistenciaReflexoes();
  if (c.semanas >= 4) {
    badge.textContent = '✓ 4 semanas seguidas';
    badge.style.cssText = 'font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;background:var(--sage-light);color:var(--sage-dark);border:1px solid var(--sage-mid)';
  } else if (c.semanas >= 2) {
    badge.textContent = c.semanas + ' de 4 semanas';
    badge.style.cssText = 'font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;background:var(--amber-light);color:var(--amber);border:1px solid rgba(201,125,46,.3)';
  } else {
    badge.textContent = 'Reflita semanalmente';
    badge.style.cssText = 'font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;background:var(--bg);color:var(--muted);border:1px solid var(--border)';
  }
}

function _analisarPadroesReflexoes() {
  var arr = _loadReflections();
  if (arr.length < 3) return null;
  var emocoes = ['ansiedade','frustração','desconforto','cansaço','dúvida','insegurança','satisfação','alegria','conexão','impasse','dificuldade','raiva'];
  var counts = {};
  arr.forEach(function(r) {
    var texto = (r.text || '').toLowerCase();
    emocoes.forEach(function(e) {
      if (texto.includes(e)) counts[e] = (counts[e] || 0) + 1;
    });
  });
  var top = Object.entries(counts).sort(function(a,b){ return b[1]-a[1]; }).filter(function(e){ return e[1] >= 2; }).slice(0, 3);
  return top.length ? top : null;
}

function exportarReflexoes() {
  var arr = _loadReflections();
  if (!arr.length) { showToast('Nenhuma reflexão para exportar.'); return; }
  var nome = (typeof tfUserData !== 'undefined' && tfUserData.nome) ? tfUserData.nome : 'Terapeuta';
  var lines = ['Reflexões clínicas — ' + nome, 'Exportado em ' + new Date().toLocaleDateString('pt-BR'), '═'.repeat(50), ''];
  arr.forEach(function(r) {
    lines.push('[' + (r.date || '') + '] ' + (r.tag || ''));
    if (r.question) lines.push('Questão: ' + r.question);
    lines.push(r.text || '');
    lines.push('─'.repeat(40));
    lines.push('');
  });
  var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var mes = String(new Date().getMonth()+1).padStart(2,'0');
  a.href = url; a.download = 'reflexoes-teravia-' + new Date().getFullYear() + '-' + mes + '.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('Reflexões exportadas com sucesso.');
}

function _mostrarPromptReflexao(p) {
  // Preferência da IA "reflexao" desligada → sem convite pós-sessão (item 2)
  if (typeof _iaPrefOn === 'function' && !_iaPrefOn('reflexao')) return;
  var existente = document.getElementById('prompt-reflexao-posssessao');
  if (existente) existente.remove();
  var nome = p ? _firstName(p.name) : 'paciente';
  var banner = document.createElement('div');
  banner.id = 'prompt-reflexao-posssessao';
  banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);z-index:8000;'
    + 'background:var(--sage-light);border:1px solid var(--sage-mid);border-radius:14px;padding:14px 20px;'
    + 'display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,.12);'
    + 'max-width:520px;width:calc(100% - 48px);transition:transform .35s cubic-bezier(.34,1.56,.64,1)';
  banner.innerHTML = '<span style="display:inline-flex;color:var(--sage-dark)">' + _tfIcon('eye',18) + '</span>'
    + '<div style="flex:1">'
      + '<div style="font-size:13.5px;font-weight:600;color:var(--sage-dark)">Sessão com ' + escHTML(nome) + ' encerrada</div>'
      + '<div style="font-size:12px;color:var(--sage);margin-top:2px">Quer registrar uma reflexão enquanto está fresco?</div>'
    + '</div>'
    + '<button class="btn btn-sage btn-sm" onclick="document.getElementById(\'prompt-reflexao-posssessao\').remove();showReflectionModal()">✍ Refletir</button>'
    + '<button onclick="document.getElementById(\'prompt-reflexao-posssessao\').remove()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1;padding:2px 4px">✕</button>';
  document.body.appendChild(banner);
  requestAnimationFrame(function() {
    banner.style.transform = 'translateX(-50%) translateY(0)';
  });
  var timer = setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
  banner.querySelector('.btn-sage').addEventListener('click', function() { clearTimeout(timer); });
}

// ═══════════════════════════════════════════════
// MINHA SUPERVISÃO — autoconhecimento do terapeuta
// ═══════════════════════════════════════════════

function renderAutoconhecimento() {
  _renderCheckinSliders();
  _renderCheckinHistorico();
  _renderContratransferencia();
  _renderPerguntasSupervPares();
}

function _renderCheckinSliders() {
  var dims = [
    { id: 'ci-energia',    label: 'Energia clínica',        desc: 'Sua vitalidade para os atendimentos' },
    { id: 'ci-equilibrio', label: 'Equilíbrio emocional',   desc: 'Separar trabalho da vida pessoal' },
    { id: 'ci-satisfacao', label: 'Satisfação profissional', desc: 'O trabalho está fazendo sentido' }
  ];
  var container = document.getElementById('checkin-sliders');
  if (!container) return;
  var saved = _loadCheckinSemana();
  container.innerHTML = dims.map(function(d) {
    var val = saved ? (saved[d.id] || 5) : 5;
    return '<div style="background:rgba(74,124,89,.05);border:1px solid var(--border);border-radius:10px;padding:14px">'
      + '<div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:3px">' + d.label + '</div>'
      + '<div style="font-size:11.5px;color:var(--muted);margin-bottom:10px">' + d.desc + '</div>'
      + '<input type="range" min="1" max="10" value="' + val + '" id="' + d.id + '" style="width:100%;accent-color:var(--purple)">'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px">'
        + '<span>Baixo</span>'
        + '<span id="' + d.id + '-val" style="font-weight:700;color:var(--purple)">' + val + '/10</span>'
        + '<span>Alto</span>'
      + '</div>'
    + '</div>';
  }).join('');
  dims.forEach(function(d) {
    var input = document.getElementById(d.id);
    if (!input) return;
    input.oninput = function() {
      var el = document.getElementById(d.id + '-val');
      if (el) el.textContent = input.value + '/10';
    };
  });
}

function _loadCheckinSemana() {
  try {
    var arr = JSON.parse(localStorage.getItem('tf_checkin_terapeuta') || '[]');
    if (!arr.length) return null;
    var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var weekStartIso = localDateISO(weekStart);
    return arr.find(function(c){ return c.date >= weekStartIso; }) || null;
  } catch(e) { return null; }
}

function salvarCheckInTerapeuta() {
  var entry = { date: localDateISO(new Date()) };
  ['ci-energia','ci-equilibrio','ci-satisfacao'].forEach(function(id) {
    var el = document.getElementById(id);
    entry[id] = el ? parseInt(el.value) : 5;
  });
  try {
    var arr = JSON.parse(localStorage.getItem('tf_checkin_terapeuta') || '[]');
    var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var weekStartIso = localDateISO(weekStart);
    arr = arr.filter(function(c){ return c.date < weekStartIso; });
    arr.unshift(entry);
    localStorage.setItem('tf_checkin_terapeuta', JSON.stringify(arr.slice(0, 12)));
    _renderCheckinHistorico();
    showToast('Check-in salvo. Autoconhecimento em dia.');
  } catch(e) { showToast('Erro ao salvar check-in.'); }
}

function _renderCheckinHistorico() {
  var container = document.getElementById('checkin-historico');
  if (!container) return;
  try {
    var arr = JSON.parse(localStorage.getItem('tf_checkin_terapeuta') || '[]').slice(0, 4);
    if (!arr.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;margin-top:4px">Últimas semanas</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px">'
      + arr.map(function(c) {
          var media = ((c['ci-energia']||5) + (c['ci-equilibrio']||5) + (c['ci-satisfacao']||5)) / 3;
          var color = media >= 7 ? 'var(--sage)' : media >= 5 ? 'var(--amber)' : 'var(--red)';
          var dt = new Date(c.date + 'T12:00:00');
          var dtStr = String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0');
          return '<div style="display:flex;align-items:center;gap:10px;font-size:12.5px">'
            + '<span style="color:var(--muted);width:42px;flex-shrink:0">' + dtStr + '</span>'
            + '<div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">'
              + '<div style="height:100%;width:' + Math.round(media/10*100) + '%;background:' + color + ';border-radius:3px"></div>'
            + '</div>'
            + '<span style="color:' + color + ';font-weight:700;width:32px;text-align:right">' + media.toFixed(1) + '</span>'
          + '</div>';
        }).join('')
      + '</div>';
  } catch(e) {}
}

function _analisarContratransferencia() {
  var insights = [];
  var emotionWords = ['difícil','pesado','desconforto','resistente','cansativo','frustrante','travado','impasse','bloqueado','esgotante','desgastante'];

  patients.forEach(function(p, idx) {
    var notas = p.prontuarioNotes || [];
    if (notas.length < 2) return;
    var textos = notas.map(function(n){ return (n.text || '').toLowerCase(); });

    // 1. Carga emocional elevada na linguagem das notas
    var emoCount = textos.filter(function(t){
      return emotionWords.some(function(w){ return t.includes(w); });
    }).length;
    if (emoCount / notas.length >= 0.45) {
      insights.push({
        tipo: 'contratransferencia',
        titulo: 'Carga emocional elevada com ' + escHTML(p.name),
        texto: Math.round(emoCount/notas.length*100) + '% das notas de ' + escHTML(p.name.split(' ')[0]) + ' contêm palavras que indicam sobrecarga (impasse, resistência, dificuldade). Esse padrão pode refletir contratransferência — vale explorar o que esse vínculo desperta em você.',
        paciente: p.name
      });
    }

    // 2. Notas sistematicamente muito curtas (evitação de conteúdo)
    var curtas = textos.filter(function(t){ return t.length < 90; }).length;
    if (notas.length >= 3 && curtas / notas.length >= 0.5) {
      insights.push({
        tipo: 'ponto-cego',
        titulo: 'Registros breves com ' + escHTML(p.name),
        texto: 'Mais da metade das notas de ' + escHTML(p.name.split(' ')[0]) + ' têm menos de 90 caracteres. Notas muito curtas em casos específicos podem indicar evitação de conteúdos desconfortáveis ou dificuldade de elaborar o que ocorreu na sessão.',
        paciente: p.name
      });
    }

    // 3. Tema presente na queixa mas ausente nas notas (pontos cegos temáticos)
    if (p.notes && notas.length >= 3) {
      var queixa = (p.notes).toLowerCase();
      var notasTexto = textos.join(' ');
      ['família','relacionamento','trauma','luto','infância','sexualidade','violência','abuso'].forEach(function(tema) {
        if (queixa.includes(tema) && !notasTexto.includes(tema)) {
          insights.push({
            tipo: 'ponto-cego',
            titulo: 'Tema "' + tema + '" ausente nas notas de ' + escHTML(p.name),
            texto: 'O tema "' + tema + '" aparece na queixa inicial de ' + escHTML(p.name.split(' ')[0]) + ', mas não está presente em nenhuma das ' + notas.length + ' notas clínicas. Pode ser uma omissão natural — ou um tema que você inconscientemente evita aprofundar.',
            paciente: p.name
          });
        }
      });
    }
  });

  // 4. Tema ausente sistematicamente em todos os pacientes (viés estrutural)
  var topicsCheck = ['família','trauma','relacionamento','sexualidade','raiva','controle','abuso'];
  topicsCheck.forEach(function(tema) {
    var emQueixa = patients.filter(function(p){ return (p.notes||'').toLowerCase().includes(tema); });
    var emNotas  = patients.filter(function(p){
      return (p.prontuarioNotes||[]).some(function(n){ return (n.text||'').toLowerCase().includes(tema); });
    });
    if (emQueixa.length >= 2 && emNotas.length === 0) {
      insights.push({
        tipo: 'contratransferencia',
        titulo: 'Viés sistemático: "' + tema + '" nunca aparece nas notas',
        texto: emQueixa.length + ' pacientes citam "' + tema + '" na queixa inicial, mas o tema não aparece nas notas de nenhum deles. Isso pode indicar um ponto cego sistemático — um tema que você tende a não registrar ou aprofundar.',
        paciente: null
      });
    }
  });

  return insights.slice(0, 5);
}

function _renderContratransferencia() {
  var container = document.getElementById('sup-contratransf-content');
  if (!container) return;
  var insights = _analisarContratransferencia();
  if (!insights.length) {
    container.innerHTML = '<div style="text-align:center;padding:28px 16px;color:var(--muted);font-size:13px;line-height:1.6">'
      + '<div style="font-size:28px;margin-bottom:8px">🌱</div>'
      + '<strong style="color:var(--ink)">Nenhum padrão preocupante identificado</strong><br>'
      + 'Continue registrando notas clínicas para que a análise fique mais precisa ao longo do tempo.'
      + '</div>';
    return;
  }
  container.innerHTML = insights.map(function(a) {
    var icon = a.tipo === 'contratransferencia' ? _tfIcon('eye',15) : _tfIcon('search',15);
    var tipoCls = a.tipo === 'contratransferencia' ? 'reflection' : 'note';
    var tipoLabel = a.tipo === 'contratransferencia' ? 'Contratransferência · Atenção' : 'Ponto cego · Observação';
    return '<div class="sup-alert-card ' + tipoCls + '" style="margin-bottom:12px">'
      + '<div class="sup-alert-icon">' + icon + '</div>'
      + '<div style="flex:1">'
        + '<div class="sup-alert-type">' + tipoLabel + '</div>'
        + '<div class="sup-alert-title">' + a.titulo + '</div>'
        + '<div class="sup-alert-text">' + a.texto + '</div>'
        + (a.paciente ? '<div class="sup-alert-patient"><span>' + escHTML(a.paciente) + '</span></div>' : '')
        + '<div class="sup-alert-actions"><button class="btn btn-sm btn-secondary" onclick="showReflectionModal()">✍ Refletir sobre isso</button></div>'
      + '</div>'
    + '</div>';
  }).join('');
}

function _gerarPerguntasSupervPares() {
  var qs = [
    'Qual paciente você mais resistiu em atender esta semana? O que essa resistência revela sobre você?',
    'Você evitou algum silêncio esta semana, preenchendo o espaço antes de ser necessário? Por quê?',
    'Há algum paciente que você está "protegendo" de um insight que poderia acelerar — mas também desconfortabilizar — o processo?',
    'Quais valores seus podem estar influenciando a direção do tratamento de algum paciente sem que você perceba?',
    'Em algum momento você se sentiu mais ansioso com o problema do paciente do que ele mesmo? O que isso diz?'
  ];

  var ativos = patients.filter(function(p){ return (p.sessions||0) >= 3; });

  var longos = ativos.filter(function(p){ return (p.sessions||0) >= 15; });
  if (longos.length) {
    var pl = longos[0];
    qs.push('Com ' + escHTML(pl.name.split(' ')[0]) + ' já em ' + pl.sessions + ' sessões, o processo ainda está avançando — ou se tornou uma zona de conforto para você também?');
  }

  var estagnados = ativos.filter(function(p){ return (p.progress !== undefined && p.progress < 30 && (p.sessions||0) >= 6); });
  if (estagnados.length) {
    var pe = estagnados[0];
    qs.push('O caso de ' + escHTML(pe.name.split(' ')[0]) + ' parece estagnado. Que emoção aparece em você quando pensa nisso — frustração, resignação, alívio?');
  }

  var comMelhora = ativos.filter(function(p){
    var mh = (p.moodHistory||[]).filter(function(v){return v!=null;});
    return mh.length >= 2 && mh[mh.length-1] > mh[0];
  });
  if (comMelhora.length >= 2 && patients.length >= 4) {
    qs.push('Você se sente melhor após atender pacientes que estão progredindo? Como isso pode influenciar sua postura com quem está estagnado?');
  }

  var temasTodos = {};
  patients.forEach(function(p){
    var notas = (p.prontuarioNotes||[]).map(function(n){ return (n.text||'').toLowerCase(); }).join(' ');
    ['autonomia','dependência','raiva','família','limite','abandono'].forEach(function(t){
      if (notas.includes(t)) temasTodos[t] = (temasTodos[t]||0) + 1;
    });
  });
  var temaTop = Object.entries(temasTodos).sort(function(a,b){return b[1]-a[1];})[0];
  if (temaTop && temaTop[1] >= 2) {
    qs.push(temaTop[1] + ' pacientes trouxeram o tema de "' + temaTop[0] + '". Esse tema ressoa com algo na sua própria história? Como isso pode estar influenciando suas intervenções?');
  }

  qs.push('Há algum valor cultural, religioso ou socioeconômico de um paciente que você teve dificuldade em não julgar internamente?');

  return qs.slice(0, 5);
}

function _renderPerguntasSupervPares() {
  var container = document.getElementById('sup-peer-questions');
  if (!container) return;
  var qs = _gerarPerguntasSupervPares();
  container.innerHTML = qs.map(function(q, i) {
    return '<div style="background:var(--purple-light);border:1px solid rgba(90,62,138,.15);border-radius:10px;padding:14px 16px">'
      + '<div style="font-size:11px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Para refletir · Questão ' + (i+1) + '</div>'
      + '<div style="font-size:14px;color:var(--ink);line-height:1.7;font-style:italic">"' + q + '"</div>'
      + '<button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="showReflectionModal()">✍ Registrar reflexão</button>'
    + '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════
// BRIDGE: ONBOARDING ↔ APP
// ═══════════════════════════════════════════════
// tfUserData e ABORDAGEM_KEY_MAP declarados em 00-globals.js
