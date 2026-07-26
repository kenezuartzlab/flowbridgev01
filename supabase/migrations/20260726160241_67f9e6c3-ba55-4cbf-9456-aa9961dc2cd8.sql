CREATE UNIQUE INDEX IF NOT EXISTS transactions_history_user_tx_hash_uniq
ON public.transactions_history (user_id, tx_hash)
WHERE tx_hash IS NOT NULL;