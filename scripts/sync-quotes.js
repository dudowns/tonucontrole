// ========================================================================
// TONUCONTROLE - ATUALIZADOR AUTOMÁTICO DE COTAÇÕES (GITHUB ACTIONS)
// ========================================================================

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://rbtxrbacdpenbslqcbbl.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';
const BRAPI_TOKEN = process.env.BRAPI_TOKEN;

async function syncQuotes() {
    console.log('🚀 Iniciando sincronização automática de cotações...');

    if (!BRAPI_TOKEN) {
        console.error('❌ Erro: Variável BRAPI_TOKEN não informada.');
        process.exit(1);
    }

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
    };

    // 1. Obter todos os tickers da carteira cadastrada em 'investments'
    let tickers = [];
    try {
        const resInvest = await fetch(`${SUPABASE_URL}/rest/v1/investments?select=ticker`, { headers });
        if (resInvest.ok) {
            const data = await resInvest.json();
            tickers = (data || [])
                .map(item => item.ticker)
                .filter(t => t && typeof t === 'string' && t.trim().length >= 3)
                .map(t => t.toUpperCase().trim().replace(/\.SA$/, ''));
        }
    } catch (e) {
        console.warn('⚠️ Falha ao buscar tickers de investments:', e.message);
    }

    // Se a tabela investments estiver vazia, busca os tickers já existentes em asset_quotes
    if (tickers.length === 0) {
        try {
            const resQuotes = await fetch(`${SUPABASE_URL}/rest/v1/asset_quotes?select=ticker`, { headers });
            if (resQuotes.ok) {
                const data = await resQuotes.json();
                tickers = (data || []).map(item => item.ticker.toUpperCase().trim().replace(/\.SA$/, ''));
            }
        } catch (e) {}
    }

    // Fallback padrão se nenhuma lista foi encontrada
    if (tickers.length === 0) {
        tickers = ['BBAS3', 'RZTR11', 'GGRC11', 'BBSE3', 'TAEE11', 'KNCR11', 'PORD11'];
    }

    const uniqueTickers = [...new Set(tickers)];
    console.log(`📊 Tickers a consultar (${uniqueTickers.length}):`, uniqueTickers.join(', '));

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 2. Consulta cotações na BRAPI individualmente (1 por requisição - Plano Free BRAPI)
    const upsertRows = [];
    const nowIso = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;

    for (const ticker of uniqueTickers) {
        const cleanTicker = ticker.trim().toUpperCase().replace(/\.SA$/, '');
        const url = `https://brapi.dev/api/quote/${encodeURIComponent(cleanTicker)}?token=${encodeURIComponent(BRAPI_TOKEN)}`;

        try {
            const res = await fetch(url);

            if (!res.ok) {
                let errDetail = `${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody?.message) errDetail += ` - ${errBody.message}`;
                } catch (_) {}
                console.log(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (${errDetail})`);
                failCount++;
                await sleep(200);
                continue;
            }

            const json = await res.json();
            const item = (json.results && json.results[0]) || null;
            const price = Number(item?.regularMarketPrice);

            if (!item || !Number.isFinite(price) || price <= 0) {
                console.log(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (sem dados)`);
                failCount++;
                await sleep(200);
                continue;
            }

            const changePct = Number(item.regularMarketChangePercent || 0);
            const sinal = changePct >= 0 ? '+' : '';

            upsertRows.push({
                ticker: cleanTicker,
                price: price,
                change: changePct,
                change_value: Number(item.regularMarketChange || 0),
                previous_close: Number(item.regularMarketPreviousClose || price),
                currency: item.currency || 'BRL',
                updated_at: nowIso
            });

            console.log(`📡 Buscando ${cleanTicker.padEnd(7)}... ✅ R$ ${price.toFixed(2).padStart(6)} (${sinal}${changePct.toFixed(2)}%)`);
            successCount++;

        } catch (err) {
            console.log(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (erro de conexão: ${err.message})`);
            failCount++;
        }

        // Delay de 200ms entre as requisições para respeitar o rate-limit do plano free
        await sleep(200);
    }

    console.log(`\n📊 Resumo da busca: ${successCount} atualizados com sucesso | ${failCount} falhas.`);

    if (upsertRows.length === 0) {
        console.error('❌ Nenhuma cotação válida retornada pela BRAPI.');
        process.exit(1);
    }

    console.log(`💾 Enviando ${upsertRows.length} cotações atualizadas para o Supabase...`);

    // 3. Upsert no Supabase na tabela asset_quotes
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/asset_quotes?on_conflict=ticker`, {
        method: 'POST',
        headers: {
            ...headers,
            'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(upsertRows)
    });

    if (!upsertRes.ok) {
        const errText = await upsertRes.text();
        console.error(`❌ Erro ao salvar cotações no Supabase: ${upsertRes.status} - ${errText}`);
        process.exit(1);
    }

    console.log('✅ SUCESSO! Cotações reais da B3 atualizadas no Supabase:');
    upsertRows.forEach(r => {
        const sinal = r.change >= 0 ? '+' : '';
        console.log(`   * ${r.ticker.padEnd(8)}: R$ ${r.price.toFixed(2).padStart(6)} (${sinal}${r.change.toFixed(2)}%)`);
    });
}

syncQuotes().catch(err => {
    console.error('❌ Falha fatal:', err);
    process.exit(1);
});
