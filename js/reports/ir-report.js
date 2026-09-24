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

    const JCP_TAX_RATE = (typeof root !== 'undefined' && root.TONU_JCP_TAX_RATE !== undefined)
        ? root.TONU_JCP_TAX_RATE
        : ((typeof window !== 'undefined' && window.TONU_JCP_TAX_RATE !== undefined)
            ? window.TONU_JCP_TAX_RATE
            : ((typeof globalThis !== 'undefined' && globalThis.TONU_JCP_TAX_RATE !== undefined)
                ? globalThis.TONU_JCP_TAX_RATE
                : ((typeof global !== 'undefined' && global.TONU_JCP_TAX_RATE !== undefined) ? global.TONU_JCP_TAX_RATE : 0)));
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

    /**
     * Exibe o modal completo do Relatório de Imposto de Renda
     */
    function showIRReportModal(transactions = [], dividends = [], corporateEvents = [], initialYear = null) {
        let existing = document.getElementById('tonuIRReportModal');
        if (existing) existing.remove();

        const currentRealYear = new Date().getFullYear();
        let targetYear = initialYear ? parseInt(initialYear, 10) : (currentRealYear - 1);

        // Identifica anos disponíveis nos dados
        const availableYears = new Set([currentRealYear, currentRealYear - 1]);
        (transactions || []).forEach(t => {
            const y = parseInt((t.date || '').slice(0, 4), 10);
            if (y && y > 2000) availableYears.add(y);
        });
        (dividends || []).forEach(d => {
            const dt = d.payment_date || d.date || '';
            const y = parseInt(dt.slice(0, 4), 10);
            if (y && y > 2000) availableYears.add(y);
        });
        const yearsList = Array.from(availableYears).sort((a, b) => b - a);
        if (!yearsList.includes(targetYear)) targetYear = yearsList[0] || currentRealYear;

        const formatMoney = (val) => {
            const n = Number(val) || 0;
            return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        };

        const modalHtml = `
        <div id="tonuIRReportModal" style="position:fixed; inset:0; background:rgba(15,23,42,0.75); z-index:999999; display:flex; align-items:center; justify-content:center; padding:12px; backdrop-filter:blur(6px); font-family:Inter,system-ui,-apple-system,sans-serif;">
            <div style="background:var(--color-surface, #ffffff); color:var(--color-text, #0f172a); border-radius:18px; max-width:880px; width:100%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 60px -15px rgba(0,0,0,0.4); border:1px solid var(--color-border, #e2e8f0); overflow:hidden;">
                <!-- Header -->
                <div style="padding:16px 20px; border-bottom:1px solid var(--color-border, #e2e8f0); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; background:linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.06) 100%);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:40px; height:40px; border-radius:10px; background:#6c5ce7; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
                            <i class="fas fa-file-invoice-dollar"></i>
                        </div>
                        <div>
                            <h2 style="font-size:16px; font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
                                Relatório IRPF • Imposto de Renda
                            </h2>
                            <div style="font-size:11.5px; color:var(--color-text-muted, #64748b);">
                                Apuração de Bens e Direitos, Proventos e Renda Variável para a Receita Federal
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <label style="font-size:12px; font-weight:600; color:var(--color-text-muted, #64748b);">Ano-Calendário:</label>
                        <select id="irReportYearSelect" style="padding:6px 12px; border-radius:8px; border:1px solid var(--color-border, #cbd5e1); font-size:13px; font-weight:700; background:var(--color-surface, #fff); color:var(--color-text, #0f172a); cursor:pointer;">
                            ${yearsList.map(y => `<option value="${y}" ${y === targetYear ? 'selected' : ''}>${y} (Declaração ${y + 1})</option>`).join('')}
                        </select>
                        <button type="button" onclick="document.getElementById('tonuIRReportModal').remove()" style="background:none; border:none; color:var(--color-text-muted, #64748b); font-size:18px; cursor:pointer; padding:6px; border-radius:8px; display:flex; align-items:center; justify-content:center;" title="Fechar">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Tabs -->
                <div style="display:flex; gap:4px; padding:8px 16px; border-bottom:1px solid var(--color-border, #e2e8f0); background:var(--color-bg, #f8fafc); overflow-x:auto;">
                    <button class="ir-tab-btn active" onclick="switchIRTab('bens', this)" style="padding:8px 14px; font-size:12px; font-weight:600; border-radius:8px; border:none; background:#6c5ce7; color:#fff; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-cubes"></i> 1. Bens e Direitos
                    </button>
                    <button class="ir-tab-btn" onclick="switchIRTab('proventos', this)" style="padding:8px 14px; font-size:12px; font-weight:600; border-radius:8px; border:none; background:transparent; color:var(--color-text, #475569); cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-hand-holding-usd"></i> 2. Proventos Recebidos
                    </button>
                    <button class="ir-tab-btn" onclick="switchIRTab('operacoes', this)" style="padding:8px 14px; font-size:12px; font-weight:600; border-radius:8px; border:none; background:transparent; color:var(--color-text, #475569); cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-chart-line"></i> 3. Renda Variável & Vendas
                    </button>
                </div>

                <!-- Body Content -->
                <div id="irReportContentBody" style="padding:16px 20px; overflow-y:auto; flex:1;">
                    <!-- Renderizado dinamicamente -->
                </div>

                <!-- Footer -->
                <div style="padding:12px 20px; border-top:1px solid var(--color-border, #e2e8f0); background:var(--color-bg, #f8fafc); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:11px; color:var(--color-text-muted, #64748b);">
                        💡 Custo de aquisição atualizado com desdobramentos, agrupamentos e bonificações.
                    </span>
                    <div style="display:flex; gap:8px;">
                        <button type="button" onclick="copyIRReportSummary()" style="padding:7px 14px; font-size:12px; font-weight:600; border-radius:8px; border:1px solid #6c5ce7; background:transparent; color:#6c5ce7; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-copy"></i> Copiar Resumo
                        </button>
                        <button type="button" onclick="document.getElementById('tonuIRReportModal').remove()" style="padding:7px 16px; font-size:12px; font-weight:600; border-radius:8px; border:none; background:#64748b; color:#fff; cursor:pointer;">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        let activeTab = 'bens';
        let currentReport = null;

        function renderReportForYear(year) {
            currentReport = generateAnnualTaxReport(year, transactions, dividends, corporateEvents);
            const container = document.getElementById('irReportContentBody');
            if (!container) return;

            if (activeTab === 'bens') {
                const items = currentReport.bensEDireitos || [];
                if (items.length === 0) {
                    container.innerHTML = `
                        <div style="text-align:center; padding:40px 10px; color:var(--color-text-muted, #94a3b8);">
                            <i class="fas fa-inbox" style="font-size:36px; opacity:0.4; margin-bottom:8px;"></i>
                            <p style="font-size:14px; font-weight:600; margin:0;">Nenhum ativo em custódia apurado para ${year}.</p>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = `
                    <div style="margin-bottom:12px; font-size:12px; color:var(--color-text-muted, #64748b);">
                        Declare os ativos mantidos em 31/12/${year} na ficha <strong>Bens e Direitos</strong> (Grupo 03 - Participações Societárias ou 04 - Fundos) pelo seu <strong>custo de aquisição</strong>:
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${items.map(item => `
                            <div style="border:1px solid var(--color-border, #e2e8f0); border-radius:12px; padding:12px 14px; background:var(--color-surface, #fff);">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="font-weight:700; font-size:14px; color:#6c5ce7; background:rgba(108,92,231,0.1); padding:2px 8px; border-radius:6px;">${item.ticker}</span>
                                        <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:#f1f5f9; color:#475569; font-weight:600;">${item.assetClass}</span>
                                    </div>
                                    <div style="display:flex; gap:16px; font-size:12px;">
                                        <div>Em 31/12/${year - 1}: <strong>${formatMoney(item.prevCostBasis)}</strong></div>
                                        <div>Em 31/12/${year}: <strong style="color:#0984e3;">${formatMoney(item.currentCostBasis)}</strong></div>
                                    </div>
                                </div>
                                <div style="font-size:11.5px; line-height:1.5; color:var(--color-text, #334155); background:var(--color-bg, #f8fafc); padding:8px 12px; border-radius:8px; border:1px solid var(--color-border, #e2e8f0); display:flex; justify-content:space-between; align-items:center; gap:10px;">
                                    <span>${item.discriminacao}</span>
                                    <button type="button" onclick="navigator.clipboard.writeText('${item.discriminacao.replace(/'/g, "\\'")}'); if(window.showToast) window.showToast('Discriminação copiada! 📋','success');" style="background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:600; cursor:pointer; flex-shrink:0;" title="Copiar para colar no IRPF">
                                        <i class="fas fa-copy"></i> Copiar
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else if (activeTab === 'proventos') {
                const p = currentReport.proventos || {};
                container.innerHTML = `
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:16px;">
                        <div style="padding:14px; border-radius:12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25);">
                            <div style="font-size:11px; font-weight:600; color:#059669; text-transform:uppercase;">Rendimentos Isentos (Ações + FIIs)</div>
                            <div style="font-size:18px; font-weight:700; color:#059669; margin-top:4px;">
                                ${formatMoney((p.totalDividendos || 0) + (p.totalRendimentosFII || 0))}
                            </div>
                            <div style="font-size:10.5px; color:#64748b; margin-top:4px;">
                                Dividendos: ${formatMoney(p.totalDividendos || 0)} • FIIs: ${formatMoney(p.totalRendimentosFII || 0)}
                            </div>
                        </div>

                        <div style="padding:14px; border-radius:12px; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25);">
                            <div style="font-size:11px; font-weight:600; color:#4f46e5; text-transform:uppercase;">Tributação Exclusiva (JCP Líquido)</div>
                            <div style="font-size:18px; font-weight:700; color:#4f46e5; margin-top:4px;">
                                ${formatMoney(p.totalJCPLiquido || 0)}
                            </div>
                            <div style="font-size:10.5px; color:#64748b; margin-top:4px;">
                                IR Retido na Fonte (15%): ${formatMoney(p.totalIRRetidoJCP || 0)}
                            </div>
                        </div>
                    </div>

                    <div style="font-size:12px; font-weight:700; margin-bottom:8px;">Detalhamento de Proventos Recebidos em ${year}:</div>
                    <div style="max-height:280px; overflow-y:auto; border:1px solid var(--color-border, #e2e8f0); border-radius:10px;">
                        <table style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left;">
                            <thead style="background:var(--color-bg, #f8fafc); border-bottom:1px solid var(--color-border, #e2e8f0); position:sticky; top:0;">
                                <tr>
                                    <th style="padding:8px 12px;">Data</th>
                                    <th style="padding:8px 12px;">Ticker</th>
                                    <th style="padding:8px 12px;">Tipo</th>
                                    <th style="padding:8px 12px; text-align:right;">Valor Líquido</th>
                                    <th style="padding:8px 12px;">Ficha IRPF</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(p.detalhe || []).length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">Nenhum provento registrado em ${year}.</td></tr>` : 
                                (p.detalhe || []).map(d => `
                                    <tr style="border-bottom:1px solid var(--color-border, #f1f5f9);">
                                        <td style="padding:8px 12px; color:#64748b;">${d.date}</td>
                                        <td style="padding:8px 12px; font-weight:700;">${d.ticker}</td>
                                        <td style="padding:8px 12px;">${d.type}</td>
                                        <td style="padding:8px 12px; text-align:right; font-weight:600;">${formatMoney(d.netValue)}</td>
                                        <td style="padding:8px 12px; font-size:10.5px; color:#64748b;">${d.irCategory}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else if (activeTab === 'operacoes') {
                const months = currentReport.rendaVariavel || [];
                const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                const totalTaxYear = months.reduce((acc, m) => acc + (m.totalTaxDue || 0), 0);

                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                        <div style="font-size:12px; color:var(--color-text-muted, #64748b);">
                            Apuração mensal no mercado à vista (Swing Trade). Isenção de até R$ 20.000 em vendas de ações. FIIs tributados a 20%.
                        </div>
                        <div style="font-size:12px; font-weight:700; color:#ef4444; background:rgba(239,68,68,0.08); padding:4px 10px; border-radius:8px;">
                            Total DARF Apurado no Ano: ${formatMoney(totalTaxYear)}
                        </div>
                    </div>
                    <div style="overflow-x:auto; border:1px solid var(--color-border, #e2e8f0); border-radius:10px;">
                        <table style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left; min-width:620px;">
                            <thead style="background:var(--color-bg, #f8fafc); border-bottom:1px solid var(--color-border, #e2e8f0);">
                                <tr>
                                    <th style="padding:8px 12px;">Mês</th>
                                    <th style="padding:8px 12px; text-align:right;">Vendas Ações</th>
                                    <th style="padding:8px 12px; text-align:center;">Isenção 20k</th>
                                    <th style="padding:8px 12px; text-align:right;">Ganho/Perda Ações</th>
                                    <th style="padding:8px 12px; text-align:right;">Vendas FIIs</th>
                                    <th style="padding:8px 12px; text-align:right;">Ganho/Perda FIIs</th>
                                    <th style="padding:8px 12px; text-align:right; font-weight:700;">Imposto Devido</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${months.map(m => {
                                    const mIdx = parseInt(m.month.slice(5, 7), 10) - 1;
                                    const name = monthNames[mIdx] || m.month;
                                    return `
                                    <tr style="border-bottom:1px solid var(--color-border, #f1f5f9);">
                                        <td style="padding:8px 12px; font-weight:600;">${name}</td>
                                        <td style="padding:8px 12px; text-align:right;">${formatMoney(m.totalAcoesSales)}</td>
                                        <td style="padding:8px 12px; text-align:center;">
                                            <span style="font-size:10px; padding:2px 6px; border-radius:6px; font-weight:600; background:${m.isExemptAcoes ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${m.isExemptAcoes ? '#059669' : '#dc2626'};">
                                                ${m.isExemptAcoes ? 'Isento' : 'Tributável'}
                                            </span>
                                        </td>
                                        <td style="padding:8px 12px; text-align:right; color:${m.realizedGainAcoes >= 0 ? '#059669' : '#dc2626'}; font-weight:600;">
                                            ${formatMoney(m.realizedGainAcoes)}
                                        </td>
                                        <td style="padding:8px 12px; text-align:right;">${formatMoney(m.totalFIISales)}</td>
                                        <td style="padding:8px 12px; text-align:right; color:${m.realizedGainFII >= 0 ? '#059669' : '#dc2626'}; font-weight:600;">
                                            ${formatMoney(m.realizedGainFII)}
                                        </td>
                                        <td style="padding:8px 12px; text-align:right; font-weight:700; color:${m.totalTaxDue > 0 ? '#dc2626' : '#64748b'};">
                                            ${formatMoney(m.totalTaxDue)}
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        }

        window.switchIRTab = function(tabName, btn) {
            activeTab = tabName;
            document.querySelectorAll('.ir-tab-btn').forEach(b => {
                b.style.background = 'transparent';
                b.style.color = 'var(--color-text, #475569)';
            });
            if (btn) {
                btn.style.background = '#6c5ce7';
                btn.style.color = '#fff';
            }
            renderReportForYear(targetYear);
        };

        const yearSelect = document.getElementById('irReportYearSelect');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                targetYear = parseInt(e.target.value, 10);
                renderReportForYear(targetYear);
            });
        }

        window.copyIRReportSummary = function() {
            if (!currentReport) return;
            const bensCount = (currentReport.bensEDireitos || []).length;
            const provTot = (currentReport.proventos?.totalDividendos || 0) + (currentReport.proventos?.totalRendimentosFII || 0) + (currentReport.proventos?.totalJCPLiquido || 0);
            const text = `=== TONUCONTROLE • RESUMO IRPF (ANO-CALENDÁRIO ${currentReport.taxYear}) ===\n` +
                         `Ativos em Bens e Direitos: ${bensCount}\n` +
                         `Total Proventos Recebidos: ${formatMoney(provTot)}\n` +
                         `  - Dividendos Isentos: ${formatMoney(currentReport.proventos?.totalDividendos)}\n` +
                         `  - Rendimentos FIIs: ${formatMoney(currentReport.proventos?.totalRendimentosFII)}\n` +
                         `  - JCP Líquido: ${formatMoney(currentReport.proventos?.totalJCPLiquido)} (IR Retido: ${formatMoney(currentReport.proventos?.totalIRRetidoJCP)})\n` +
                         `Gerado via TonuControle em ${new Date().toLocaleDateString('pt-BR')}`;
            navigator.clipboard.writeText(text);
            if (window.showToast) window.showToast('Resumo do IRPF copiado para a área de transferência! 📋', 'success');
            else alert('Resumo do IRPF copiado!');
        };

        renderReportForYear(targetYear);
    }

    return {
        generateAnnualTaxReport,
        computePositionsAtDate,
        computeMonthlyTrading,
        showIRReportModal
    };
}));
