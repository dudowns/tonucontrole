// ==========================================================================
// TONUCONTROLE - PAGINATION.JS
// Sistema de paginação para queries do Supabase
// ==========================================================================

(function () {
    'use strict';

    // ============================================
    // 1. CLASSE BASE DE PAGINAÇÃO
    // ============================================

    class BasePagination {
        constructor(options = {}) {
            this.page = options.page || 1;
            this.limit = options.limit || 50;
            this.total = 0;
            this.totalPages = 0;
            this.data = [];
            this.hasNext = false;
            this.hasPrevious = false;
            this.loading = false;
            this.error = null;
            this.filters = options.filters || {};
            this.orderBy = options.orderBy || { field: 'date', ascending: false };
            this.onDataLoaded = options.onDataLoaded || null;
            this.onError = options.onError || null;
        }

        // ============================================
        // MÉTODOS DE PÁGINA
        // ============================================

        updatePaginationInfo() {
            this.totalPages = Math.ceil(this.total / this.limit);
            this.hasNext = this.page < this.totalPages;
            this.hasPrevious = this.page > 1;
        }

        getState() {
            return {
                page: this.page,
                limit: this.limit,
                total: this.total,
                totalPages: this.totalPages,
                hasNext: this.hasNext,
                hasPrevious: this.hasPrevious,
                loading: this.loading,
                dataLength: this.data.length,
                hasData: this.data.length > 0,
                isFirstPage: this.page === 1,
                isLastPage: this.page === this.totalPages || this.totalPages === 0
            };
        }

        getPageInfo() {
            const start = (this.page - 1) * this.limit + 1;
            const end = Math.min(this.page * this.limit, this.total);
            return {
                start: this.total > 0 ? start : 0,
                end: this.total > 0 ? end : 0,
                total: this.total,
                showing: this.data.length
            };
        }

        // ============================================
        // NAVEGAÇÃO
        // ============================================

        async nextPage() {
            if (this.hasNext && !this.loading) {
                this.page++;
                return await this.fetchData();
            }
            return null;
        }

        async prevPage() {
            if (this.hasPrevious && !this.loading) {
                this.page--;
                return await this.fetchData();
            }
            return null;
        }

        async goToPage(page) {
            if (page >= 1 && page <= this.totalPages && !this.loading) {
                this.page = page;
                return await this.fetchData();
            }
            return null;
        }

        async goToFirst() {
            if (this.page !== 1 && !this.loading) {
                this.page = 1;
                return await this.fetchData();
            }
            return null;
        }

        async goToLast() {
            if (this.page !== this.totalPages && this.totalPages > 0 && !this.loading) {
                this.page = this.totalPages;
                return await this.fetchData();
            }
            return null;
        }

        // ============================================
        // FILTROS E ORDENAÇÃO
        // ============================================

        setFilters(filters) {
            this.filters = { ...this.filters, ...filters };
            this.reset();
            return this;
        }

        setOrderBy(field, ascending = false) {
            this.orderBy = { field, ascending };
            this.reset();
            return this;
        }

        setLimit(limit) {
            this.limit = limit;
            this.reset();
            return this;
        }

        reset() {
            this.page = 1;
            this.data = [];
            this.total = 0;
            this.totalPages = 0;
            this.hasNext = false;
            this.hasPrevious = false;
            this.error = null;
            return this;
        }

        // ============================================
        // MÉTODO DE BUSCA (A SER SOBRESCRITO)
        // ============================================

        async fetchData() {
            throw new Error('Método fetchData deve ser implementado pela classe filha');
        }

        // ============================================
        // MÉTODOS DE UTILIDADE
        // ============================================

        toJSON() {
            return {
                page: this.page,
                limit: this.limit,
                total: this.total,
                totalPages: this.totalPages,
                hasNext: this.hasNext,
                hasPrevious: this.hasPrevious,
                data: this.data,
                filters: this.filters,
                orderBy: this.orderBy
            };
        }

        getPagesArray(maxDisplay = 5) {
            const pages = [];
            const total = this.totalPages;
            const current = this.page;

            if (total <= maxDisplay) {
                for (let i = 1; i <= total; i++) {
                    pages.push(i);
                }
                return pages;
            }

            // Primeira página
            pages.push(1);

            let start = Math.max(2, current - Math.floor(maxDisplay / 2));
            let end = Math.min(total - 1, start + maxDisplay - 2);

            if (start > 2) {
                pages.push('...');
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < total - 1) {
                pages.push('...');
            }

            // Última página
            if (total > 1) {
                pages.push(total);
            }

            return pages;
        }
    }

    // ============================================
    // 2. PAGINAÇÃO DE TRANSAÇÕES
    // ============================================

    class TransactionPagination extends BasePagination {
        constructor(userId, options = {}) {
            super(options);
            this.userId = userId;
            this.table = options.table || 'transactions';
            this.includeBills = options.includeBills || false;
            this.monthFilter = options.monthFilter || null;
        }

        async fetchData() {
            if (!window.supabaseClient) {
                this.error = 'Supabase client não disponível';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            if (!this.userId) {
                this.error = 'Usuário não autenticado';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            this.loading = true;
            this.error = null;

            try {
                const start = (this.page - 1) * this.limit;
                const end = start + this.limit - 1;

                let query = window.supabaseClient
                    .from(this.table)
                    .select('*', { count: 'exact' })
                    .eq('user_id', this.userId)
                    .order(this.orderBy.field, { ascending: this.orderBy.ascending })
                    .range(start, end);

                // Filtros
                if (!this.includeBills) {
                    query = query.eq('is_bill', false);
                }

                // Filtro de mês
                if (this.monthFilter) {
                    const lastDay = new Date(this.monthFilter + '-01');
                    lastDay.setMonth(lastDay.getMonth() + 1);
                    lastDay.setDate(0);
                    const lastDayStr = lastDay.toISOString().split('T')[0];
                    query = query
                        .gte('date', `${this.monthFilter}-01`)
                        .lte('date', lastDayStr);
                }

                if (this.filters.type && this.filters.type !== 'all') {
                    query = query.eq('type', this.filters.type);
                }

                if (this.filters.category_id && this.filters.category_id !== 'all') {
                    query = query.eq('category_id', this.filters.category_id);
                }

                if (this.filters.date_start) {
                    query = query.gte('date', this.filters.date_start);
                }

                if (this.filters.date_end) {
                    query = query.lte('date', this.filters.date_end);
                }

                if (this.filters.search) {
                    query = query.ilike('description', `%${this.filters.search}%`);
                }

                if (this.filters.min_amount !== undefined && this.filters.min_amount !== null) {
                    query = query.gte('amount', Number(this.filters.min_amount));
                }

                if (this.filters.max_amount !== undefined && this.filters.max_amount !== null) {
                    query = query.lte('amount', Number(this.filters.max_amount));
                }

                if (this.filters.tags) {
                    query = query.ilike('tags', `%${this.filters.tags}%`);
                }

                const { data, error, count } = await query;

                if (error) throw error;

                this.data = data || [];
                this.total = count || 0;
                this.updatePaginationInfo();

                if (this.onDataLoaded) {
                    this.onDataLoaded(this.data, this.getState());
                }

                return this.getState();

            } catch (error) {
                console.error('❌ Erro ao buscar transações paginadas:', error);
                this.error = error.message;
                if (this.onError) this.onError(error.message);
                throw error;
            } finally {
                this.loading = false;
            }
        }

        // Método específico para buscar transações de um mês específico
        async fetchMonthTransactions(year, month) {
            this.monthFilter = `${year}-${String(month).padStart(2, '0')}`;
            this.reset();
            return await this.fetchData();
        }
    }

    // ============================================
    // 3. PAGINAÇÃO DE CONTAS
    // ============================================

    class BillPagination extends BasePagination {
        constructor(userId, options = {}) {
            super(options);
            this.userId = userId;
            this.table = options.table || 'transactions';
            this.monthFilter = options.monthFilter || null;
            this.showPaid = options.showPaid !== undefined ? options.showPaid : false;
        }

        async fetchData() {
            if (!window.supabaseClient) {
                this.error = 'Supabase client não disponível';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            if (!this.userId) {
                this.error = 'Usuário não autenticado';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            this.loading = true;
            this.error = null;

            try {
                const start = (this.page - 1) * this.limit;
                const end = start + this.limit - 1;

                let query = window.supabaseClient
                    .from(this.table)
                    .select('*', { count: 'exact' })
                    .eq('user_id', this.userId)
                    .eq('type', 'expense')
                    .eq('is_bill', true)
                    .order('date', { ascending: true })
                    .range(start, end);

                // Filtro de mês
                if (this.monthFilter) {
                    const lastDay = new Date(this.monthFilter + '-01');
                    lastDay.setMonth(lastDay.getMonth() + 1);
                    lastDay.setDate(0);
                    const lastDayStr = lastDay.toISOString().split('T')[0];
                    query = query
                        .gte('date', `${this.monthFilter}-01`)
                        .lte('date', lastDayStr);
                }

                // Filtro de status
                if (this.filters.status && this.filters.status !== 'all') {
                    const today = new Date().toISOString().split('T')[0];
                    if (this.filters.status === 'pending') {
                        query = query.eq('paid', false).gte('date', today);
                    } else if (this.filters.status === 'paid') {
                        query = query.eq('paid', true);
                    } else if (this.filters.status === 'overdue') {
                        query = query.eq('paid', false).lt('date', today);
                    } else if (this.filters.status === 'all_paid') {
                        query = query.eq('paid', true);
                    } else if (this.filters.status === 'all_pending') {
                        query = query.eq('paid', false);
                    }
                } else if (!this.showPaid) {
                    // Por padrão, mostrar apenas pendentes
                    query = query.eq('paid', false);
                }

                if (this.filters.search) {
                    query = query.ilike('description', `%${this.filters.search}%`);
                }

                if (this.filters.category_id && this.filters.category_id !== 'all') {
                    query = query.eq('category_id', this.filters.category_id);
                }

                const { data, error, count } = await query;

                if (error) throw error;

                this.data = data || [];
                this.total = count || 0;
                this.updatePaginationInfo();

                if (this.onDataLoaded) {
                    this.onDataLoaded(this.data, this.getState());
                }

                return this.getState();

            } catch (error) {
                console.error('❌ Erro ao buscar contas paginadas:', error);
                this.error = error.message;
                if (this.onError) this.onError(error.message);
                throw error;
            } finally {
                this.loading = false;
            }
        }

        async fetchMonthBills(year, month) {
            this.monthFilter = `${year}-${String(month).padStart(2, '0')}`;
            this.reset();
            return await this.fetchData();
        }
    }

    // ============================================
    // 4. PAGINAÇÃO DE METAS
    // ============================================

    class GoalPagination extends BasePagination {
        constructor(userId, options = {}) {
            super(options);
            this.userId = userId;
            this.table = options.table || 'goals';
        }

        async fetchData() {
            if (!window.supabaseClient) {
                this.error = 'Supabase client não disponível';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            if (!this.userId) {
                this.error = 'Usuário não autenticado';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            this.loading = true;
            this.error = null;

            try {
                const start = (this.page - 1) * this.limit;
                const end = start + this.limit - 1;

                let query = window.supabaseClient
                    .from(this.table)
                    .select('*', { count: 'exact' })
                    .eq('user_id', this.userId)
                    .order(this.orderBy.field, { ascending: this.orderBy.ascending })
                    .range(start, end);

                if (this.filters.status === 'completed') {
                    query = query.eq('completed', true);
                } else if (this.filters.status === 'active') {
                    query = query.eq('completed', false);
                }

                if (this.filters.search) {
                    query = query.ilike('title', `%${this.filters.search}%`);
                }

                const { data, error, count } = await query;

                if (error) throw error;

                this.data = data || [];
                this.total = count || 0;
                this.updatePaginationInfo();

                if (this.onDataLoaded) {
                    this.onDataLoaded(this.data, this.getState());
                }

                return this.getState();

            } catch (error) {
                console.error('❌ Erro ao buscar metas paginadas:', error);
                this.error = error.message;
                if (this.onError) this.onError(error.message);
                throw error;
            } finally {
                this.loading = false;
            }
        }
    }

    // ============================================
    // 5. PAGINAÇÃO DE INVESTIMENTOS
    // ============================================

    class InvestmentPagination extends BasePagination {
        constructor(userId, options = {}) {
            super(options);
            this.userId = userId;
            this.table = options.table || 'investments';
        }

        async fetchData() {
            if (!window.supabaseClient) {
                this.error = 'Supabase client não disponível';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            if (!this.userId) {
                this.error = 'Usuário não autenticado';
                if (this.onError) this.onError(this.error);
                throw new Error(this.error);
            }

            this.loading = true;
            this.error = null;

            try {
                const start = (this.page - 1) * this.limit;
                const end = start + this.limit - 1;

                let query = window.supabaseClient
                    .from(this.table)
                    .select('*', { count: 'exact' })
                    .eq('user_id', this.userId)
                    .order(this.orderBy.field, { ascending: this.orderBy.ascending })
                    .range(start, end);

                if (this.filters.ticker) {
                    query = query.ilike('ticker', `%${this.filters.ticker.toUpperCase()}%`);
                }

                if (this.filters.type && this.filters.type !== 'all') {
                    query = query.eq('type', this.filters.type);
                }

                if (this.filters.asset_class && this.filters.asset_class !== 'all') {
                    query = query.eq('asset_class', this.filters.asset_class);
                }

                if (this.filters.date_start) {
                    query = query.gte('date', this.filters.date_start);
                }

                if (this.filters.date_end) {
                    query = query.lte('date', this.filters.date_end);
                }

                const { data, error, count } = await query;

                if (error) throw error;

                this.data = data || [];
                this.total = count || 0;
                this.updatePaginationInfo();

                if (this.onDataLoaded) {
                    this.onDataLoaded(this.data, this.getState());
                }

                return this.getState();

            } catch (error) {
                console.error('❌ Erro ao buscar investimentos paginados:', error);
                this.error = error.message;
                if (this.onError) this.onError(error.message);
                throw error;
            } finally {
                this.loading = false;
            }
        }
    }

    // ============================================
    // 6. EXPORTAÇÃO GLOBAL
    // ============================================

    window.BasePagination = BasePagination;
    window.TransactionPagination = TransactionPagination;
    window.BillPagination = BillPagination;
    window.GoalPagination = GoalPagination;
    window.InvestmentPagination = InvestmentPagination;

    console.log('✅ Pagination.js carregado com sucesso');

})();