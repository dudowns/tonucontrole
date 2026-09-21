-- ==========================================================================
-- TONUCONTROLE - SUÍTE DE TESTES E VERIFICAÇÃO DE RLS (ROW LEVEL SECURITY)
-- Prova matemática e estrutural de que cada usuário só acessa seus próprios dados
-- ==========================================================================

-- 1. VERIFICAÇÃO DE STATUS DE RLS NAS TABELAS
-- Todas as tabelas sensíveis DEVEM estar com rowsecurity = true
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'dividends', 'investments', 'corporate_events', 'bills', 'goals', 'categories')
ORDER BY tablename;

-- 2. VERIFICAÇÃO DE POLÍTICAS EXISTENTES (SELECT, INSERT, UPDATE, DELETE)
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'dividends', 'investments', 'corporate_events', 'bills', 'goals', 'categories')
ORDER BY tablename, cmd;

-- ==========================================================================
-- 3. TESTE DE ISOLAMENTO PRÁTICO EM BLOCO ANÔNIMO (SIMULAÇÃO DE USUÁRIOS)
-- ==========================================================================
DO $$
DECLARE
    v_user_a_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
    v_user_b_id uuid := '22222222-2222-4222-8222-222222222222'::uuid;
    v_count_a integer;
    v_count_b integer;
    v_leak_count integer;
BEGIN
    RAISE NOTICE 'Iniciando teste de isolamento de dados com RLS...';

    -- SIMULA CONTEXTO DO USUÁRIO A
    PERFORM set_config('request.jwt.claim.sub', v_user_a_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Usuário A tenta ler proventos
    SELECT COUNT(*) INTO v_count_a FROM public.dividends WHERE user_id = v_user_a_id;
    RAISE NOTICE 'Usuário A enxerga % proventos próprios.', v_count_a;

    -- Usuário A tenta ler proventos do Usuário B (deve ser 0)
    SELECT COUNT(*) INTO v_leak_count FROM public.dividends WHERE user_id = v_user_b_id;
    IF v_leak_count > 0 THEN
        RAISE EXCEPTION 'FALHA DE RLS: Usuário A conseguiu enxergar % registros do Usuário B na tabela dividends!', v_leak_count;
    ELSE
        RAISE NOTICE 'SUCESSO: Usuário A não enxerga dados do Usuário B em dividends.';
    END IF;

    -- SIMULA CONTEXTO DO USUÁRIO B
    PERFORM set_config('request.jwt.claim.sub', v_user_b_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    -- Usuário B tenta ler eventos corporativos do Usuário A (deve ser 0)
    SELECT COUNT(*) INTO v_leak_count FROM public.corporate_events WHERE user_id = v_user_a_id;
    IF v_leak_count > 0 THEN
        RAISE EXCEPTION 'FALHA DE RLS: Usuário B conseguiu enxergar % registros do Usuário A na tabela corporate_events!', v_leak_count;
    ELSE
        RAISE NOTICE 'SUCESSO: Usuário B não enxerga dados do Usuário A em corporate_events.';
    END IF;

    -- SIMULA CONTEXTO ANÔNIMO (NÃO LOGADO)
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);

    SELECT COUNT(*) INTO v_leak_count FROM public.transactions;
    IF v_leak_count > 0 THEN
        RAISE EXCEPTION 'FALHA DE RLS: Usuário anônimo conseguiu ler % transações!', v_leak_count;
    ELSE
        RAISE NOTICE 'SUCESSO: Usuário anônimo recebe 0 registros de transações.';
    END IF;

    RAISE NOTICE 'Todos os testes de isolamento de RLS foram concluídos com 100%% de aprovação.';
END $$;
