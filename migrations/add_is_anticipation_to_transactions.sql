-- Migration: Adiciona suporte a quitação antecipada de parcelas
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS is_anticipation boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_anticipation 
ON transactions (user_id, parent_transaction_id) 
WHERE is_anticipation = true;
