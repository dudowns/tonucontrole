-- ==========================================================================
-- MIGRAÇÃO SUPABASE: TABELA DIVIDENDS
-- Validação de consistência matemática, colunas net_value e date_com, e UNIQUE
-- ==========================================================================

-- 1. Adicionar coluna net_value (numeric)
ALTER TABLE public.dividends 
  ADD COLUMN IF NOT EXISTS net_value numeric(10, 2) NULL;

-- 2. Adicionar coluna date_com (date)
ALTER TABLE public.dividends 
  ADD COLUMN IF NOT EXISTS date_com date NULL;

-- 3. Constraint para validar que total_value = quantity * unit_value (margem 0.01)
ALTER TABLE public.dividends 
  DROP CONSTRAINT IF EXISTS dividends_total_value_check;

ALTER TABLE public.dividends 
  ADD CONSTRAINT dividends_total_value_check 
  CHECK (abs(total_value - (quantity * unit_value)) <= 0.01);

-- 4. Constraint UNIQUE para evitar proventos duplicados por usuário, ticker, data e tipo
ALTER TABLE public.dividends 
  DROP CONSTRAINT IF EXISTS dividends_user_ticker_date_type_unique;

ALTER TABLE public.dividends 
  ADD CONSTRAINT dividends_user_ticker_date_type_unique 
  UNIQUE (user_id, ticker, date, type);
