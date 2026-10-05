// ========================================================================
// SUPABASE EDGE FUNCTION: sync-quotes
// Atualiza cotações da B3 na tabela public.asset_quotes via BRAPI
// ========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Tratamento de preflight CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const brapiToken = Deno.env.get('BRAPI_TOKEN');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
    }

    if (!brapiToken) {
      throw new Error('Secret BRAPI_TOKEN não configurada no Supabase.');
    }

    // Cliente com permissão de escrita (service_role ignora RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Busca todos os tickers únicos cadastrados na tabela 'investments'
    const { data: investments, error: investError } = await supabase
      .from('investments')
      .select('ticker');

    if (investError) {
      throw new Error(`Erro ao consultar investments: ${investError.message}`);
    }

    // Extrai e sanitiza os tickers (ações, FIIs, BDRs, etc.)
    const rawTickers = (investments || [])
      .map((item: { ticker: string }) => item.ticker)
      .filter((t: string) => t && typeof t === 'string' && t.trim().length >= 3)
      .map((t: string) => t.toUpperCase().trim().replace(/\.SA$/, ''));

    const uniqueTickers = [...new Set(rawTickers)];

    if (uniqueTickers.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, count: 0, message: 'Nenhum ticker encontrado na carteira.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`📡 Atualizando ${uniqueTickers.length} tickers: ${uniqueTickers.join(', ')}`);

    // 2. Consulta a BRAPI individualmente (1 por requisição - Plano Free BRAPI)
    const upsertRows: Array<{
      ticker: string;
      price: number;
      change: number;
      change_value: number;
      previous_close: number;
      currency: string;
      updated_at: string;
    }> = [];

    const nowIso = new Date().toISOString();
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let successCount = 0;
    let failCount = 0;

    for (const ticker of uniqueTickers) {
      const cleanTicker = ticker.trim().toUpperCase().replace(/\.SA$/, '');
      const brapiUrl = `https://brapi.dev/api/quote/${encodeURIComponent(cleanTicker)}?token=${encodeURIComponent(brapiToken)}`;

      try {
        const response = await fetch(brapiUrl, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          let errDetail = `${response.status}`;
          try {
            const errBody = await response.json();
            if (errBody?.message) errDetail += ` - ${errBody.message}`;
          } catch (_) {}
          console.warn(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (${errDetail})`);
          failCount++;
          await sleep(200);
          continue;
        }

        const data = await response.json();
        const item = (data.results && data.results[0]) || null;
        const price = Number(item?.regularMarketPrice);

        if (!item || !Number.isFinite(price) || price <= 0) {
          console.warn(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (sem dados)`);
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

      } catch (tickerErr: any) {
        console.error(`📡 Buscando ${cleanTicker.padEnd(7)}... ⚠️ (${tickerErr.message})`);
        failCount++;
      }

      await sleep(200);
    }

    if (upsertRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, count: 0, message: 'Nenhuma cotação válida retornada pela BRAPI.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }

    // 3. Grava no banco de dados via upsert (onConflict: ticker)
    const { error: upsertError } = await supabase
      .from('asset_quotes')
      .upsert(upsertRows, { onConflict: 'ticker' });

    if (upsertError) {
      throw new Error(`Erro ao salvar no asset_quotes: ${upsertError.message}`);
    }

    console.log(`✅ ${upsertRows.length} cotações atualizadas no Supabase com sucesso.`);

    return new Response(
      JSON.stringify({
        ok: true,
        count: upsertRows.length,
        tickers: upsertRows.map(r => r.ticker),
        updated_at: nowIso
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err: any) {
    console.error('❌ Falha na execução de sync-quotes:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
