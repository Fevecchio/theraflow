# Runbook — Resposta a Incidente de Segurança (Teravia)

> **Versão 1 — 22/07/2026.** O que fazer se houver (ou houver suspeita de)
> vazamento, acesso indevido, perda ou comprometimento de dados. Feito para ser
> seguido sob pressão, na ordem. **Guarde o número da ANPD e este arquivo em local
> acessível mesmo se a plataforma estiver fora do ar.**

---

## Regra de ouro
Nas primeiras horas, **conter primeiro, investigar depois**. É melhor derrubar o acesso e perder disponibilidade por uma hora do que deixar dados vazando enquanto você analisa. Não apague evidências — você vai precisar delas para a notificação e para a defesa.

## Os 4 tipos de incidente e como reconhecer

| Tipo | Sinais |
|---|---|
| **Credencial comprometida** (sua ou de um profissional) | Login de local/horário estranho, ação que ninguém fez, alerta de login novo |
| **Acesso indevido a dados** | Muitos "acessos negados" na trilha de auditoria, picos de consulta, um profissional relatando dado de outro |
| **Comprometimento de terceiro** (Supabase, Vercel, IA…) | Comunicado do próprio provedor, status page deles |
| **Perda/indisponibilidade** | Dados sumiram, banco corrompido, ransomware |

## Passo a passo (na ordem)

### 1. Conter (primeiras minutos)
- [ ] **Se for sua conta comprometida:** troque a senha de tudo que é seu (GitHub, Vercel, Supabase, e-mail, Stripe) e **rotacione a `SUPABASE_SERVICE_ROLE_KEY`** e demais chaves no painel do provedor + Vercel env. Encerre sessões ativas.
- [ ] **Se for um profissional comprometido:** revogue o acesso dele, force troca de senha, e verifique o que foi acessado na trilha de auditoria.
- [ ] **Se for indefinido e grave:** coloque a plataforma em manutenção (ou desative as funções sensíveis) até entender o alcance.

### 2. Avaliar o alcance (primeiras horas)
- [ ] **Quais dados?** Cadastrais? De saúde (sensíveis)? De quantos titulares? Dado sensível eleva o dever de notificar.
- [ ] **Como entrou?** Credencial, bug, terceiro, acesso físico? (Isso define a correção.)
- [ ] **Ainda está aberto?** Confirme que a contenção fechou a porta.
- [ ] Consulte a **trilha de auditoria** (`audit_logs`) e a **trava de login** (`portal_auth_attempts`) para reconstruir o que aconteceu. Rode a função `monitor_seguranca()` (migration 036) para os números.
- [ ] **Preserve as evidências** (logs, prints, IPs) antes de corrigir.

### 3. Notificar (obrigação legal — LGPD art. 48)
A LGPD exige comunicar à **ANPD** e aos **titulares afetados** quando o incidente puder acarretar **risco ou dano relevante**. Dado de saúde quase sempre se enquadra.
- [ ] **Prazo:** a ANPD orienta comunicar em **até 3 dias úteis** da ciência. Não espere ter todas as respostas — pode complementar depois.
- [ ] **Quem notifica:** como regra, o **profissional (controlador)** notifica seus pacientes e a ANPD; a **Teravia (operadora)** notifica os profissionais afetados e dá o apoio informativo. (Ver DPA, seção 5.)
- [ ] **O que a comunicação deve ter** (art. 48, §1º): natureza dos dados afetados, os titulares envolvidos, as medidas técnicas de proteção usadas, os riscos, o motivo de eventual demora, e as medidas de mitigação.
- [ ] Canal ANPD: peticionamento no site gov.br/anpd. Guarde o protocolo.
- [ ] **CFP:** se envolver prontuário/sigilo profissional, o profissional avalia comunicação ao Conselho Regional.

### 4. Corrigir e documentar
- [ ] Feche a causa-raiz (não só o sintoma).
- [ ] Registre tudo: linha do tempo, o que foi afetado, o que foi feito, quando. Esse registro é sua defesa e cumpre o princípio de responsabilização (accountability) da LGPD.
- [ ] Reveja se outras portas iguais existem (a auditoria de 22/07 é a base).

## Contatos e recursos (preencher)
- **ANPD:** gov.br/anpd — peticionamento eletrônico
- **Encarregado de dados (DPO) da Teravia:** [nome] — privacidade@teravia.com.br
- **Suporte de emergência dos provedores:** Supabase / Vercel / Stripe (status pages e suporte)
- **Advogado(a) de plantão (quando houver):** [contato]

## Prevenção contínua (o que reduz a chance de chegar aqui)
- 2FA em TODAS as suas contas de administração.
- Rotação periódica das chaves de serviço.
- Rodar a auditoria de segurança a cada lote grande de mudanças (não uma vez só).
- Acompanhar o alerta de anomalia (`monitor_seguranca` + rotina agendada).
- Nunca colar chave/segredo em chat ou e-mail.

---

> **Disclaimer.** Material educativo/operacional. Os prazos e obrigações da LGPD podem ter interpretações e atualizações regulatórias; confirme com a orientação vigente da ANPD e, havendo incidente real, com advogado(a).
