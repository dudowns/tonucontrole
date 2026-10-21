-- ====================================================================
-- TonuControle - Suporte a Antecipação e Quitação de Parcelas
-- ====================================================================

-- Adiciona campo booleano para identificar transações de quitação antecipada no extrato
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS is_anticipation boolean DEFAULT false;

COMMENT ON COLUMN transactions.is_anticipation IS 'Identifica lançamentos no extrato que representam a quitação antecipada de uma ou mais parcelas futuras';

-- Índice de performance para consultas por conta-mãe
CREATE INDEX IF NOT EXISTS idx_transactions_anticipation 
ON transactions (user_id, parent_transaction_id) 
WHERE is_anticipation = true;
