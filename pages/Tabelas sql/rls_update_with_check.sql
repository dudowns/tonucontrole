-- ==========================================================================
-- TONUCONTROLE - CORREÇÃO DE SEGURANÇA RLS: ADIÇÃO DE WITH CHECK NAS POLÍTICAS DE UPDATE
-- Evita a brecha de sequestro de dados (mudar user_id para outro usuário em UPDATE)
-- ==========================================================================

-- 1. TABELA: corporate_events
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios eventos corporativos" ON public.corporate_events;
CREATE POLICY "Usuários podem atualizar seus próprios eventos corporativos"
  ON public.corporate_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. TABELA: dividends
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios proventos" ON public.dividends;
CREATE POLICY "Usuários podem atualizar seus próprios proventos"
  ON public.dividends FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. TABELA: investments
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios investimentos" ON public.investments;
CREATE POLICY "Usuários podem atualizar seus próprios investimentos"
  ON public.investments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. TABELA: transactions
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias transações" ON public.transactions;
CREATE POLICY "Usuários podem atualizar suas próprias transações"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. TABELA: goals
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias metas" ON public.goals;
CREATE POLICY "Usuários podem atualizar suas próprias metas"
  ON public.goals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. TABELA: categories
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias categorias" ON public.categories;
CREATE POLICY "Usuários podem atualizar suas próprias categorias"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
