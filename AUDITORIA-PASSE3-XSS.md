# Auditoria PASSE 3 — XSS no frontend

**Data:** 2026-06-26
**Escopo:** XSS DOM-based / persistente no frontend (`js/*.js`). Procura por dados controláveis pelo usuário (nome, notas, queixa, diário, lead, perfil, alert) injetados via `innerHTML`/`insertAdjacentHTML` sem `escHTML()`. Método: mapeamento (agente Explore) + **confirmação adversarial lendo o código** + reprodução via Playwright (payload `<img onerror>`/`<svg onload>`) + correção + re-teste.

---

## Conclusão geral

**Não havia XSS persistente cross-user explorável.** Todas as **re-renderizações ao carregar** (o vetor mais grave: paciente escreve → terapeuta abre) já escapavam: `renderDiarioLivre`, `_renderDiarioCard`/`_renderDiarioExistente`, `renderPatientNotas`, busca global, dropdown/notas da Supervisão.

Os problemas eram **escape inconsistente**: funções que renderizam no momento do save (self-XSS) e alguns pontos de render na tela/PDF que não escapavam. Corrigidos por consistência e defesa-em-profundidade.

---

## Corrigidos

### 1ª leva (commit `e696796`)
| Arquivo:fn | Dado | Contexto |
|---|---|---|
| `06-patients.js` modal convite | `_firstName(p.name)` | Modal "Enviar acesso ao portal" |
| `13-portal.js` `saveDiaryLivre` | `text`, `therapistFirst`, `dateStr` | Render imediata do diário livre (preview terapeuta) |
| `13-portal.js` `saveDiaryTCC` | `sit`, `pen`, `alt`, `tccEmocaoSelecionada`, `intVal`, `_nomeT2` | Render imediata do diário TCC |
| `12-financeiro.js` `saveDiaryEsp` | nome do terapeuta (campos já escapavam) | Render imediata do diário especializado |

### 2ª leva (commit `234ba76`) — todos na Supervisão
| Arquivo:linha | Dado | Contexto |
|---|---|---|
| `14-supervisao.js:1411` | `${sp.name}` | Banner "Sessão X de [nome] indexada agora" |
| `14-supervisao.js:1382` | `${p.name}`/`${p.abordagem}`/iniciais | Tabela "Saúde da carteira" (tela) |
| `14-supervisao.js:1385` | `${obs}` (= `p.alert`) | Coluna observação da mesma tabela |
| `14-supervisao.js:632/684/749` | `p.name`/`nomeT`/`crpT` | `<title>` e `.meta` dos PDFs extrato/prontuário |

Testes E2E (Playwright): payloads no diário livre, diário TCC e tabela de saúde da carteira → **0 execução**, injetados como texto escapado.

---

## Auditado — já escapava corretamente (sem ação)
- **Re-render do diário** (terapeuta `renderDiarioLivre`; paciente `_renderDiarioCard`/`_renderDiarioExistente`) — `escHTML` em text/reply/date.
- **Notas clínicas** (`renderPatientNotas`) — `escHTML(n.text/n.date/p.portalNota)`.
- **Ficha clínica** (`06-patients.js`) — `escHTML` em name/abordagem/cidade/cid/notes/email/sessionLink.
- **Metas** (`09-sessions.js`) — `escHTML(p.metas)`.
- **Materiais** (`06-patients.js`) — `escHTML` em titulo/desc/date/label.
- **Anamnese** (`_popularAnamnese`) — usa `el.value` (não innerHTML) → seguro por construção.
- **Busca global** (`16-busca-global.js`) — `escHTML` em label/sub/titulo/query.
- **Supervisão — alertas** (`gerarAlertasReais`) — `titulo` escapa `p.name` na origem; `texto` usa só dados fixos (riskWords) e numéricos.

---

### 3ª leva (commit `59838bb`) — fecha o item antes em aberto
| Arquivo | O quê |
|---|---|
| `01-utils.js` | Novo helper global `safeURL(u)` — só aceita `http(s)`, escapa aspas, retorna '' se inválida. |
| `06-patients.js` render de materiais | `href` do material e do botão "Abrir" agora usam `safeURL(m.url)`; URL inválida (ex.: `javascript:`) cai para texto puro (sem link). Testado E2E: material com `javascript:` → sem href; https preservada. |

---

## Status final
**Varredura de XSS concluída.** Todos os pontos com dado controlável em `innerHTML` escapam (`escHTML`) e os `href` controláveis passam por `safeURL`/validação. Nenhum item em aberto.
