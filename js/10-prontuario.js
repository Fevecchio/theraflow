// 10-prontuario.js — Prontuário, notas clínicas, materiais, export de prontuário

/* ── PRONTUÁRIO & NOTAS CLÍNICAS ── */
function renderMateriaisProntuario(idx) {
  _materialPatientIdx = idx;
  var p = patients[idx];
  if (!p) return;
  var list = document.getElementById('materiais-list');
  var empty = document.getElementById('materiais-empty');
  var count = document.getElementById('materiais-count');
  if (!list) return;
  var mats = p.materials || [];
  if (count) count.textContent = mats.length > 0 ? mats.length + ' material' + (mats.length !== 1 ? 'is' : '') : '';
  if (mats.length === 0) {
    list.innerHTML = '';
    if (empty) { empty.style.display = ''; list.appendChild(empty); }
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = mats.map(function(m) {
    var icon = MATERIAL_ICONS[m.tipo] || '📎';
    var tituloHtml = m.url
      ? '<a href="'+escHTML(m.url)+'" target="_blank" rel="noopener">'+escHTML(m.titulo)+'</a>'
      : escHTML(m.titulo);
    var descHtml = m.desc ? '<div class="material-desc">'+escHTML(m.desc)+'</div>' : '';
    var tag = '<span style="font-size:10.5px;background:#f0f2f0;color:var(--muted);padding:2px 7px;border-radius:10px;font-weight:500">'+escHTML(MATERIAL_LABELS[m.tipo]||m.tipo)+'</span>';
    return '<div class="material-card">'
      +'<div class="material-icon '+m.tipo+'">'+icon+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div class="material-title" style="display:flex;align-items:center;gap:8px">'+tituloHtml+tag+'</div>'
        +descHtml
        +'<div class="material-date">'+escHTML(m.date)+'</div>'
      +'</div>'
      +'<div class="material-actions">'
        +(m.url ? '<a href="'+escHTML(m.url)+'" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none">↗ Abrir</a>' : '')
        +'<button class="task-delete" onclick="excluirMaterial('+idx+','+m.id+')" title="Excluir">✕</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

function excluirMaterial(pidx, mid) {
  if (!confirm('Remover este material?')) return;
  var p = patients[pidx];
  if (!p || !p.materials) return;
  p.materials = p.materials.filter(function(m){ return m.id !== mid; });
  salvarPacientes();
  renderMateriaisProntuario(pidx);
  showToast('Material removido.');
}
// ── /PRONTUÁRIOS ─────────────────────────────────────────────────────────────

function regenerarNota(btn) {
  const ta = btn?.previousElementSibling;
  if (!ta || ta.tagName !== 'TEXTAREA') return;
  const orig = btn.textContent;
  btn.textContent = '⟳ Gerando...';
  btn.disabled = true;
  setTimeout(() => {
    ta.value = 'Paciente apresentou-se com sinais de sobrecarga cognitiva e emocional. Relatou dificuldade em priorizar tarefas sem sentir que está falhando. Foram explorados padrões de pensamento dicotômico e crenças de autoeficácia. Intervenção focada em técnica de defusão cognitiva. Exercício proposto: identificar 3 pensamentos automáticos ao longo da semana e registrar evidências contrárias.';
    btn.textContent = orig;
    btn.disabled = false;
    showToast('Nota regenerada com novo ângulo clínico.');
  }, 1600);
}

function approveNoteAndIndex() {
  const btn = event.target;
  btn.textContent = '⟳ Indexando…';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = '✓ Salvo e indexado';
    btn.style.background = '#3d6b4b';
    const msg = document.getElementById('note-indexed-msg');
    if (msg) { msg.style.display = 'flex'; }
    // Mark supervisão as having new data
    supHasNewData = true;
    injectNewEvidenceIntoSupervisao();
    const _anp = patients[currentSessionPatientIdx] || patients[0];
    showToast(`Sessão ${_anp ? ((_anp.sessions||0)+1) : ''} de ${_anp?.name||'paciente'} indexada. Supervisão IA atualizada.`);
  }, 1800);
}

// ── BRIEFING ──

// Constrói sessionHistory dinamicamente a partir das notas reais do paciente
function buildSessionHistory(p) {
  const notas = (p && p.prontuarioNotes) ? p.prontuarioNotes : [];
  if (notas.length === 0) return [];
  // Mais recentes primeiro, mapeia para formato de timeline
  const _totalSessoes = (p && typeof p.sessions === 'number' && p.sessions > 0) ? p.sessions : notas.length;
  return notas.slice().reverse().map((n, i) => ({
    date: n.date || '—',
    num: Math.max(1, _totalSessoes - i),
    summary: n.text ? n.text.substring(0, 280) : 'Nota sem conteúdo.',
    mood: null
  }));
}
