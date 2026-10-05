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

    // 2. Consulta cotações na BRAPI em lotes
    const batchSize = 15;
    const upsertRows = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < uniqueTickers.length; i += batchSize) {
        const batch = uniqueTickers.slice(i, i + batchSize);
        const tickersParam = batch.map(t => encodeURIComponent(t)).join(',');
        const url = `https://brapi.dev/api/quote/${tickersParam}?token=${encodeURIComponent(BRAPI_TOKEN)}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`⚠️ BRAPI retornou status ${res.status} para o lote: ${batch.join(',')}`);
                continue;
            }

            const json = await res.json();
            const results = json.results || [];

            for (const item of results) {
                const symbol = (item.symbol || '').toUpperCase().trim().replace(/\.SA$/, '');
                const price = Number(item.regularMarketPrice);

                if (!symbol || !Number.isFinite(price) || price <= 0) continue;

                upsertRows.push({
                    ticker: symbol,
                    price: price,
                    change: Number(item.regularMarketChangePercent || 0),
                    change_value: Number(item.regularMarketChange || 0),
                    previous_close: Number(item.regularMarketPreviousClose || price),
                    currency: item.currency || 'BRL',
                    updated_at: nowIso
                });
            }
        } catch (err) {
            console.error(`❌ Erro ao consultar lote ${batch.join(',')}:`, err.message);
        }
    }

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
