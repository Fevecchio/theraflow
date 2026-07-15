# Teravia — Manual do Projeto (para Claude e futuros desenvolvedores)

> Escrito em 11-12/07/2026 pelo Claude Fable 5 como seguro de continuidade.
> **Leia inteiro antes de editar qualquer coisa.** As regras daqui existem porque
> algo quebrou de verdade quando elas não existiam.

## ⚠️ RENAME TheraFlow → Teravia (14/07/2026)

O produto chamava **TheraFlow** até 14/07/2026 (nome novo: **Teravia**, domínio
teravia.com.br registrado no CPF do fundador). O rename cobriu marca, e-mails,
manifests, docs e o arquivo principal (`theraflow-unified-v3.html` → **`app.html`**,
com redirect permanente no vercel.json). **Ficaram COM o nome antigo DE PROPÓSITO
— NÃO "corrigir":**
- `theraflow-one.vercel.app` — é a URL REAL do projeto na Vercel (CORS, APP_URL
  fallback, links de e-mail). Só muda quando o domínio teravia.com.br for
  apontado e o APP_URL env atualizado.
- `tfHashSenha('trial:' + n + ':theraflow')` em js/17 — SALT do contador de
  trial; trocar invalida/reseta o trial de todo mundo.
- Nome da pasta local `TheraFlow/`, repo GitHub e projeto Vercel — renomear
  quebra integração/URLs; decisão do fundador, sem pressa.

## O que é

Plataforma clínica para psicólogos(as). **Diferencial-núcleo**: sessão por vídeo →
transcrição (Groq whisper-large-v3) → nota SOAP por IA (Claude) que o profissional
revisa e assina em ~2 min. Segundo ato: portal do paciente (check-in de humor,
diário, exercícios) que alimenta um briefing pré-sessão. Fase atual: recrutar 10
fundadores (plano fundador, preço travado).

## Arquitetura em 60 segundos

- **Frontend**: HTML estático + JS vanilla, SEM build. `app.html`
  (app do terapeuta) carrega `js/00-*.js` … `js/21-*.js` via `<script defer>` (ordem
  importa). `paciente.html` = portal standalone da paciente (carrega SUBCONJUNTO:
  00,01,02,03,04,06,13 — função nova usada no portal precisa estar num desses).
  `landing.html`, `seguranca.html`, `sala.html` (entrada da paciente na
  videochamada). CSS único: `app.css`.
- **Backend**: funções serverless em `api/*.js` (Vercel, LIMITE 12 no plano Hobby —
  já estamos em 12; criar uma nova exige apagar/fundir outra). Banco: Supabase
  (`hkryvbyoviejdjlzfehm`, São Paulo) com RLS + RPCs (migrations em
  `backend/migrations/`, aplicadas 001–027).
- **Deploy**: push em `master` → deploy AUTOMÁTICO na Vercel (theraflow-one.vercel.app).
  `.vercelignore` é crítico: `backend/`, relatórios, `docs-rascunhos/` e `*.png`
  NÃO podem ser servidos.
- **Estado no cliente**: arrays globais (`patients`, `appointments`, `charges`,
  `tasks`) espelhados em localStorage (`tf_patients` etc.) e sincronizados com o
  Supabase em background (`js/03-sync.js`).

## REGRAS INEGOCIÁVEIS (decisões do fundador)

1. **Features desligadas NÃO se removem.** O que está na UI sem função é
   documentado e decidido com calma (memória do Claude tem o relatório; 9/10 já
   ligadas). Nunca deletar "carcaça de feature" sem aprovação — só código morto
   VERIFICADO sem referências.
2. **A UI nunca mente.** Sem números fabricados, sem "✓ salvo" antes de confirmar,
   sem estados congelados. Se algo falha, avisa com o caminho de correção. Toda
   promessa na tela precisa ser verdadeira (auditorias V1 e de Confiança
   existiram por isso).
3. **Nada de conteúdo clínico fora do lugar**: texto de nota/diário/humor NUNCA
   vai para analytics (PostHog recebe só metadados), NUNCA em logs de servidor, e
   pacientes são anônimos no PostHog (sem identify).
4. **Nada chega ao paciente sem aprovação do terapeuta** (ex.: resumo da jornada
   fica em `resumoPendente` até publicar).
5. **Português nas respostas ao fundador; linguagem simples, sem jargão.** Listas
   de pendências: agrupadas por dono + tabela com coluna de esforço.
6. **Idioma/moeda BR**: datas DD/MM/AAAA, R$, textos pt-BR.

## O CAMPO MINADO do sync (leia 2×)

O sync é merge-aware e cheio de proteções conquistadas a ferro:

- **Chaves protegidas do paciente** (`v_protected` nas RPCs 016/017/025/027):
  moodHistory, moodNotes, mood, portalNota, anamnese, meuInsight, etc. O patch do
  TERAPEUTA as descarta, salvo `p_touch: ['chave']` para escrita intencional
  (ex.: `_supaSync_patients({ touch: ['anamnese'], onlyId })`). Se uma edição do
  terapeuta "não chega ao servidor", suspeite disto primeiro.
- **Merge por elemento + tombstones** (migration 025): diary/exercises/portalMetas
  /materials unem por id/ts com `_up` (ms) de desempate; exclusões gravam
  `p._tombs[array][id]=ts` via `_tfTombstone()` — **toda exclusão de item dessas
  listas PRECISA do tombstone** ou o item ressuscita de outra cópia.
- **prontuarioNotes** (migration 027): união por `date` preservando ordem do
  entrante (nota nunca some por cópia velha). Criações/edições de nota devem
  incluir `_up: Date.now()`.
- **planoEvolucao**: LWW por `planoEvolucaoUp` (setar ao salvar).
- **Appointments**: identidade por `patientId` (uuid) — `patientIdx` é derivado e
  NUNCA deve ser a fonte de verdade (índice desloca com exclusões; já gravou
  sessão no paciente errado). Campos extras viajam em `metadata` e a lista de
  chaves é EXPLÍCITA em `js/03` (campo novo = adicionar lá, senão morre no sync).
- **Multi-aba**: listener `storage` em `js/02` recarrega os arrays quando outra
  aba grava; com modal/sessão ativa, adia via `_tfStorageStale`. Não gravar
  localStorage inteiro por fora de `salvarPacientes`/`_salvarAppointments`/etc.
- **Owner guard**: `tf_owner_uid` (js/00) limpa dados locais de OUTRA conta no
  login — não contornar, evita vazamento entre contas e 403 no sync.
- **Delete-diff** (appts/charges/tasks): o sync DELETA no servidor o que não está
  na lista local (guard só p/ lista vazia). Cuidado ao manipular esses arrays.
- **RESÍDUO CONHECIDO (C5/C8/C12 da auditoria de confiança)**: delete-diff com
  aba stale não-vazia; moodHistory da paciente entre 2 aparelhos dela; grade de
  horários LWW. Ver memória "auditoria de confiança" antes de mexer.

## Padrões que o app inteiro segue

- **Sem framework**: funções globais, `onclick` inline, template strings. Imitar o
  estilo local do arquivo (uns usam `var`+concat, outros template literals).
- **Escapar TUDO que vem de dado com `escHTML()`** em innerHTML (XSS já foi
  auditado 3×; não regredir).
- **Feedback honesto**: falha de rede/servidor → `showToast('⚠ …')` com causa e
  próximo passo; portal da paciente usa `_pacSyncBanner` (alimentado pelo funil
  único `_supaPatientSync`, que retorna true/false — o supabase-js NÃO lança em
  erro de RPC, sempre checar `{error}` no retorno!).
- **Preferências da IA**: qualquer recurso novo de IA visível deve respeitar
  `_iaPrefOn('chave')` (autonomia clínica do profissional).
- **Nome/bio da terapeuta no portal**: usar `_pacTherapistNome()/_pacTherapistFirst()
  /_pacTherapistBio()` (nunca fallback fictício tipo "Ana"; título "Dra." é
  removido do primeiro nome).
- **Hex em DADOS ≠ var() em ESTILO**: `p.color`/`charges.color` são dados
  armazenados — não trocar por var(--sage) cegamente.
- **Design system "Sálvia & Linho"**: tokens no `:root` de app.css (sálvia #4A7A63
  acento único, linho #FAF7F2, Instrument Serif títulos, DM Sans corpo, roxo SÓ
  para IA). Portal do paciente = tom compassivo (sem 🔥/streak/%/gamificação);
  emojis de UI estão sendo substituídos por SVG de traço.

## Como trabalhar (fluxo validado ~30× nesta base)

1. Ler a memória do Claude (bloco RETOMAR) antes de tudo.
2. Editar → `node --check js/arquivo.js` em TODO js tocado.
3. Smoke local: `npx http-server -p 81XX -s -c-1` (porta NOVA a cada rodada — o
   browser cacheia js 1h e você testa código velho sem perceber!) → Playwright em
   `http://localhost:81XX/app.html?demo=1` (demo entra sem login;
   em demo nada sobe ao servidor).
4. Commit descritivo em pt (sem acento nos títulos por segurança de encoding) →
   push → aguardar ~45s → `vercel ls` deve mostrar Ready → smoke em produção
   (theraflow-one.vercel.app) via Playwright.
5. Atualizar a memória do Claude ao fechar cada lote.
6. Migrations: arquivo em `backend/migrations/NNN_nome.sql` (idempotente, tags
   `$fn$`, seguir o estilo da 025/027) — quem APLICA é o fundador colando no SQL
   Editor do Supabase (mandar o SQL como bloco único, avisos como comentários
   `--`; ele cola texto de chat junto sem querer). Validar depois via REST
   `rpc/<função>` com a service key (em `vercel env pull`).

## Gotchas que já causaram bugs reais

- Um `</div>` sobrando numa página REMOVE as páginas seguintes do `<main>` (o
  parser hoisteia para o body) — sintoma: "deserto" de layout. Verificar balanço
  ao editar o HTML grande.
- `paciente.html`: `<script>` inline roda IMEDIATO (defer ignorado) — overrides
  dentro de DOMContentLoaded.
- Trial: 20 sessões, contador assinado (`tfTrialToken`); não mexer sem ler js/17.
- IDs duplicados no DOM: a Anamnese vive num `<template>` justamente para evitar
  isso; não criar segunda instância de ids `ana-*`, `tab-plano-content`, etc.
- `_sessionNote`/timer da sessão: navegar NÃO pode matar sessão LiveKit ativa
  (guards em js/02 navigate) — cuidado ao mexer em navigate().
- Groq/transcrição: NUNCA armazenar áudio; segmentos são efêmeros em memória
  (promessa pública da página /seguranca).
- Emojis em SVG de manifest não rasterizam em Android — ícones PWA são desenhos.

## Mapa rápido de arquivos

| Arquivo | Dono de |
|---|---|
| js/00-globals | boot, restore do Supabase (`_supaLoadUserData`), owner guard |
| js/01-utils | escHTML, tombstones, `_iaPrefOn`, `_tfSetPatientsLS`, tracking |
| js/02-ui | navigate (redirects prontuarios/briefing!), modais, multi-aba |
| js/03-sync | TODOS os syncs + badge de sync + mensagens/chat |
| js/04-auth | login/2FA gate, anamnese do paciente, reset |
| js/06-patients | CRUD paciente, painel de 7 abas, `_supaPatientSync` |
| js/07-dashboard | dashboard + insights com CTA + hero sessão real |
| js/08-agenda | agenda 3 views, confirmada/lembrete, recorrência |
| js/09-sessions | página sessão, pós-sessão clássico, timer, resumo jornada |
| js/11-briefing-ia | briefing (parser único `_parseBriefingBlocks`), charges load |
| js/12-financeiro | financeiro, régua de cobrança `_gerarTarefasCobranca` |
| js/13-portal | portal (prévia terapeuta + app paciente) — o maior; cuidado |
| js/14-supervisao | alertas reais, metas do plano, exports PDF, materiais |
| js/17-misc | perfil (saveProfile/initPerfil), trial, `_sendEmail` |
| js/20-2fa | 2FA completo (enroll/challenge/backup codes) |
| js/21-livekit-session | vídeo+captura+transcrição+nota (fluxo-núcleo!) |
| api/transcribe.js | Groq whisper-large-v3 + prompt pt-BR, LGPD audit log |
| api/session-note.js / briefing.js | prompts clínicos (Claude) |

## Onde está a verdade sobre o estado do projeto

Na **memória persistente do Claude** (`~/.claude/.../memory/`): bloco RETOMAR em
`project_teravia_pendencias.md` (começar SEMPRE por ele), auditoria de
confiança, funcionalidades desligadas, GTM. Este arquivo documenta o que NÃO
muda; a memória documenta o que muda toda sessão.
