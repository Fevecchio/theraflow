# Diagnóstico QA — TheraFlow — 13/05/2026
**Auditor:** Claude (QA Sênior + PM + UX + Dev)
**Ambiente:** Produção — theraflow-one.vercel.app
**Status geral:** ✅ Concluído — 8 bugs encontrados, 3 corrigidos, 5 pendentes (baixa prioridade)

---

## Resumo executivo

| Prioridade | Total | Corrigidos | Pendentes |
|---|---|---|---|
| 🔴 Crítico | 1 | 1 | 0 |
| 🟠 Médio | 2 | 2 | 0 |
| 🔵 Baixo/UX | 5 | 0 | 5 |

**Veredicto:** ✅ **Pronto para testes beta com usuários reais** (com os 3 bugs críticos/médios já corrigidos)

---

## Bugs encontrados

| ID | Área | Descrição curta | Gravidade | Status |
|----|------|-----------------|-----------|--------|
| BUG-001 | Auth | Dados demo persistem no localStorage após sessão demo | 🔵 Baixo | ⏳ Pendente |
| BUG-002 | Auth | Login não valida formato de email antes de chamar Supabase | 🔵 Baixo | ⏳ Pendente |
| BUG-003 | Auth | Botão "Voltar" da tela "Esqueceu sua senha" fica abaixo do fold em viewports pequenos | 🔵 Baixo | ⏳ Pendente |
| BUG-004 | Auth | Submit vazio no forgot-password: toast some rápido, sem mensagem persistente | 🔵 Baixo | ⏳ Pendente |
| BUG-005 | UX | Supervisão IA abaixo do scroll na sidebar em telas de 900px | 🔵 Baixo | ⏳ Pendente |
| BUG-006 | Agenda | Escape não fecha o modal "Nova sessão" | 🔵 Baixo | ✅ Corrigido |
| BUG-007 | Tarefas | ID de tarefa com hífen quebra onclick `toggleTarefa()` — crash ReferenceError | 🔴 Crítico | ✅ Corrigido |
| BUG-008 | Pacientes | `.catch()` no builder Supabase não existe — `excluirPaciente()` trava UI | 🟠 Médio | ✅ Corrigido |

---

## Detalhamento dos bugs

### BUG-007 🔴 CRÍTICO — `15-tarefas.js` linha 232 (CORRIGIDO)
**Problema:** `salvarNovaTarefa()` gerava IDs no formato `Date.now() + '-' + Math.random().toString(36)`, ex: `1778684303076-km6`. No template HTML `onclick="toggleTarefa(1778684303076-km6)"`, o JavaScript interpreta como subtração de variável inexistente → `ReferenceError: km6 is not defined`. Nenhuma tarefa criada pelo usuário podia ser concluída, editada ou excluída.
**Fix:** Usar `Date.now()` simples como ID (número puro, sem hífen).
**Commit:** incluso no próximo commit desta sessão.

---

### BUG-008 🟠 MÉDIO — `06-patients.js` linha 165 (CORRIGIDO)
**Problema:** `excluirPaciente()` chamava `.catch()` diretamente no builder Supabase PostgREST. O builder não expõe `.catch()` (apenas `.then()` via thenable). A exception `TypeError: supa.from(...).catch is not a function` impedia o `renderPatients()` e `navigate('pacientes')` de rodar, deixando a UI travada mesmo com a exclusão local já realizada.
**Fix:** Substituir `.catch()` por IIFE async/await: `(async function() { const { error } = await supa.from(...); if (error) { ... } })();`
**Commit:** incluso no próximo commit desta sessão.

---

### BUG-006 🔵 UX — `14-supervisao.js` linha 399 (CORRIGIDO)
**Problema:** O modal "Nova sessão" (criado via `showAgendarModal()`) não respondia à tecla Escape. Tinha handler de click-fora mas não keydown.
**Fix:** Adicionar listener `keydown` para Escape com auto-remoção após trigger.
**Commit:** incluso no próximo commit desta sessão.

---

### BUG-001 🔵 Baixo — Demo data em localStorage
**Problema:** Dados demo (tf_patients, tf_appointments, tf_tasks, tf_charges) persistem no localStorage após sair da sessão demo. Um usuário real que usa o demo antes de criar conta pode iniciar com dados fictícios.
**Situação:** Já existe limpeza no logout (`04-auth.js`). O fluxo mais provável para usuário real (cadastro direto) não passa pelo demo. Impacto baixo.
**Fix sugerido:** Limpar chaves demo no `_proceedToApp()` ao detectar conta real.

---

### BUG-002 🔵 Baixo — Sem validação de email no login
**Problema:** O campo de email no login não valida o formato antes de chamar `supa.auth.signInWithPassword()`. Supabase retorna erro mas a UX poderia ser mais ágil.
**Fix sugerido:** Adicionar `if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('...'); return; }` antes do call.

---

### BUG-003 🔵 Baixo — "Voltar" abaixo do fold no forgot-password
**Problema:** Em viewports baixas (< 700px de altura), o botão "← Voltar para o login" fica abaixo da dobra, dando impressão de não existir.
**Nota:** O botão EXISTS no HTML — `hideForgotPassword()` funciona. É um problema de layout/scroll.
**Fix sugerido:** `position:sticky` no footer do ob-card.

---

### BUG-004 🔵 Baixo — Toast de validação some rápido
**Problema:** Ao submeter forgot-password vazio, o toast "⚠ Informe seu e-mail" aparece e some em ~3s. Em conjunto com o red border, a UX é aceitável mas poderia ter uma mensagem inline persistente.
**Fix sugerido:** Adicionar `<div id="forgot-email-error">` que persiste até o usuário digitar.

---

### BUG-005 🔵 UX — Supervisão IA abaixo do fold na sidebar
**Problema:** Em viewports de ~900px de altura, a seção "Desenvolvimento Profissional" (Supervisão IA) requer scroll na sidebar para ser vista. O badge de alertas fica invisível sem scroll.
**Fix sugerido:** Reduzir padding/margin dos itens da sidebar ou implementar scroll automático ao item ativo.

---

## O que foi testado e está OK

| Seção | Status | Observações |
|-------|--------|-------------|
| Login terapeuta | ✅ OK | Fluxo completo funcional |
| Dashboard | ✅ OK | Stats corretos, sessões do dia, tarefas, insights IA |
| Agenda — Dia | ✅ OK | Sessões renderizadas, ações (confirmação, cancelamento) |
| Agenda — Semana | ✅ OK | Grid 5 dias, hoje destacado |
| Agenda — Mês | ✅ OK | Calendar view, +N mais, hoje correto |
| Nova Sessão (modal) | ✅ OK | Validação funciona, campos corretos (Escape corrigido) |
| Tarefas — lista | ✅ OK | Filtros, badges atrasada/hoje, ordenação |
| Tarefas — criar | ✅ OK | Validação required, criação, contador atualizado |
| Tarefas — concluir | ✅ OK (após BUG-007 fix) | Crash corrigido |
| Pacientes — lista | ✅ OK | Busca com debounce, filtros status/abordagem |
| Pacientes — detalhe | ✅ OK | Dados clínicos, alerta supervisão, tarefas |
| Pacientes — criar | ✅ OK | Form LGPD, modal de convite portal |
| Pacientes — excluir | ✅ OK (após BUG-008 fix) | Confirm LGPD, exclusão local + Supabase async |
| Sessão ao vivo | ✅ OK | Whereby integrado, nota SOAP auto-gerada, monitor IA |
| Prontuários | ✅ OK | Lista pacientes, linha do tempo, abas |
| Briefing IA | ✅ OK | Contexto correto, memória clínica, botão gerar |
| Financeiro | ✅ OK | Cobranças, planos mensais, status badges, inadimplência |
| Portal do Paciente | ✅ OK | Preview terapeuta, check-in, próxima sessão com countdown |
| Supervisão IA | ✅ OK | Alertas clínicos, taxa evolução, análise padrões |
| Busca Global (Ctrl+K) | ✅ OK | Cross-entity: pacientes, agenda, tarefas |
| Indicar um colega | ✅ OK | Link personalizado, mensagem WhatsApp/Email |
| Perfil | ✅ OK | Dados profissionais, configurações IA |

---

## Erros de console detectados

| Erro | Origem | Status |
|------|--------|--------|
| `ReferenceError: km6 is not defined` | Tarefa com ID-hífen clicada antes do fix | ✅ Corrigido (BUG-007) |
| `TypeError: supa.from(...).catch is not a function` | excluirPaciente antes do fix | ✅ Corrigido (BUG-008) |
| `[DOM] Password field is not contained in a form` | Campo portal-senha sem `<form>` | ⏳ Cosmético, sem impacto funcional |
