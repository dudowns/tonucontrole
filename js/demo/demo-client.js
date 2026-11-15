// ============================================
// TONUCONTROLE — MODO DEMONSTRAÇÃO: CLIENTE EM MEMÓRIA
// Implementa o subconjunto da API do Supabase usada pelo app
// (auth + query builder) sobre o dataset de exemplo.
// ============================================

(function () {
    'use strict';

    function clone(value) {
        if (value === null || typeof value !== 'object') return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return value;
        }
    }

    function toComparable(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (value === null || value === undefined) return '';
        const num = Number(value);
        if (String(value).trim() !== '' && !isNaN(num) && /^-?\d+(\.\d+)?$/.test(String(value).trim())) return num;
        return String(value);
    }

    function matchesFilter(row, filter) {
        const current = row ? row[filter.column] : undefined;
        const value = filter.value;

        switch (filter.op) {
            case 'eq':
                return String(current) === String(value) || current === value;
            case 'neq':
                return String(current) !== String(value);
            case 'gt':
                return toComparable(current) > toComparable(value);
            case 'gte':
                return toComparable(current) >= toComparable(value);
            case 'lt':
                return toComparable(current) < toComparable(value);
            case 'lte':
                return toComparable(current) <= toComparable(value);
            case 'is':
                if (value === null) return current === null || current === undefined;
                if (value === true) return current === true || current === 'true';
                if (value === false) return current === false || current === 'false' || current === undefined;
                return current === value;
            case 'in':
                return Array.isArray(value) && value.map(String).includes(String(current));
            case 'like':
            case 'ilike': {
                const pattern = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
                const flags = filter.op === 'ilike' ? 'i' : '';
                try {
                    return new RegExp(`^${pattern}$`, flags).test(String(current || ''));
                } catch (e) {
                    return false;
                }
            }
            default:
                return true;
        }
    }

    // "user_id.eq.abc,is_default.eq.true,user_id.is.null"
    function parseOrExpression(expression) {
        return String(expression || '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .map(part => {
                const chunks = part.split('.');
                if (chunks.length < 3) return null;
                return { column: chunks[0], op: chunks[1], value: chunks.slice(2).join('.') };
            })
            .filter(Boolean)
            .map(filter => ({
                column: filter.column,
                op: filter.op,
                value: filter.value === 'null' ? null : (filter.value === 'true' ? true : (filter.value === 'false' ? false : filter.value))
            }));
    }

    function newId(table) {
        return `${table}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function createAuth(demoUser) {
        const session = {
            access_token: 'demo-access-token',
            refresh_token: 'demo-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: demoUser
        };
        return {
            getSession: async () => ({ data: { session: clone(session) }, error: null }),
            getUser: async () => ({ data: { user: clone(demoUser) }, error: null }),
            signInWithPassword: async () => ({ data: { session: clone(session), user: clone(demoUser) }, error: null }),
            signUp: async () => ({ data: { session: clone(session), user: clone(demoUser) }, error: null }),
            signOut: async () => ({ error: null }),
            refreshSession: async () => ({ data: { session: clone(session) }, error: null }),
            setSession: async () => ({ data: { session: clone(session) }, error: null }),
            exchangeCodeForSession: async () => ({ data: { session: clone(session) }, error: null }),
            updateUser: async () => ({ data: { user: clone(demoUser) }, error: null }),
            resetPasswordForEmail: async () => ({ data: {}, error: null }),
            signInWithOAuth: async () => ({ data: { provider: 'demo', url: '' }, error: null }),
            onAuthStateChange: () => ({
                data: { subscription: { unsubscribe() {} } }
            })
        };
    }

    class DemoQuery {
        constructor(client, table) {
            this.client = client;
            this.table = table;
            this.action = 'select';
            this.filters = [];
            this.orders = [];
            this.maxRows = null;
            this.payload = null;
            this.singleMode = null;
            this.wantsCount = false;
            this.countMode = null;
            this.headOnly = false;
        }

        select(_columns, options) {
            if (options && options.count) {
                this.wantsCount = true;
                this.countMode = options.count;
            }
            if (options && options.head) this.headOnly = true;
            return this;
        }

        insert(rows) {
            this.action = 'insert';
            this.payload = Array.isArray(rows) ? rows : [rows];
            return this;
        }

        upsert(rows) {
            this.action = 'upsert';
            this.payload = Array.isArray(rows) ? rows : [rows];
            return this;
        }

        update(patch) {
            this.action = 'update';
            this.payload = patch || {};
            return this;
        }

        delete() {
            this.action = 'delete';
            return this;
        }

        _add(column, op, value) {
            this.filters.push({ column, op, value });
            return this;
        }

        eq(column, value) { return this._add(column, 'eq', value); }
        neq(column, value) { return this._add(column, 'neq', value); }
        gt(column, value) { return this._add(column, 'gt', value); }
        gte(column, value) { return this._add(column, 'gte', value); }
        lt(column, value) { return this._add(column, 'lt', value); }
        lte(column, value) { return this._add(column, 'lte', value); }
        like(column, value) { return this._add(column, 'like', value); }
        ilike(column, value) { return this._add(column, 'ilike', value); }
        is(column, value) { return this._add(column, 'is', value); }
        in(column, value) { return this._add(column, 'in', value); }
        not(column, op, value) { return this._add(column, op === 'is' ? 'is' : op, value); }
        match(criteria) {
            Object.keys(criteria || {}).forEach(key => this._add(key, 'eq', criteria[key]));
            return this;
        }
        or(expression) {
            const parsed = parseOrExpression(expression);
            if (parsed.length) this.filters.push({ anyOf: parsed });
            return this;
        }
        order(column, options) {
            this.orders.push({ column, ascending: !(options && options.ascending === false) });
            return this;
        }
        limit(count) {
            this.maxRows = count;
            return this;
        }
        range(from, to) {
            this.range.from = from;
            this.range.to = to;
            this.maxRows = (to - from) + 1;
            return this;
        }
        single() {
            this.singleMode = 'single';
            return this;
        }
        maybeSingle() {
            this.singleMode = 'maybe';
            return this;
        }

        _rows() {
            return this.client._table(this.table);
        }

        _applyFilters(rows) {
            return rows.filter(row => this.filters.every(filter => {
                if (filter.anyOf) return filter.anyOf.some(item => matchesFilter(row, item));
                return matchesFilter(row, filter);
            }));
        }

        _run() {
            const tableRows = this._rows();

            if (this.action === 'insert' || this.action === 'upsert') {
                const inserted = (this.payload || []).map(row => {
                    const record = Object.assign({}, clone(row));
                    const existingIdx = this.action === 'upsert' && record.id
                        ? tableRows.findIndex(r => String(r.id) === String(record.id))
                        : -1;
                    if (existingIdx >= 0) {
                        tableRows[existingIdx] = Object.assign({}, tableRows[existingIdx], record);
                        return clone(tableRows[existingIdx]);
                    }
                    if (!record.id) record.id = newId(this.table);
                    if (!record.created_at) record.created_at = new Date().toISOString();
                    if (!record.user_id) record.user_id = this.client.userId;
                    tableRows.push(record);
                    return clone(record);
                });
                return this._respond(inserted.length ? inserted : []);
            }

            if (this.action === 'update') {
                const matched = this._applyFilters(tableRows);
                matched.forEach(row => Object.assign(row, clone(this.payload)));
                return this._respond(matched.map(clone));
            }

            if (this.action === 'delete') {
                const matched = this._applyFilters(tableRows);
                matched.forEach(row => {
                    const idx = tableRows.indexOf(row);
                    if (idx >= 0) tableRows.splice(idx, 1);
                });
                return this._respond(matched.map(clone));
            }

            let rows = this._applyFilters(tableRows);

            if (this.orders.length) {
                rows = rows.slice().sort((a, b) => {
                    for (const order of this.orders) {
                        const av = toComparable(a[order.column]);
                        const bv = toComparable(b[order.column]);
                        if (av < bv) return order.ascending ? -1 : 1;
                        if (av > bv) return order.ascending ? 1 : -1;
                    }
                    return 0;
                });
            }

            if (typeof this.maxRows === 'number') rows = rows.slice(0, this.maxRows);

            return this._respond(rows);
        }

        _respond(rows) {
            const total = rows.length;
            if (this.singleMode === 'single') {
                return {
                    data: total ? clone(rows[0]) : null,
                    error: total ? null : { code: 'PGRST116', message: 'Nenhum registro encontrado', details: null, hint: null },
                    count: total
                };
            }
            if (this.singleMode === 'maybe') {
                return { data: total ? clone(rows[0]) : null, error: null, count: total };
            }
            const result = {
                data: this.headOnly ? null : rows.map(clone),
                error: null
            };
            if (this.wantsCount) result.count = total;
            return result;
        }

        then(onFulfilled, onRejected) {
            return Promise.resolve()
                .then(() => this._run())
                .then(onFulfilled, onRejected);
        }

        catch(onRejected) {
            return this.then(undefined, onRejected);
        }

        finally(callback) {
            return this.then(
                value => { callback(); return value; },
                error => { callback(); throw error; }
            );
        }
    }

    class DemoClient {
        constructor(dataset, demoUser) {
            this.userId = demoUser.id;
            this._tables = dataset;
            this.auth = createAuth(demoUser);
            this.functions = {
                invoke: async (name) => {
                    if (name === 'get-cdi') {
                        return { data: { cdi: { daily_rate: 0.000368, annual_rate: 0.1345, updated_at: new Date().toISOString() } }, error: null };
                    }
                    return { data: null, error: null };
                }
            };
            this.storage = {
                from: () => ({
                    upload: async () => ({ data: { path: 'demo/avatar.png' }, error: null }),
                    getPublicUrl: () => ({ data: { publicUrl: '' } }),
                    remove: async () => ({ data: {}, error: null })
                })
            };
        }

        _table(name) {
            if (!this._tables[name]) this._tables[name] = [];
            return this._tables[name];
        }

        from(table) {
            return new DemoQuery(this, table);
        }

        channel() {
            const stub = {
                on() { return stub; },
                subscribe() { return stub; },
                unsubscribe() { return Promise.resolve('ok'); }
            };
            return stub;
        }

        removeChannel() {
            return Promise.resolve('ok');
        }
    }

    window.createTonuDemoClient = function (dataset, demoUser) {
        return new DemoClient(dataset, demoUser);
    };
})();
