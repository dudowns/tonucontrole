// ==========================================================================
// TONUCONTROLE - MOTOR DE RELATÓRIO DE IMPOSTO DE RENDA (IR)
// Arquivo: js/reports/ir-report.js
// Gera dados para a Declaração Anual de Ajuste do IRPF:
// 1. Bens e Direitos (Posição de custódia em 31/12 do ano-calendário pelo custo de aquisição)
// 2. Rendimentos Isentos e Não Tributáveis (Dividendos, Rendimentos FIIs, Vendas Ações até R$ 20k)
// 3. Rendimentos Sujeitos à Tributação Exclusiva/Definitiva (JCP líquido)
// 4. Renda Variável (Apuração mensal de ganhos/perdas líquidas, compensação de prejuízos)
// ==========================================================================

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TonuIRReport = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const JCP_TAX_RATE = (typeof root !== 'undefined' && root.TONU_JCP_TAX_RATE) || 0.15;
    const SWING_TRADE_MONTHLY_EXEMPTION_LIMIT = 20000.00; // Limite de isenção para ações no swing trade

    function parseSafeNumber(val) {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const str = String(val).replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Gera relatório completo para o ano-calendário especificado
     * @param {number} taxYear - Ano-calendário (ex: 2024)
     * @param {Array} transactions - Histórico de investimentos
     * @param {Array} dividends - Histórico de proventos
     * @param {Array} corporateEvents - Histórico de eventos corporativos
     * @returns {Object} Relatório consolidado para o IRPF
     */
    function generateAnnualTaxReport(taxYear, transactions = [], dividends = [], corporateEvents = []) {
        const yearInt = parseInt(taxYear, 10);
        const endDateCurrentYear = `${yearInt}-12-31`;
        const endDatePreviousYear = `${yearInt - 1}-12-31`;

        // 1. Apura Posição em 31/12 do Ano Anterior e do Ano Corrente (Bens e Direitos)
        const posPrevYear = computePositionsAtDate(endDatePreviousYear, transactions, corporateEvents);
        const posCurrYear = computePositionsAtDate(endDateCurrentYear, transactions, corporateEvents);

        // Mescla tickers que tiveram posição em qualquer dos dois anos
        const allTickers = new Set([...Object.keys(posPrevYear), ...Object.keys(posCurrYear)]);
        const bensEDireitos = [];

        allTickers.forEach(ticker => {
            const pPrev = posPrevYear[ticker] || { quantity: 0, costBasis: 0, assetClass: 'Ações' };
            const pCurr = posCurrYear[ticker] || { quantity: 0, costBasis: 0, assetClass: 'Ações' };

            if (pPrev.quantity > 0.0001 || pCurr.quantity > 0.0001) {
                bensEDireitos.push({
                    ticker,
                    assetClass: pCurr.assetClass || pPrev.assetClass || 'Ações',
                    prevQuantity: pPrev.quantity,
                    prevCostBasis: Math.round(pPrev.costBasis * 100) / 100,
                    currentQuantity: pCurr.quantity,
                    currentCostBasis: Math.round(pCurr.costBasis * 100) / 100,
                    currentAverageCost: pCurr.quantity > 0 ? Math.round((pCurr.costBasis / pCurr.quantity) * 100) / 100 : 0,
                    discriminacao: `${pCurr.quantity} cotas/ações de ${ticker}, custo médio de aquisição R$ ${(pCurr.quantity > 0 ? (pCurr.costBasis / pCurr.quantity).toFixed(2) : '0.00')}.`
                });
            }
        });

        // 2. Apura Proventos Recebidos no Ano
        let totalDividendos = 0;
        let totalRendimentosFII = 0;
        let totalJCPBruto = 0;
        let totalJCPLiquido = 0;
        let totalIRRetidoJCP = 0;

        const proventosDetalhe = [];

        (dividends || []).forEach(div => {
            const dateStr = div.payment_date || div.date || '';
            if (!dateStr.startsWith(String(yearInt))) return;

            const ticker = (div.ticker || '').toUpperCase().trim();
            const type = (div.type || '').trim();
            const grossVal = parseSafeNumber(div.total_value || div.amount);
            let netVal = parseSafeNumber(div.net_value);

            if (type === 'JCP') {
                if (netVal <= 0) netVal = grossVal * (1 - JCP_TAX_RATE);
                const tax = grossVal - netVal;
                totalJCPBruto += grossVal;
                totalJCPLiquido += netVal;
                totalIRRetidoJCP += tax;
                proventosDetalhe.push({
                    ticker,
                    date: dateStr,
                    type: 'JCP',
                    grossValue: grossVal,
                    netValue: netVal,
                    taxWithheld: tax,
                    irCategory: 'Tributação Exclusiva/Definitiva'
                });
            } else if (type === 'Rendimento') {
                totalRendimentosFII += grossVal;
                proventosDetalhe.push({
                    ticker,
                    date: dateStr,
                    type: 'Rendimento FII',
                    grossValue: grossVal,
                    netValue: grossVal,
                    taxWithheld: 0,
                    irCategory: 'Isentos e Não Tributáveis'
                });
            } else {
                // Dividendo padrão
                totalDividendos += grossVal;
                proventosDetalhe.push({
                    ticker,
                    date: dateStr,
                    type: 'Dividendo',
                    grossValue: grossVal,
                    netValue: grossVal,
                    taxWithheld: 0,
                    irCategory: 'Isentos e Não Tributáveis'
                });
            }
        });

        // 3. Apuração Mensal de Renda Variável (Ganhos de Capital em Vendas)
        const monthlyTrading = computeMonthlyTrading(yearInt, transactions, corporateEvents);

        return {
            taxYear: yearInt,
            generatedAt: new Date().toISOString(),
            bensEDireitos: bensEDireitos.sort((a, b) => a.ticker.localeCompare(b.ticker)),
            proventos: {
                totalDividendos: Math.round(totalDividendos * 100) / 100,
                totalRendimentosFII: Math.round(totalRendimentosFII * 100) / 100,
                totalIsentos: Math.round((totalDividendos + totalRendimentosFII) * 100) / 100,
                totalJCPBruto: Math.round(totalJCPBruto * 100) / 100,
                totalJCPLiquido: Math.round(totalJCPLiquido * 100) / 100,
                totalIRRetidoJCP: Math.round(totalIRRetidoJCP * 100) / 100,
                detalhes: proventosDetalhe
            },
            rendaVariavel: monthlyTrading
        };
    }

    /**
     * Calcula o portfólio de ativos até uma data específica
     */
    function computePositionsAtDate(targetDateStr, transactions, corporateEvents) {
        const txs = (transactions || []).filter(t => (t.date || '1970-01-01') <= targetDateStr);
        const evs = (corporateEvents || []).filter(e => (e.event_date || e.date || '1970-01-01') <= targetDateStr);

        const normalizedTx = txs.map(t => ({
            ...t,
            isCorporateEvent: false,
            sortDate: t.date || '1970-01-01',
            sortPriority: (t.type || '').toLowerCase().includes('compra') || (t.type || '').toLowerCase().includes('buy') ? 1 : 2
        }));

        const normalizedEvents = evs.map(e => ({
            ...e,
            isCorporateEvent: true,
            sortDate: e.event_date || e.date || '1970-01-01',
            sortPriority: 0
        }));

        const timeline = [...normalizedTx, ...normalizedEvents].sort((a, b) => {
            const da = new Date(a.sortDate + 'T12:00:00').getTime();
            const db = new Date(b.sortDate + 'T12:00:00').getTime();
            if (da !== db) return da - db;
            if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });

        const map = {};

        timeline.forEach(item => {
            const ticker = (item.ticker || '').toUpperCase().trim();
            if (!ticker) return;

            if (!map[ticker]) {
                map[ticker] = {
                    ticker,
                    assetClass: item.asset_class || 'Ações',
                    quantity: 0,
                    costBasis: 0
                };
            }

            const p = map[ticker];

            if (item.isCorporateEvent) {
                const evType = (item.event_type || item.type || '').trim();
                if (evType === 'Desdobramento' || evType === 'Agrupamento' || evType === 'Split' || evType === 'Inplit') {
                    const rf = parseSafeNumber(item.ratio_from) || 1;
                    const rt = parseSafeNumber(item.ratio_to) || 1;
                    if (rf > 0 && rt > 0 && p.quantity > 0) {
                        p.quantity = (p.quantity * rt) / rf;
                    }
                } else if (evType === 'Bonificação' || evType === 'Subscrição') {
                    const bShares = parseSafeNumber(item.bonus_shares || item.shares_received || 0);
                    const bCost = parseSafeNumber(item.bonus_unit_cost || item.unit_value || 0);
                    if (bShares > 0) {
                        p.quantity += bShares;
                        p.costBasis += (bShares * bCost);
                    }
                } else if (evType === 'Amortização') {
                    const amort = parseSafeNumber(item.amortization_per_share || item.unit_value || 0);
                    if (amort > 0 && p.quantity > 0) {
                        p.costBasis = Math.max(0, p.costBasis - (amort * p.quantity));
                    }
                }
                return;
            }

            // Operação
            const qty = parseSafeNumber(item.quantity);
            let unit = parseSafeNumber(item.unit_price);
            let total = parseSafeNumber(item.total_value || item.amount);
            if (total <= 0 && qty > 0 && unit > 0) total = qty * unit;

            const isBuy = (item.type || '').toLowerCase().includes('compra') || (item.type || '').toLowerCase().includes('buy');

            if (isBuy) {
                p.costBasis += total;
                p.quantity += qty;
            } else {
                const avg = p.quantity > 0 ? p.costBasis / p.quantity : 0;
                const soldQty = Math.min(qty, p.quantity);
                p.costBasis = Math.max(0, p.costBasis - (avg * soldQty));
                p.quantity = Math.max(0, p.quantity - soldQty);
                if (p.quantity <= 0.0000001) {
                    p.quantity = 0;
                    p.costBasis = 0;
                }
            }
        });

        return map;
    }

    /**
     * Calcula o resultado mensal de vendas com apuração de imposto devido
     */
    function computeMonthlyTrading(taxYear, transactions, corporateEvents) {
        // Inicializa 12 meses
        const months = [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            months.push({
                month: `${taxYear}-${mStr}`,
                monthNumber: m,
                totalAcoesSales: 0,
                totalFIISales: 0,
                realizedGainAcoes: 0,
                realizedGainFII: 0,
                isExemptAcoes: false,
                taxDueAcoes: 0,
                taxDueFII: 0,
                totalTaxDue: 0
            });
        }

        // Simula linha do tempo completa para saber PM em cada venda
        const normalizedTx = (transactions || []).map(t => ({
            ...t,
            isCorporateEvent: false,
            sortDate: t.date || '1970-01-01',
            sortPriority: (t.type || '').toLowerCase().includes('compra') ? 1 : 2
        }));

        const normalizedEvents = (corporateEvents || []).map(e => ({
            ...e,
            isCorporateEvent: true,
            sortDate: e.event_date || e.date || '1970-01-01',
            sortPriority: 0
        }));

        const timeline = [...normalizedTx, ...normalizedEvents].sort((a, b) => {
            const da = new Date(a.sortDate + 'T12:00:00').getTime();
            const db = new Date(b.sortDate + 'T12:00:00').getTime();
            if (da !== db) return da - db;
            if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
            return (a.created_at || '').localeCompare(b.created_at || '');
        });

        const map = {};

        timeline.forEach(item => {
            const ticker = (item.ticker || '').toUpperCase().trim();
            if (!ticker) return;

            if (!map[ticker]) {
                map[ticker] = {
                    ticker,
                    assetClass: item.asset_class || (ticker.endsWith('11') ? 'FIIs' : 'Ações'),
                    quantity: 0,
                    costBasis: 0
                };
            }
            const p = map[ticker];

            if (item.isCorporateEvent) {
                const evType = (item.event_type || item.type || '').trim();
                if (evType === 'Desdobramento' || evType === 'Agrupamento' || evType === 'Split' || evType === 'Inplit') {
                    const rf = parseSafeNumber(item.ratio_from) || 1;
                    const rt = parseSafeNumber(item.ratio_to) || 1;
                    if (rf > 0 && rt > 0 && p.quantity > 0) p.quantity = (p.quantity * rt) / rf;
                } else if (evType === 'Bonificação') {
                    const bShares = parseSafeNumber(item.bonus_shares || item.shares_received || 0);
                    const bCost = parseSafeNumber(item.bonus_unit_cost || item.unit_value || 0);
                    if (bShares > 0) {
                        p.quantity += bShares;
                        p.costBasis += (bShares * bCost);
                    }
                } else if (evType === 'Amortização') {
                    const amort = parseSafeNumber(item.amortization_per_share || item.unit_value || 0);
                    if (amort > 0 && p.quantity > 0) p.costBasis = Math.max(0, p.costBasis - (amort * p.quantity));
                }
                return;
            }

            const isBuy = (item.type || '').toLowerCase().includes('compra');
            const qty = parseSafeNumber(item.quantity);
            let unit = parseSafeNumber(item.unit_price);
            let total = parseSafeNumber(item.total_value || item.amount);
            if (total <= 0 && qty > 0 && unit > 0) total = qty * unit;

            if (isBuy) {
                p.costBasis += total;
                p.quantity += qty;
            } else {
                // Venda
                const dateStr = item.sortDate;
                const year = dateStr.substring(0, 4);
                const monthStr = dateStr.substring(0, 7);

                const avg = p.quantity > 0 ? p.costBasis / p.quantity : 0;
                const soldQty = Math.min(qty, p.quantity);
                const costOfSold = avg * soldQty;
                const gain = total - costOfSold;

                p.costBasis = Math.max(0, p.costBasis - costOfSold);
                p.quantity = Math.max(0, p.quantity - soldQty);
                if (p.quantity <= 0.0000001) {
                    p.quantity = 0;
                    p.costBasis = 0;
                }

                if (year === String(taxYear)) {
                    const mObj = months.find(m => m.month === monthStr);
                    if (mObj) {
                        const isFII = p.assetClass === 'FIIs' || ticker.endsWith('11');
                        if (isFII) {
                            mObj.totalFIISales += total;
                            mObj.realizedGainFII += gain;
                        } else {
                            mObj.totalAcoesSales += total;
                            mObj.realizedGainAcoes += gain;
                        }
                    }
                }
            }
        });

        // Consolidação dos tributos com limite de isenção de 20k em Ações
        let accumulatedLossAcoes = 0;
        let accumulatedLossFII = 0;

        months.forEach(m => {
            // AÇÕES: Isenção até R$ 20.000 de vendas mensais no mercado à vista
            if (m.totalAcoesSales <= SWING_TRADE_MONTHLY_EXEMPTION_LIMIT) {
                m.isExemptAcoes = true;
                m.taxDueAcoes = 0;
            } else {
                m.isExemptAcoes = false;
                if (m.realizedGainAcoes > 0) {
                    const taxableGain = Math.max(0, m.realizedGainAcoes - accumulatedLossAcoes);
                    accumulatedLossAcoes = Math.max(0, accumulatedLossAcoes - m.realizedGainAcoes);
                    m.taxDueAcoes = taxableGain * 0.15; // 15% Swing Trade
                } else {
                    accumulatedLossAcoes += Math.abs(m.realizedGainAcoes);
                    m.taxDueAcoes = 0;
                }
            }

            // FIIs: Sem isenção mensal, alíquota de 20%
            if (m.realizedGainFII > 0) {
                const taxableGainFII = Math.max(0, m.realizedGainFII - accumulatedLossFII);
                accumulatedLossFII = Math.max(0, accumulatedLossFII - m.realizedGainFII);
                m.taxDueFII = taxableGainFII * 0.20; // 20% FIIs
            } else {
                accumulatedLossFII += Math.abs(m.realizedGainFII);
                m.taxDueFII = 0;
            }

            m.totalTaxDue = Math.round((m.taxDueAcoes + m.taxDueFII) * 100) / 100;
        });

        return months;
    }

    return {
        generateAnnualTaxReport,
        computePositionsAtDate,
        computeMonthlyTrading
    };
}));
