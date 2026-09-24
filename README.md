# 🪙 TonuControle — Suas Finanças

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![PWA](https://img.shields.io/badge/PWA-Ready-orange.svg)
![Tests](https://img.shields.io/badge/tests-34%2F34%20passing-success.svg)

> **Controle Financeiro Inteligente e Gestão de Investimentos com Suporte Offline-First e Alta Segurança.**

---

## 📌 O que é o TonuControle?

O **TonuControle** é uma plataforma completa e moderna para gestão financeira pessoal e controle avançado de patrimônio e investimentos. Desenvolvido com foco em usabilidade, velocidade e confiabilidade, ele opera de forma híbrida e responsiva, oferecendo interfaces refinadas tanto para Desktop quanto para Mobile (PWA instalável).

A aplicação adota uma arquitetura **Offline-First**, permitindo que você registre transações, consulte despesas e gerencie metas mesmo sem conexão ativa à internet. As alterações são sincronizadas automaticamente com o banco de dados em nuvem assim que a conectividade for restabelecida.

Diferente de planilhas complexas ou soluções lentas, o TonuControle une a simplicidade do lançamento financeiro cotidiano à precisão contábil e tributária, incluindo cálculo de preço médio ponderado com eventos corporativos (splits, inplits, bonificações) e emissão de relatórios para o Imposto de Renda (IR).

---

## ✨ Funcionalidades Principais

### 📊 Dashboard
- **Cards de Métricas:** Saldo total consolidado, receitas, despesas, contas pendentes e total investido.
- **Modo Privacidade:** Botão para ocultar/revelar valores financeiros (`••••••`) com persistência de preferência.
- **Gráficos Interativos (Chart.js):** Distribuição de despesas por categoria e evolução financeira mensal (gráfico combo de barras e linhas).
- **Saudação Personalizada:** Exibição dinâmica de boas-vindas com o primeiro nome do usuário autenticado.

### 💳 Transações
- **Registro Completo:** Receitas e despesas com categorização, tags, data e descrição.
- **Filtros Avançados:** Filtros dinâmicos por categoria, tipo e intervalo temporal.
- **Parcelamento & Recorrência:** Criação automática de parcelas e repetições periódicas.
- **Importação & Exportação:** Importação de extratos via OFX e CSV, além de exportação filtrada para planilha CSV.

### 📅 Contas a Pagar
- **Visão Temporal:** Acompanhamento de contas a vencer, vencidas e pagas.
- **Liquidação Rápida:** Pagamento em 1 clique com geração instantânea da respectiva despesa no fluxo de caixa.
- **Banner de Contas Parceladas:** Resumo em destaque do progresso de parcelas e compromissos futuros.

### 🎯 Metas Financeiras
- **Criação e Monitoramento:** Definição de metas com prazos, valor-alvo e categoria.
- **Aportes e Resgates:** Registro de movimentações com histórico detalhado e recálculo da barra de progresso.
- **Modal de Celebração de Metas:** Ao atingir 100%, dispara celebração em tela cheia com troféu, raios animados, fanfarra por áudio sintetizado e chuva de confetes (`canvas-confetti`).

### 📈 Investimentos & Carteira
- **Gestão de Custódia:** Ações, FIIs, BDRs, ETFs, Renda Fixa e Criptoativos.
- **Motor de Custódia & Splits:** Apuração rigorosa de Preço Médio (PM), custo de aquisição e quantidade.
- **Eventos Corporativos:** Suporte a desdobramentos (splits), grupamentos (inplits), bonificações e amortizações.
- **Proventos & Dividendos:** Registro de dividendos, rendimentos e Juros sobre Capital Próprio (JCP) com alíquota oficial única de retenção na fonte (15%).
- **Cotações B3:** Integração com APIs financeiras (BRAPI e Yahoo Finance) com cache resiliente.

### 📄 Relatório de Imposto de Renda (IR)
- **Bens e Direitos:** Posição exata da custódia em 31/12 para declaração anual.
- **Rendimentos Isentos & Tributação Exclusiva:** Separação de dividendos e JCP tributado.
- **Apuração de Ganhos de Capital:** Cálculo de lucros/prejuízos líquidos com compensação e controle de DARF.

### ⚙️ Configurações & Segurança
- **Perfil de Usuário:** Atualização de nome, foto de perfil (avatar) e dados cadastrais.
- **Categorias e Orçamentos:** Criação, edição e exclusão de categorias personalizadas com teto orçamentário.
- **Segurança Reforçada:**
  - **Biometria (WebAuthn):** Face ID e Touch ID no Desktop e Mobile.
  - **Autenticação em Duas Etapas (2FA):** Proteção adicional contra acessos indevidos.
  - **PIN de Acesso Rápido:** Bloqueio local por código numérico.
- **Backup e Restauração:** Exportação completa da base em formato JSON criptografado e restauração com validação de integridade.

### 📱 Versão Mobile Otimizada
- Interface PWA dedicada em `/pages/mobile/` com navegação inferior (*bottom nav*).
- Gestos fluidos, modais responsivos e experiência nativa em iOS e Android.

---

## 🛠️ Arquitetura Técnica

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (PWA)                      │
│   HTML5 Vanilla • CSS3 Moderno • JavaScript Modular     │
│   Chart.js • FontAwesome • Canvas-Confetti • Web Audio  │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
    (Sincronização Local)         (Injeção & APIs Públicas)
               ▼                           ▼
┌──────────────────────────────┐   ┌──────────────────────┐
│  OFFLINE & LOCAL STORAGE     │   │   EXPRESS SERVER     │
│  IndexedDB (Cache Local)     │   │   Node.js + Dotenv   │
│  Fila de Sincronização       │   │   Helmet + RateLimit │
│  Service Worker (sw.js)      │   │   Proxy de Cotações  │
└──────────────┬───────────────┘   └──────────┬───────────┘
               │                              │
               └──────────────┬───────────────┘
                              ▼
               ┌──────────────────────────────┐
               │    SUPABASE CLOUD BACKEND    │
               │    PostgreSQL + Row-Level    │
               │    Security (RLS) + Auth     │
               └──────────────────────────────┘
```

- **Frontend:** HTML5 semântico, Tailwind/CSS3 com variáveis de tema (Light/Dark), JavaScript puro (ES6+ modular). Sem frameworks pesados, garantindo carregamento instantâneo.
- **Backend:** Node.js com Express, compressão Gzip, proteção via Helmet, CORS e limitador de taxa (Rate Limiting).
- **Banco de Dados & Autenticação:** Supabase (PostgreSQL) com segurança rigorosa via **Row-Level Security (RLS)**, garantindo que cada usuário acesse apenas seus próprios registros.
- **Criptografia & Privacidade:** Criptografia simétrica com **AES-GCM** via Web Crypto API para dados sensíveis em repouso e offline.
- **Injeção Dinâmica de Variáveis:** O servidor lê o arquivo `.env` e injeta `window.__TONU_CONFIG__` de forma controlada no HTML, sem expor chaves de serviço ou segredos de backend.

---

## 🚀 Instalação e Execução

### Pré-requisitos
- **Node.js** `>= 18.0.0`
- **npm** ou **bun**

### 1. Clonar e Instalar Dependências
```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/tonucontrole.git
cd tonucontrole

# Instalar pacotes npm
npm install
```

### 2. Configurar Variáveis de Ambiente
Copie o template de exemplo para criar o seu `.env` local:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:
```env
# Ambiente & Porta
NODE_ENV=development
PORT=3000

# Supabase (Banco de Dados & Auth)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=seu-anon-key-publico

# Cotações B3 (Opcional)
BRAPI_TOKEN=seu-token-brapi

# Inteligência Artificial (Opcional)
GEMINI_API_KEY=sua-chave-gemini
```

### 3. Iniciar o Servidor
```bash
# Modo Desenvolvimento
npm run dev

# Modo Produção
npm start
```
Acesse a aplicação no seu navegador em: `http://localhost:3000`.

---

## 📂 Estrutura do Projeto

```
tonucontrole/
├── .env.example            # Template de variáveis de ambiente
├── .gitignore              # Proteção contra commit de credenciais
├── index.html              # Landing page e entrada Desktop
├── index-mobile.html       # Entrada dedicada Mobile
├── manifest.json           # Manifesto PWA
├── package.json            # Dependências e scripts
├── server.js               # Servidor Express, segurança e APIs
├── sw.js                   # Service Worker (estratégia de cache)
│
├── css/                    # Estilos modulares e temas claro/escuro
│   ├── theme.css
│   ├── dark-theme.css
│   └── ...
│
├── js/                     # Lógica de negócio da aplicação
│   ├── auth.js             # Autenticação, rate limiting e sessão
│   ├── core.js             # Formatações, haptic feedback e config
│   ├── dashboard.js        # Lógica do painel e gráficos
│   ├── transactions.js     # Gestão e filtros de transações
│   ├── bills.js            # Contas a pagar e recorrência
│   ├── goals.js            # Metas e celebrações
│   ├── investments.js      # Carteira, cotações e proventos
│   ├── security.js         # WebAuthn (biometria), 2FA e PIN
│   ├── sync.js             # Fila de sincronização offline
│   └── supabase.js         # Cliente Supabase com resolução dinâmica
│
├── pages/                  # Telas Desktop
│   ├── dashboard.html
│   ├── transactions.html
│   ├── bills.html
│   ├── goals.html
│   ├── investments.html
│   ├── settings.html
│   └── mobile/             # Telas Mobile equivalentes
│
├── scripts/                # Scripts de compilação e build
│   └── build.js
│
└── tests/                  # Bateria de testes automatizados
    ├── unit.test.js
    ├── computeRealPositions.test.js
    ├── e2e.test.js
    ├── security.test.js
    └── run-tests.js
```

---

## 🧪 Testes e Validação

O TonuControle possui uma suíte rigorosa de testes automatizados abrangendo unidades matemáticas, motor de custódia, testes ponta-a-ponta e validações de segurança:

```bash
# Executar toda a suíte de testes
npm test

# Executar validação de integridade sintática (lint)
npm run lint

# Gerar build otimizado de produção em /dist
npm run build
```

---

## 📄 Licença e Créditos

Distribuído sob a licença **MIT**. Consulte o arquivo de licença para mais detalhes.

Desenvolvido com foco na soberania dos seus dados financeiros e liberdade de patrimônio. 🚀
