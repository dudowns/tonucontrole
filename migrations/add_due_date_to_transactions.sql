-- ========================================================
-- ADICIONA COLUNA DUE_DATE EM TRANSACTIONS
-- ========================================================
-- Permite armazenar a data original de vencimento das contas (is_bill = true)
-- separada da data do pagamento (date / paid_date)

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS due_date date NULL;
