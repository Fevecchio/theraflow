# Auditoria TheraFlow — 13/05/2026
Gerada por revisão de código + testes em browser. **35 problemas** — 2 críticos, 16 médios, 17 baixos.

---

## 🔴 CRÍTICOS

### A7 — `03-sync.js` ~linha 164 — Sync deleta TODOS os appointments quando lista está vazia
`_supaSync_appointments` faz `DELETE` em todos os appointments do usuário se `localStorage` estiver vazio no momento da chamada. Race condition na inicialização pode apagar dados irreversivelmente.
- **Fix:** Remover o branch de delete-all quando lista vazia; ou exigir `patients.length > 0` como pré-condição.

### A1 — `06-patients.js` ~linha 153 — Exclusão de paciente quebra índices de appointments
`excluirPaciente(idx)` faz `patients.splice(idx, 1)` mas não re-indexa os appointments que usam `patientIdx` inteiro. Após excluir qualquer paciente, todos os agendamentos dos pacientes seguintes apontam para o paciente errado.
- **Fix:** Migrar appointments para usar `patientId` (UUID); ou re-computar `patientIdx` via `findIndex` por nome após cada exclusão.

---

## 🟠 MÉDIOS

### C1 — `15-busca.js` ~linha 40 — Busca de tarefas completamente quebrada
Campo usado: `t.titulo` — campo real no objeto: `t.title`. Busca global nunca retorna tarefas.
- **Fix:** Trocar `t.titulo` por `t.title`.

### C6 — `06-patients.js` ~linha 469 — `_supaPatientSync` usa `patients[0]` como fallback
Se chamada no contexto do terapeuta (sem `_loggedPatientData`), sincroniza dados do primeiro paciente da lista para a sessão Supabase do paciente.
- **Fix:** `if (!_loggedPatientData) return;` no início da função.

### A2 — `09-sessions.js` ~linha 537 — Cobrança duplicada ao encerrar sessão
`indexPostSession` cria cobrança automaticamente E marca presença. `marcarPresenca('compareceu')` já pode ter criado cobrança via `_ofereceCobrancaPresenca`. Resultado: dois registros de cobrança para a mesma sessão.
- **Fix:** Verificar se já existe cobrança para `sp.name + hojeISO()` antes de criar nova em `indexPostSession`.

### D3 — `01-utils.js` ~linha 14 — XSS via `showToast(msg)` com innerHTML sem escape
`toast.innerHTML = \`...<span>${msg}</span>...\`` — se `msg` vier de dado do paciente (nome, CID, nota), é vetor de XSS.
- **Fix:** Usar `escHTML(msg)` ou `textContent` para o conteúdo do span.

### D2 — `06-patients.js` ~linha 480 — `portalPassword` plaintext enviado ao Supabase
A senha em texto plano é incluída no objeto de sync mesmo quando já existe `portalPasswordHash`.
- **Fix:** Remover `portalPassword` do objeto de sync em `_supaPatientSync`.

### B1 — `06-patients.js` ~linha 928 — Senha do portal exposta em `data-real` no DOM
`data-real="${escHTML(p.portalPassword...)}"` — qualquer pessoa com DevTools vê a senha sem clicar em "mostrar".
- **Fix:** Remover `data-real`; ao clicar em "mostrar", buscar `patients[i].portalPassword` em memória JS.

### A4 — `07-dashboard.js` ~linha 218 — Stat "Notas pendentes" sempre errado
Datas de prontuário no formato `DD/MM` são convertidas para `DD-MM` (sem ano), que nunca satisfaz comparação com ISO `YYYY-MM-DD`. O stat sempre conta zero ou todos erroneamente.
- **Fix:** Ao converter `DD/MM` para ISO, assumir ano corrente: `parts[2] || new Date().getFullYear()`.

### A6 — `11-tarefas.js` ~linha 232 — ID de tarefa vira `NaN` quando há tarefas com UUID
`Math.max.apply(null, tasks.map(t => t.id)) + 1` retorna `NaN` quando alguma tarefa tem ID string (UUID do Supabase). Novas tarefas ficam com `id: NaN`, impossibilitando edição e conclusão.
- **Fix:** Usar `Date.now()` ou `crypto.randomUUID()` como ID de novas tarefas.

### C3 — `09-sessions.js` ~linha 550 — Presença marcada na sessão errada com 2 agendamentos no dia
`indexPostSession` filtra appointments por `date === hoje` e pega o primeiro (sort por hora ASC). Com dois agendamentos, sempre marca o mais cedo como compareceu.
- **Fix:** Guardar o `apptId` corrente em `startSession()` e usá-lo diretamente em `indexPostSession`.

### C4 — `16-portal.js` — `profileAbordagem` declarado no módulo errado
Variável declarada em `13-portal.js` e usada em `09-sessions.js`. Dependência implícita de ordem de carregamento de scripts.
- **Fix:** Mover `profileAbordagem` para `00-globals.js`.

### A3 — `08-agenda.js` ~linha 306 — `var nd` e `var w` redeclarados em múltiplos blocos de recorrência
Reuso de nomes de variável com `var` em blocos sequenciais de `confirmarAgendamento`. Propenso a bugs na refatoração.
- **Fix:** Usar `let`/`const` com blocos `{}` delimitados.

### A8 — `00-globals.js` ~linha 157 — `patientIdx: -1` não tratado em todos os consumidores
`findIndex` retorna `-1` quando paciente não encontrado. Verificado em `renderDayView` mas não em `_recalcSessions` e `_ofereceCobrancaPresenca`.
- **Fix:** Adicionar `if (a.patientIdx < 0) return/continue` nos consumidores que ainda não verificam.

### F1 — `06-patients.js` ~linha 386 — Datas demo hardcoded para março
`lastSession:'24/03'`, `next:'31/03'` etc. Em qualquer mês diferente de março, as datas parecem erradas.
- **Fix:** Calcular dinamicamente como offset da data atual.

### F2 — `08-agenda.js` ~linha 192 — Demo assume "hoje = terça-feira"
`di:1` (terça) é tratado como "hoje" nos dados demo. Em outros dias da semana, o dashboard "Sessões de hoje" pode estar vazio.
- **Fix:** Calcular `di` dinamicamente baseado no `new Date().getDay()`.

### G1 — `06-patients.js` ~linha 621 — 4 recálculos O(n×m) por keystroke na busca
`renderPatients` chama `_recalcFinStatus`, `_recalcNextSessions`, `_recalcSessions`, `_recalcAllProgress` a cada busca.
- **Fix:** Debounce de 150ms na `searchPatients`; recálculos só ao salvar dados.

### B3 — `09-sessions.js` ~linha 106 — `regenerarNotaSessao` usa variantes hardcoded de "Camila"
As 3 variantes de nota regenerada mencionam "autoexigência" e conteúdos específicos da Camila.
- **Fix:** Parametrizar com `sp.notes` e `sp.abordagem`.

### B4 — `02-ui.js` ~linha 98 — `switchTab` pode ocultar painéis de outro grupo de tabs
`querySelectorAll('[id^="tab-"]')` no `parentElement` pode capturar painéis de outro grupo no mesmo container.
- **Fix:** Limitar a busca com um seletor mais específico ou atributo `data-tab-group`.

### D1 — `00-globals.js` linha 4 — Stripe ainda em `pk_test_` no código de produção
Deve ser trocado por `pk_live_` antes do lançamento real.

### C2 — `00-globals.js` ~linha 136 — `charges = mergedChgs` depende de ordem de carregamento
Atribuição a `charges` de módulo diferente sem `import`/`export` explícito.

### C5 — `04-auth.js` ~linha 354 — `_loggedPatientIdx = 0` hardcoded no login via Supabase
Pode referenciar paciente errado em condições de race.

---

## 🔵 BAIXOS

### A5 — `06-patients.js` ~linha 588 — Próxima sessão sem desempate por hora quando há 2 no dia
### B2 — `04-auth.js` ~linha 419 — "Obrigada!" e "terapeuta" hardcoded no feminino
### B5 — `07-dashboard.js` ~linha 263 — `showAgendarModal()` sem args pode não abrir o modal correto
### B6 — `11-tarefas.js` ~linha 263 — `appendChild(emptyEl)` após `innerHTML=''` pode falhar
### B7 — `14-supervisao.js` ~linha 23 — Badge supervisão mostra 0 no carregamento inicial
### E1 — `08-agenda.js` ~linha 350 — Aspas simples em onclick dentro de template literal
### E2 — `09-sessions.js` ~linha 632 — Modal pós-sessão não fecha ao clicar fora
### E3 — `08-agenda.js` ~linha 89 — Toast de cobrança aparece sem contexto após fechar modal de nota
### E4 — `06-patients.js` ~linha 99 — Z-index do modal de convite do portal pode ficar atrás
### F3 — `09-sessions.js` ~linha 117 — Transcrição demo sempre mostra "Camila" hardcoded
### G2 — `07-dashboard.js` ~linha 19 — Re-render completo a cada 60s no dashboard
### G3 — `05-onboarding.js` ~linha 410 — Demo usa `setTimeout(150ms)` frágil em vez de await
### G4 — `13-briefing.js` ~linha 95 — Cache de briefing expira prematuramente no fuso BRT

---

## Resumo

| Prioridade | Qtd | IDs |
|---|---|---|
| 🔴 Crítico | 2 | A7, A1 |
| 🟠 Médio | 20 | A2–A6, A8, B1, B3, B4, C1–C6, D1–D3, F1–F2, G1 |
| 🔵 Baixo | 13 | A5, B2, B5–B7, E1–E4, F3, G2–G4 |

**Arquivos mais problemáticos:** `06-patients.js`, `09-sessions.js`, `03-sync.js`, `15-busca.js`

---

## Status de correção

| ID | Status |
|---|---|
| A7 | ✅ Corrigido (commit b312cc7) |
| A1 | ✅ Corrigido (commit 5c98eae) |
| C1 | ✅ Corrigido (commit b312cc7) |
| C6 | ✅ Corrigido (commit b312cc7) |
| A2 | ✅ Corrigido (commit b312cc7) |
| D3 | ✅ Corrigido (commit b312cc7) |
| D2 | ✅ Corrigido (commit b312cc7) |
| B1 | ✅ Corrigido (commit b312cc7) |
| A4 | ✅ Corrigido (commit b312cc7) |
| A6 | ✅ Corrigido (commit b312cc7) |
| C3 | ✅ Corrigido (commit b312cc7) |
| C4 | ✅ Corrigido (commit 669225c) |
| A3 | ✅ Corrigido (commit 669225c) |
| A8 | ✅ Corrigido (commit 669225c) |
| F1 | ✅ Corrigido (commit b312cc7) |
| F2 | ⏳ Pendente (cosmético, baixa prioridade) |
| G1 | ✅ Corrigido (commit 669225c) |
| B3 | ✅ Corrigido (commit b312cc7) |
| B4 | ✅ Corrigido (commit 669225c) |
| D1 | ⏳ Pendente (Stripe pk_test → pk_live antes do lançamento) |
| C2 | ✅ Corrigido (commit 669225c) |
| C5 | ✅ Corrigido (commit 669225c) |
| A5 | ✅ Corrigido (commit 669225c) |
| B2 | ✅ Corrigido (commit 669225c) |
| B5 | ✅ N/A — função tem defaults, funciona sem args |
| B6 | ✅ Corrigido (commit 669225c) |
| B7 | ✅ N/A — badge já oculta com 0 alertas; código correto |
| E1 | ✅ Corrigido (commit 669225c) |
| E2 | ✅ N/A — modal já tem click-outside handler (linha 648) |
| E3 | ✅ Corrigido (commit 5c98eae) |
| E4 | ⏳ Pendente (cosmético, z-index já é 9999) |
| F3 | ✅ Corrigido (commit b312cc7) |
| G2 | ✅ N/A — auto-refresh só re-renderiza seção de sessões, não o dashboard todo |
| G3 | ✅ Corrigido (commit 5c98eae) |
| G4 | ⏳ Pendente (cache fuso BRT — lógica parece correta, investigar em produção) |
