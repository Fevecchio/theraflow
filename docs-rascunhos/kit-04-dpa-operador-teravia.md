# Contrato de Operador de Dados (DPA) — Teravia ↔ Profissional

> **Versão 1 — 22/07/2026.** Define os papéis de LGPD entre a **Teravia** (que
> processa os dados) e o **profissional** (que decide o tratamento). É a peça que
> separa a responsabilidade de cada um e protege a Teravia num eventual incidente.
> **Material educativo, redigido com pesquisa normativa — não substitui revisão por
> advogado(a), recomendada antes de haver receita relevante.** Este documento é um
> ANEXO aos Termos de Uso da plataforma e vincula-se ao aceite do profissional.

---

## 1. Quem é quem (papéis na LGPD)

| Parte | Papel na LGPD | O que decide / faz |
|---|---|---|
| **Profissional** (psicólogo(a) usuário da Teravia) | **CONTROLADOR** (art. 5º, VI) | Decide quais pacientes cadastra, o que registra, com que finalidade. É o titular da relação clínica e o responsável primário pelo prontuário (Res. CFP 1/2009). |
| **Teravia** (Felipe Vecchio Leal — [CNPJ/CPF]) | **OPERADORA** (art. 5º, VII) | Processa os dados **em nome e sob instrução** do profissional, para operar a plataforma (agenda, prontuário, transcrição por IA, portal do paciente). |
| **Paciente** | **TITULAR** (art. 5º, V) | A pessoa a quem os dados se referem. |

**Consequência prática:** a responsabilidade pelo *conteúdo* clínico, pelo *consentimento* do paciente e pelas *obrigações do CFP* é do profissional (controlador). A responsabilidade pela *segurança do processamento* e pela *disponibilidade da plataforma* é da Teravia (operadora). Este documento formaliza essa divisão — sem ela, num incidente as responsabilidades se confundem.

## 2. Objeto e instruções de tratamento

2.1. A Teravia trata os dados pessoais dos pacientes **exclusivamente** para prestar os serviços da plataforma ao profissional, seguindo as instruções dele e estes termos. Não usa os dados dos pacientes para finalidade própria, não os vende, não os compartilha para publicidade, e não treina modelos de IA com o conteúdo clínico.

2.2. **Dados tratados:** cadastrais do paciente (nome, contato, data de nascimento), dados de saúde (registros de sessão, notas clínicas, humor, diário, anamnese), áudio/transcrição de sessões (quando a gravação for consentida), e dados financeiros de cobrança.

2.3. A Teravia **não** acessa o conteúdo clínico para fins próprios. O acesso técnico da equipe da Teravia ao banco de dados é restrito ao estritamente necessário para operar, corrigir e dar suporte à plataforma, sob dever de sigilo.

## 3. Segurança da informação (medidas técnicas e organizacionais)

A Teravia adota, no mínimo, as seguintes medidas (art. 46 da LGPD):

- **Isolamento entre profissionais:** cada profissional só acessa os próprios dados, imposto no nível do banco de dados (Row-Level Security), não apenas na interface.
- **Criptografia em trânsito:** todo o tráfego é HTTPS/TLS; conexões de banco e mídia são cifradas.
- **Autenticação forte:** senha + verificação em duas etapas (2FA) disponível para o profissional; senha mínima de 8 caracteres no portal do paciente.
- **Minimização enviada à IA:** o nome do paciente **não** é enviado ao modelo de IA que gera a nota — o texto é pseudonimizado ("o paciente").
- **Áudio efêmero:** o áudio da sessão é processado para transcrição e **não é armazenado**.
- **Trilha de auditoria:** ações sensíveis (exportações, exclusões, acessos negados) ficam registradas.
- **Backups** dos dados clínicos, com retenção adequada à recuperação.
- **Controle de acesso** por menor privilégio; chaves de serviço nunca expostas no aplicativo.

## 4. Sub-operadores (sub-processadores) e transferência internacional

4.1. Para operar, a Teravia utiliza os prestadores listados no **Anexo A**. Ao aceitar estes termos, o profissional **autoriza** esse uso. A Teravia permanece responsável perante o profissional pelo cumprimento, por esses prestadores, de obrigações equivalentes às deste contrato.

4.2. **Transferência internacional (art. 33 da LGPD):** parte do processamento — em especial a **transcrição do áudio** e a **geração da nota clínica por IA** — ocorre em prestadores sediados **fora do Brasil (Estados Unidos)**. A Teravia adota salvaguardas contratuais com esses prestadores (cláusulas de proteção de dados equivalentes) e limita o que trafega (o áudio é efêmero; o nome do paciente é pseudonimizado antes de ir à IA). O profissional deve **informar o paciente** dessa transferência — o modelo de consentimento do Kit (Termo LGPD do Paciente, consentimento B3-gravação/IA) já cobre isso.

4.3. A Teravia comunicará o profissional em caso de alteração relevante na lista de sub-operadores, com antecedência razoável.

## 5. Incidentes de segurança

5.1. Ocorrendo incidente de segurança que possa acarretar risco relevante aos titulares, a Teravia comunicará o profissional **em prazo razoável a partir da ciência** (buscando até 48 horas úteis), com as informações do art. 48, §1º da LGPD (natureza dos dados, titulares afetados, medidas técnicas, riscos, medidas de mitigação).

5.2. Cabe ao **profissional (controlador)**, como regra, a comunicação à ANPD e aos titulares quando exigida — com o apoio informativo da Teravia. O runbook interno de resposta a incidentes da Teravia detalha o fluxo operacional.

## 6. Auxílio ao controlador e direitos dos titulares

6.1. A Teravia disponibiliza ao profissional os meios para atender às solicitações dos titulares (art. 18): acesso, correção, portabilidade e **eliminação** dos dados, por meio das funções da plataforma (exportação de dados, exclusão de paciente).

6.2. **Limite de eliminação:** a exclusão a pedido do titular **não** apaga o prontuário antes do prazo mínimo de guarda exigido pelo CFP (5 anos, Res. CFP 1/2009), conforme art. 16, I da LGPD (guarda para cumprimento de obrigação legal/regulatória). Esse limite é do controlador e está refletido na plataforma.

## 7. Retenção e devolução ao término

7.1. Encerrada a relação entre o profissional e a Teravia, o profissional poderá **exportar** todos os seus dados (portabilidade). Após período de carência razoável, a Teravia **elimina ou anonimiza** os dados sob sua guarda, ressalvado o que a lei obrigue a reter.

## 8. Responsabilidade

8.1. Cada parte responde pelo cumprimento das obrigações do seu papel: o profissional pelo conteúdo, pela base legal do tratamento clínico e pelo consentimento do paciente; a Teravia pela segurança e disponibilidade do processamento que realiza.

8.2. A Teravia não se responsabiliza por: uso indevido das credenciais pelo próprio profissional ou seus pacientes; conteúdo inserido pelo profissional; decisões clínicas; nem por descumprimento, pelo profissional, das normas do CFP e da LGPD que lhe cabem como controlador.

8.3. Ressalvadas as hipóteses de dolo ou culpa grave e os limites da legislação aplicável, a responsabilidade da Teravia por danos diretos comprovados limita-se ao valor pago pelo profissional nos 12 meses anteriores ao evento.

## 9. Vigência

Este DPA vige enquanto durar o uso da plataforma pelo profissional e, quanto às obrigações de sigilo, segurança e eliminação, pelo tempo necessário após o término.

---

## Anexo A — Sub-operadores (sub-processadores)

*Prestadores que processam dados para operar a Teravia, o que fazem, e onde ficam.*

| Prestador | Função | Localização | Dado que trafega |
|---|---|---|---|
| **Supabase** | Banco de dados e autenticação | (verificar região do projeto) | Todos os dados cadastrais e clínicos (em repouso) |
| **Vercel** | Hospedagem da aplicação e funções | Rede global (edge) | Tráfego da aplicação (em trânsito) |
| **LiveKit** | Vídeo da sessão ao vivo | EUA / rede global | Áudio e vídeo em tempo real (não armazenado por nós) |
| **Groq** e/ou **OpenAI** | Transcrição do áudio (Whisper) | **EUA** | Áudio da sessão (efêmero) → texto |
| **Anthropic (Claude)** | Geração da nota clínica e do briefing | **EUA** | Transcrição pseudonimizada (sem o nome do paciente) |
| **Resend** | Envio de e-mails (convites, lembretes) | EUA / região SP | Nome e e-mail do paciente, dados da sessão |
| **Stripe** | Pagamento da assinatura do profissional | EUA / global | Dados de cobrança do profissional (não do paciente) |
| **PostHog** | Métricas de uso (produto) | EUA | Apenas metadados de uso — **nunca** conteúdo clínico; pacientes anônimos |

*Esta lista é mantida atualizada. Alterações relevantes são comunicadas ao profissional.*

---

> **Disclaimer.** Documento educativo elaborado com base na LGPD (Lei 13.709/2018) e nas resoluções do CFP vigentes em 2026. Não constitui aconselhamento jurídico individualizado. Recomenda-se revisão por advogado(a) especializado(a) em proteção de dados e direito digital da saúde, especialmente antes da operação com receita relevante. Campos entre [colchetes] devem ser preenchidos.
