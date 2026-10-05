# Gestão de Visitas

Sistema web para gestão de visitas e agendamentos de equipes pedagógicas.
Painel único onde cada profissional registra suas visitas, o administrador
enxerga a rede inteira e a equipe enxerga o consolidado da semana.

Construído em **HTML/CSS/JavaScript puro** (sem framework), apoiado no
**Hostinger / phpMyAdmin (MySQL)** para autenticação, banco de dados e políticas de acesso
(RLS), com **FullCalendar** para visualização de calendário e **SheetJS**
para exportação em Excel.

---

## Sumário

- [Visão geral](#visão-geral)
- [Perfis de acesso](#perfis-de-acesso)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Modelo de dados](#modelo-de-dados)
- [Segurança](#segurança)
- [Usar como template](#usar-como-template)
- [Instalação](#instalação)
- [Configuração do Hostinger / phpMyAdmin (MySQL)](#configuração-do-hostinger)
- [Edge Function: `criar-usuario`](#edge-function-criar-usuario)
- [Deploy no Vercel](#deploy-no-vercel)
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
3. **Consolidado Semanal** — matriz local × dia da semana, mostrando
   onde cada profissional estará
4. **Relatórios** — individual (cada um vê o seu) e geral (ADM vê todos),
   com exportação em Excel

---

## Perfis de acesso

O sistema tem dois perfis, definidos na coluna `escopo` da tabela
`public.usuarios`:

### USER

- Consulta o próprio cadastro
- Consulta funções, locais e tarefas **ativos**
- Consulta **todos** os agendamentos (necessário para o Consolidado,
  onde a equipe enxerga junto quem estará em cada local)
- Cria agendamentos **somente para si**
- Edita e exclui **somente** seus próprios agendamentos
- Vê o próprio relatório e os indicadores

### ADM

- Consulta todos os usuários e agendamentos
- Altera dados complementares dos usuários (nome, e-mail, função,
  escopo, ativo)
- **Cria novos usuários** e **redefine senha** via Edge Function
- Cria, edita e exclui qualquer agendamento
- Gerencia funções, locais e tarefas
- Acessa o relatório geral (consolidado de toda a rede)

---

## Funcionalidades

### 1. Início (Dashboard)

Cards de resumo + lista das próximas visitas.

- **USER:** total, planejadas, concluídas, próximas visitas pessoais
- **ADM:** total, planejadas, concluídas, usuários ativos, localidades

### 2. Agenda

Lista tabular dos agendamentos com filtros por data, local, período e
status. Cada linha abre o modal de edição (se o usuário tiver permissão).
Ao editar, se a visita for **planejada** e o usuário tiver permissão,
o botão **Excluir** aparece no rodapé do modal.

### 3. Calendário

Integração com **FullCalendar 6**. Cores por status:

- 🟠 Planejado (laranja escuro)
- 🔵 Concluído (azul)

Clique em um evento planejado → abre o formulário de edição (se for seu
ou se for ADM). Clique em um evento concluído → abre o modal de detalhes
(somente leitura). Clique em um dia vazio → abre o formulário de nova
visita com a data já preenchida.

Em telas pequenas, inicia na visão de Lista, com toolbar compacta.

### 4. Consolidado Semanal

Matriz com:

- **Linhas:** localidades
- **Colunas:** dias da semana
- **Células:** compromissos do local naquele dia, agrupados por período

Clique em qualquer célula vazia para criar uma visita com **data e local
já preenchidos**. Clique em um compromisso existente para ver os detalhes.
A coluna de localidades é fixa (sticky) ao rolar horizontalmente.

### 5. Cadastro (ADM)

Lista de usuários com edição de **nome**, **e-mail**, **função**,
**escopo** e **ativo**. Também permite **redefinir a senha** de qualquer
usuário (campo opcional no modal de edição).

Criação de novos usuários é feita via **Edge Function** `criar-usuario`,
que roda no servidor com `service_role` para criar a conta em
`auth.users` e completar `public.usuarios` numa transação atômica.

### 6. Locais (ADM)

CRUD de localidades (nome + cidade). Localidades inativas deixam de
aparecer nos seletores de agendamento.

### 7. Tarefas (ADM)

CRUD dos tipos de tarefa (acompanhamento, formação, ATPA, etc.) com
descrição opcional.

### 8. Relatório (todos)

Relatório individual com filtros de data, local, tarefa e status,
cards de totais e exportação para **Excel** (SheetJS).

### 9. Relatório Geral (ADM)

Igual ao individual, mas com filtros adicionais (usuário, função,
cidade), ordenação por coluna e exportação.

### 10. Indicadores

Gráficos de barras simples (CSS puro) com distribuição por local,
tarefa, status, período e evolução semanal.

---

## Arquitetura

```
┌──────────────────────────────┐
│  Navegador (HTML/CSS/JS)     │
│  ─ SPA por troca de <section>│
│  ─ Hostinger / phpMyAdmin (MySQL) JS (client)      │
│  ─ FullCalendar / SheetJS    │
└───────────┬──────────────────┘
            │ HTTPS + JWT
            ▼
┌──────────────────────────────┐
│  Hostinger / phpMyAdmin (MySQL)                    │
│  ─ Auth (JWT)                │
│  ─ PostgreSQL + RLS          │
│  ─ RPC listar_usuarios_ativos│
│  ─ Edge Function             │
│    criar-usuario             │
│    (criar / redefinir senha) │
└──────────────────────────────┘
```

- **Frontend:** SPA com seções trocadas via JavaScript. Cada módulo
  registra sua view em `App.registrarView(id, { onEnter })`.
- **Autenticação:** Hostinger / phpMyAdmin (MySQL) Auth. O JWT é enviado em todas as
  requisições; a RLS filtra as linhas por `auth.uid()`.
- **Edge Function:** roda no servidor Hostinger / phpMyAdmin (MySQL) com a `service_role`
  para criar usuários e redefinir senhas — operações que o cliente
  anon não pode fazer por segurança.
- **Sem framework:** JavaScript puro, sem build step, sem npm. Basta
  servir os arquivos via HTTP e abrir o `index.html`.

---

## Estrutura de arquivos

```
.
├── index.html                    # Shell da aplicação (login, app, modais)
├── LICENSE                       # Licença MIT
├── README.md
├── css/
│   └── style.css                 # Todo o CSS (variáveis, componentes, responsivo)
├── js/
│   ├── hostinger.js               # URL + chave anon + instancia do client
│   ├── app.js                    # Núcleo: estado, navegação, utilitários
│   ├── auth.js                   # Login, logout, erros
│   ├── dashboard.js              # Tela Início
│   ├── agenda.js                 # Tela Agenda + formulário de agendamento
│   ├── calendario.js             # Tela Calendário (FullCalendar)
│   ├── consolidado.js            # Tela Consolidado Semanal
│   ├── usuarios.js               # Tela Cadastro (ADM)
│   ├── locais.js                 # Tela Locais (ADM)
│   ├── tarefas.js                # Tela Tarefas (ADM)
│   ├── relatorios.js             # Relatório + Relatório Geral
│   └── indicadores.js            # Tela Indicadores
└── image/
    ├── logo.png
    ├── casa.png
    ├── caderno-alternativo.png
    ├── relogio-calendario.png
    ├── semana-do-calendario.png
    ├── pin.png
    ├── tarefas.png
    ├── adicionar-usuario.png
    ├── relatorio-de-dados.png
    ├── arquivo-excel.png
    └── calculadora.png
```

**Fora do repositório**, no painel Hostinger / phpMyAdmin (MySQL):

```
hostinger/functions/criar-usuario/index.ts   # Edge Function (deploy pelo painel)
```

---

## Modelo de dados

Cinco tabelas no schema `public`:

### `funcoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | |
| `nome` | text NOT NULL UNIQUE | Supervisor, CEC, PEC, Dirigente… |
| `ativo` | boolean | default `true` |

### `usuarios`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK FK → `auth.users.id` | |
| `nome` | text NOT NULL | |
| `email` | text NOT NULL UNIQUE | |
| `escopo` | text NOT NULL | `'adm'` ou `'user'` |
| `funcao_id` | bigint FK → `funcoes.id` | opcional |
| `ativo` | boolean | default `true` |
| `created_at` | timestamptz | default `now()` |

### `locais`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | |
| `nome` | text NOT NULL | |
| `cidade` | text NOT NULL | |
| `ativo` | boolean | default `true` |
| | | UNIQUE (`nome`, `cidade`) |

### `tarefas`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | |
| `nome` | text NOT NULL UNIQUE | |
| `descricao` | text | opcional |
| `ativo` | boolean | default `true` |

### `agendamentos`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | |
| `usuario_id` | uuid NOT NULL FK → `usuarios.id` | |
| `local_id` | bigint NOT NULL FK → `locais.id` | |
| `tarefa_id` | bigint NOT NULL FK → `tarefas.id` | |
| `data` | date NOT NULL | |
| `periodo` | **text[] NOT NULL** | array de `'manha'`, `'tarde'`, `'noite'` |
| `status` | text NOT NULL | `'planejado'` ou `'concluido'` |
| `objetivo` | text | opcional |
| `resumo` | text | **obrigatório** se `status = 'concluido'` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | atualizado por trigger |

**Restrições importantes:**

- `status = 'concluido'` exige `resumo` não-vazio
- `periodo` é um array que **contém pelo menos 1** item, e **todos** os
  itens estão em `{'manha','tarde','noite'}` — validado por
  `periodo <@ array['manha','tarde','noite'] and array_length(periodo, 1) >= 1`
- `status` restrito a `'planejado'`, `'concluido'`
- Índice **GIN** em `periodo` para acelerar consultas `contains`

---

## Segurança

### Row Level Security (RLS)

Todas as tabelas têm RLS **habilitada e forçada**
(`force row level security`), o que significa que nem o dono da tabela
escapa das policies — só `service_role` (usado apenas na Edge Function).

Resumo das policies:

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `funcoes` | ADM ou ativo | ADM | ADM | ADM |
| `locais` | ADM ou ativo | ADM | ADM | ADM |
| `tarefas` | ADM ou ativo | ADM | ADM | ADM |
| `usuarios` | self ou ADM | ADM | self (nome/e-mail) ou ADM | — |
| `agendamentos` | **ativo (todos veem)** | self ou ADM | self ou ADM | **self ou ADM** |

A policy de `SELECT` em `agendamentos` deixa **qualquer usuário ativo
ver todos os agendamentos** — isso é intencional, para o Consolidado
funcionar como painel de equipe. A **edição** continua restrita: cada
um só altera o próprio (ou o ADM altera qualquer).

### Trigger de proteção de campos administrativos

Na tabela `usuarios`, a trigger `trg_usuarios_protege_campos_admin`
impede que um USER altere `escopo`, `funcao_id` ou `ativo` do próprio
registro — mesmo que a RLS permita o UPDATE. Isso é necessário porque
RLS é row-level, não column-level.

### RPC `listar_usuarios_ativos()`

Como RLS é row-level (não column-level), não seria possível dar ao USER
permissão de ver só o `nome` dos colegas. Para não vazar e-mails, a
listagem de nomes é exposta por uma função `SECURITY DEFINER` que
retorna apenas `(id, nome)`. Usada pelo Calendário, Consolidado e
algumas listas.

### Edge Function com `service_role`

A `service_role` do Hostinger / phpMyAdmin (MySQL) **nunca** vai para o frontend. Ela só é
usada dentro da Edge Function `criar-usuario`, que roda no servidor,
valida o JWT do chamador, confirma que é ADM ativo e só então:

- **Modo criação:** cria a conta em `auth.users` via
  `admin.auth.admin.createUser()` + faz upsert em `public.usuarios`
- **Modo redefinição de senha:** atualiza a senha via
  `admin.auth.admin.updateUserById()`

### Boas práticas seguidas

- Nenhuma credencial privilegiada no código do cliente
- RLS em todas as tabelas, sem exceção
- Funções `SECURITY DEFINER` com `search_path = ''`
- Validação de payload na Edge Function (nunca confiar no cliente)
- CORS restrito nas Edge Functions

---

## Usar como template

Este repositório pode ser usado como **template** no GitHub — ou seja,
qualquer pessoa pode gerar um projeto novo (com histórico próprio) a
partir dele.

### Passo 1 — Criar o repositório a partir do template

No GitHub, acesse a página do repositório deste projeto e clique no
botão verde **"Use this template"** (canto superior direito) →
**"Create a new repository"**.

Na tela que abrir, defina:

| Campo | O que colocar |
|---|---|
| **Owner** | sua conta ou organização |
| **Repository name** | o nome do seu projeto (ex.: `gestao-visitas-minha-rede`) |
| **Visibility** | Public ou Private (à sua escolha) |
| **Include all branches** | deixe desmarcado, a não ser que queira o histórico completo |

Clique em **"Create repository from template"**.

> O repositório novo contém **todos os arquivos** do template, mas
> **sem o histórico de commits** — é um projeto novo, seu.

### Passo 2 — Clonar localmente

```bash
git clone https://github.com/SEU-USUARIO/SEU-REPO.git
cd SEU-REPO
```

### Passo 3 — Configurar o Hostinger / phpMyAdmin (MySQL)

Siga a seção [Configuração do Hostinger / phpMyAdmin (MySQL)](#configuração-do-hostinger) deste
README. É lá que você vai:

1. Criar o projeto no Hostinger / phpMyAdmin (MySQL)
2. Rodar o script SQL (schema, RLS, triggers, seeds)
3. Editar `js/hostinger.js` com a URL e a chave anon do **seu** projeto
4. Criar o primeiro ADM e promovê-lo via SQL

### Passo 4 — Deploy da Edge Function

A Edge Function `criar-usuario` precisa ser criada **no painel do
Hostinger / phpMyAdmin (MySQL) do seu projeto**. Siga a seção
[Edge Function: `criar-usuario`](#edge-function-criar-usuario).

### Passo 5 — Publicar

Hospede como quiser. Instruções para Vercel em
[Deploy no Vercel](#deploy-no-vercel).

---

## Instalação

### Pré-requisitos

- Conta no [Hostinger / phpMyAdmin (MySQL)](https://hostinger.com) (free tier resolve)
- Um servidor HTTP simples para servir os arquivos (não abrir via
  `file://` — o CORS do Hostinger / phpMyAdmin (MySQL) bloqueia)

### Opção A — VSCode + Live Server

1. Abra a pasta do projeto no VSCode
2. Instale a extensão **Live Server**
3. Clique em **Go Live** no canto inferior direito

### Opção B — Python

```bash
cd pasta-do-projeto
python -m http.server 8000
```

Acesse `http://localhost:8000`.

### Opção C — Node

```bash
npx serve .
```

### Opção D — Hospedagem estática

Vercel, Netlify, GitHub Pages, Cloudflare Pages — qualquer uma funciona.
Lembre de configurar o domínio do site em **Authentication → URL
Configuration** no Hostinger / phpMyAdmin (MySQL).

---

## Configuração do Hostinger / phpMyAdmin (MySQL)

### 1. Criar o projeto

No painel Hostinger / phpMyAdmin (MySQL), crie um projeto novo. Anote a **URL** e a
**anon key** (Settings → API).

### 2. Rodar o schema

Cole o script SQL completo no **SQL Editor** e execute. Isso cria:

- Tabelas (`funcoes`, `usuarios`, `locais`, `tarefas`, `agendamentos`)
- Índices (incluindo **GIN** em `agendamentos.periodo`)
- Triggers (`updated_at`, proteção de campos, auto-criação de usuário)
- Funções auxiliares (`usuario_e_adm`, `usuario_esta_ativo`,
  `listar_usuarios_ativos`)
- RLS + policies
- Dados iniciais (funções, tarefas, locais de exemplo)

### 3. Configurar `js/hostinger.js`

As credenciais ficam no topo do arquivo `js/hostinger.js`:

```javascript
const SUPABASE_URL = 'https://SEU-PROJETO.hostinger.co';
const SUPABASE_ANON_KEY = 'eyJ...';   // chave anon completa

const hostingerClient = hostinger.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    }
);
```

> A chave anon é **pública por design**. Quem protege os dados é a RLS.

### 4. Criar o primeiro ADM

Em **Authentication → Users**, crie um usuário com e-mail e senha.
O trigger `trg_on_auth_user_created` vai inserir automaticamente uma
linha em `public.usuarios` com `escopo = 'user'`.

Promova-o a ADM rodando no SQL Editor:

```sql
update public.usuarios
   set escopo = 'adm',
       nome   = 'Seu Nome Completo'
 where email = 'seu@email.com';
```

Depois faça login no app com esse usuário.

### 5. Adicionar o domínio de produção

Depois de publicar o site (ver [Deploy no Vercel](#deploy-no-vercel)),
volte ao Hostinger / phpMyAdmin (MySQL) em **Authentication → URL Configuration** e adicione
o domínio (ex.: `https://seu-projeto.vercel.app`) tanto em **Site URL**
quanto em **Redirect URLs**. Sem isso, o login pode falhar no domínio
de produção.

---

## Edge Function: `criar-usuario`

### Por que existe

Duas operações exigem `service_role`, que **nunca** pode ficar no
frontend:

- **Criar usuário no Auth** (o cliente anon não tem permissão)
- **Redefinir a senha de outro usuário** (idem)

Em vez de duas Edge Functions, uma única função roteia pelo payload:

| Payload recebido | O que a função faz |
|---|---|
| `{ nome, email, senha, funcao_id, escopo, ativo }` | Cria usuário (Auth + `public.usuarios`) |
| `{ usuario_id, senha }` | Atualiza somente a senha do usuário |

### Deploy

No painel Hostinger / phpMyAdmin (MySQL):

1. Menu lateral → **Edge Functions**
2. **Deploy a new function** → nome: `criar-usuario`
3. Cole o código TypeScript (disponível em
   `hostinger/functions/criar-usuario/index.ts`)
4. **Deploy**
5. Confirme que **Enforce JWT verification** está **ativado** em
   Settings

### Variáveis de ambiente

São injetadas automaticamente pelo Hostinger / phpMyAdmin (MySQL) — não precisa configurar:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Como o frontend chama

**Criação:**
```javascript
const { data, error } = await hostingerClient.functions.invoke('criar-usuario', {
    body: { nome, email, senha, funcao_id, escopo, ativo }
});
```

**Redefinição de senha:**
```javascript
const { data, error } = await hostingerClient.functions.invoke('criar-usuario', {
    body: { usuario_id, senha }
});
```

O `hostinger-js` envia o JWT do usuário logado automaticamente. A função
valida que é ADM ativo antes de qualquer coisa.

---

## Deploy no Vercel

O projeto é **estático** (HTML, CSS, JS, imagens). O Vercel detecta
isso automaticamente e faz o deploy **sem build step**, sem precisar de
`package.json`, sem configuração especial[reference:0].

### Passo 1 — Suba o código para o GitHub

Se ainda não estiver no GitHub, crie um repositório e faça push:

```bash
git init
git add .
git commit -m "Primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

### Passo 2 — Crie a conta no Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em **Sign Up**
3. Escolha **Continue with GitHub** e autorize o Vercel a acessar
   seus repositórios

O Vercel fica automaticamente vinculado à sua conta GitHub[reference:1].

### Passo 3 — Importe o projeto

1. No painel do Vercel, clique em **Add New…** → **Project**
2. Em **Import Git Repository**, localize o repositório do projeto
3. Clique em **Import**[reference:2]

> Se o repositório não aparecer, clique em **Adjust GitHub App
> Permissions** e conceda acesso ao repositório específico.

### Passo 4 — Configure o projeto

Na tela de configuração:

| Campo | Valor |
|---|---|
| **Framework Preset** | `Other` |
| **Root Directory** | deixe **em branco** (a raiz do repositório) |
| **Build Command** | deixe **em branco** (Vercel ignora) |
| **Output Directory** | deixe **em branco** |

Como é um site estático puro, o Vercel **não precisa** rodar build
nenhum. Ele serve os arquivos como estão[reference:3].

### Passo 5 — Deploy

Clique em **Deploy**. O Vercel:

1. Clona o repositório
2. Serve os arquivos estáticos pela CDN global
3. Gera uma URL de preview tipo
   `https://seu-projeto-xxxx.vercel.app`

Depois do deploy concluído, o **domínio de produção** fica em
`https://seu-projeto.vercel.app`.

### Passo 6 — Configure o Hostinger / phpMyAdmin (MySQL) para aceitar o domínio

No painel Hostinger / phpMyAdmin (MySQL) → **Authentication → URL Configuration**:

- **Site URL:** `https://seu-projeto.vercel.app`
- **Redirect URLs:** adicione `https://seu-projeto.vercel.app/**`

Sem isso, o login funciona no `localhost` mas pode falhar no domínio
do Vercel.

### Passo 7 — Deploys automáticos

A partir do momento em que o repositório está conectado, **todo push
para o `main` gera um novo deploy de produção**, e todo push para
outras branches gera um **deploy de preview** com URL própria. Não
precisa fazer nada manualmente[reference:4].

### Variáveis de ambiente (opcional)

Como as credenciais do Hostinger / phpMyAdmin (MySQL) estão **no arquivo
`js/hostinger.js`** (e são públicas por natureza), o projeto **não
precisa** de variáveis de ambiente no Vercel. Mas se você quiser
mover para variáveis de ambiente no futuro, o Vercel permite:

1. Painel do projeto → **Settings → Environment Variables**
2. Adicione cada chave (ex.: `VITE_SUPABASE_URL`)
3. Escolha os ambientes (**Production**, **Preview**,
   **Development**)[reference:5]

> ⚠️ Como o projeto **não usa build step**, variáveis de ambiente
> **não** são injetadas automaticamente nos arquivos estáticos. Se
> precisar delas no cliente, teria que migrar para uma build tool
> (Vite, Webpack) — não é o caso atual.

### Alternativa — Deploy via CLI

Se preferir fazer o deploy sem GitHub:

```bash
# Instala o CLI globalmente
npm i -g vercel

# Login
vercel login

# Deploy (a partir da pasta do projeto)
vercel

# Deploy em produção (sem prompt)
vercel --prod
```

O primeiro `vercel` cria um projeto novo e pergunta as configurações.
Como é estático, aceite os defaults (framework `Other`, sem build
command)[reference:6].

---

## Como usar

### Login

Acesse a URL, insira e-mail e senha cadastrados.

### Criar uma visita

**Pela Agenda:**

1. **+ Nova visita**
2. Preencha local, data, período(s) e tarefa, objetivo e status
3. **Salvar**

**Pelo Calendário:**

- Clique em um dia vazio → abre o formulário com a data preenchida

**Pelo Consolidado:**

- Clique em uma célula vazia → abre o formulário com data e local
  preenchidos

### Marcar como concluída

Edite a visita, mude o status para **Concluído** e preencha o
**resumo** (obrigatório).

### Excluir uma visita

Abra a visita pela Agenda ou pelo Calendário. Se você tiver permissão
(dono ou ADM), o botão **Excluir** aparece no canto esquerdo do rodapé
do modal. Confirmação por `confirm()` antes de apagar.

### Exportar para Excel

No **Relatório** ou **Relatório Geral**, clique em **⬇ Exportar
Excel**. O arquivo é gerado localmente pelo SheetJS (nada é enviado
para servidor).

### Gerenciar usuários (ADM)

**Cadastro → + Novo usuário** → preencha nome, e-mail, senha, função,
escopo e ativo → Salvar. O usuário é criado no Auth + complemento em
`public.usuarios` numa transação.

Para **redefinir a senha** de alguém, clique em **Editar**, preencha o
campo **Nova senha (opcional)** e salve. Deixe em branco para não
alterar.

---

## Personalização

### Cores

Edite as variáveis CSS no topo de `css/style.css`:

```css
:root {
    --cor-primaria: #1F3A5F;
    --cor-primaria-escura: #16293F;
    --cor-planejado: #B5540A;
    --cor-concluido: #1D5FA6;
    /* ... */
}
```

### Períodos

Hoje são três: `manha`, `tarde`, `noite`. Para adicionar um quarto:

1. Adicione o label em `App.periodoLabel` (em `app.js`)
2. Adicione o `<input type="checkbox" name="ag-periodo">` no modal
   (`index.html`)
3. Atualize a constraint SQL `agendamentos_periodo_check` para incluir
   o novo valor no array de permitidos

### Ícones

Os ícones do menu vêm de `image/` (PNG). Para trocar, basta sobrescrever
o arquivo com o mesmo nome. Para mudar o mapeamento, edite o array de
itens do menu em `app.js` (`montarMenu`).

---

## Limitações conhecidas

- **Sem confirmação de e-mail** — a Edge Function cria usuários com
  `email_confirm: true` para simplificar o fluxo interno
- **Uma tarefa por agendamento** — o modelo atual permite apenas uma
  tarefa por visita
- **Recuperação de senha self-service** — não há link "esqueci minha
  senha" no frontend; a senha só é alterada pelo ADM
- **Sem PWA / offline** — requer conexão
- **Sem notificações** — não há e-mail nem push ao criar/alterar
  agendamento
- **Sem log de auditoria** — não há histórico de quem alterou o quê

---

## Licença

Distribuído sob a **Licença MIT**. Veja o arquivo [LICENSE](LICENSE)
para o texto completo.

Em resumo: você pode usar, copiar, modificar, mesclar, publicar,
distribuir, sublicenciar e/ou vender cópias do software, desde que
mantenha o aviso de copyright e a licença original em todas as cópias
ou partes substanciais do software. O software é fornecido "como está",
sem garantias de qualquer tipo.

As bibliotecas de terceiros usadas via CDN (FullCalendar, SheetJS,
Hostinger / phpMyAdmin (MySQL) JS) mantêm suas próprias licenças originais.

---

## Suporte

Dúvidas, sugestões ou bugs: abrir uma issue no repositório ou
contatar o administrador do sistema.
