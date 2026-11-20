// ============================================
// TONUCONTROLE - SECURE EXPRESS SERVER
// ============================================

try {
    require('dotenv').config();
} catch (e) {
    // dotenv is optional if env vars are already loaded in environment
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const archiverModule = require('archiver');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI, ThinkingLevel, Type } = require('@google/genai');
const { generateNonceMiddleware, createHelmetMiddleware, injectNonceIntoHtml } = require('./security-headers');

function createZipArchive(options = {}) {
    if (typeof archiverModule === 'function') {
        return archiverModule('zip', options);
    }
    if (archiverModule.ZipArchive) {
        return new archiverModule.ZipArchive(options);
    }
    if (archiverModule.default && typeof archiverModule.default === 'function') {
        return archiverModule.default('zip', options);
    }
    throw new Error('Módulo archiver não suportado');
}

const app = express();

// Habilita confiança no proxy reverso do Google AI Studio / Cloud Run
app.set('trust proxy', 1);

// A porta 3000 é estritamente exigida pelo ambiente e proxy do Google AI Studio.
const PRIMARY_PORT = 3000;
const ALT_PORT = (process.env.PORT && parseInt(process.env.PORT, 10) !== 3000)
    ? parseInt(process.env.PORT, 10)
    : null;
const PORT = PRIMARY_PORT;
const ROOT_DIR = __dirname;

// ============================================
// 1. CABEÇALHOS DE SEGURANÇA E CSP (HELMET + NONCE)
// ============================================
// Middleware para gerar nonce criptográfico único por requisição
app.use(generateNonceMiddleware);

// Middleware Helmet com política CSP estrita vinculada ao nonce por request
app.use(createHelmetMiddleware());

// ============================================
// 2. LIMITADOR DE REQUISIÇÕES (RATE LIMITING)
// ============================================
// Limite global para navegação e chamadas de API
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Janela de 15 minutos
    max: 1500, // Limite seguro para requisições por IP
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        error: 'Muitas requisições deste IP. Por favor, tente novamente em alguns instantes.'
    }
});
app.use(globalLimiter);

// Limite restritivo para operações pesadas (download do ZIP)
const zipDownloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: {
        error: 'Limite de downloads de código-fonte atingido. Aguarde alguns minutos.'
    }
});

// Middlewares essenciais
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
}

// ============================================
// 3. DEFESA EM PROFUNDIDADE: BLOQUEIO DE ARQUIVOS SENSÍVEIS
// ============================================
// Impede qualquer tentativa direta de ler variáveis de ambiente, código de servidor,
// dependências ou arquivos de configuração do sistema.
app.use((req, res, next) => {
    let decodedPath = '';
    try {
        decodedPath = decodeURIComponent(req.path).toLowerCase();
    } catch {
        return res.status(400).send('Caminho de requisição malformado.');
    }

    const sensitivePatterns = [
        '.env',
        '.git',
        'package.json',
        'package-lock.json',
        'bun.lock',
        'metadata.json',
        'server.js',
        'node_modules',
        'tests/',
        'scripts/',
        '.ds_store'
    ];

    const isSensitive = sensitivePatterns.some(pattern => decodedPath.includes(pattern));
    if (isSensitive) {
        return res.status(403).json({
            error: 'Acesso proibido a arquivos internos e protegidos do sistema.'
        });
    }

    next();
});

// ============================================
// 4. ROTAS DE API
// ============================================

const DEFAULT_SUPABASE_URL = 'https://rbtxrbacdpenbslqcbbl.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHhyYmFjZHBlbmJzbHFjYmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MDA5MjksImV4cCI6MjEwMTk3NjkyOX0.VDmJ-pty8oLzkgEad4WBpk7leR9ZR-b_bXXUE3HkPcM';

// Configuração pública do cliente (Variáveis de ambiente controladas)
app.get(['/api/config', '/tonucontrole/api/config'], (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    const brapiToken = process.env.BRAPI_TOKEN;

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({
        supabaseUrl,
        supabaseAnonKey,
        brapiToken: brapiToken || ''
    });
});

// Health check
app.get(['/api/health', '/tonucontrole/api/health'], (req, res) => {
    res.json({
        status: 'ok',
        app: 'TonuControle',
        version: '2.1.0',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// CATEGORIZAÇÃO AUTOMÁTICA POR IA (MVP - HORIZONTE 2)
// ============================================
const AI_ALLOWED_CATEGORIES = [
    'Alimentação',
    'Transporte',
    'Moradia',
    'Saúde',
    'Educação',
    'Lazer',
    'Assinaturas',
    'Compras',
    'Salário',
    'Investimentos',
    'Outros'
];
const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const AI_CACHE_MAX_ENTRIES = 5000;
const AI_DAILY_USER_LIMIT = 50;
const AI_REQUEST_TIMEOUT_MS = 10000;
const AI_INSIGHTS_REQUEST_TIMEOUT_MS = 18000;

const aiClassifyCache = new Map();
const aiDailyRateLimit = new Map();

let geminiClientInstance = null;
let geminiClientApiKey = '';

function getGeminiClient() {
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return null;
    if (!geminiClientInstance || geminiClientApiKey !== apiKey) {
        geminiClientInstance = new GoogleGenAI({
            apiKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });
        geminiClientApiKey = apiKey;
    }
    return geminiClientInstance;
}

function stripDiacriticsLower(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeAiCategory(rawText) {
    if (!rawText) return null;
    const cleaned = String(rawText)
        .replace(/[\r\n`*_"'.:;-]+/g, ' ')
        .trim();
    if (!cleaned) return null;

    const normalizedRaw = stripDiacriticsLower(cleaned);

    for (const cat of AI_ALLOWED_CATEGORIES) {
        if (stripDiacriticsLower(cat) === normalizedRaw) {
            return cat;
        }
    }
    for (const cat of AI_ALLOWED_CATEGORIES) {
        const normCat = stripDiacriticsLower(cat);
        if (normalizedRaw.includes(normCat) || normCat.includes(normalizedRaw)) {
            return cat;
        }
    }
    return null;
}

function extractBearerUser(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) return null;

    const token = match[1].trim();
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

    try {
        const headerJson = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payloadJson = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (!headerJson || typeof headerJson !== 'object' || !payloadJson || typeof payloadJson !== 'object') {
            return null;
        }
        const userId = payloadJson.sub || payloadJson.user_id || payloadJson.id;
        if (!userId || typeof userId !== 'string' || !userId.trim()) {
            return null;
        }
        if (typeof payloadJson.exp === 'number' && payloadJson.exp * 1000 <= Date.now()) {
            return null;
        }
        return { userId: userId.trim(), token };
    } catch {
        return null;
    }
}

function hashUserForLog(userId) {
    return crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8);
}

function getUtcDateKey() {
    return new Date().toISOString().slice(0, 10);
}

function consumeDailyAiQuota(userId) {
    const today = getUtcDateKey();
    let entry = aiDailyRateLimit.get(userId);
    if (!entry || entry.date !== today) {
        entry = { date: today, count: 0 };
        aiDailyRateLimit.set(userId, entry);
    }
    if (entry.count >= AI_DAILY_USER_LIMIT) {
        return { allowed: false, remaining: 0 };
    }
    entry.count += 1;
    return { allowed: true, remaining: AI_DAILY_USER_LIMIT - entry.count };
}

function setAiCache(key, category) {
    if (aiClassifyCache.size >= AI_CACHE_MAX_ENTRIES) {
        const oldestKey = aiClassifyCache.keys().next().value;
        if (oldestKey !== undefined) {
            aiClassifyCache.delete(oldestKey);
        }
    }
    aiClassifyCache.set(key, { category, ts: Date.now() });
}

app.get(['/api/ai-health', '/tonucontrole/api/ai-health'], (req, res) => {
    const now = Date.now();
    for (const [k, v] of aiClassifyCache.entries()) {
        if (now - v.ts >= AI_CACHE_TTL_MS) {
            aiClassifyCache.delete(k);
        }
    }
    return res.json({
        status: 'ok',
        cache_size: aiClassifyCache.size,
        gemini_configured: Boolean(String(process.env.GEMINI_API_KEY || '').trim())
    });
});

app.post(['/api/classify', '/tonucontrole/api/classify'], async (req, res) => {
    const startMs = Date.now();
    const authUser = extractBearerUser(req.headers.authorization);
    if (!authUser) {
        return res.status(401).json({ error: 'Token de autenticação inválido ou ausente.', category: null });
    }

    const userHash = hashUserForLog(authUser.userId);
    const rawDescription = String(req.body?.description || '').trim();
    if (!rawDescription || rawDescription.length < 2) {
        return res.status(400).json({ error: 'Descrição deve ter pelo menos 2 caracteres.', category: null });
    }

    const normalizedKey = rawDescription.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
    const cached = aiClassifyCache.get(normalizedKey);
    if (cached && (Date.now() - cached.ts < AI_CACHE_TTL_MS)) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-classify] user=${userHash} source=cache ms=${Date.now() - startMs}`);
        }
        return res.json({ category: cached.category, source: 'cache' });
    }

    const quota = consumeDailyAiQuota(authUser.userId);
    if (!quota.allowed) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-classify] user=${userHash} source=rate_limit ms=${Date.now() - startMs}`);
        }
        return res.json({ category: null, reason: 'rate_limit' });
    }

    const ai = getGeminiClient();
    if (!ai) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-classify] user=${userHash} source=degraded ms=${Date.now() - startMs}`);
        }
        return res.json({ category: null, gemini_configured: false });
    }

    let timeoutHandle = null;
    try {
        const promptText =
            `Classifique esta transação financeira brasileira em exatamente UMA das categorias permitidas: ` +
            `${AI_ALLOWED_CATEGORIES.join(', ')}.\n` +
            `Descrição: "${rawDescription.slice(0, 120)}"\n` +
            `Responda apenas com o nome exato da categoria.`;

        const geminiPromise = ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: promptText,
            config: {
                systemInstruction: 'Você é um classificador financeiro brasileiro. Responda exclusivamente com uma única categoria exata da lista fornecida, sem explicações.',
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                abortSignal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)
            }
        });

        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_REQUEST_TIMEOUT_MS);
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const category = normalizeAiCategory(response?.text);

        if (category) {
            setAiCache(normalizedKey, category);
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[ai-classify] user=${userHash} source=ai ms=${Date.now() - startMs}`);
            }
            return res.json({ category, source: 'ai' });
        }

        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-classify] user=${userHash} source=empty ms=${Date.now() - startMs}`);
        }
        return res.json({ category: null });
    } catch (err) {
        const reason = err?.message === 'AI_TIMEOUT' ? 'timeout' : 'error';
        if (process.env.NODE_ENV !== 'test') {
            console.warn(`[ai-classify] user=${userHash} source=${reason} ms=${Date.now() - startMs}`);
        }
        return res.json({ category: null });
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
});

// ============================================
// INSIGHTS FINANCEIROS POR IA (HORIZONTE 2 - ITEM 2)
// ============================================
const AI_INSIGHTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const AI_INSIGHTS_CACHE_MAX_ENTRIES = 2000;
const AI_INSIGHTS_DAILY_LIMIT = 30;
const AI_INSIGHTS_ALLOWED_TYPES = new Set(['warning', 'success', 'info']);
const AI_INSIGHTS_FALLBACK = [
    { type: 'info', text: 'Continue registrando transações para insights personalizados.' }
];

const aiInsightsCache = new Map();
const aiInsightsDailyRateLimit = new Map();

function consumeDailyInsightsQuota(userId) {
    const today = getUtcDateKey();
    let entry = aiInsightsDailyRateLimit.get(userId);
    if (!entry || entry.date !== today) {
        entry = { date: today, count: 0 };
        aiInsightsDailyRateLimit.set(userId, entry);
    }
    if (entry.count >= AI_INSIGHTS_DAILY_LIMIT) {
        return { allowed: false, remaining: 0 };
    }
    entry.count += 1;
    return { allowed: true, remaining: AI_INSIGHTS_DAILY_LIMIT - entry.count };
}

function setAiInsightsCache(userId, insights, generatedAt) {
    if (aiInsightsCache.size >= AI_INSIGHTS_CACHE_MAX_ENTRIES) {
        const oldestKey = aiInsightsCache.keys().next().value;
        if (oldestKey !== undefined) {
            aiInsightsCache.delete(oldestKey);
        }
    }
    aiInsightsCache.set(userId, {
        insights,
        generated_at: generatedAt,
        ts: Date.now()
    });
}

async function fetchSupabaseRestTable(url, headers) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

async function fetchUserFinancialSummary(userId, userJwt) {
    const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
    const apiKey = serviceRoleKey || anonKey;
    const authToken = serviceRoleKey || userJwt || anonKey;

    const headers = {
        apikey: apiKey,
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json'
    };

    const start90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const encodedUid = encodeURIComponent(userId);

    const txUrl = `${supabaseUrl}/rest/v1/transactions?select=amount,type,category,category_id,date,paid&user_id=eq.${encodedUid}&date=gte.${start90d}&order=date.desc&limit=500`;
    const goalsUrl = `${supabaseUrl}/rest/v1/goals?select=title,current_amount,target_amount,completed&user_id=eq.${encodedUid}&limit=100`;
    const catsUrl = `${supabaseUrl}/rest/v1/categories?select=id,name&user_id=eq.${encodedUid}&limit=100`;

    const [transactions, goals, categories] = await Promise.all([
        fetchSupabaseRestTable(txUrl, headers),
        fetchSupabaseRestTable(goalsUrl, headers),
        fetchSupabaseRestTable(catsUrl, headers)
    ]);

    const categoryMapById = new Map();
    categories.forEach(c => {
        if (c && c.id && c.name) {
            categoryMapById.set(String(c.id), String(c.name).trim());
        }
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = new Map();

    transactions.forEach(t => {
        if (!t) return;
        const amt = Math.abs(Number(t.amount || 0));
        if (!Number.isFinite(amt) || amt <= 0) return;

        if (t.type === 'income') {
            totalIncome += amt;
        } else if (t.type === 'expense') {
            totalExpense += amt;
            const catName =
                (t.category && String(t.category).trim()) ||
                (t.category_id && categoryMapById.get(String(t.category_id))) ||
                'Outros';
            categoryTotals.set(catName, (categoryTotals.get(catName) || 0) + amt);
        }
    });

    const topCategories = Array.from(categoryTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([category, total]) => ({
            category: category.slice(0, 40),
            total: Math.round(total * 100) / 100,
            pct: totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0
        }));

    const goalsProgress = goals.slice(0, 5).map(g => {
        const cur = Math.max(0, Number(g.current_amount || 0));
        const tgt = Math.max(0, Number(g.target_amount || 0));
        const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : (g.completed ? 100 : 0);
        return {
            title: String(g.title || 'Meta').slice(0, 40),
            current_amount: Math.round(cur * 100) / 100,
            target_amount: Math.round(tgt * 100) / 100,
            progress_pct: pct
        };
    });

    const netBalance = totalIncome - totalExpense;
    const savingsRatePct = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

    return {
        period_days: 90,
        total_income: Math.round(totalIncome * 100) / 100,
        total_expense: Math.round(totalExpense * 100) / 100,
        net_balance: Math.round(netBalance * 100) / 100,
        savings_rate_pct: savingsRatePct,
        transactions_count: transactions.length,
        top_categories: topCategories,
        goals_count: goals.length,
        goals_progress: goalsProgress
    };
}

function parseAiInsightsResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed = null;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                parsed = JSON.parse(jsonMatch[0]);
            } catch {
                parsed = null;
            }
        }
    }

    if (!parsed || !Array.isArray(parsed.insights)) return null;

    const validInsights = parsed.insights
        .filter(item => item && typeof item.text === 'string' && item.text.trim().length > 0)
        .slice(0, 3)
        .map(item => {
            const rawType = String(item.type || 'info').toLowerCase().trim();
            const safeType = AI_INSIGHTS_ALLOWED_TYPES.has(rawType) ? rawType : 'info';
            const cleanText = item.text.replace(/\s+/g, ' ').trim().slice(0, 220);
            return { type: safeType, text: cleanText };
        });

    return validInsights.length > 0 ? validInsights : null;
}

let lastAiInsightsError = null;

function sanitizeAiErrorMessage(err) {
    const raw = String(err?.message || 'Erro desconhecido ao consultar IA.');
    return raw.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]').slice(0, 300);
}

function classifyGeminiError(err) {
    const msg = sanitizeAiErrorMessage(err);
    const statusNum = Number(err?.status || err?.code) || 0;
    const upper = msg.toUpperCase();

    if (err?.message === 'AI_TIMEOUT' || err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return {
            reason: 'timeout',
            httpStatus: 504,
            userMessage: 'A IA demorou para responder. Tente novamente em instantes.',
            rawMessage: msg
        };
    }
    if (statusNum === 400 && (upper.includes('API_KEY_INVALID') || upper.includes('API KEY NOT VALID'))) {
        return {
            reason: 'api_key_invalid',
            httpStatus: 400,
            userMessage: 'Chave da API Gemini inválida no servidor. Verifique as configurações de segredos.',
            rawMessage: msg
        };
    }
    if (statusNum === 403 || upper.includes('PERMISSION_DENIED') || upper.includes('ACCESS_DENIED')) {
        return {
            reason: 'api_key_invalid',
            httpStatus: 403,
            userMessage: 'Acesso negado pela API Gemini. Verifique a chave configurada no servidor.',
            rawMessage: msg
        };
    }
    if (statusNum === 429 || upper.includes('RESOURCE_EXHAUSTED')) {
        return {
            reason: 'quota_exceeded',
            httpStatus: 429,
            userMessage: 'Cota da API Gemini excedida no momento. Tente novamente mais tarde.',
            rawMessage: msg
        };
    }
    if (statusNum === 404 || upper.includes('NOT_FOUND')) {
        return {
            reason: 'model_not_found',
            httpStatus: 502,
            userMessage: 'Modelo de IA indisponível ou não encontrado.',
            rawMessage: msg
        };
    }
    return {
        reason: 'error',
        httpStatus: (statusNum >= 400 && statusNum < 600) ? statusNum : 502,
        userMessage: 'Falha temporária ao gerar insights com IA.',
        rawMessage: msg
    };
}

app.get(['/api/insights-health', '/tonucontrole/api/insights-health'], (req, res) => {
    const now = Date.now();
    for (const [k, v] of aiInsightsCache.entries()) {
        if (now - v.ts >= AI_INSIGHTS_CACHE_TTL_MS) {
            aiInsightsCache.delete(k);
        }
    }
    return res.json({
        status: 'ok',
        cache_size: aiInsightsCache.size,
        gemini_configured: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
        last_error: lastAiInsightsError ? {
            reason: lastAiInsightsError.reason,
            status: lastAiInsightsError.status,
            at: lastAiInsightsError.at
        } : null
    });
});

app.post(['/api/insights', '/tonucontrole/api/insights'], async (req, res) => {
    const startMs = Date.now();
    const authUser = extractBearerUser(req.headers.authorization);
    if (!authUser) {
        return res.status(401).json({ error: 'Token de autenticação inválido ou ausente.', insights: [], reason: 'unauthorized' });
    }

    const userHash = hashUserForLog(authUser.userId);
    const forceRefresh = req.body?.forceRefresh === true;

    if (!forceRefresh) {
        const cached = aiInsightsCache.get(authUser.userId);
        if (cached && (Date.now() - cached.ts < AI_INSIGHTS_CACHE_TTL_MS)) {
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[ai-insights] user=${userHash} source=cache latency_ms=${Date.now() - startMs}`);
            }
            return res.json({
                insights: cached.insights,
                source: 'cache',
                generated_at: cached.generated_at
            });
        }
    }

    const ai = getGeminiClient();
    if (!ai) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-insights] user=${userHash} source=degraded latency_ms=${Date.now() - startMs}`);
        }
        return res.status(503).json({
            insights: [],
            gemini_configured: false,
            reason: 'not_configured',
            error: 'Chave da API Gemini não configurada no servidor.'
        });
    }

    const quota = consumeDailyInsightsQuota(authUser.userId);
    if (!quota.allowed) {
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-insights] user=${userHash} source=rate_limit latency_ms=${Date.now() - startMs}`);
        }
        return res.status(429).json({
            insights: [],
            reason: 'rate_limit',
            error: 'Limite diário de consultas IA atingido.'
        });
    }

    let timeoutHandle = null;
    try {
        const summary = await fetchUserFinancialSummary(authUser.userId, authUser.token);
        const promptText =
            `Analise este resumo financeiro pessoal dos últimos 90 dias: ${JSON.stringify(summary)}. ` +
            `Gere EXATAMENTE 3 insights acionáveis em português brasileiro, específicos aos números, máx 20 palavras cada. ` +
            `Retorne APENAS JSON válido no formato {"insights": [{"type": "warning|success|info", "text": "..."}]}.`;

        const geminiPromise = ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: promptText,
            config: {
                systemInstruction: 'Você é um consultor financeiro pessoal brasileiro objetivo. Responda exclusivamente em JSON válido conforme o esquema, sem markdown.',
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        insights: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    text: { type: Type.STRING }
                                },
                                required: ['type', 'text']
                            }
                        }
                    },
                    required: ['insights']
                },
                abortSignal: AbortSignal.timeout(AI_INSIGHTS_REQUEST_TIMEOUT_MS)
            }
        });

        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_INSIGHTS_REQUEST_TIMEOUT_MS);
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const parsedInsights = parseAiInsightsResponse(response?.text);
        const generatedAt = new Date().toISOString();

        if (parsedInsights) {
            lastAiInsightsError = null;
            setAiInsightsCache(authUser.userId, parsedInsights, generatedAt);
            if (process.env.NODE_ENV !== 'test') {
                console.log(`[ai-insights] user=${userHash} source=ai latency_ms=${Date.now() - startMs}`);
            }
            return res.json({
                insights: parsedInsights,
                source: 'ai',
                generated_at: generatedAt
            });
        }

        if (process.env.NODE_ENV !== 'test') {
            console.log(`[ai-insights] user=${userHash} source=fallback latency_ms=${Date.now() - startMs}`);
        }
        return res.json({
            insights: AI_INSIGHTS_FALLBACK,
            source: 'fallback',
            generated_at: generatedAt
        });
    } catch (err) {
        const classified = classifyGeminiError(err);
        // Não consome cota diária quando falha por erro de configuração/chave
        if (classified.reason === 'api_key_invalid') {
            const entry = aiInsightsDailyRateLimit.get(authUser.userId);
            if (entry && entry.count > 0) entry.count -= 1;
        }
        lastAiInsightsError = {
            reason: classified.reason,
            status: classified.httpStatus,
            message: classified.rawMessage,
            at: new Date().toISOString()
        };
        if (process.env.NODE_ENV !== 'test') {
            console.error('[insights] Gemini falhou:', {
                reason: classified.reason,
                error: classified.rawMessage,
                errorName: err?.name,
                errorStatus: classified.httpStatus,
                model: 'gemini-4-hydrogen',
                user: userHash,
                latency_ms: Date.now() - startMs
            });
            console.warn(`[ai-insights] user=${userHash} source=${classified.reason} latency_ms=${Date.now() - startMs}`);
        }
        return res.status(classified.httpStatus).json({
            insights: [],
            reason: classified.reason,
            error_status: classified.httpStatus,
            error: classified.userMessage
        });
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
});

// ============================================
// ENDPOINT DE LOG DE VIOLAÇÕES CSP
// ============================================
// Endpoint para captura e auditoria de violações de Content Security Policy
app.post(['/api/csp-report', '/tonucontrole/api/csp-report'], express.json({ type: ['application/json', 'application/csp-report', 'text/plain'] }), (req, res) => {
    const report = req.body?.['csp-report'] || req.body || {};
    const blockedUri = report['blocked-uri'] || report.blockedURI || 'desconhecido';
    const violatedDirective = report['violated-directive'] || report.violatedDirective || 'geral';
    const documentUri = report['document-uri'] || report.documentURI || 'desconhecido';

    if (process.env.NODE_ENV !== 'test') {
        console.warn(`🛡️ [CSP VIOLATION] Diretiva: "${violatedDirective}" | Bloqueado: "${blockedUri}" | Página: "${documentUri}"`);
    }

    // Responde com 204 No Content conforme especificação de CSP reporting
    return res.status(204).end();
});

// ============================================
// COTAÇÕES HISTÓRICAS MENSAIS (INVESTIDOR 10 STYLE)
// ============================================
const historicalQuotesCache = new Map();
const HISTORICAL_CACHE_TTL = 60 * 60 * 1000; // 1 hora de cache

function parseChartMonthlyPrices(chart) {
    const timestamps = chart.timestamp || [];
    const closes = chart.indicators?.quote?.[0]?.close || [];
    const monthlyPrices = {};

    timestamps.forEach((ts, idx) => {
        const price = closes[idx];
        if (price !== null && price !== undefined && Number.isFinite(price) && price > 0) {
            const d = new Date(ts * 1000);
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const monthKey = `${year}-${month}`;
            monthlyPrices[monthKey] = Math.round(price * 100) / 100;
        }
    });
    return monthlyPrices;
}

app.get(['/api/historical-quotes', '/tonucontrole/api/historical-quotes'], async (req, res) => {
    try {
        const tickersParam = req.query.tickers || '';
        if (!tickersParam) {
            return res.json({ quotes: {} });
        }

        const tickers = tickersParam.split(',')
            .map(t => t.trim().toUpperCase())
            .filter(Boolean);

        const result = {};
        const now = Date.now();

        await Promise.all(tickers.map(async (rawTicker) => {
            const cleanTicker = rawTicker.replace(/\.SA$/, '');
            const cacheKey = cleanTicker;

            const cached = historicalQuotesCache.get(cacheKey);
            if (cached && (now - cached.timestamp < HISTORICAL_CACHE_TTL)) {
                result[cleanTicker] = cached.data;
                result[`${cleanTicker}.SA`] = cached.data;
                return;
            }

            const saTicker = `${cleanTicker}.SA`;
            try {
                const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(saTicker)}?range=2y&interval=1mo`;
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    signal: AbortSignal.timeout(6000)
                });

                if (!response.ok) {
                    const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=2y&interval=1mo`;
                    const fbRes = await fetch(fallbackUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                        signal: AbortSignal.timeout(6000)
                    });
                    if (!fbRes.ok) return;
                    const fbData = await fbRes.json();
                    const fbChart = fbData.chart?.result?.[0];
                    if (fbChart) {
                        const monthlyPrices = parseChartMonthlyPrices(fbChart);
                        historicalQuotesCache.set(cacheKey, { timestamp: now, data: monthlyPrices });
                        result[cleanTicker] = monthlyPrices;
                        result[saTicker] = monthlyPrices;
                    }
                    return;
                }

                const data = await response.json();
                const chart = data.chart?.result?.[0];
                if (chart) {
                    const monthlyPrices = parseChartMonthlyPrices(chart);
                    historicalQuotesCache.set(cacheKey, { timestamp: now, data: monthlyPrices });
                    result[cleanTicker] = monthlyPrices;
                    result[saTicker] = monthlyPrices;
                }
            } catch (err) {
                console.warn(`[historical-quotes] Aviso ao buscar ${cleanTicker}:`, err.message);
            }
        }));

        res.json({ quotes: result });
    } catch (error) {
        console.error('Erro em /api/historical-quotes:', error);
        res.status(500).json({ error: 'Erro ao consultar cotações históricas' });
    }
});

// Download do código-fonte (ZIP Seguro)
app.get(['/api/download-zip', '/tonucontrole/api/download-zip'], zipDownloadLimiter, (req, res) => {
    const zipFileName = 'tonucontrole-source-code.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = createZipArchive({
        zlib: { level: 9 }
    });

    archive.on('error', (err) => {
        console.error('Erro ao gerar arquivo ZIP:', err);
        if (!res.headersSent) {
            res.status(500).send({ error: err.message });
        }
    });

    archive.pipe(res);

    // Adiciona arquivos do projeto garantindo exclusão absoluta de credenciais e logs
    archive.glob('**/*', {
        cwd: ROOT_DIR,
        ignore: [
            'node_modules/**',
            '.git/**',
            'dist/**',
            '*.zip',
            '.DS_Store',
            '.env*',
            '*.env',
            'env.example',
            '.env.example',
            '*.log',
            '*.pem',
            '*.key',
            '*.crt',
            'coverage/**',
            '.vscode/**',
            '.idea/**',
            'tmp/**',
            'temp/**',
            'metadata.json'
        ]
    });

    archive.finalize();
});

// ============================================
// 5. SERVIÇO ESTRUTURADO DE ASSETS PÚBLICOS
// ============================================
// Serve estritamente pastas públicas, nunca a raiz do projeto.
const staticOptions = {
    dotfiles: 'ignore',
    index: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
};

app.use('/css', express.static(path.join(ROOT_DIR, 'css'), staticOptions));
app.use('/js', express.static(path.join(ROOT_DIR, 'js'), staticOptions));
app.use('/icons', express.static(path.join(ROOT_DIR, 'icons'), staticOptions));

// Suporte ao alias legado /tonucontrole/*
app.use('/tonucontrole/css', express.static(path.join(ROOT_DIR, 'css'), staticOptions));
app.use('/tonucontrole/js', express.static(path.join(ROOT_DIR, 'js'), staticOptions));
app.use('/tonucontrole/icons', express.static(path.join(ROOT_DIR, 'icons'), staticOptions));

// Manifest PWA e Service Worker
app.get(['/manifest.json', '/tonucontrole/manifest.json'], (req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'manifest.json'));
});

app.get(['/sw.js', '/tonucontrole/sw.js'], (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(ROOT_DIR, 'sw.js'));
});

// ============================================
// 6. RENDERIZAÇÃO SEGURA DE PÁGINAS E INJEÇÃO DE CONFIGURAÇÃO COM NONCE
// ============================================

function getClientConfigScript(nonce) {
    const config = {
        supabaseUrl: process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
        brapiToken: process.env.BRAPI_TOKEN || ''
    };
    const sanitizedJson = JSON.stringify(config).replace(/</g, '\\u003c');
    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
    return `<script${nonceAttr}>window.__TONU_CONFIG__ = ${sanitizedJson};</script>`;
}

function sendHtmlWithConfig(req, res, filePath) {
    try {
        let html = fs.readFileSync(filePath, 'utf8');
        const nonce = res.locals?.cspNonce || '';

        // 1. Injeta a configuração global do cliente preservando o window.__TONU_CONFIG__
        const scriptTag = getClientConfigScript(nonce);
        if (html.includes('<head>')) {
            html = html.replace('<head>', `<head>\n    ${scriptTag}`);
        } else if (html.includes('</title>')) {
            html = html.replace('</title>', `</title>\n    ${scriptTag}`);
        } else {
            html = `${scriptTag}\n${html}`;
        }

        // 2. Injeta o nonce criptográfico da requisição atual em TODOS os <script> e <style>
        if (nonce) {
            html = injectNonceIntoHtml(html, nonce);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(html);
    } catch (err) {
        console.error('Erro ao injetar configuração e nonce no HTML:', err);
        return res.sendFile(filePath);
    }
}

// Entrada principal da aplicação
app.get(['/', '/index.html', '/tonucontrole', '/tonucontrole/index.html'], (req, res) => {
    sendHtmlWithConfig(req, res, path.join(ROOT_DIR, 'index.html'));
});

app.get(['/index-mobile.html', '/tonucontrole/index-mobile.html'], (req, res) => {
    sendHtmlWithConfig(req, res, path.join(ROOT_DIR, 'index-mobile.html'));
});

function serveSecurePage(req, res, next, isMobile = false) {
    if (req.path.length > 1 && req.path.endsWith('/')) {
        const cleanUrl = req.path.replace(/\/+$/, '') + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
        return res.redirect(301, cleanUrl);
    }

    const rawPage = req.params.page;
    if (!rawPage) return next();

    // Sanitização e validação estrita: apenas letras, dígitos, traços e underscores
    const cleanPage = rawPage.replace(/\.html$/i, '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanPage)) {
        return res.status(400).send('Nome de página inválido.');
    }

    const baseDir = isMobile
        ? path.resolve(ROOT_DIR, 'pages', 'mobile')
        : path.resolve(ROOT_DIR, 'pages');

    const filePath = path.resolve(baseDir, `${cleanPage}.html`);

    // Validação de fronteira de diretório (Prevenção definitiva contra Path Traversal)
    if (!filePath.startsWith(baseDir)) {
        return res.status(403).send('Acesso não permitido.');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return sendHtmlWithConfig(req, res, filePath);
    }

    next();
}

// Rotas desktop e mobile protegidas
app.get('/pages/mobile/:page', (req, res, next) => serveSecurePage(req, res, next, true));
app.get('/pages/:page', (req, res, next) => serveSecurePage(req, res, next, false));

app.get('/tonucontrole/pages/mobile/:page', (req, res, next) => serveSecurePage(req, res, next, true));
app.get('/tonucontrole/pages/:page', (req, res, next) => serveSecurePage(req, res, next, false));

// ============================================
// 7. FALLBACK E PÁGINA 404
// ============================================
app.use((req, res) => {
    const reqPath = (req.path || '').toLowerCase();

    if (reqPath.startsWith('/api/') || reqPath.startsWith('/tonucontrole/api/') || reqPath.endsWith('.json')) {
        return res.status(404).json({ error: 'Recurso não encontrado.' });
    }

    if (/\.(js|mjs|cjs|map)$/.test(reqPath) || reqPath.startsWith('/js/') || reqPath.startsWith('/tonucontrole/js/')) {
        return res.status(404).type('application/javascript; charset=utf-8').send('/* 404 Not Found */');
    }

    if (/\.css$/.test(reqPath) || reqPath.startsWith('/css/') || reqPath.startsWith('/tonucontrole/css/')) {
        return res.status(404).type('text/css; charset=utf-8').send('/* 404 Not Found */');
    }

    const notFoundPath = path.join(ROOT_DIR, 'pages', '404.html');
    if (fs.existsSync(notFoundPath)) {
        res.status(404).sendFile(notFoundPath);
    } else {
        res.status(404).sendFile(path.join(ROOT_DIR, 'index.html'));
    }
});

// Inicia servidor principal na porta 3000 (obrigatória para o ambiente AI Studio)
const server = app.listen(PRIMARY_PORT, '0.0.0.0', () => {
    console.log(`🛡️ Servidor TonuControle Seguro rodando em http://0.0.0.0:${PRIMARY_PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Porta ${PRIMARY_PORT} já em uso. Servidor já está ativo.`);
    } else {
        console.error(`❌ Erro no servidor na porta ${PRIMARY_PORT}:`, err.message);
    }
});

// Se houver uma porta alternativa (ex: Cloud Run) diferente de 3000, escuta também de forma segura
if (ALT_PORT) {
    try {
        const altServer = app.listen(ALT_PORT, '0.0.0.0', () => {
            console.log(`🛡️ Servidor TonuControle espelhado na porta ${ALT_PORT}`);
        });
        altServer.on('error', (err) => {
            if (err.code !== 'EADDRINUSE') {
                console.warn(`⚠️ Erro na porta alternativa ${ALT_PORT}:`, err.message);
            }
        });
    } catch (_) {}
}

