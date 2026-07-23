// 16-busca-global.js — Busca global (inline stubs + overlay Ctrl+K), escHTML, showToast, _firstName

/* ── LOGIN ── */
// ── BUSCA GLOBAL ─────────────────────────────────────────────
function globalSearchInput(q) {
  q = (q || '').trim().toLowerCase();
  const box = document.getElementById('global-search-results');
  if (!box) return;
  if (q.length < 2) { box.style.display = 'none'; return; }

  var results = [];

  // Pacientes
  patients.forEach(function(p, i) {
    var score = 0;
    var match = '';
    if (p.name && p.name.toLowerCase().includes(q)) { score = 10; match = p.name; }
    else if (p.notes && p.notes.toLowerCase().includes(q)) { score = 5; match = p.notes.slice(0, 60) + '…'; }
    else if (p.cidade && p.cidade.toLowerCase().includes(q)) { score = 3; match = p.cidade; }
    else if (p.cid && p.cid.toLowerCase().includes(q)) { score = 3; match = 'CID: ' + p.cid; }
    if (score > 0) results.push({ type:'paciente', icon:'⊙', label: p.name, sub: match !== p.name ? match : (p.abordagem || '—'), score, action: function(){ navigate('pacientes'); setTimeout(function(){ selectPatient(i); }, 100); } });
  });

  // Notas clínicas
  patients.forEach(function(p, i) {
    (p.prontuarioNotes || []).forEach(function(n) {
      if (n.text && n.text.toLowerCase().includes(q)) {
        var snippet = n.text;
        var idx = snippet.toLowerCase().indexOf(q);
        snippet = '…' + snippet.slice(Math.max(0, idx - 20), idx + 60) + '…';
        results.push({ type:'nota', icon:'≡', label: p.name + ' — nota', sub: snippet, score: 4, action: function(){ navigate('prontuarios'); setTimeout(function(){ selectPatient(i); }, 100); } });
      }
    });
  });

  // Tarefas
  var tfTasks = [];
  try { tfTasks = JSON.parse(localStorage.getItem('tf_tasks') || '[]'); } catch(e) {}
  tfTasks.forEach(function(t) {
    if (t.title && t.title.toLowerCase().includes(q)) {
      results.push({ type:'tarefa', icon:'☑', label: t.title, sub: (t.patientName || '') + (t.dueDate ? ' · ' + t.dueDate : ''), score: 6, action: function(){ navigate('tarefas'); } });
    }
  });

  results.sort(function(a,b){ return b.score - a.score; });
  results = results.slice(0, 8);

  if (results.length === 0) {
    box.innerHTML = '<div style="padding:16px;text-align:center"><div style="font-size:12.5px;color:#8fb89c;margin-bottom:6px">Nenhum resultado para "' + escHTML(q) + '"</div><div style="font-size:11px;color:#556;line-height:1.5">Tente o nome do paciente, trecho de nota clínica ou título de tarefa.</div></div>';
  } else {
    var typeLabel = { paciente:'Paciente', nota:'Nota clínica', tarefa:'Tarefa' };
    box.innerHTML = results.map(function(r, idx) {
      return '<div class="gsearch-item" data-idx="' + idx + '" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);display:flex;align-items:flex-start;gap:10px;transition:background .1s" onmousedown="globalSearchGo(' + idx + ')" onmouseenter="gsearchHover(this)" onmouseleave="gsearchUnhover(this)">' +
        '<span style="font-size:14px;flex-shrink:0;margin-top:1px;opacity:.7">' + r.icon + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:500;color:#e8f0ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHTML(r.label) + '</div>' +
        '<div style="font-size:11px;color:#8fb89c;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHTML(r.sub || '') + '</div></div>' +
        '<span style="font-size:10px;color:#6a7a6d;background:rgba(255,255,255,.05);padding:2px 7px;border-radius:20px;flex-shrink:0;margin-top:2px">' + (typeLabel[r.type] || r.type) + '</span>' +
      '</div>';
    }).join('');
  }

  box._results = results;
  box.style.display = 'block';
}

function globalSearchGo(idx) {
  var box = document.getElementById('global-search-results');
  if (!box || !box._results) return;
  var r = box._results[idx];
  if (r && r.action) {
    closeGlobalSearch();
    document.getElementById('global-search-input').value = '';
    r.action();
  }
}

function closeGlobalSearch() {
  var box = document.getElementById('global-search-results');
  if (box) box.style.display = 'none';
}

function globalSearchKey(e) {
  if (e.key === 'Escape') { closeGlobalSearch(); document.getElementById('global-search-input').blur(); }
}

function gsearchHover(el) { el.style.background = 'rgba(74,124,89,.2)'; }
function gsearchUnhover(el) { el.style.background = ''; }

/* ══════════════════════════════════════════════════════════
   BUSCA GLOBAL — overlay Ctrl+K
══════════════════════════════════════════════════════════ */
var _gsActiveIdx = -1;

function abrirBuscaGlobal() {
  var ov = document.getElementById('global-search-overlay');
  var inp = document.getElementById('gs-input');
  if (!ov) return;
  ov.classList.add('visible');
  document.body.style.overflow = 'hidden';
  setTimeout(function(){ if (inp) { inp.value = ''; inp.focus(); } }, 60);
  executarBuscaGlobal('');
}

function fecharBuscaGlobal() {
  var ov = document.getElementById('global-search-overlay');
  if (ov) ov.classList.remove('visible');
  document.body.style.overflow = '';
  _gsActiveIdx = -1;
}

function executarBuscaGlobal(q) {
  var box = document.getElementById('gs-results');
  if (!box) return;
  _gsActiveIdx = -1;
  q = (q || '').toLowerCase().trim();

  var resultados = [];

  // ── Pacientes
  patients.forEach(function(p, i) {
    var match = !q
      || p.name.toLowerCase().includes(q)
      || (p.notes||'').toLowerCase().includes(q)
      || (p.abordagem||'').toLowerCase().includes(q)
      || (p.status||'').toLowerCase().includes(q);
    if (match) { var _pInit = (p.initials || p.name.trim().split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase()); resultados.push({ tipo: 'paciente', icon: _pInit, bg: p.color || '#4a7c59', titleColor: '#fff', titulo: p.name, sub: (p.abordagem||'—') + ' · ' + (p.status||'ativo'), action: function(){ navigate('pacientes'); setTimeout(function(){ selectPatient(i); }, 80); } }); }
  });

  // ── Notas clínicas
  if (q) {
    patients.forEach(function(p, i) {
      (p.prontuarioNotes||[]).forEach(function(n) {
        if ((n.text||'').toLowerCase().includes(q)) {
          var trecho = n.text.substring(Math.max(0, n.text.toLowerCase().indexOf(q)-20), Math.min(n.text.length, n.text.toLowerCase().indexOf(q)+60));
          resultados.push({ tipo: 'nota', icon: _tfIcon('clip',14), bg: '#f0f4ff', titulo: 'Nota: ' + p.name, sub: '…' + trecho + '…', action: function(){ navigate('prontuarios'); setTimeout(function(){ selectPatient(i); }, 80); } });
        }
      });
    });
  }

  // ── Agenda (appointments)
  if (q) {
    var hojeIso = hojeISO();
    appointments.filter(function(a){ return a.status !== 'cancelada' && a.date >= hojeIso; }).forEach(function(a){
      if (a.patientName.toLowerCase().includes(q) || (a.abordagem||'').toLowerCase().includes(q)) {
        var d = new Date(a.date+'T12:00');
        var dateLbl = d.toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'short'});
        resultados.push({ tipo: 'agenda', icon: _tfIcon('cal',14), bg: '#f0fdf4', titulo: a.patientName, sub: dateLbl + ' · ' + a.time + ' · ' + escHTML(a.abordagem||'—'), action: function(){ navigate('agenda'); } });
      }
    });
  }

  // ── Tarefas
  (window.tasks||[]).forEach(function(t) {
    if (!q || (t.title||'').toLowerCase().includes(q) || (t.patientName||'').toLowerCase().includes(q)) {
      resultados.push({ tipo: 'tarefa', icon: '☑', bg: '#fff8e1', titulo: t.title, sub: (t.patientName||'Geral') + ' · ' + (t.status||'aberta'), action: function(){ navigate('tarefas'); } });
    }
  });

  // ── Ações rápidas (sempre visíveis sem query)
  if (!q) {
    [
      { icon: '+',   label: 'Agendar nova sessão',        cat: 'Sessão',      action: function(){ fecharBuscaGlobal(); showAgendarModal(); } },
      { icon: '+',   label: 'Cadastrar novo paciente',    cat: 'Paciente',    action: function(){ navigate('pacientes'); setTimeout(function(){ abrirModalNovoPaciente(); }, 200); } },
      { icon: _tfIcon('sparkle',14),   label: 'Abrir briefing IA',          cat: 'Briefing',    action: function(){ navigate('briefing'); } },
      { icon: '◈',   label: 'Ir para supervisão IA',      cat: 'Supervisão',  action: function(){ navigate('supervisao'); } },
      { icon: '$',   label: 'Ver cobranças',              cat: 'Financeiro',  action: function(){ navigate('financeiro'); } },
      { icon: _tfIcon('chart',14),  label: 'Gerar relatório financeiro', cat: 'Financeiro',  action: function(){ fecharBuscaGlobal(); navigate('financeiro'); setTimeout(exportarRelatorioMensal, 300); } },
    ].forEach(function(a){ resultados.push({ tipo: 'acao', icon: a.icon, bg: '#f8faf8', titulo: a.label, sub: a.cat, action: a.action }); });
  }

  if (!resultados.length) {
    box.innerHTML = '<div class="gs-empty" style="line-height:1.7">Nenhum resultado para "<strong>' + escHTML(q) + '</strong>"<br><span style="font-size:11.5px;opacity:.7">Tente nome do paciente, data, trecho de nota ou título de tarefa.</span></div>';
    return;
  }

  // Agrupa por tipo
  var grupos = {};
  var ordemGrupos = ['acao','paciente','agenda','nota','tarefa'];
  var labelsGrupo = { acao: 'Ações rápidas', paciente: 'Pacientes', agenda: 'Agenda', nota: 'Notas clínicas', tarefa: 'Tarefas' };
  resultados.forEach(function(r){ if (!grupos[r.tipo]) grupos[r.tipo] = []; grupos[r.tipo].push(r); });

  var html = '';
  var flat = []; // para navegação por teclado
  ordemGrupos.forEach(function(tipo){
    if (!grupos[tipo]) return;
    html += '<div class="gs-section-label">' + labelsGrupo[tipo] + '</div>';
    grupos[tipo].slice(0, tipo === 'nota' ? 3 : 5).forEach(function(r, ri){
      var idx = flat.length;
      flat.push(r);
      var _iconStyle = 'background:'+r.bg+(r.titleColor?';color:'+r.titleColor+';font-size:11px;font-weight:700':'')+';';
      html += '<div class="gs-item" data-gs-idx="'+idx+'" onmouseenter="gsItemHover(this)" onclick="gsItemClick('+idx+')">'
        // Ícones SVG do sistema (_tfIcon) entram crus; qualquer outro valor
        // (ex.: iniciais do paciente = dado do usuário) continua escapado.
        + '<div class="gs-item-icon" style="'+_iconStyle+'">'+(String(r.icon).indexOf('<svg') === 0 ? r.icon : escHTML(r.icon))+'</div>'
        + '<div style="flex:1;min-width:0"><div class="gs-item-title">'+escHTML(r.titulo)+'</div><div class="gs-item-sub">'+escHTML(r.sub)+'</div></div>'
        + '</div>';
    });
  });

  box.innerHTML = html;
  box._flat = flat;
}

function gsItemHover(el) {
  document.querySelectorAll('.gs-item').forEach(function(e){ e.classList.remove('gs-active'); });
  el.classList.add('gs-active');
  _gsActiveIdx = parseInt(el.dataset.gsIdx);
}

function gsItemClick(idx) {
  var box = document.getElementById('gs-results');
  var flat = box && box._flat;
  if (!flat || idx < 0 || idx >= flat.length) return;
  fecharBuscaGlobal();
  flat[idx].action();
}

function navegarBuscaGlobal(e) {
  var box = document.getElementById('gs-results');
  var flat = box && box._flat;
  var items = document.querySelectorAll('.gs-item');
  if (e.key === 'Escape') { fecharBuscaGlobal(); return; }
  if (!flat || !items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _gsActiveIdx = Math.min(_gsActiveIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _gsActiveIdx = Math.max(_gsActiveIdx - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_gsActiveIdx >= 0) gsItemClick(_gsActiveIdx);
    return;
  } else { return; }
  items.forEach(function(el){ el.classList.remove('gs-active'); });
  if (items[_gsActiveIdx]) { items[_gsActiveIdx].classList.add('gs-active'); items[_gsActiveIdx].scrollIntoView({ block: 'nearest' }); }
}

// Atalhos de teclado globais
document.addEventListener('keydown', function(e) {
  var tag = document.activeElement ? document.activeElement.tagName : '';
  var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  // Ctrl+K / Cmd+K — busca global
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var ov = document.getElementById('global-search-overlay');
    if (ov && ov.classList.contains('visible')) { fecharBuscaGlobal(); } else { abrirBuscaGlobal(); }
    return;
  }
  // Escape — fechar busca ou modais. Os modais (showModal) usam a classe `open`,
  // NÃO `visible` → o Esc nunca fechava modal nenhum. M4/Lote 4.
  if (e.key === 'Escape') {
    var ov2 = document.getElementById('global-search-overlay');
    if (ov2 && ov2.classList.contains('visible')) { fecharBuscaGlobal(); return; }
    var abertos = document.querySelectorAll('.modal-overlay.open');
    if (abertos.length) { abertos.forEach(function(m){ var id = m.id; if(id) closeModal(id); else m.classList.remove('open'); }); return; }
    return;
  }
  if (isInput) return;
  // N — novo paciente (em pacientes) ou nova sessão (em agenda) ou nova cobrança (em financeiro)
  if (e.key === 'n') {
    var activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-pacientes') { abrirModalNovoPaciente(); return; }
    if (activePage && activePage.id === 'page-agenda') { showAgendarModal(); return; }
    if (activePage && activePage.id === 'page-financeiro') { abrirModalNovaCobranca(); return; }
  }
  // I — inadimplentes (em financeiro)
  if (e.key === 'i') {
    var ap3 = document.querySelector('.page.active');
    if (ap3 && ap3.id === 'page-financeiro') { lembreteInadimplentes(); return; }
  }
});

// ── DOCUMENTOS LEGAIS ────────────────────────────────────────
const LEGAL_DOCS = {
  termos: {
    titulo: 'Termos de Uso',
    versao: 'Versão 1.0 · Abril de 2026',
    conteudo: `
      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:0 0 8px">1. Aceitação dos Termos</h3>
      <p>Ao criar uma conta ou utilizar a plataforma Teravia ("Plataforma"), você ("Terapeuta") concorda integralmente com estes Termos de Uso e com a Política de Privacidade.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">2. O Serviço</h3>
      <p>A Teravia é uma plataforma de gestão clínica para psicólogos e profissionais de saúde mental, oferecendo gestão de pacientes, agenda, financeiro, prontuários eletrônicos e ferramentas de apoio com inteligência artificial.</p>
      <p style="background:var(--sage-light);border-left:3px solid var(--sage);padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0">
        <strong>Importante:</strong> A Teravia é uma ferramenta de gestão e apoio. Ela não substitui o julgamento clínico do profissional e não realiza diagnósticos. Toda análise gerada por inteligência artificial é sugestiva.
      </p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">3. Elegibilidade</h3>
      <p>Para utilizar a Plataforma, você deve ser profissional de saúde mental habilitado com registro ativo no CFP ou conselho de classe equivalente, ter capacidade legal para contratar e utilizar a Plataforma exclusivamente para fins profissionais lícitos.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">4. Responsabilidades do Terapeuta</h3>
      <ul style="padding-left:20px;display:flex;flex-direction:column;gap:8px">
        <li><strong>Consentimento do paciente:</strong> Você é o responsável legal por obter o consentimento informado do paciente para coleta e uso dos seus dados clínicos, conforme a LGPD e a Resolução CFP 04/2020.</li>
        <li><strong>Prontuário:</strong> Você é responsável pela completude, veracidade e guarda dos registros clínicos inseridos na Plataforma.</li>
        <li><strong>Julgamento clínico:</strong> Toda sugestão gerada pela inteligência artificial é auxiliar. A decisão clínica final é sempre e exclusivamente do profissional.</li>
        <li><strong>Gravação de sessões:</strong> Quando disponível, somente deve ser utilizado com consentimento explícito do paciente.</li>
      </ul>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">5. Trial e Pagamentos</h3>
      <p>Novos usuários têm direito a 20 sessões gratuitas, sem cartão de crédito. Após esse limite, é necessária a contratação de um plano pago (R$89/mês). Você pode cancelar a qualquer momento; o acesso permanece ativo até o fim do período pago.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">6. Uso Aceitável</h3>
      <p>É proibido utilizar a Plataforma para fins ilegais, compartilhar conta sem plano multi-usuário, realizar engenharia reversa, inserir dados de pacientes sem consentimento, ou utilizar a Plataforma para fins não profissionais.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">7. Limitação de Responsabilidade</h3>
      <p>A Teravia não se responsabiliza por decisões clínicas tomadas com base nas sugestões geradas pela inteligência artificial, nem por perdas de dados decorrentes de falha do Terapeuta em proteger suas credenciais.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">8. Lei Aplicável</h3>
      <p>Estes Termos são regidos pelas leis da República Federativa do Brasil. Contato: <a href="mailto:contato@teravia.com.br" style="color:var(--sage)">contato@teravia.com.br</a></p>
    `
  },
  privacidade: {
    titulo: 'Política de Privacidade',
    versao: 'Versão 1.0 · Abril de 2026 · Conforme LGPD (Lei 13.709/2018)',
    conteudo: `
      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:0 0 8px">1. Quem somos</h3>
      <p>A Teravia é operadora dos dados pessoais tratados nesta Política. Contato do encarregado de dados (DPO): <a href="mailto:privacidade@teravia.com.br" style="color:var(--sage)">privacidade@teravia.com.br</a></p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">2. Dados que coletamos</h3>
      <p><strong>Do Terapeuta:</strong> nome, e-mail, CRP, abordagem terapêutica, dados de pagamento (via Stripe), logs de acesso.</p>
      <p style="margin-top:8px"><strong>Dos Pacientes (dados sensíveis de saúde):</strong> nome, contato, prontuário, notas clínicas, histórico de sessões, diário e check-ins de humor.</p>
      <p style="background:#f0ecfa;border-left:3px solid var(--purple);padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0;font-size:13px">
        Dados de saúde mental são tratados como <strong>dados sensíveis</strong> nos termos do Art. 11 da LGPD, com base legal em tutela da saúde (Art. 11, II, f) e consentimento explícito (Art. 11, I).
      </p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">3. Como usamos os dados</h3>
      <p>Exclusivamente para: prestar o serviço contratado, gerar análises com IA sob instrução do Terapeuta, enviar comunicações do serviço, cumprir obrigações legais e melhorar a Plataforma (sempre com dados anonimizados).</p>
      <p style="background:var(--sage-light);border-left:3px solid var(--sage);padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0">
        <strong>A Teravia não vende, aluga ou compartilha dados pessoais com terceiros para fins comerciais.</strong>
      </p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">4. Inteligência Artificial</h3>
      <p>Os recursos de IA processam dados clínicos exclusivamente para gerar as análises solicitadas pelo Terapeuta. Os dados são enviados à API da Anthropic (Claude), que <strong>não utiliza dados de API para treinar seus modelos</strong>. A Teravia não armazena prompts ou respostas da IA associados a pacientes identificados além do necessário.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">5. Parceiros e transferências</h3>
      <p>Compartilhamos dados apenas com: Supabase (banco de dados), Anthropic (IA), Stripe (pagamentos), Vercel (hospedagem). Todos sob Data Processing Agreements.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">6. Segurança</h3>
      <p>Criptografia em trânsito (HTTPS/TLS) e em repouso (AES-256), senhas com hash bcrypt, controle de acesso por Row Level Security, backups automáticos diários, logs de auditoria.</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">7. Retenção de dados</h3>
      <p>Dados da conta e dados clínicos são mantidos enquanto a conta estiver ativa + 90 dias após cancelamento. Prontuários podem ser retidos pelo prazo mínimo de 5 anos conforme Resolução CFP 001/2009. Dados financeiros: 5 anos (obrigação fiscal).</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">8. Seus direitos (Art. 18 LGPD)</h3>
      <ul style="padding-left:20px;display:flex;flex-direction:column;gap:6px">
        <li><strong>Acesso</strong> — saber quais dados temos</li>
        <li><strong>Correção</strong> — corrigir dados incorretos</li>
        <li><strong>Exclusão</strong> — solicitar a exclusão</li>
        <li><strong>Portabilidade</strong> — receber seus dados em formato estruturado</li>
        <li><strong>Revogação do consentimento</strong> — quando a base for consentimento</li>
      </ul>
      <p style="margin-top:10px">Solicitações: <a href="mailto:privacidade@teravia.com.br" style="color:var(--sage)">privacidade@teravia.com.br</a> · Prazo de resposta: 15 dias úteis.</p>
      <p style="margin-top:8px">Você pode registrar reclamações junto à <strong>ANPD</strong>: gov.br/anpd</p>

      <h3 style="font-family:'Instrument Serif',serif;font-size:18px;margin:20px 0 8px">9. Consentimento do paciente</h3>
      <p>O Terapeuta deve obter consentimento explícito do paciente antes de inserir seus dados. A Teravia disponibiliza modelo de Termo de Consentimento mediante solicitação.</p>
    `
  }
};

let _legalCurrentTab = 'termos';

function abrirDocumentoLegal(doc) {
  _legalCurrentTab = doc;
  _renderLegalDoc(doc);
  const overlay = document.getElementById('modal-legal-doc');
  if (overlay) { overlay.style.display = 'flex'; requestAnimationFrame(() => overlay.classList.add('active')); }
}

function fecharDocumentoLegal() {
  const overlay = document.getElementById('modal-legal-doc');
  if (overlay) { overlay.classList.remove('active'); overlay.style.display = 'none'; }
}

function switchLegalTab(doc) {
  _legalCurrentTab = doc;
  _renderLegalDoc(doc);
}

function _renderLegalDoc(doc) {
  const data = LEGAL_DOCS[doc];
  if (!data) return;
  // Conteúdo
  const content = document.getElementById('legal-doc-content');
  if (content) {
    content.innerHTML = `
      <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <div style="font-family:'Instrument Serif',serif;font-size:22px;color:var(--ink);margin-bottom:4px">${data.titulo}</div>
        <div style="font-size:12px;color:var(--muted)">${data.versao}</div>
      </div>
      ${data.conteudo}
    `;
    content.scrollTop = 0;
  }
  // Abas
  ['termos','privacidade'].forEach(function(t) {
    const tab = document.getElementById('legal-tab-' + t);
    if (!tab) return;
    if (t === doc) {
      tab.style.color = 'var(--sage)';
      tab.style.borderBottomColor = 'var(--sage)';
      tab.style.fontWeight = '600';
    } else {
      tab.style.color = 'var(--muted)';
      tab.style.borderBottomColor = 'transparent';
      tab.style.fontWeight = '500';
    }
  });
}

// ── TERMOS DE USO ────────────────────────────────────────────
const TERMS_VERSION = '1.0';

function termsAlreadyAccepted() {
  try {
    const saved = JSON.parse(localStorage.getItem('tf_terms_accepted') || 'null');
    return saved && saved.version === TERMS_VERSION;
  } catch(e) { return false; }
}

function termsCheckboxChange() {
  const cb  = document.getElementById('terms-checkbox');
  const btn = document.getElementById('btn-accept-terms');
  if (!btn) return;
  if (cb.checked) {
    btn.disabled = false;
    btn.style.background = 'var(--sage)';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
  } else {
    btn.disabled = true;
    btn.style.background = 'var(--border)';
    btn.style.color = 'var(--muted)';
    btn.style.cursor = 'not-allowed';
  }
}

let _termsCallback = null;

function showTermsModal(callback) {
  _termsCallback = callback;
  // Reseta estado do modal
  const cb  = document.getElementById('terms-checkbox');
  const btn = document.getElementById('btn-accept-terms');
  if (cb)  { cb.checked = false; }
  if (btn) { btn.disabled = true; btn.style.background = 'var(--border)'; btn.style.color = 'var(--muted)'; btn.style.cursor = 'not-allowed'; }
  const overlay = document.getElementById('modal-terms');
  if (overlay) { overlay.style.display = 'flex'; requestAnimationFrame(() => overlay.classList.add('active')); }
}

function acceptTerms() {
  if (!document.getElementById('terms-checkbox')?.checked) return;
  // Salva aceite com versão e timestamp
  localStorage.setItem('tf_terms_accepted', JSON.stringify({
    version: TERMS_VERSION,
    date: new Date().toISOString()
  }));
  // Registra o aceite no banco (LGPD) — best-effort, não bloqueia
  if (typeof _logConsent === 'function') _logConsent('termos_plataforma', { versao: TERMS_VERSION });
  // Fecha modal
  const overlay = document.getElementById('modal-terms');
  if (overlay) { overlay.classList.remove('active'); overlay.style.display = 'none'; }
  // Executa callback (continuar para o app)
  if (typeof _termsCallback === 'function') { _termsCallback(); _termsCallback = null; }
}

function checkTermsAndProceed(callback) {
  if (window._tfDemo || termsAlreadyAccepted()) {
    callback();
  } else {
    showTermsModal(callback);
  }
}
