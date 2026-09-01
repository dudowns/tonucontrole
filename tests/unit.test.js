// ==========================================================================
// TONUCONTROLE - UNIT TESTS SUITE
// Testes unitários para funções matemáticas, formatação e regras de negócio
// ==========================================================================

const assert = require('assert');

// 1. Módulos / Helpers a serem testados
function formatCurrency(val, currency = 'BRL') {
    const num = Number(val) || 0;
    if (currency === 'USD') return `$ ${num.toFixed(2)}`;
    if (currency === 'EUR') return `€ ${num.toFixed(2)}`;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calculateBalance(transactions) {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income') income += amt;
        else if (t.type === 'expense') expense += amt;
    });
    return {
        income,
        expense,
        balance: income - expense
    };
}

function sanitizeString(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function calculateWeeklySummary(transactions, sevenDaysAgoStr, todayStr) {
    let currentWeekExpenses = 0;
    let currentWeekIncome = 0;
    const categoryTotals = {};

    transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.date >= sevenDaysAgoStr && t.date <= todayStr) {
            if (t.type === 'expense') {
                currentWeekExpenses += amt;
                const cat = t.category || 'Outros';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
            } else if (t.type === 'income') {
                currentWeekIncome += amt;
            }
        }
    });

    return {
        currentWeekExpenses,
        currentWeekIncome,
        netBalance: currentWeekIncome - currentWeekExpenses,
        categoryTotals
    };
}

// 2. Execução dos testes unitários
async function runUnitTests() {
    const results = [];

    function test(name, fn) {
        try {
            fn();
            results.push({ name, passed: true });
        } catch (err) {
            results.push({ name, passed: false, error: err.message });
        }
    }

    test('Deve formatar valores em Reais (BRL)', () => {
        const res = formatCurrency(1250.5);
        assert.ok(res.includes('1.250,50') || res.includes('1250,50'));
    });

    test('Deve formatar valores em Dólares (USD)', () => {
        const res = formatCurrency(100.25, 'USD');
        assert.strictEqual(res, '$ 100.25');
    });

    test('Deve calcular balanço financeiro corretamente', () => {
        const mockTxs = [
            { type: 'income', amount: '5000' },
            { type: 'expense', amount: '1200' },
            { type: 'expense', amount: '800' },
            { type: 'income', amount: '350.50' }
        ];
        const res = calculateBalance(mockTxs);
        assert.strictEqual(res.income, 5350.50);
        assert.strictEqual(res.expense, 2000);
        assert.strictEqual(res.balance, 3350.50);
    });

    test('Deve sanitizar strings contra ataques XSS', () => {
        const unsafe = '<script>alert("hack")</script>';
        const safe = sanitizeString(unsafe);
        assert.strictEqual(safe, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
    });

    test('Deve calcular resumo semanal e categorização com precisão', () => {
        const txs = [
            { date: '2026-08-10', type: 'expense', amount: '150', category: 'Alimentação' },
            { date: '2026-08-12', type: 'expense', amount: '50', category: 'Transporte' },
            { date: '2026-08-14', type: 'income', amount: '1000', category: 'Salário' },
            { date: '2026-07-01', type: 'expense', amount: '999', category: 'Antigo' } // Fora do intervalo
        ];
        const summary = calculateWeeklySummary(txs, '2026-08-08', '2026-08-15');
        assert.strictEqual(summary.currentWeekExpenses, 200);
        assert.strictEqual(summary.currentWeekIncome, 1000);
        assert.strictEqual(summary.netBalance, 800);
        assert.strictEqual(summary.categoryTotals['Alimentação'], 150);
        assert.strictEqual(summary.categoryTotals['Transporte'], 50);
    });

    return results;
}

module.exports = { runUnitTests };
