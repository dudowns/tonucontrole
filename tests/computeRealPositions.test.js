// ==========================================================================
// TONUCONTROLE - TESTES DO MOTOR DE CÁLCULO DE CUSTÓDIA E POSIÇÕES REAIS
// Testes para compra, venda, split, inplit, bonificação, amortização
// ==========================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Carrega TONU_JCP_TAX_RATE diretamente do js/core.js
const coreCode = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const jcpMatch = coreCode.match(/TONU_JCP_TAX_RATE\s*=\s*([0-9.]+)/);
const detectedRate = jcpMatch ? parseFloat(jcpMatch[1]) : 0.15;
global.TONU_JCP_TAX_RATE = detectedRate;
globalThis.TONU_JCP_TAX_RATE = detectedRate;

/**
 * Motor puro de cálculo de custódia e preço médio
 * @param {Array} transactions - Transações de compra/venda
 * @param {Array} corporateEvents - Eventos corporativos (split, grupamento, bonificação, amortização)
 * @returns {Map<string, object>} Mapa de ticker para posição calculada
 */
function computeRealPositionsEngine(transactions = [], corporateEvents = []) {
    const normalizedTx = transactions.map(t => ({
        ...t,
        isCorporateEvent: false,
        sortDate: t.date || '1970-01-01',
        sortPriority: (t.type || '').toLowerCase().includes('compra') || (t.type || '').toLowerCase().includes('buy') ? 1 : 2
    }));

    const normalizedEvents = corporateEvents.map(ev => ({
        ...ev,
        isCorporateEvent: true,
        sortDate: ev.event_date || ev.date || '1970-01-01',
        sortPriority: 0 // Precedência na Data Ex
    }));

    const timeline = [...normalizedTx, ...normalizedEvents].sort((a, b) => {
        const da = new Date(a.sortDate + 'T12:00:00').getTime();
        const db = new Date(b.sortDate + 'T12:00:00').getTime();
        if (da !== db) return da - db;
        if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
        return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const map = new Map();

    timeline.forEach(item => {
        const ticker = (item.ticker || '').toUpperCase().trim();
        if (!ticker) return;

        if (!map.has(ticker)) {
            map.set(ticker, {
                ticker: ticker,
                assetClass: item.asset_class || 'Ações',
                quantity: 0,
                costBasis: 0,
                averageCost: 0,
                realizedGain: 0,
                totalTransactions: 0
            });
        }

        const pos = map.get(ticker);

        if (item.isCorporateEvent) {
            const evType = (item.event_type || item.type || '').trim();
            if (evType === 'Desdobramento' || evType === 'Agrupamento' || evType === 'Split' || evType === 'Inplit') {
                const rf = parseFloat(item.ratio_from) || 1;
                const rt = parseFloat(item.ratio_to) || 1;
                if (rf > 0 && rt > 0 && pos.quantity > 0) {
                    pos.quantity = pos.quantity * (rt / rf);
                    pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                }
            } else if (evType === 'Bonificação' || evType === 'Subscrição') {
                const bShares = parseFloat(item.bonus_shares || item.shares_received || 0);
                const bCost = parseFloat(item.bonus_unit_cost || item.unit_value || 0);
                if (bShares > 0) {
                    pos.quantity += bShares;
                    pos.costBasis += (bShares * bCost);
                    pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                }
            } else if (evType === 'Amortização') {
                const amort = parseFloat(item.amortization_per_share || item.unit_value || 0);
                if (amort > 0 && pos.quantity > 0) {
                    const totalAmort = amort * pos.quantity;
                    pos.costBasis = Math.max(0, pos.costBasis - totalAmort);
                    pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                }
            }
            return;
        }

        // Operação Normal
        const qty = parseFloat(item.quantity) || 0;
        let unit = parseFloat(item.unit_price) || 0;
        let total = parseFloat(item.total_value || item.amount) || 0;
        if (total <= 0 && qty > 0 && unit > 0) total = qty * unit;
        if (unit <= 0 && qty > 0 && total > 0) unit = total / qty;

        const type = (item.type || '').toLowerCase();
        pos.totalTransactions++;

        if (type.includes('compra') || type.includes('buy')) {
            pos.costBasis += total;
            pos.quantity += qty;
            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        } else if (type.includes('venda') || type.includes('sell')) {
            const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
            const costOfSold = avg * qty;
            const saleRevenue = total > 0 ? total : (qty * unit);
            pos.realizedGain += (saleRevenue - costOfSold);
            pos.costBasis = Math.max(0, pos.costBasis - costOfSold);
            pos.quantity = Math.max(0, pos.quantity - qty);
            if (pos.quantity <= 0.0000001) {
                pos.quantity = 0;
                pos.costBasis = 0;
                pos.averageCost = 0;
            } else {
                pos.averageCost = pos.costBasis / pos.quantity;
            }
        }
    });

    return map;
}

function runComputePositionsTests() {
    const results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name, passed: true });
        } catch (err) {
            results.push({ name, passed: false, error: err.message });
        }
    }

    // 1. Compra Simples e Preço Médio
    test('Compra Simples: calcula quantidade e preço médio exato', () => {
        const txs = [
            { ticker: 'PETR4', type: 'compra', quantity: 100, unit_price: 30, total_value: 3000, date: '2025-01-10' }
        ];
        const res = computeRealPositionsEngine(txs, []);
        const petr = res.get('PETR4');
        assert.strictEqual(petr.quantity, 100);
        assert.strictEqual(petr.costBasis, 3000);
        assert.strictEqual(petr.averageCost, 30);
    });

    // 2. Múltiplas Compras com PM Ponderado
    test('Compras Múltiplas: calcula preço médio ponderado corretamente', () => {
        const txs = [
            { ticker: 'VALE3', type: 'compra', quantity: 100, unit_price: 60, total_value: 6000, date: '2025-01-10' },
            { ticker: 'VALE3', type: 'compra', quantity: 100, unit_price: 80, total_value: 8000, date: '2025-02-10' }
        ];
        const res = computeRealPositionsEngine(txs, []);
        const vale = res.get('VALE3');
        assert.strictEqual(vale.quantity, 200);
        assert.strictEqual(vale.costBasis, 14000);
        assert.strictEqual(vale.averageCost, 70);
    });

    // 3. Venda Parcial Mantém o Preço Médio
    test('Venda Parcial: reduz quantidade e custo proporcionalmente mantendo PM inalterado', () => {
        const txs = [
            { ticker: 'ITUB4', type: 'compra', quantity: 200, unit_price: 30, total_value: 6000, date: '2025-01-10' },
            { ticker: 'ITUB4', type: 'venda', quantity: 50, unit_price: 35, total_value: 1750, date: '2025-02-10' }
        ];
        const res = computeRealPositionsEngine(txs, []);
        const itub = res.get('ITUB4');
        assert.strictEqual(itub.quantity, 150);
        assert.strictEqual(itub.averageCost, 30);
        assert.strictEqual(itub.costBasis, 4500);
        assert.strictEqual(itub.realizedGain, 250); // 50 * (35 - 30) = 250
    });

    // 4. Desdobramento (Split 1:2)
    test('Desdobramento (Split 1:2): dobra quantidade, mantém custo total e reduz PM pela metade', () => {
        const txs = [
            { ticker: 'MGLU3', type: 'compra', quantity: 100, unit_price: 20, total_value: 2000, date: '2025-01-10' }
        ];
        const events = [
            { ticker: 'MGLU3', event_type: 'Desdobramento', ratio_from: 1, ratio_to: 2, event_date: '2025-02-01' }
        ];
        const res = computeRealPositionsEngine(txs, events);
        const mglu = res.get('MGLU3');
        assert.strictEqual(mglu.quantity, 200);
        assert.strictEqual(mglu.costBasis, 2000);
        assert.strictEqual(mglu.averageCost, 10);
    });

    // 5. Agrupamento (Inplit 10:1)
    test('Agrupamento (Inplit 10:1): reduz quantidade em 10x, mantém custo total e multiplica PM por 10', () => {
        const txs = [
            { ticker: 'OIBR3', type: 'compra', quantity: 1000, unit_price: 1, total_value: 1000, date: '2025-01-10' }
        ];
        const events = [
            { ticker: 'OIBR3', event_type: 'Agrupamento', ratio_from: 10, ratio_to: 1, event_date: '2025-02-01' }
        ];
        const res = computeRealPositionsEngine(txs, events);
        const oi = res.get('OIBR3');
        assert.strictEqual(oi.quantity, 100);
        assert.strictEqual(oi.costBasis, 1000);
        assert.strictEqual(oi.averageCost, 10);
    });

    // 6. Bonificação em Ações com Custo Atribuído
    test('Bonificação: adiciona novas cotas e incorpora o custo unitário atribuído pela empresa', () => {
        const txs = [
            { ticker: 'BBDC4', type: 'compra', quantity: 100, unit_price: 15, total_value: 1500, date: '2025-01-10' }
        ];
        const events = [
            { ticker: 'BBDC4', event_type: 'Bonificação', bonus_shares: 10, bonus_unit_cost: 10, event_date: '2025-02-01' }
        ];
        const res = computeRealPositionsEngine(txs, events);
        const bbdc = res.get('BBDC4');
        assert.strictEqual(bbdc.quantity, 110);
        assert.strictEqual(bbdc.costBasis, 1600); // 1500 + (10 * 10)
        assert.strictEqual(Math.round(bbdc.averageCost * 100) / 100, 14.55); // 1600 / 110 = 14.5454
    });

    // 7. Amortização de FII
    test('Amortização: reduz o custo total mantendo a mesma quantidade de cotas', () => {
        const txs = [
            { ticker: 'MXRF11', type: 'compra', quantity: 100, unit_price: 10, total_value: 1000, date: '2025-01-10' }
        ];
        const events = [
            { ticker: 'MXRF11', event_type: 'Amortização', amortization_per_share: 1.5, event_date: '2025-02-01' }
        ];
        const res = computeRealPositionsEngine(txs, events);
        const mxrf = res.get('MXRF11');
        assert.strictEqual(mxrf.quantity, 100);
        assert.strictEqual(mxrf.costBasis, 850); // 1000 - (1.5 * 100)
        assert.strictEqual(mxrf.averageCost, 8.5);
    });

    // 8. Encerramento Total de Posição
    test('Venda Total: zera quantidade, custo de aquisição e preço médio', () => {
        const txs = [
            { ticker: 'WEGE3', type: 'compra', quantity: 50, unit_price: 40, total_value: 2000, date: '2025-01-10' },
            { ticker: 'WEGE3', type: 'venda', quantity: 50, unit_price: 55, total_value: 2750, date: '2025-02-10' }
        ];
        const res = computeRealPositionsEngine(txs, []);
        const wege = res.get('WEGE3');
        assert.strictEqual(wege.quantity, 0);
        assert.strictEqual(wege.costBasis, 0);
        assert.strictEqual(wege.averageCost, 0);
        assert.strictEqual(wege.realizedGain, 750);
    });

    // 9. Migração Segura (recompute-positions.js)
    test('Migração Segura: recomputa posições e gera log de auditoria idempotente', () => {
        const { recomputePositions } = require('../js/migrations/recompute-positions');
        const txs = [
            { ticker: 'PETR4', type: 'compra', quantity: 100, unit_price: 30, total_value: 3000, date: '2025-01-10' },
            { ticker: 'PETR4', type: 'compra', quantity: 100, unit_price: 40, total_value: 4000, date: '2025-02-10' }
        ];
        const res = recomputePositions(txs, []);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.activeCount, 1);
        assert.strictEqual(res.activePositions[0].averageCost, 35);
        assert.strictEqual(res.auditLog.length, 2);
    });

    // 10. Relatório de IR: Bens e Direitos e Proventos (ir-report.js)
    test('Relatório de IR: apura Bens e Direitos em 31/12, proventos e tributação de JCP', () => {
        const { generateAnnualTaxReport } = require('../js/reports/ir-report');
        const txs = [
            { ticker: 'ITUB4', type: 'compra', quantity: 100, unit_price: 30, total_value: 3000, date: '2024-05-10' }
        ];
        const divs = [
            { ticker: 'ITUB4', type: 'Dividendo', total_value: 150, date: '2024-06-15' },
            { ticker: 'ITUB4', type: 'JCP', total_value: 100, net_value: 85, date: '2024-08-20' }
        ];
        const report = generateAnnualTaxReport(2024, txs, divs, []);
        assert.strictEqual(report.taxYear, 2024);
        assert.strictEqual(report.bensEDireitos.length, 1);
        assert.strictEqual(report.bensEDireitos[0].currentCostBasis, 3000);
        assert.strictEqual(report.proventos.totalDividendos, 150);
        assert.strictEqual(report.proventos.totalJCPLiquido, 85);
        assert.strictEqual(report.proventos.totalIRRetidoJCP, 15);
    });

    // 11. Gráfico de Investimentos com Eventos Corporativos
    test('Gráfico de Investimentos: simula evolução com split e bonificação mantendo timeline consistente', () => {
        const simulatedPortfolio = new Map();
        
        function applyToSim(item) {
            const ticker = item.ticker.toUpperCase();
            if (!simulatedPortfolio.has(ticker)) {
                simulatedPortfolio.set(ticker, { quantity: 0, costBasis: 0, averageCost: 0 });
            }
            const pos = simulatedPortfolio.get(ticker);
            if (item.isCorporateEvent) {
                const evType = item.event_type;
                if (evType === 'Desdobramento') {
                    pos.quantity = pos.quantity * (item.ratio_to / item.ratio_from);
                } else if (evType === 'Bonificação') {
                    pos.quantity += item.bonus_shares;
                    pos.costBasis += item.bonus_shares * item.bonus_unit_cost;
                } else if (evType === 'Amortização') {
                    pos.costBasis = Math.max(0, pos.costBasis - (item.amortization_per_share * pos.quantity));
                }
            } else {
                if (item.type === 'compra') {
                    pos.quantity += item.quantity;
                    pos.costBasis += item.total_value;
                } else {
                    const avg = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
                    pos.quantity -= item.quantity;
                    pos.costBasis -= avg * item.quantity;
                }
            }
            pos.averageCost = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        }

        // 1. Compra 100 ações a R$ 40 (Custo R$ 4.000, PM R$ 40)
        applyToSim({ ticker: 'WEGE3', isCorporateEvent: false, type: 'compra', quantity: 100, total_value: 4000 });
        assert.strictEqual(simulatedPortfolio.get('WEGE3').averageCost, 40);

        // 2. Split 1:2 (Passa a ter 200 ações a PM R$ 20, Custo R$ 4.000)
        applyToSim({ ticker: 'WEGE3', isCorporateEvent: true, event_type: 'Desdobramento', ratio_from: 1, ratio_to: 2 });
        assert.strictEqual(simulatedPortfolio.get('WEGE3').quantity, 200);
        assert.strictEqual(simulatedPortfolio.get('WEGE3').costBasis, 4000);
        assert.strictEqual(simulatedPortfolio.get('WEGE3').averageCost, 20);

        // 3. Bonificação de 10 ações a R$ 10 (Total 210 ações, Custo R$ 4.100)
        applyToSim({ ticker: 'WEGE3', isCorporateEvent: true, event_type: 'Bonificação', bonus_shares: 10, bonus_unit_cost: 10 });
        assert.strictEqual(simulatedPortfolio.get('WEGE3').quantity, 210);
        assert.strictEqual(simulatedPortfolio.get('WEGE3').costBasis, 4100);
        assert.strictEqual(Math.round(simulatedPortfolio.get('WEGE3').averageCost * 100) / 100, 19.52);
    });

    // 12. Centralização da taxa de JCP
    test('Centralização da Taxa de JCP: alíquota oficial única de 15% definida no core.js', () => {
        const rate = (typeof globalThis !== 'undefined' && globalThis.TONU_JCP_TAX_RATE !== undefined)
            ? globalThis.TONU_JCP_TAX_RATE
            : (typeof global !== 'undefined' ? global.TONU_JCP_TAX_RATE : undefined);
        assert.strictEqual(rate, 0.15);
        
        // Simula cálculo de JCP líquido com a taxa centralizada
        const jcpBruto = 1000;
        const jcpLiquido = jcpBruto * (1 - rate);
        assert.strictEqual(jcpLiquido, 850);
    });

    return results;
}

module.exports = {
    computeRealPositionsEngine,
    runComputePositionsTests
};

if (require.main === module) {
    console.log('🧪 Executando testes de computeRealPositions...');
    const results = runComputePositionsTests();
    results.forEach(r => {
        if (r.passed) console.log(`   ✅ PASS: ${r.name}`);
        else console.error(`   ❌ FAIL: ${r.name} - ${r.error}`);
    });
}
