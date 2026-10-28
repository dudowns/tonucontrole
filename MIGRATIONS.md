# 🗄️ Migrações de Banco de Dados — TonuControle

Este documento contém os scripts SQL e as instruções para atualização e garantia de esquema no Supabase PostgreSQL.

---

## 📌 Migração Fase 1: Ciclos Anuais e Metas Temporais

Esta migração adiciona o suporte nativo a ciclos anuais, metas contínuas de longo prazo e reprogramação amigável na tabela `public.goals`.

### Script SQL para o Supabase (SQL Editor)

```sql
-- =========================================================================
-- MIGRAÇÃO: Ciclos Anuais, Metas Contínuas e Reprogramação na tabela goals
-- =========================================================================

-- 1. Adicionar colunas temporais caso ainda não existam
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS target_year integer,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS postponed_to integer,
  ADD COLUMN IF NOT EXISTS is_continuous boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporal_mode text;

-- 2. Backfill inteligente para registros já existentes no banco
-- Metas com prazo definido: extrai o ano do deadline
UPDATE public.goals 
SET target_year = EXTRACT(YEAR FROM deadline::date)::integer,
    year = EXTRACT(YEAR FROM deadline::date)::integer
WHERE target_year IS NULL 
  AND deadline IS NOT NULL;

-- Metas sem prazo (ex: reserva ou contínuas): define como contínua
UPDATE public.goals 
SET is_continuous = true, 
    temporal_mode = 'continuous',
    target_year = NULL,
    year = NULL
WHERE target_year IS NULL 
  AND deadline IS NULL;

-- 3. Criar índice de performance para consultas filtradas por usuário e ciclo anual
CREATE INDEX IF NOT EXISTS idx_goals_user_target_year 
  ON public.goals(user_id, target_year);

CREATE INDEX IF NOT EXISTS idx_goals_user_temporal_mode 
  ON public.goals(user_id, temporal_mode);
```

### Instruções de Execução

1. Acesse o painel do **Supabase** do seu projeto: [supabase.com](https://supabase.com).
2. No menu lateral esquerdo, clique no ícone **SQL Editor** (`>_`).
3. Clique em **+ New query**.
4. Cole o script SQL acima no editor.
5. Clique no botão verde **Run** (ou pressione `Ctrl + Enter` / `Cmd + Enter`).
6. A mensagem `Success. No rows returned` confirmará a aplicação das colunas e índices.

---

## 🛡️ Resiliência da Aplicação (Camada Dupla de Proteção)

Mesmo que a migração ainda não tenha sido executada em um novo ambiente ou banco espelho:
1. **Frontend Graceful Fallback (`goals.js` e `pages/mobile/goals.html`):** Caso o Supabase retorne erro `PGRST204` (coluna inexistente no schema cache), a aplicação automaticamente remove os campos novos da requisição e persiste a data do ciclo na coluna padrão `deadline` no formato `YYYY-12-31`.
2. **Sync Manager Resiliente (`sync.js`):** O trabalhador da fila offline detecta e extrai colunas ausentes na nuvem via regex (`_extractMissingColumn`), retentando sem travar a fila de sincronização.
