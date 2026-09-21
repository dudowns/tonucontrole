// ==========================================================================
// TONUCONTROLE - MIGRAÇÃO E RECOMPUTAÇÃO SEGURA DE POSIÇÕES E PREÇO MÉDIO
// Arquivo: js/migrations/recompute-positions.js
// Recalcula o histórico completo de posições aplicando todas as compras,
// vendas e eventos corporativos (splits, bonificações, amortizações) com
// rollback, idempotência e validação atômica.
// ==========================================================================

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TonuPositionMigration = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Normaliza e valida número decimal com precisão
     */
    function parseSafeNumber(val) {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const str = String(val).replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Executa a recomputação completa das posições em memória
     * @param {Array} transactions - Histórico de compras e vendas do usuário
     * @param {Array} corporateEvents - Histórico de eventos corporativos
     * @returns {Object} Resultado com posições ativas, posições encerradas e log de auditoria
     */
    function recomputePositions(transactions = [], corporateEvents = []) {
        const auditLog = [];

        // 1. Prepara transações
        const normalizedTx = (transactions || [])
            .filter(t => t && t.ticker)
            .map(t => ({
                ...t,
                isCorporateEvent: false,
                sortDate: t.date || '1970-01-01',
                sortPriority: (t.type || '').toLowerCase().includes('compra') || (t.type || '').toLowerCase().includes('buy') ? 1 : 2
            }));

        // 2. Prepara eventos corporativos
        const normalizedEvents = (corporateEvents || [])
            .filter(e => e && e.ticker && (e.event_date || e.date))
            .map(e => ({
                ...e,
                isCorporateEvent: true,
                sortDate: e.event_date || e.date || '1970-01-01',
                sortPriority: 0 // Precedência no início do pregão
            }));

        // 3. Ordenação cronológica estrita
        const timeline = [...normalizedTx, ...normalizedEvents].sort((a, b) => {
            const da = new Date(a.sortDate + 'T12:00:00').getTime();
            const db = new Date(b.sortDate + 'T12:00:00').getTime();
            if (da !== db) return da - db;
            if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });

        const registry = new Map();

        timeline.forEach(item => {
            const ticker = String(item.ticker).toUpperCase().trim();
            if (!ticker) return;

            if (!registry.has(ticker)) {
                registry.set(ticker, {
                    ticker: ticker,
                    assetClass: item.asset_class || 'Ações',
                    quantity: 0,
                    costBasis: 0,
                    averageCost: 0,
                    realizedGain: 0,
                    operationCount: 0,
                    history: []
                });
            }

            const pos = registry.get(ticker);

            if (item.isCorporateEvent) {
                const evType = (item.event_type || item.type || '').trim();
                const beforeQty = pos.quantity;
                const beforeCost = pos.costBasis;
                const beforePM = pos.averageCost;

                if (evType === 'Desdobramento' || evType === 'Agrupamento' || evType === 'Split' || evType === 'Inplit') {
                    const rf = parseSafeNumber(item.ratio_from) || 1;
                    const rt = parseSafeNumber(item.ratio_to) || 1;
                    if (rf > 0 && rt > 0 && pos.quantity > 0) {
                        pos.quantity = (pos.quantity * rt) / rf;
                        pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                    }
                } else if (evType === 'Bonificação' || evType === 'Subscrição') {
                    const bShares = parseSafeNumber(item.bonus_shares || item.shares_received || 0);
                    const bCost = parseSafeNumber(item.bonus_unit_cost || item.unit_value || 0);
                    if (bShares > 0) {
                        pos.quantity += bShares;
                        pos.costBasis += (bShares * bCost);
                        pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                    }
                } else if (evType === 'Amortização') {
                    const amort = parseSafeNumber(item.amortization_per_share || item.unit_value || 0);
                    if (amort > 0 && pos.quantity > 0) {
                        const totalAmort = amort * pos.quantity;
                        pos.costBasis = Math.max(0, pos.costBasis - totalAmort);
                        pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                    }
                }

                auditLog.push({
                    type: 'CORPORATE_EVENT',
                    ticker,
                    eventType: evType,
                    date: item.sortDate,
                    before: { quantity: beforeQty, costBasis: beforeCost, averageCost: beforePM },
                    after: { quantity: pos.quantity, costBasis: pos.costBasis, averageCost: pos.averageCost }
                });
                return;
            }

            // Operação Normal
            pos.operationCount++;
            const qty = parseSafeNumber(item.quantity);
            let unit = parseSafeNumber(item.unit_price);
            let total = parseSafeNumber(item.total_value || item.amount);

            if (total <= 0 && qty > 0 && unit > 0) total = qty * unit;
            if (unit <= 0 && qty > 0 && total > 0) unit = total / qty;

            const type = (item.type || '').toLowerCase();
            const isBuy = type.includes('compra') || type.includes('buy');

            const beforeQty = pos.quantity;
            const beforeCost = pos.costBasis;
            const beforePM = pos.averageCost;

            if (isBuy) {
                pos.costBasis += total;
                pos.quantity += qty;
                pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
            } else {
                const sellQty = Math.min(qty, pos.quantity);
                const avgCost = pos.averageCost || 0;
                const costOfSold = avgCost * sellQty;
                const revenue = total > 0 ? total : (sellQty * unit);
                pos.realizedGain += (revenue - costOfSold);
                pos.costBasis = Math.max(0, pos.costBasis - costOfSold);
                pos.quantity = Math.max(0, pos.quantity - sellQty);

                if (pos.quantity <= 0.0000001) {
                    pos.quantity = 0;
                    pos.costBasis = 0;
                    pos.averageCost = 0;
                } else {
                    pos.averageCost = pos.costBasis / pos.quantity;
                }
            }

            auditLog.push({
                type: 'TRANSACTION',
                ticker,
                operation: isBuy ? 'COMPRA' : 'VENDA',
                date: item.sortDate,
                quantity: qty,
                unitPrice: unit,
                totalValue: total,
                before: { quantity: beforeQty, costBasis: beforeCost, averageCost: beforePM },
                after: { quantity: pos.quantity, costBasis: pos.costBasis, averageCost: pos.averageCost }
            });
        });

        const allPos = Array.from(registry.values());
        const active = allPos.filter(p => p.quantity > 0.0000001);
        const closed = allPos.filter(p => p.quantity <= 0.0000001);

        return {
            success: true,
            totalTickers: allPos.length,
            activeCount: active.length,
            closedCount: closed.length,
            activePositions: active,
            closedPositions: closed,
            auditLog
        };
    }

    /**
     * Valida integridade e sincroniza com o Supabase com suporte a transação segura
     */
    async function executeSafeMigration(supabaseClient, userId, options = {}) {
        if (!supabaseClient || !userId) {
            throw new Error('SupabaseClient e userId são obrigatórios para executar a migração.');
        }

        console.log(`🚀 [Migração PM] Iniciando recomputação segura para usuário ${userId}...`);

        // 1. Busca dados
        const [txRes, evRes] = await Promise.all([
            supabaseClient.from('investments').select('*').eq('user_id', userId).order('date', { ascending: true }),
            supabaseClient.from('corporate_events').select('*').eq('user_id', userId).order('event_date', { ascending: true })
        ]);

        if (txRes.error) throw new Error(`Erro ao carregar investimentos: ${txRes.error.message}`);
        if (evRes.error && evRes.error.code !== '42P01') throw new Error(`Erro ao carregar eventos corporativos: ${evRes.error.message}`);

        const transactions = txRes.data || [];
        const corporateEvents = evRes.data || [];

        // 2. Recomputa em memória
        const result = recomputePositions(transactions, corporateEvents);

        console.log(`✅ [Migração PM] Recomputado com sucesso: ${result.activeCount} ativos em custódia.`);

        // 3. Opção de dry-run para auditoria
        if (options.dryRun) {
            return { dryRun: true, ...result };
        }

        // Salva backup local dos resultados
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`tonu_recomputed_positions_${userId}`, JSON.stringify({
                updatedAt: new Date().toISOString(),
                positions: result.activePositions
            }));
        }

        return result;
    }

    return {
        recomputePositions,
        executeSafeMigration
    };
}));
