// ==========================================================================
// TONUCONTROLE - BASE DE DADOS DE CNPJs DA B3 (Ações, FIIs e ETFs)
// Arquivo: js/data/cnpj-base.js
// Base cadastral com Razão Social e CNPJ dos ativos mais negociados na B3
// Padrão oficial exigido pela Receita Federal na Declaração de Ajuste Anual (IRPF)
// ==========================================================================

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const data = factory();
        root.TONU_CNPJ_BASE = data;
        if (typeof window !== 'undefined') {
            window.TONU_CNPJ_BASE = data;
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CNPJ_BASE = {
        // =====================================================================
        // AÇÕES (Grupo 03 - Participações Societárias)
        // =====================================================================
        "PETR4": { name: "PETROLEO BRASILEIRO S.A. PETROBRAS", cnpj: "33.000.167/0001-01" },
        "PETR3": { name: "PETROLEO BRASILEIRO S.A. PETROBRAS", cnpj: "33.000.167/0001-01" },
        "VALE3": { name: "VALE S.A.", cnpj: "33.592.510/0001-54" },
        "ITUB4": { name: "ITAU UNIBANCO HOLDING S.A.", cnpj: "60.872.504/0001-23" },
        "ITUB3": { name: "ITAU UNIBANCO HOLDING S.A.", cnpj: "60.872.504/0001-23" },
        "BBDC4": { name: "BANCO BRADESCO S.A.", cnpj: "60.746.948/0001-12" },
        "BBDC3": { name: "BANCO BRADESCO S.A.", cnpj: "60.746.948/0001-12" },
        "BBAS3": { name: "BANCO DO BRASIL S.A.", cnpj: "00.000.000/0001-91" },
        "BBSE3": { name: "BB SEGURIDADE PARTICIPACOES S.A.", cnpj: "17.344.597/0001-94" },
        "ABEV3": { name: "AMBEV S.A.", cnpj: "07.526.557/0001-00" },
        "WEGE3": { name: "WEG S.A.", cnpj: "84.429.695/0001-11" },
        "MGLU3": { name: "MAGAZINE LUIZA S.A.", cnpj: "47.960.950/0001-21" },
        "B3SA3": { name: "B3 S.A. - BRASIL, BOLSA, BALCAO", cnpj: "09.346.601/0001-25" },
        "ELET3": { name: "CENTRAIS ELETRICAS BRASILEIRAS S.A. - ELETROBRAS", cnpj: "00.001.180/0001-26" },
        "ELET6": { name: "CENTRAIS ELETRICAS BRASILEIRAS S.A. - ELETROBRAS", cnpj: "00.001.180/0001-26" },
        "RENT3": { name: "LOCALIZA RENT A CAR S.A.", cnpj: "16.670.085/0001-55" },
        "SUZB3": { name: "SUZANO S.A.", cnpj: "16.404.287/0001-55" },
        "JBSS3": { name: "JBS S.A.", cnpj: "02.916.265/0001-00" },
        "EMBR3": { name: "EMBRAER S.A.", cnpj: "07.689.002/0001-89" },
        "GGBR4": { name: "GERDAU S.A.", cnpj: "33.611.500/0001-19" },
        "GGBR3": { name: "GERDAU S.A.", cnpj: "33.611.500/0001-19" },
        "GOAU4": { name: "METALURGICA GERDAU S.A.", cnpj: "92.690.783/0001-09" },
        "CSNA3": { name: "COMPANHIA SIDERURGICA NACIONAL", cnpj: "33.042.730/0001-04" },
        "PRIO3": { name: "PRIO S.A.", cnpj: "10.744.358/0001-06" },
        "CPLE6": { name: "COMPANHIA PARANAENSE DE ENERGIA - COPEL", cnpj: "76.483.817/0001-20" },
        "CMIG4": { name: "COMPANHIA ENERGETICA DE MINAS GERAIS - CEMIG", cnpj: "17.155.730/0001-64" },
        "TAEE11": { name: "TRANSMISSORA ALIANCA DE ENERGIA ELETRICA S.A. - TAESA", cnpj: "07.859.971/0001-30" },
        "TAEE4": { name: "TRANSMISSORA ALIANCA DE ENERGIA ELETRICA S.A. - TAESA", cnpj: "07.859.971/0001-30" },
        "EGIE3": { name: "ENGIE BRASIL ENERGIA S.A.", cnpj: "02.474.103/0001-19" },
        "CPFE3": { name: "CPFL ENERGIA S.A.", cnpj: "02.429.144/0001-93" },
        "EQTL3": { name: "EQUATORIAL ENERGIA S.A.", cnpj: "03.220.438/0001-73" },
        "ENEV3": { name: "ENEVA S.A.", cnpj: "04.423.567/0001-85" },
        "VIVT3": { name: "TELEFONICA BRASIL S.A.", cnpj: "02.558.157/0001-62" },
        "TIMS3": { name: "TIM S.A.", cnpj: "02.421.421/0001-11" },
        "SANB11": { name: "BANCO SANTANDER (BRASIL) S.A.", cnpj: "90.400.888/0001-42" },
        "BPAC11": { name: "BANCO BTG PACTUAL S.A.", cnpj: "30.306.294/0001-45" },
        "ITSA4": { name: "ITAUSA S.A.", cnpj: "61.532.644/0001-15" },
        "ITSA3": { name: "ITAUSA S.A.", cnpj: "61.532.644/0001-15" },
        "KLBN11": { name: "KLABIN S.A.", cnpj: "89.637.490/0001-45" },
        "RADL3": { name: "RAIA DROGASIL S.A.", cnpj: "61.585.865/0001-51" },
        "CRFB3": { name: "ATACADAO S.A.", cnpj: "75.315.333/0001-09" },
        "ASAI3": { name: "SENDAS DISTRIBUIDORA S.A.", cnpj: "06.057.223/0001-71" },
        "LREN3": { name: "LOJAS RENNER S.A.", cnpj: "92.754.738/0001-62" },
        "VBBR3": { name: "VIBRA ENERGIA S.A.", cnpj: "34.274.233/0001-02" },
        "CSAN3": { name: "COSAN S.A.", cnpj: "50.746.577/0001-15" },
        "CCRO3": { name: "CCR S.A.", cnpj: "02.846.056/0001-97" },
        "RAIL3": { name: "RUMO S.A.", cnpj: "13.555.275/0001-98" },
        "BEEF3": { name: "MINERVA S.A.", cnpj: "67.620.377/0001-14" },
        "MRFG3": { name: "MARFRIG GLOBAL FOODS S.A.", cnpj: "03.853.896/0001-40" },
        "BRFS3": { name: "BRF S.A.", cnpj: "01.838.723/0001-27" },
        "MULT3": { name: "MULTIPLAN EMPREENDIMENTOS IMOBILIARIOS S.A.", cnpj: "07.816.890/0001-53" },
        "CYRE3": { name: "CYRELA BRAZIL REALTY S.A.", cnpj: "73.178.600/0001-18" },
        "BRKM5": { name: "BRASKEM S.A.", cnpj: "42.150.391/0001-70" },
        "USIM5": { name: "USINAS SIDERURGICAS DE MINAS GERAIS S.A. - USIMINAS", cnpj: "60.870.004/0001-40" },
        "COGN3": { name: "COGNA EDUCACAO S.A.", cnpj: "03.018.845/0001-61" },
        "YDUQ3": { name: "YDUQS PARTICIPACOES S.A.", cnpj: "08.801.079/0001-71" },
        "HAPV3": { name: "HAPVIDA PARTICIPACOES E INVESTIMENTOS S.A.", cnpj: "05.814.877/0001-20" },
        "RDOR3": { name: "REDE D'OR SAO LUIZ S.A.", cnpj: "06.047.087/0001-39" },
        "TOTS3": { name: "TOTVS S.A.", cnpj: "53.113.791/0001-22" },
        "UGPA3": { name: "ULTRAPAR PARTICIPACOES S.A.", cnpj: "33.256.439/0001-39" },
        "SBSP3": { name: "CIA SANEAMENTO BASICO ESTADO DE SAO PAULO - SABESP", cnpj: "43.776.517/0001-80" },
        "ALOS3": { name: "ALLOS S.A.", cnpj: "08.431.747/0001-98" },

        // =====================================================================
        // FUNDOS IMOBILIÁRIOS - FIIs (Grupo 04 - Fundos)
        // =====================================================================
        "MXRF11": { name: "MAXI RENDA FUNDO DE INVESTIMENTO IMOBILIARIO", cnpj: "09.732.181/0001-23" },
        "HGLG11": { name: "CSHG LOGISTICA FUNDO DE INVESTIMENTO IMOBILIARIO", cnpj: "11.728.688/0001-47" },
        "VGHF11": { name: "VALORA HEDGE FUND FII", cnpj: "36.877.064/0001-88" },
        "KNRI11": { name: "KINEA RENDA IMOBILIARIA FII", cnpj: "12.005.956/0001-65" },
        "XPML11": { name: "XP MALLS FII", cnpj: "28.757.546/0001-00" },
        "KNCR11": { name: "KINEA RENDIMENTOS IMOBILIARIOS FII", cnpj: "16.706.958/0001-32" },
        "KNSC11": { name: "KINEA SECURITIES FII", cnpj: "35.864.448/0001-00" },
        "CPTS11": { name: "CAPITANIA SECURITIES II FII", cnpj: "18.979.895/0001-13" },
        "VISC11": { name: "VINCI SHOPPING CENTERS FII", cnpj: "17.554.274/0001-25" },
        "BTLG11": { name: "BTG PACTUAL LOGISTICA FII", cnpj: "11.839.593/0001-09" },
        "XPLG11": { name: "XP LOG FII", cnpj: "26.502.794/0001-85" },
        "GGRC11": { name: "GGR COVEPI RENDA FII", cnpj: "26.614.485/0001-13" },
        "RBRR11": { name: "RBR RENDIMENTO HIGH GRADE FII", cnpj: "30.126.925/0001-52" },
        "TGAR11": { name: "TG ATIVO REAL FII", cnpj: "25.032.881/0001-53" },
        "VGIR11": { name: "VALORA RE III FII", cnpj: "30.126.377/0001-92" },
        "RECR11": { name: "REC RECEBIVEIS IMOBILIARIOS FII", cnpj: "28.172.969/0001-42" },
        "HGRU11": { name: "CSHG RENDA URBANA FII", cnpj: "29.641.226/0001-53" },
        "HGBS11": { name: "HEDGE BRASIL SHOPPING FII", cnpj: "08.431.747/0001-98" },
        "RZTR11": { name: "RIZA TERRAX FII", cnpj: "37.198.006/0001-40" },
        "BCFF11": { name: "BTG PACTUAL FUNDO DE FUNDOS FII", cnpj: "11.026.627/0001-42" },
        "HFOF11": { name: "HEDGE TOP FOFII 3 FII", cnpj: "29.742.664/0001-76" },
        "VGIA11": { name: "VALORA CRA FIAGRO", cnpj: "41.765.736/0001-25" },
        "KNCA11": { name: "KINEA CREDITO AGRO FIAGRO", cnpj: "44.423.834/0001-03" },
        "RURA11": { name: "ITAU ASSET RURAL FIAGRO", cnpj: "43.606.337/0001-29" },

        // =====================================================================
        // ETFs (Grupo 07 - Fundos de Índices)
        // =====================================================================
        "BOVA11": { name: "ISHARES IBOVESPA FUNDO DE INDICE", cnpj: "10.406.590/0001-06" },
        "SMAL11": { name: "ISHARES BM&FBOVESPA SMALL CAP FUNDO DE INDICE", cnpj: "09.529.697/0001-40" },
        "IVVB11": { name: "ISHARES S&P 500 FUNDO DE INDICE", cnpj: "19.909.308/0001-17" }
    };

    return CNPJ_BASE;
}));
