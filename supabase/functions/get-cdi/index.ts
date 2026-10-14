// ==========================================================================
// TONUCONTROLE - EDGE FUNCTION: get-cdi
// Consulta oficial da taxa CDI Diária (SGS Banco Central do Brasil - Série 12)
// e cálculo automático de rendimento de aportes com IOF e IR regressivo.
// ==========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tabela regressiva de IOF para aplicações de renda fixa (dias 1 a 29)
const IOF_TABLE: { [day: number]: number } = {
  1: 0.96, 2: 0.93, 3: 0.90, 4: 0.86, 5: 0.83,
  6: 0.80, 7: 0.76, 8: 0.73, 9: 0.70, 10: 0.66,
  11: 0.63, 12: 0.60, 13: 0.56, 14: 0.53, 15: 0.50,
  16: 0.46, 17: 0.43, 18: 0.40, 19: 0.36, 20: 0.33,
  21: 0.30, 22: 0.26, 23: 0.23, 24: 0.20, 25: 0.16,
  26: 0.13, 27: 0.10, 28: 0.06, 29: 0.03
};

function getIOFRate(daysPassed: number): number {
  if (daysPassed <= 0) return 0.96;
  if (daysPassed >= 30) return 0;
  return IOF_TABLE[daysPassed] !== undefined ? IOF_TABLE[daysPassed] : 0;
}

function getIRRate(daysPassed: number): number {
  if (daysPassed <= 180) return 0.225; // 22,5%
  if (daysPassed <= 360) return 0.200; // 20,0%
  if (daysPassed <= 720) return 0.175; // 17,5%
  return 0.150; // 15,0%
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: any = {};
    if (req.method === 'POST') {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
    }

    // 1. Busca dados do Banco Central (Série 12 - CDI Diária)
    // https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/60?formato=json
    let cdiList: Array<{ data: string; valor: string }> = [];
    try {
      const bcbRes = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/60?formato=json', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (bcbRes.ok) {
        cdiList = await bcbRes.json();
      }
    } catch (fetchErr) {
      console.warn('⚠️ Falha ao obter dados do BCB diretamente:', fetchErr);
    }

    // Fallback razoável se o BCB estiver indisponível no momento
    const latestCdiDaily = cdiList.length > 0
      ? parseFloat(cdiList[cdiList.length - 1].valor)
      : 0.040169; // ~10.65% a.a.

    const cdiAnnualized = (Math.pow(1 + (latestCdiDaily / 100), 252) - 1) * 100;

    // 2. Se for solicitado cálculo de rendimento por aportes
    if (body.deposits && Array.isArray(body.deposits)) {
      const cdiPct = parseFloat(body.cdi_percent) || 100; // Ex: 100% do CDI
      const today = new Date();

      let totalDeposited = 0;
      let totalGrossYield = 0;
      let totalIOF = 0;
      let totalIR = 0;
      let totalNetYield = 0;

      const calculatedDeposits = body.deposits.map((dep: any) => {
        const amount = parseFloat(dep.amount) || 0;
        const depDate = dep.deposit_date ? new Date(dep.deposit_date + 'T12:00:00') : today;
        const diffDays = Math.max(0, Math.floor((today.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24)));
        const workDays = Math.floor(diffDays * (252 / 365));

        // Taxa acumulada estimada com base no CDI anualizado
        const ratePerDay = (latestCdiDaily / 100) * (cdiPct / 100);
        const factor = Math.pow(1 + ratePerDay, workDays) - 1;
        const grossYield = Math.max(0, Math.round(amount * factor * 100) / 100);

        const iofRate = getIOFRate(diffDays);
        const iof = Math.round(grossYield * iofRate * 100) / 100;

        const baseForIR = Math.max(0, grossYield - iof);
        const irRate = getIRRate(diffDays);
        const ir = Math.round(baseForIR * irRate * 100) / 100;

        const netYield = Math.max(0, grossYield - iof - ir);
        const totalGross = amount + grossYield;
        const totalNet = amount + netYield;

        totalDeposited += amount;
        totalGrossYield += grossYield;
        totalIOF += iof;
        totalIR += ir;
        totalNetYield += netYield;

        return {
          id: dep.id,
          amount,
          deposit_date: dep.deposit_date,
          days_passed: diffDays,
          work_days: workDays,
          gross_yield: grossYield,
          iof_tax: iof,
          ir_tax: ir,
          net_yield: netYield,
          total_gross: totalGross,
          total_net: totalNet
        };
      });

      return new Response(JSON.stringify({
        success: true,
        cdi: {
          daily_rate: latestCdiDaily,
          annualized_rate: Math.round(cdiAnnualized * 100) / 100,
          cdi_percent_applied: cdiPct
        },
        summary: {
          total_deposited: totalDeposited,
          total_gross_yield: totalGrossYield,
          total_iof: totalIOF,
          total_ir: totalIR,
          total_net_yield: totalNetYield,
          total_gross_amount: totalDeposited + totalGrossYield,
          total_net_amount: totalDeposited + totalNetYield
        },
        deposits: calculatedDeposits
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Retorno simples de taxa
    return new Response(JSON.stringify({
      success: true,
      cdi: {
        daily_rate: latestCdiDaily,
        annualized_rate: Math.round(cdiAnnualized * 100) / 100,
        history: cdiList.slice(-10)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Erro na edge function get-cdi:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || 'Erro ao processar CDI'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
