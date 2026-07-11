// 10-prontuario.js — Prontuário, notas clínicas, materiais, export de prontuário

/* Materiais do paciente: renderizados pela aba Ficha do painel de Pacientes
   (renderPatientFicha/_excluirMaterialFicha em js/06). Os renderizadores da
   página Prontuários legada saíram junto com ela no V2. */

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
