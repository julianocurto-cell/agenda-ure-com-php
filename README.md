# Gestão de Visitas

Sistema web para gestão de visitas e agendamentos de equipes pedagógicas.
Painel único onde cada profissional registra suas visitas, o administrador
enxerga a rede inteira e a equipe enxerga o consolidado da semana.

Construído em **HTML/CSS/JavaScript puro** (sem framework) no frontend, com uma **API RESTful nativa em PHP 7.4+** e banco de dados **MySQL / MariaDB**. Ideal para hospedagem compartilhada (Hostinger, cPanel) ou servidores VPS. Conta com **FullCalendar** para visualização de calendário e **SheetJS** para exportação em Excel.

---

## Sumário

- [Visão geral](#visão-geral)
- [Perfis de acesso](#perfis-de-acesso)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Modelo de dados](#modelo-de-dados)
- [Segurança](#segurança)
- [Instalação e Configuração na Hostinger (ou cPanel/VPS)](#instalação-e-configuração-na-hostinger-ou-cpanelvps)
- [Como usar](#como-usar)
- [Personalização](#personalização)
- [Limitações conhecidas](#limitações-conhecidas)
- [Licença](#licença)

---

## Visão geral

O sistema foi desenhado para o dia a dia de uma equipe pedagógica que faz
visitas periódicas a escolas, unidades regionais (URE) e salas de
formação. Cada visita é um **agendamento** que relaciona:

- **Usuário** responsável (quem faz a visita)
- **Local** (escola, URE, etc.) e **cidade**
- **Data** e **período(s)** — pode marcar mais de um: manhã, tarde e/ou noite
- **Tarefa** realizada (acompanhamento, formação, ATPA, etc.)
- **Status** (planejado / concluído)
- **Objetivo** e **resumo** (texto livre)

O sistema oferece quatro formas de visualizar esses dados:

1. **Agenda** — lista com filtros, criação e edição
2. **Calendário** — visão de mês, semana ou lista (FullCalendar)
3. **Consolidado Semanal** — matriz local × dia da semana, mostrando onde cada profissional estará
4. **Relatórios** — individual (cada um vê o seu) e geral (ADM vê todos), com exportação em Excel

---

## Perfis de acesso

O sistema tem dois perfis, definidos na coluna `escopo` da tabela `usuarios`:

### USER

- Consulta o próprio cadastro.
- Consulta funções, locais e tarefas **ativos**.
- Consulta **todos** os agendamentos (necessário para o Consolidado, onde a equipe enxerga junto quem estará em cada local).
- Cria agendamentos **somente para si**.
- Edita e exclui **somente** seus próprios agendamentos.
- Vê o próprio relatório e os indicadores.

### ADM

- Consulta todos os usuários e agendamentos.
- Altera dados complementares dos usuários (nome, e-mail, função, escopo, ativo).
- **Cria novos usuários** e **redefine senha** através do painel.
- Cria, edita e exclui qualquer agendamento.
- Gerencia funções, locais e tarefas.
- Acessa o relatório geral (consolidado de toda a rede).

---

## Funcionalidades

### 1. Início (Dashboard)
Cards de resumo + lista das próximas visitas.
- **USER:** total, planejadas, concluídas, próximas visitas pessoais.
- **ADM:** total, planejadas, concluídas, usuários ativos, localidades.

### 2. Agenda
Lista tabular dos agendamentos com filtros por data, local, período e status. Cada linha abre o modal de edição (se o usuário tiver permissão). Ao editar, se a visita for **planejada** e o usuário tiver permissão, o botão **Excluir** aparece no rodapé do modal.

### 3. Calendário
Integração com **FullCalendar 6**. Cores por status:
- 🟠 Planejado (laranja escuro)
- 🔵 Concluído (azul)
Clique em um dia vazio → abre o formulário de nova visita com a data já preenchida.

### 4. Consolidado Semanal
Matriz com localidades nas linhas e dias da semana nas colunas. Clique em qualquer célula vazia para criar uma visita com **data e local já preenchidos**.

### 5. Cadastro (ADM)
Lista de usuários com edição de **nome**, **e-mail**, **função**, **escopo** e **ativo**. Também permite **redefinir a senha** de qualquer usuário. A criação de novos usuários é processada diretamente pela API PHP e salva no MySQL, com criptografia de senha (`bcrypt`).

### 6. Locais (ADM) e 7. Tarefas (ADM)
CRUD de localidades e tipos de tarefa. Registros inativos deixam de aparecer nos formulários.

### 8. Relatórios e Indicadores
Telas de exportação para Excel via SheetJS e gráficos CSS de distribuição e evolução semanal.

---

## Arquitetura

```text
┌──────────────────────────────┐
│  Navegador (HTML/CSS/JS)     │
│  ─ SPA por troca de <section>│
│  ─ Cliente Fetch JS          │
│  ─ FullCalendar / SheetJS    │
└───────────┬──────────────────┘
            │ HTTPS (JSON)
            ▼
┌──────────────────────────────┐
│  Servidor (Hostinger / VPS)  │
│  ─ API em PHP Puro (REST)    │
│  ─ Sessões Seguras (HttpOnly)│
│  ─ Banco de Dados MySQL      │
└──────────────────────────────┘
```

- **Frontend:** SPA com JavaScript puro. Sem build step, sem Node.js.
- **Backend (API):** PHP puro sem frameworks. Recebe requisições via `fetch`, processa a lógica de negócios, valida sessões e se comunica com o banco.
- **Banco de Dados:** MySQL ou MariaDB.

---

## Estrutura de arquivos

```text
/ (raiz da hospedagem / um nível acima do public_html)
│
├── .env                              # Variáveis de ambiente protegidas (BD, Senhas, etc.)
│
└── public_html/                      # Diretório público do site
    ├── index.html                    # Shell da aplicação
    ├── .htaccess                     # Regras do Apache (bloqueios e URL)
    │
    ├── api/                          # Backend em PHP
    │   ├── config.php                # Configuração global (carrega .env e PDO)
    │   ├── env-loader.php            # Leitor de variáveis
    │   ├── auth.php                  # Login, Logout, checagem de sessão
    │   ├── usuarios.php, locais.php, agendamentos.php...
    │   └── criar-primeiro-usuario.php# Script inicializador (deletar após uso)
    │
    ├── css/
    │   └── style.css                 # Todo o CSS
    ├── js/
    │   ├── app.js                    # Núcleo frontend
    │   ├── hostinger-api.js          # Utilitário de chamadas HTTP para o PHP
    │   └── ...                       # Telas modulares
    ├── image/                        # Assets visuais
    ├── sql/                          # Scripts de banco de dados
    └── vendor/                       # Dependências estáticas (FullCalendar, XLSX)
```

---

## Modelo de dados

Tabelas principais no MySQL:

### `usuarios`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INT AUTO_INCREMENT | Chave primária |
| `nome` | VARCHAR(150) | |
| `email` | VARCHAR(150) | UNIQUE |
| `senha_hash` | VARCHAR(255) | Hash gerado via `password_hash` |
| `escopo` | ENUM | `'adm'` ou `'user'` |
| `funcao_id` | INT | Opcional |
| `ativo` | TINYINT(1) | `1` (Ativo) ou `0` (Inativo) |

*(Demais tabelas: `funcoes`, `locais`, `tarefas`, `agendamentos`, `acessos_log` - todas estruturadas no arquivo SQL acompanhante).*

---

## Segurança

O sistema foi arquitetado para contornar falhas comuns de sistemas web:

- **Sessões Nativas PHP:** Em vez de JWT exposto, utiliza sessão persistente no lado do servidor com cookies `HttpOnly`, `SameSite=Lax` e `Secure` (quando HTTPS ativo).
- **Proteção CSRF:** Tokens de segurança gerados no backend e exigidos em todas as mutações (`POST`, `PUT`, `DELETE`).
- **Prevenção de SQL Injection:** Conexão feita inteiramente via `PDO` com Prepared Statements (variáveis sanitizadas e desvinculadas das queries).
- **Rate Limiting:** Bloqueio temporário de IP após 5 tentativas de login falhas consecutivas (parametrizável no `.env`).
- **Arquivos Ocultos:** O `.env` é arquitetado para ficar **fora** da pasta pública (`public_html`). Caso seja mantido dentro, o arquivo `.htaccess` fornecido bloqueia sua leitura.

---

## Instalação e Configuração na Hostinger (ou cPanel/VPS)

### 1. Criar o Banco de Dados (MySQL)
No painel da Hostinger (hPanel) ou cPanel, vá em **Bancos de Dados MySQL**.
Crie um banco (ex: `u123456_agenda`), um usuário e associe com uma senha forte. Conceda todos os privilégios.

### 2. Importar as Tabelas
Acesse o **phpMyAdmin**. Selecione o banco de dados criado, clique em **Importar** e envie o arquivo `sql/esquema_banco_de_dados.sql`.

### 3. Fazer Upload dos Arquivos
Usando o **Gerenciador de Arquivos** ou FTP, envie o conteúdo do projeto.
Os arquivos (como `index.html`, pasta `api/`, `css/`, etc.) devem ficar dentro da pasta **`public_html`**.

### 4. Configurar o `.env`
No Gerenciador de Arquivos:
1. Navegue para a pasta **raiz da sua hospedagem** (um nível *acima* do `public_html`).
2. Mova ou crie o arquivo `.env` lá. O sistema detectará automaticamente.
3. Preencha os dados:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u123456_agenda
DB_USER=u123456_agenda
DB_PASS=SuaSenhaDoBanco

APP_ENV=production
APP_URL=https://seudominio.com.br
APP_TIMEZONE=America/Sao_Paulo

TRUST_PROXY=0
MAX_TENTATIVAS_LOGIN=5
BLOQUEIO_MINUTOS=15
SESSION_LIFETIME=28800
SESSION_NAME=gv_sessao

# Token de configuração inicial
SETUP_TOKEN=TokenSuperSecreto123!
```

### 5. Criar o Primeiro Administrador
1. No navegador, acesse: `https://seudominio.com.br/api/criar-primeiro-usuario.php`
2. Informe o **SETUP_TOKEN** configurado no passo anterior e preencha seus dados de administrador (E-mail e Senha).
3. **AÇÃO OBRIGATÓRIA:** Após criar, vá no Gerenciador de Arquivos, entre na pasta `api/` e **EXCLUA** o arquivo `criar-primeiro-usuario.php`. Em seguida, remova a linha `SETUP_TOKEN` do seu `.env`.

Pronto! Seu sistema está instalado e seguro para operar em produção.

---

## Como usar

### Criar uma visita
- **Pela Agenda:** Botão "+ Nova visita".
- **Pelo Calendário:** Clique em um dia vazio.
- **Pelo Consolidado:** Clique em uma célula vazia (Data e Local são pré-preenchidos).

### Marcar como concluída
Edite a visita, mude o status para **Concluído** e preencha o **resumo** (obrigatório).

### Excluir uma visita
Abra a visita. Se tiver permissão, o botão **Excluir** aparece no rodapé do formulário.

### Gerenciar usuários (ADM)
Vá em **Cadastro**. O ADM pode inativar contas, mudar perfis (escopo) ou clicar no botão de edição de usuário para digitar uma **nova senha** caso um profissional perca o acesso.

---

## Personalização

### Cores
Edite as variáveis CSS no topo de `css/style.css`:
```css
:root {
    --cor-primaria: #1F3A5F;
    --cor-planejado: #B5540A;
    --cor-concluido: #1D5FA6;
    /* ... */
}
```

### Períodos
Hoje são três: `manha`, `tarde`, `noite`. Para adicionar:
1. Adicione o label em `App.periodoLabel` (em `app.js`).
2. Adicione o `<input type="checkbox">` no modal (`index.html`).

---

## Limitações conhecidas

- **Sem confirmação de e-mail** — Contas são ativadas instantaneamente na criação pelo Administrador.
- **Uma tarefa por agendamento** — O modelo permite apenas uma tarefa por visita (embora suporte múltiplos períodos no dia).
- **Sem "Esqueci minha senha" self-service** — Sem servidor SMTP integrado por padrão, a recuperação de senha é feita administrativamente (o ADM redefine no painel).
- **Sem log detalhado de auditoria de edições** — Não há histórico granular de quem editou cada campo em um agendamento.

---

## Licença

Distribuído sob a **Licença MIT**. Veja o arquivo `LICENSE` para o texto completo.
As bibliotecas de terceiros usadas via CDN (FullCalendar, SheetJS) mantêm suas próprias licenças originais.
