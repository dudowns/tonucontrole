# Design System Mobile — Tonu Premium (Aurora)

**Escopo:** Versão Mobile PWA (`css/mobile.css`, `pages/mobile/*.html`, `js/mobile/dashboard.js`, `js/mobile/ui.js`)  
**Status:** Produção — Opção A (**Aurora**)

---

## 1. Escolha da Paleta & Justificativa

Adotamos a **Opção A — Aurora**:
- **Gradiente Primário:** Azul Royal (`#4338CA`) → Violeta (`#7C3AED`)
- **Acento Positivo / Mint:** `#10B981`
- **Justificativa:** A transição Indigo/Royal (`#4338CA`) para Violeta (`#7C3AED`) preserva a familiaridade tecnológica de bancos digitais modernos (como Nubank/Revolut/Inter), eleva drasticamente a sobriedade financeira em relação ao roxo saturado legado (`#6C5CE7` — 100% removido do mobile), oferece excelente contraste para texto branco sobre o gradiente (`> 7:1` WCAG AAA) e cria harmonia imediata com o verde mint `#10B981` em cards de receita, proventos e metas concluídas.

---

## 2. Tokens de Cores (Light & Dark Mode)

### Modo Claro (`:root` / Light)
| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--mob-bg` | `#F8FAFC` | Fundo geral da viewport |
| `--mob-surface` | `#FFFFFF` | Cards, grouped lists, bottom sheets |
| `--mob-surface-2` | `#F1F5F9` | Chips inativos, segmented track, inputs |
| `--mob-surface-glass` | `rgba(255, 255, 255, 0.86)` | Topbar e bottom nav com `backdrop-filter: blur(20px)` |
| `--mob-text` | `#0F172A` | Títulos, valores monetários, labels principais (`17.4:1` sobre `#FFFFFF`) |
| `--mob-text-secondary` | `#334155` | Subtítulos e corpo (`10.2:1` sobre `#FFFFFF`) |
| `--mob-text-muted` | `#475569` | Labels auxiliares (`7.5:1` sobre `#FFFFFF`, WCAG AA/AAA) |
| `--mob-border` | `rgba(15, 23, 42, 0.08)` | Bordas sutis de cards e divisores |
| `--mob-primary` | `#4338CA` | Ações primárias, links, estados ativos |
| `--mob-primary-end` | `#7C3AED` | Extremidade direita do gradiente Aurora |
| `--mob-primary-soft` | `rgba(67, 56, 202, 0.10)` | Fundos de badges e pills ativas |
| `--mob-gradient` | `linear-gradient(135deg, #4338CA 0%, #7C3AED 100%)` | Hero card, FAB central, CTAs |

### Modo Escuro (`body.dark-theme` / `[data-theme="dark"]`)
| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--mob-bg` | `#0B1220` | Fundo OLED-friendly de alto conforto visual |
| `--mob-surface` | `#1E293B` | Cards elevados e grouped containers |
| `--mob-surface-2` | `#0F172A` | Inputs, tracks e caixas aninhadas |
| `--mob-surface-glass` | `rgba(11, 18, 32, 0.86)` | Topbar e bottom nav translúcidos |
| `--mob-text` | `#F1F5F9` | Texto principal (`13.8:1` sobre `#1E293B`) |
| `--mob-text-secondary` | `#CBD5E1` | Subtítulos (`9.9:1` sobre `#1E293B`) |
| `--mob-text-muted` | `#94A3B8` | Labels auxiliares (`5.7:1` sobre `#1E293B`, WCAG AA) |
| `--mob-border` | `rgba(148, 163, 184, 0.16)` | Contornos finos para separar superfícies escuras |
| `--mob-primary` | `#6366F1` | Azul-índigo luminoso para legibilidade em dark |
| `--mob-primary-soft` | `rgba(99, 102, 241, 0.18)` | Badges e pills ativas em dark |

### Cores Semânticas
- **Sucesso / Receita:** `#10B981` (claro) / `#34D399` (dark)
- **Erro / Despesa / Exclusão:** `#EF4444` (claro) / `#F87171` (dark)
- **Alerta / Pendente:** `#F59E0B` (claro) / `#FBBF24` (dark)
- **Info / Proventos futuros:** `#0284C7` (claro) / `#38BDF8` (dark)

---

## 3. Tipografia (`Inter` + `tabular-nums`)

- **Família:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Alinhamento Numérico:** `font-variant-numeric: tabular-nums;` obrigatório em todos os valores financeiros, KPIs, percentuais, cotações e datas.

| Papel | Tamanho | Peso | Line-height | Letter-spacing |
| :--- | :--- | :--- | :--- | :--- |
| **Display Hero Balance** | `32px` | `800` | `1.12` | `-0.03em` |
| **Page / Hero Title** | `22px` | `700` | `1.22` | `-0.02em` |
| **Card Title** | `14px` | `700` | `1.35` | `-0.01em` |
| **Body / Input (iOS no-zoom)** | `16px` (inputs) / `14px` (texto) | `500` | `1.45` | `0` |
| **KPI / Section Label** | `11px` | `600` | `1.2` | `+0.04em` (uppercase) |
| **Micro / Nav Label** | `11px` | `500–600` | `1.2` | `0` |

---

## 4. Espaçamento, Raios & Elevação

- **Grid base:** múltiplos de `4px` (`4, 8, 12, 16, 20, 24, 32`).
- **Padding lateral padrão:** `16px` (`max-width: 540px` centralizado para tablets estreitos).
- **Toque mínimo:** `44x44px` em botões de topbar, tabs, segmented buttons, switches e ações.
- **Border Radius:**
  - Cards e Grouped Containers: `16px`
  - Inputs, Quick Actions e Sub-cards: `12px`
  - Chips, Segmented Controls e Badges: `999px`
  - Hero Card: `24px`
  - Bottom Sheets: `28px 28px 0 0`
- **Sombras em Camadas (Light):**
  - `--mob-shadow-sm`: `0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)`
  - `--mob-shadow-md`: `0 4px 16px rgba(15, 23, 42, 0.06), 0 12px 28px rgba(15, 23, 42, 0.05)`
  - `--mob-shadow-hero`: `0 14px 32px -6px rgba(67, 56, 202, 0.36), 0 4px 12px rgba(124, 58, 237, 0.20)`

---

## 5. Movimento & Acessibilidade (`prefers-reduced-motion`)

- **Curvas:** `cubic-bezier(0.22, 1, 0.36, 1)` para entradas e bottom sheets; `180ms` para micro-interações de toque (`transform: scale(0.97)`).
- **Redução de movimento:** `@media (prefers-reduced-motion: reduce)` desliga `animation`, `transition`, count-up animado e confetes extras automaticamente.
- **Safe Areas:** uso sistemático de `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)` para iPhones com Dynamic Island e home indicator.

---

## 6. Inventário de Componentes

1. **Topbar Frosted Glass:** Ícone squircle `36px`, título `TonuControle`, ações rápidas de `40–44px` (Busca Global, Modo Privacidade, Notificações, Tema, Avatar).
2. **Barra de Progresso de Navegação (`#mobNavProgress`):** Linha Aurora no topo da viewport durante transições de rota.
3. **Pull-to-Refresh (`#mobPullIndicator`):** Indicador elástico no topo ao puxar com `scrollY === 0`.
4. **Hero Card Aurora (`mobile-hero-card` / `mobile-hero-balance`):** Superfície em gradiente `#4338CA → #7C3AED` com orbes sutis, alternador de privacidade sincronizado e breakdown 2-colunas.
5. **Grouped List Containers (`ios-grouped-card`):** Agrupamento por data/categoria estilo Apple Wallet/iOS Settings com divisores internos `1px`.
6. **Swipe-to-Delete (`[data-swipe-row]`):** Deslize horizontal em itens de lista revelando ação "Excluir" sem conflitar com o swipe de troca de abas.
7. **Bottom Sheet Modal (`mobile-modal-sheet`):** Cantos `28px`, drag handle `38x4px`, inputs `16px` (previne zoom no Safari iOS).
8. **Bottom Navigation Flutuante (`bottom-nav`):** Glassmorphism flutuante (`bottom: 10px` ou encaixado com safe-area), FAB central elevado `52x52px` com gradiente Aurora e suporte à classe `.nav-icons-only`.
9. **Command Palette (`#mobCmdOverlay`):** Busca global rápida de telas, atalhos de criação, dark mode e privacidade.
10. **Dynamic Island Toast & Confetti:** Notificações em pílula escura no topo (`#0F172A` / `#1E293B`) e celebração WebAudio + confetti ao concluir metas.
