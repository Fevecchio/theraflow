# Política de Privacidade — TheraFlow

**Versão 1.0 | Abril de 2026**

> **Aviso:** Este documento é um rascunho para revisão jurídica. Antes de publicar para usuários reais, submeta a um advogado especializado em LGPD e direito de saúde.

---

## 1. Quem somos

A **[RAZÃO SOCIAL]**, inscrita no CNPJ **[CNPJ]** ("TheraFlow", "nós"), é a controladora e operadora dos dados pessoais tratados nesta Política, conforme os papéis definidos pela Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).

**Encarregado de Dados (DPO):** [NOME DO DPO]
**Contato do DPO:** privacidade@theraflow.app

---

## 2. A quem esta Política se aplica

Esta Política se aplica a:

- **Terapeutas** — profissionais que criam conta e utilizam a Plataforma
- **Pacientes** — cujos dados são inseridos pelos Terapeutas na Plataforma
- **Visitantes** — que acessam nosso site ou landing page

---

## 3. Dados que coletamos

### 3.1 Dados do Terapeuta

| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Nome, e-mail, senha | Criação e acesso à conta | Execução de contrato (Art. 7º, V) |
| CRP | Verificação de habilitação profissional | Execução de contrato (Art. 7º, V) |
| Abordagem terapêutica | Personalização da IA | Execução de contrato (Art. 7º, V) |
| Dados de pagamento (Stripe) | Processamento de assinatura | Execução de contrato (Art. 7º, V) |
| Endereço IP, logs de acesso | Segurança e auditoria | Legítimo interesse (Art. 7º, IX) |
| Chave de API Claude | Acesso à IA pelo terapeuta | Execução de contrato (Art. 7º, V) |

### 3.2 Dados dos Pacientes (dados sensíveis de saúde)

Os dados clínicos dos pacientes são **dados sensíveis** nos termos do Art. 11 da LGPD, exigindo base legal específica e maior cuidado no tratamento.

| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Nome, contato, dados pessoais | Gestão do vínculo terapêutico | Tutela da saúde — Art. 11, II, f |
| Prontuário, notas clínicas | Suporte ao tratamento | Tutela da saúde — Art. 11, II, f |
| Histórico de sessões | Continuidade do cuidado | Tutela da saúde — Art. 11, II, f |
| Diário e check-ins de humor | Acompanhamento entre sessões | Consentimento explícito — Art. 11, I |
| Gravações de sessão (futuro) | Transcrição e supervisão clínica | Consentimento explícito — Art. 11, I |

> **Importante:** O Terapeuta é responsável por obter o consentimento informado do paciente antes de inserir seus dados na Plataforma. A TheraFlow disponibiliza modelo de Termo de Consentimento no item 10 desta Política.

### 3.3 Dados coletados automaticamente

- Logs de acesso (IP, data/hora, ação)
- Dados de uso da Plataforma (páginas acessadas, funcionalidades utilizadas)
- Cookies de sessão (autenticação)

---

## 4. Como usamos os dados

Utilizamos os dados exclusivamente para:

a) Prestar o serviço contratado (gestão clínica, agenda, financeiro);
b) Gerar análises com inteligência artificial sob instrução do Terapeuta;
c) Enviar comunicações relacionadas ao serviço (confirmações, alertas, suporte);
d) Cumprir obrigações legais e regulatórias;
e) Proteger a segurança da Plataforma e de seus usuários;
f) Melhorar a Plataforma — sempre com dados anonimizados ou agregados, **nunca** com dados clínicos identificados.

**A TheraFlow não vende, aluga ou compartilha dados pessoais com terceiros para fins comerciais.**

---

## 5. Inteligência Artificial e dados clínicos

5.1. Os recursos de IA da Plataforma (Briefing pré-sessão, Supervisão IA) processam dados clínicos do paciente para gerar análises sob instrução direta do Terapeuta.

5.2. Esses dados são enviados à API da Anthropic (Claude) exclusivamente para processamento da requisição. A Anthropic não utiliza dados enviados via API para treinar seus modelos, conforme sua política de privacidade.

5.3. A TheraFlow não armazena os prompts ou respostas da IA de forma associada a pacientes identificados além do necessário para o funcionamento do serviço.

5.4. O Terapeuta é responsável por avaliar criticamente qualquer análise gerada pela IA antes de utilizá-la clinicamente.

---

## 6. Compartilhamento de dados

Compartilhamos dados apenas com:

| Parceiro | Finalidade | País |
|---|---|---|
| Supabase | Banco de dados e autenticação | EUA (SCCs aplicáveis) |
| Anthropic | Processamento de IA (sob instrução) | EUA (SCCs aplicáveis) |
| Stripe | Processamento de pagamentos | EUA (SCCs aplicáveis) |
| Resend / Brevo | Envio de e-mails transacionais | EUA / França |
| Vercel | Hospedagem do frontend | EUA (SCCs aplicáveis) |

Todos os parceiros estão sujeitos a Data Processing Agreements (DPAs) que garantem tratamento adequado dos dados conforme a LGPD e, quando aplicável, o GDPR.

> **SCCs:** Standard Contractual Clauses — mecanismo de transferência internacional de dados aprovado pelas autoridades de proteção de dados.

---

## 7. Segurança dos dados

Adotamos as seguintes medidas técnicas e organizacionais:

- **Criptografia em trânsito:** HTTPS/TLS em todas as comunicações
- **Criptografia em repouso:** dados armazenados com criptografia AES-256 (Supabase)
- **Autenticação:** senhas com hash bcrypt, sem armazenamento em texto plano
- **Controle de acesso:** Row Level Security (RLS) — terapeuta acessa apenas seus próprios dados
- **Logs de auditoria:** registro de acessos e operações críticas
- **Backups:** cópias de segurança automáticas diárias com retenção de 30 dias
- **Tokens JWT** com expiração e renovação automática

Em caso de incidente de segurança que possa causar risco aos titulares, notificaremos a ANPD e os afetados nos prazos previstos pela LGPD.

---

## 8. Retenção de dados

| Dado | Prazo de retenção |
|---|---|
| Dados da conta (terapeuta) | Enquanto a conta estiver ativa + 90 dias após cancelamento |
| Dados clínicos dos pacientes | Enquanto a conta estiver ativa + 90 dias após cancelamento |
| Prontuários (após solicitação de exclusão) | Podem ser retidos pelo prazo mínimo de 5 anos conforme CFP (Resolução 001/2009), salvo instrução contrária do Terapeuta |
| Logs de acesso e segurança | 12 meses |
| Dados financeiros | 5 anos (obrigação fiscal) |

Após os prazos acima, os dados são permanentemente excluídos ou anonimizados.

---

## 9. Direitos dos titulares

Conforme o Art. 18 da LGPD, você tem direito a:

| Direito | Como exercer |
|---|---|
| **Acesso** — saber quais dados temos sobre você | E-mail para privacidade@theraflow.app |
| **Correção** — corrigir dados incompletos ou incorretos | Diretamente na Plataforma ou por e-mail |
| **Exclusão** — solicitar a exclusão dos seus dados | E-mail para privacidade@theraflow.app |
| **Portabilidade** — receber seus dados em formato estruturado | E-mail para privacidade@theraflow.app |
| **Revogação do consentimento** — quando a base for consentimento | E-mail para privacidade@theraflow.app |
| **Oposição** — opor-se ao tratamento em determinadas situações | E-mail para privacidade@theraflow.app |
| **Informação** — saber com quem compartilhamos seus dados | Esta Política de Privacidade |

Atendemos solicitações em até **15 dias úteis**.

**Pacientes:** os direitos do paciente sobre seus dados clínicos devem ser exercidos junto ao Terapeuta responsável, que atua como controlador dos dados clínicos. A TheraFlow auxilia o Terapeuta no atendimento dessas solicitações.

---

## 10. Consentimento informado do paciente

O Terapeuta deve obter consentimento explícito do paciente antes de inserir seus dados na Plataforma. Sugerimos o seguinte modelo de linguagem para o Termo de Consentimento:

---

*"Eu, [NOME DO PACIENTE], autorizo que meu(minha) terapeuta [NOME DO TERAPEUTA] registre e armazene dados relacionados ao meu acompanhamento terapêutico na plataforma TheraFlow, incluindo dados pessoais, histórico de sessões, notas clínicas e registros do portal do paciente.*

*Compreendo que:*
- *Meus dados são tratados de acordo com a Lei Geral de Proteção de Dados (LGPD);*
- *Posso solicitar acesso, correção ou exclusão dos meus dados a qualquer momento;*
- *Posso revogar este consentimento a qualquer momento, sem prejuízo ao meu atendimento;*
- *Dados de saúde mental são tratados com sigilo e proteção reforçada.*

*Data: ___/___/______*
*Assinatura: _______________________"*

---

## 11. Cookies

Utilizamos cookies estritamente necessários para:

- Manter a sessão autenticada
- Preferências de interface

Não utilizamos cookies de rastreamento publicitário ou de terceiros para fins comerciais.

---

## 12. Menores de idade

A Plataforma é destinada a profissionais de saúde e não coleta diretamente dados de menores de idade. Caso um Terapeuta atenda pacientes menores, o consentimento deve ser obtido dos responsáveis legais, conforme a LGPD e o ECA.

---

## 13. Alterações nesta Política

Alterações substanciais serão comunicadas por e-mail com **15 dias de antecedência**. A versão vigente estará sempre disponível na Plataforma com a data da última atualização.

---

## 14. Contato e DPO

Para exercer seus direitos ou tirar dúvidas sobre privacidade:

**E-mail:** privacidade@theraflow.app
**DPO:** [NOME DO DPO]
**Endereço:** [ENDEREÇO COMPLETO]

Você também pode registrar reclamações junto à **Autoridade Nacional de Proteção de Dados (ANPD):** gov.br/anpd

---

*Última atualização: Abril de 2026*
