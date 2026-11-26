// ============================================
// TONUCONTROLE - SUPABASE EDGE FUNCTION: INSIGHTS IA
// Runtime: Deno (Supabase Edge Functions)
// ============================================

import { GoogleGenAI, ThinkingLevel, Type } from "npm:@google/genai";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const PROMPT_VERSION = "v2";
const CACHE_MAX_ENTRIES = 1000;
const DAILY_LIMIT = 30;
const ALLOWED_TYPES = new Set(["warning", "success", "info"]);
const FALLBACK_INSIGHTS = [
  { type: "info", text: "Continue registrando transações para insights personalizados." }
];

const insightsCache = new Map<string, { insights: Array<{ type: string; text: string }>; generated_at: string; ts: number }>();
const dailyRateLimit = new Map<string, { date: string; count: number }>();

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const customAllowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (customAllowed.includes(origin)) return true;

    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "dudowns.github.io" ||
      host.endsWith(".github.io") ||
      host.endsWith(".run.app") ||
      host.endsWith(".googleusercontent.com") ||
      host.endsWith(".usercontent.goog") ||
      host.endsWith(".vercel.app") ||
      host.endsWith(".netlify.app") ||
      host.endsWith(".onrender.com")
    ) {
      return u.protocol === "https:" || u.protocol === "http:";
    }
    if (u.protocol === "capacitor:" || u.protocol === "ionic:") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : "https://dudowns.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function consumeDailyQuota(userId: string): { allowed: boolean; remaining: number } {
  const today = getUtcDateKey();
  let entry = dailyRateLimit.get(userId);
  if (!entry || entry.date !== today) {
    entry = { date: today, count: 0 };
    dailyRateLimit.set(userId, entry);
  }
  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

function setCachedInsights(userId: string, insights: Array<{ type: string; text: string }>, generatedAt: string) {
  if (insightsCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = insightsCache.keys().next().value;
    if (oldestKey !== undefined) {
      insightsCache.delete(oldestKey);
    }
  }
  insightsCache.set(userId, {
    insights,
    generated_at: generatedAt,
    ts: Date.now()
  });
}

async function verifySupabaseUser(supabaseUrl: string, supabaseAnonKey: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const uid = typeof data?.id === "string" ? data.id.trim() : "";
    return uid || null;
  } catch {
    return null;
  }
}

async function fetchSupabaseRestTable(url: string, headers: Record<string, string>): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await fetch(url, {
      method: "GET",
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

interface CategorySummary {
  category: string;
  total: number;
  pct_of_outflows: number;
  pct_of_income?: number;
  is_investment?: boolean;
  top_items?: string[];
}

interface FinancialSummary {
  period_days: number;
  reference_month: string;
  today: string;
  current_month: {
    income: number;
    extra_income: number;
    total_outflows: number;
    invested_outflows: number;
    real_consumption_expense: number;
    operational_balance: number;
    cash_balance_ex_investments: number;
    pending_bills_count: number;
    pending_bills_total: number;
    top_categories: CategorySummary[];
  };
  last_90_days: {
    total_income: number;
    total_outflows: number;
    invested_outflows: number;
    real_consumption_expense: number;
    net_balance: number;
    savings_rate_pct: number;
    transactions_count: number;
    overdue_bills_count: number;
    overdue_bills_total: number;
    overdue_bill_names: string[];
    pending_bills_count: number;
    pending_bills_total: number;
    top_categories: CategorySummary[];
  };
  goals_count: number;
  active_goals: Array<{
    title: string;
    current_amount: number;
    target_amount: number;
    remaining_amount: number;
    progress_pct: number;
  }>;
}

function cleanLabel(raw: unknown, maxLen: number): string {
  return String(raw || "")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function isInvestmentEntry(catName: string, desc: string): boolean {
  const c = catName.toLowerCase();
  const d = desc.toLowerCase();
  return (
    c.includes("investiment") ||
    c.includes("aporte") ||
    c.includes("reserva") ||
    c.includes("poupan") ||
    d.includes("guardar") ||
    d.includes("aporte") ||
    d.includes("tesouro") ||
    d.includes("cdb")
  );
}

function isExtraIncomeEntry(catName: string, desc: string): boolean {
  const c = catName.toLowerCase();
  const d = desc.toLowerCase();
  return (
    c.includes("bico") ||
    c.includes("extra") ||
    c.includes("freela") ||
    c.includes("bonifica") ||
    d.includes("bico") ||
    d.includes("extra") ||
    d.includes("freela") ||
    d.includes("uber") ||
    d.includes("ifood") ||
    d.includes("comiss")
  );
}

function getBrazilDateKey(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function buildTopCategories(
  catTotals: Map<string, number>,
  catItems: Map<string, Map<string, number>>,
  totalOutflows: number,
  totalIncome: number,
  limit = 4
): CategorySummary[] {
  return Array.from(catTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, total]) => {
      const itemMap = catItems.get(category);
      const topItems = itemMap
        ? Array.from(itemMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([label, val]) => `${label} (R$ ${Math.round(val)})`)
        : [];
      return {
        category: category.slice(0, 40),
        total: Math.round(total * 100) / 100,
        pct_of_outflows: totalOutflows > 0 ? Math.round((total / totalOutflows) * 100) : 0,
        ...(totalIncome > 0 ? { pct_of_income: Math.round((total / totalIncome) * 100) } : {}),
        is_investment: isInvestmentEntry(category, ""),
        ...(topItems.length > 0 ? { top_items: topItems } : {})
      };
    });
}

async function fetchUserFinancialSummary(
  supabaseUrl: string,
  supabaseAnonKey: string,
  userId: string,
  userJwt: string
): Promise<FinancialSummary> {
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${userJwt}`,
    Accept: "application/json"
  };

  const now = new Date();
  const todayStr = getBrazilDateKey(now);
  const currentMonthPrefix = todayStr.slice(0, 7);
  const firstDayOfMonth = `${currentMonthPrefix}-01`;
  const [yr, mo] = currentMonthPrefix.split("-").map(Number);
  const endOfCurrentMonth = new Date(Date.UTC(yr, mo, 0)).toISOString().slice(0, 10);
  const start90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const encodedUid = encodeURIComponent(userId);

  const txUrl = `${supabaseUrl}/rest/v1/transactions?select=amount,type,category_id,description,date,paid,is_bill&user_id=eq.${encodedUid}&date=gte.${start90d}&date=lte.${endOfCurrentMonth}&order=date.desc&limit=500`;
  const goalsUrl = `${supabaseUrl}/rest/v1/goals?select=title,current_amount,target_amount,completed&user_id=eq.${encodedUid}&limit=100`;
  const catsUrl = `${supabaseUrl}/rest/v1/categories?select=id,name&user_id=eq.${encodedUid}&limit=100`;

  const [transactions, goals, categories] = await Promise.all([
    fetchSupabaseRestTable(txUrl, headers),
    fetchSupabaseRestTable(goalsUrl, headers),
    fetchSupabaseRestTable(catsUrl, headers)
  ]);

  const categoryMapById = new Map<string, string>();
  for (const c of categories) {
    if (c?.id && c?.name) {
      const cleaned = cleanLabel(c.name, 40);
      if (cleaned) categoryMapById.set(String(c.id), cleaned);
    }
  }

  let totalIncome90 = 0;
  let totalOutflows90 = 0;
  let investedOutflows90 = 0;
  let pendingBillsTotal90 = 0;
  let pendingBillsCount90 = 0;
  let overdueBillsTotal = 0;
  let overdueBillsCount = 0;
  const overdueBillItems: Array<{ label: string; amt: number }> = [];
  const catTotals90 = new Map<string, number>();
  const catItems90 = new Map<string, Map<string, number>>();

  let monthIncome = 0;
  let monthExtraIncome = 0;
  let monthOutflows = 0;
  let monthInvested = 0;
  let monthPendingTotal = 0;
  let monthPendingCount = 0;
  const monthCatTotals = new Map<string, number>();
  const monthCatItems = new Map<string, Map<string, number>>();

  for (const t of transactions) {
    if (!t) continue;
    const amt = Math.abs(Number(t.amount || 0));
    if (!Number.isFinite(amt) || amt <= 0) continue;

    const txDate = String(t.date || "").slice(0, 10);
    const inCurrentMonth = txDate >= firstDayOfMonth && txDate <= endOfCurrentMonth;
    const catName =
      (t.category_id && categoryMapById.get(String(t.category_id))) ||
      "Outros";
    const descLabel = cleanLabel(t.description, 32);
    const isPaid = t.paid === true || t.paid === "true" || t.paid === 1 || (t.paid == null && !t.is_bill);

    if (!isPaid) {
      if (t.type === "expense") {
        pendingBillsTotal90 += amt;
        pendingBillsCount90 += 1;
        if (inCurrentMonth) {
          monthPendingTotal += amt;
          monthPendingCount += 1;
        }
        if (txDate && txDate < todayStr) {
          overdueBillsTotal += amt;
          overdueBillsCount += 1;
          overdueBillItems.push({ label: descLabel || catName, amt });
        }
      }
      continue;
    }

    if (t.type === "income") {
      totalIncome90 += amt;
      if (inCurrentMonth) {
        monthIncome += amt;
        if (isExtraIncomeEntry(catName, descLabel)) {
          monthExtraIncome += amt;
        }
      }
    } else if (t.type === "expense") {
      const isInv = isInvestmentEntry(catName, descLabel);
      totalOutflows90 += amt;
      if (isInv) investedOutflows90 += amt;
      catTotals90.set(catName, (catTotals90.get(catName) || 0) + amt);
      if (descLabel) {
        if (!catItems90.has(catName)) catItems90.set(catName, new Map());
        const m = catItems90.get(catName)!;
        m.set(descLabel, (m.get(descLabel) || 0) + amt);
      }

      if (inCurrentMonth) {
        monthOutflows += amt;
        if (isInv) monthInvested += amt;
        monthCatTotals.set(catName, (monthCatTotals.get(catName) || 0) + amt);
        if (descLabel) {
          if (!monthCatItems.has(catName)) monthCatItems.set(catName, new Map());
          const m = monthCatItems.get(catName)!;
          m.set(descLabel, (m.get(descLabel) || 0) + amt);
        }
      }
    }
  }

  const activeGoals = goals
    .filter((g) => g && g.completed !== true)
    .map((g) => {
      const cur = Math.max(0, Number(g.current_amount || 0));
      const tgt = Math.max(0, Number(g.target_amount || 0));
      const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
      return {
        title: cleanLabel(g.title || "Meta", 40) || "Meta",
        current_amount: Math.round(cur * 100) / 100,
        target_amount: Math.round(tgt * 100) / 100,
        remaining_amount: Math.round(Math.max(0, tgt - cur) * 100) / 100,
        progress_pct: pct
      };
    })
    .sort((a, b) => b.progress_pct - a.progress_pct)
    .slice(0, 4);

  const net90 = totalIncome90 - totalOutflows90;
  const monthOpBalance = monthIncome - monthOutflows;
  const monthRealConsumption = Math.max(0, monthOutflows - monthInvested);
  const realConsumption90 = Math.max(0, totalOutflows90 - investedOutflows90);

  const overdueBillNames = overdueBillItems
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 3)
    .map((b) => `${b.label} (R$ ${Math.round(b.amt)})`);

  return {
    period_days: 90,
    reference_month: currentMonthPrefix,
    today: todayStr,
    current_month: {
      income: Math.round(monthIncome * 100) / 100,
      extra_income: Math.round(monthExtraIncome * 100) / 100,
      total_outflows: Math.round(monthOutflows * 100) / 100,
      invested_outflows: Math.round(monthInvested * 100) / 100,
      real_consumption_expense: Math.round(monthRealConsumption * 100) / 100,
      operational_balance: Math.round(monthOpBalance * 100) / 100,
      cash_balance_ex_investments: Math.round((monthIncome - monthRealConsumption) * 100) / 100,
      pending_bills_count: monthPendingCount,
      pending_bills_total: Math.round(monthPendingTotal * 100) / 100,
      top_categories: buildTopCategories(monthCatTotals, monthCatItems, monthOutflows, monthIncome, 4)
    },
    last_90_days: {
      total_income: Math.round(totalIncome90 * 100) / 100,
      total_outflows: Math.round(totalOutflows90 * 100) / 100,
      invested_outflows: Math.round(investedOutflows90 * 100) / 100,
      real_consumption_expense: Math.round(realConsumption90 * 100) / 100,
      net_balance: Math.round(net90 * 100) / 100,
      savings_rate_pct: totalIncome90 > 0 ? Math.round((net90 / totalIncome90) * 100) : 0,
      transactions_count: transactions.length,
      overdue_bills_count: overdueBillsCount,
      overdue_bills_total: Math.round(overdueBillsTotal * 100) / 100,
      overdue_bill_names: overdueBillNames,
      pending_bills_count: pendingBillsCount90,
      pending_bills_total: Math.round(pendingBillsTotal90 * 100) / 100,
      top_categories: buildTopCategories(catTotals90, catItems90, totalOutflows90, totalIncome90, 4)
    },
    goals_count: goals.length,
    active_goals: activeGoals
  };
}

function sanitizeClientSummary(raw: unknown): FinancialSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const toNum = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };
  const totalIncome = Math.max(0, toNum(obj.total_income));
  const totalExpense = Math.max(0, toNum(obj.total_expense));
  const txCount = Math.max(0, Math.min(5000, Math.round(Number(obj.transactions_count) || 0)));
  const goalsCount = Math.max(0, Math.min(100, Math.round(Number(obj.goals_count) || 0)));
  if (txCount === 0 && goalsCount === 0 && totalIncome === 0 && totalExpense === 0) {
    return null;
  }
  const todayStr = getBrazilDateKey(new Date());
  const netBalance = Math.round((totalIncome - totalExpense) * 100) / 100;
  const savingsRatePct = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;
  const topCategories: CategorySummary[] = Array.isArray(obj.top_categories)
    ? obj.top_categories.slice(0, 4).map((c: Record<string, unknown>) => {
        const catTotal = Math.max(0, toNum(c?.total));
        const pctExp = Math.max(0, Math.min(100, Math.round(Number(c?.pct_of_expenses ?? c?.pct) || 0)));
        const pctInc = totalIncome > 0 ? Math.round((catTotal / totalIncome) * 100) : 0;
        const catName = cleanLabel(c?.category || "Outros", 40) || "Outros";
        return {
          category: catName,
          total: catTotal,
          pct_of_outflows: pctExp,
          ...(totalIncome > 0 ? { pct_of_income: pctInc } : {}),
          is_investment: isInvestmentEntry(catName, "")
        };
      })
    : [];
  const activeGoals = Array.isArray(obj.goals_progress)
    ? obj.goals_progress.slice(0, 4).map((g: Record<string, unknown>) => {
        const cur = Math.max(0, toNum(g?.current_amount));
        const tgt = Math.max(0, toNum(g?.target_amount));
        return {
          title: cleanLabel(g?.title || "Meta", 40) || "Meta",
          current_amount: cur,
          target_amount: tgt,
          remaining_amount: Math.round(Math.max(0, tgt - cur) * 100) / 100,
          progress_pct: Math.max(0, Math.min(100, Math.round(Number(g?.progress_pct) || 0)))
        };
      })
    : [];

  return {
    period_days: 90,
    reference_month: todayStr.slice(0, 7),
    today: todayStr,
    current_month: {
      income: totalIncome,
      extra_income: 0,
      total_outflows: totalExpense,
      invested_outflows: 0,
      real_consumption_expense: totalExpense,
      operational_balance: netBalance,
      cash_balance_ex_investments: netBalance,
      pending_bills_count: Math.max(0, Math.round(Number(obj.pending_bills_count) || 0)),
      pending_bills_total: Math.max(0, toNum(obj.pending_bills_total)),
      top_categories: topCategories
    },
    last_90_days: {
      total_income: totalIncome,
      total_outflows: totalExpense,
      invested_outflows: 0,
      real_consumption_expense: totalExpense,
      net_balance: netBalance,
      savings_rate_pct: savingsRatePct,
      transactions_count: txCount,
      overdue_bills_count: 0,
      overdue_bills_total: 0,
      overdue_bill_names: [],
      pending_bills_count: Math.max(0, Math.round(Number(obj.pending_bills_count) || 0)),
      pending_bills_total: Math.max(0, toNum(obj.pending_bills_total)),
      top_categories: topCategories
    },
    goals_count: goalsCount,
    active_goals: activeGoals
  };
}

function parseAiInsightsResponse(rawText: string | undefined): Array<{ type: string; text: string }> | null {
  if (!rawText || typeof rawText !== "string") return null;

  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: { insights?: Array<{ type?: unknown; text?: unknown }> } | null = null;
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
    .filter((item) => item && typeof item.text === "string" && item.text.trim().length > 0)
    .slice(0, 3)
    .map((item) => {
      const rawType = String(item.type || "info").toLowerCase().trim();
      const safeType = ALLOWED_TYPES.has(rawType) ? rawType : "info";
      const cleanText = String(item.text).replace(/\s+/g, " ").trim().slice(0, 280);
      return { type: safeType, text: cleanText };
    });

  return validInsights.length > 0 ? validInsights : null;
}

function sanitizeAiErrorMessage(err: unknown): string {
  const e = err as { message?: unknown };
  const raw = String(e?.message || "Erro desconhecido ao consultar IA.");
  return raw.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED]").slice(0, 300);
}

function classifyGeminiError(err: unknown) {
  const e = err as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
  const msg = sanitizeAiErrorMessage(err);
  const statusNum = Number(e?.status || e?.code) || 0;
  const upper = msg.toUpperCase();

  if (e?.message === "AI_TIMEOUT" || e?.name === "TimeoutError" || e?.name === "AbortError") {
    return {
      reason: "timeout",
      httpStatus: 504,
      userMessage: "A IA demorou para responder. Tente novamente em instantes."
    };
  }
  if (statusNum === 400 && (upper.includes("API_KEY_INVALID") || upper.includes("API KEY NOT VALID"))) {
    return {
      reason: "api_key_invalid",
      httpStatus: 400,
      userMessage: "Chave da API Gemini inválida nos Secrets do Supabase."
    };
  }
  if (statusNum === 403 || upper.includes("PERMISSION_DENIED") || upper.includes("ACCESS_DENIED")) {
    return {
      reason: "api_key_invalid",
      httpStatus: 403,
      userMessage: "Acesso negado pela API Gemini. Verifique o Secret GEMINI_API_KEY no Supabase."
    };
  }
  if (statusNum === 429 || upper.includes("RESOURCE_EXHAUSTED")) {
    return {
      reason: "quota_exceeded",
      httpStatus: 429,
      userMessage: "Cota gratuita diária da API Gemini atingida no momento. Tente novamente mais tarde ou selecione uma chave com faturamento ativo."
    };
  }
  if (statusNum === 503 || upper.includes("UNAVAILABLE") || upper.includes("OVERLOADED") || upper.includes("HIGH DEMAND")) {
    return {
      reason: "overloaded",
      httpStatus: 503,
      userMessage: "Os servidores da IA estão com alta demanda agora (503). Tente novamente em instantes."
    };
  }
  if (statusNum === 404 || upper.includes("NOT_FOUND")) {
    return {
      reason: "model_not_found",
      httpStatus: 502,
      userMessage: "Modelo de IA indisponível ou não encontrado."
    };
  }
  return {
    reason: "error",
    httpStatus: (statusNum >= 400 && statusNum < 600) ? statusNum : 502,
    userMessage: "Falha temporária ao gerar insights com IA."
  };
}

function isTransientGeminiError(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
  const statusNum = Number(e?.status || e?.code) || 0;
  const msg = String(e?.message || "").toUpperCase();
  return (
    statusNum === 503 ||
    statusNum === 502 ||
    statusNum === 500 ||
    statusNum === 429 ||
    e?.message === "AI_TIMEOUT" ||
    e?.name === "TimeoutError" ||
    e?.name === "AbortError" ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("OVERLOADED") ||
    msg.includes("TRY AGAIN")
  );
}

async function callGeminiInsightsModel(
  ai: GoogleGenAI,
  modelName: string,
  promptText: string,
  attemptTimeoutMs: number
) {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const config: Record<string, unknown> = {
      systemInstruction:
        "Você é um consultor financeiro pessoal brasileiro prático, empático e preciso. " +
        "Baseie-se exclusivamente nos números e itens fornecidos, sem clichês genéricos ('corte de supérfluos', 'juros abusivos') se os dados não mostrarem isso. " +
        "Responda exclusivamente em JSON válido conforme o esquema, sem markdown.",
      responseMimeType: "application/json",
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
              required: ["type", "text"]
            }
          }
        },
        required: ["insights"]
      },
      abortSignal: AbortSignal.timeout(attemptTimeoutMs)
    };
    if (modelName === "gemini-4-hydrogen") {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    const geminiPromise = ai.models.generateContent({
      model: modelName,
      contents: promptText,
      config
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("AI_TIMEOUT")), attemptTimeoutMs);
    });
    return await Promise.race([geminiPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

async function generateInsightsWithRetry(ai: GoogleGenAI, promptText: string) {
  let lastErr: unknown = null;
  let primaryQuotaErr: unknown = null;

  // 1) Tenta modelo principal (gemini-4-hydrogen)
  try {
    const response = await callGeminiInsightsModel(ai, "gemini-4-hydrogen", promptText, 8000);
    return { response, modelUsed: "gemini-4-hydrogen" };
  } catch (err) {
    lastErr = err;
    const e = err as { status?: unknown; code?: unknown; message?: unknown };
    const statusNum = Number(e?.status || e?.code) || 0;
    if (statusNum === 400 || statusNum === 401 || statusNum === 403) {
      throw err;
    }
    if (statusNum === 429 || String(e?.message || "").toUpperCase().includes("RESOURCE_EXHAUSTED")) {
      primaryQuotaErr = err;
    } else if (!isTransientGeminiError(err) && statusNum !== 404) {
      throw err;
    }
  }

  // 2) Fallback para modelo alternativo (gemini-3.1-flash-lite)
  await new Promise((r) => setTimeout(r, 300));
  try {
    const response = await callGeminiInsightsModel(ai, "gemini-3.1-flash-lite", promptText, 9000);
    return { response, modelUsed: "gemini-3.1-flash-lite" };
  } catch (err) {
    lastErr = err;
    const e = err as { status?: unknown; code?: unknown };
    const statusNum = Number(e?.status || e?.code) || 0;
    if (statusNum === 400 || statusNum === 401 || statusNum === 403) {
      throw err;
    }
    if (!isTransientGeminiError(err) && statusNum !== 404) {
      throw err;
    }
  }

  // 3) Última tentativa: alterna para o principal se não estourou cota, ou tenta o alternativo mais uma vez
  const thirdModel = primaryQuotaErr ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";
  await new Promise((r) => setTimeout(r, 700));
  try {
    const response = await callGeminiInsightsModel(ai, thirdModel, promptText, 9000);
    return { response, modelUsed: thirdModel };
  } catch (err) {
    const e = err as { status?: unknown; code?: unknown };
    const statusNum = Number(e?.status || e?.code) || 0;
    if (primaryQuotaErr && (statusNum === 503 || statusNum === 429)) {
      throw primaryQuotaErr;
    }
    throw err || lastErr || new Error("Falha temporária ao gerar insights com IA.");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, 405, {
      insights: [],
      reason: "method_not_allowed",
      error: "Método não permitido."
    });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const supabaseAnonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(req, 500, {
      insights: [],
      reason: "not_configured",
      error: "Ambiente Supabase não configurado nesta Edge Function."
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : "";
  if (!token) {
    return jsonResponse(req, 401, {
      insights: [],
      reason: "unauthorized",
      error: "Token de autenticação ausente."
    });
  }

  const userId = await verifySupabaseUser(supabaseUrl, supabaseAnonKey, token);
  if (!userId) {
    return jsonResponse(req, 401, {
      insights: [],
      reason: "unauthorized",
      error: "Sessão inválida ou expirada."
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cacheKey = `${PROMPT_VERSION}:${userId}`;
  const forceRefresh = body?.forceRefresh === true;
  if (!forceRefresh) {
    const cached = insightsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return jsonResponse(req, 200, {
        insights: cached.insights,
        source: "cache",
        generated_at: cached.generated_at
      });
    }
  }

  const geminiApiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!geminiApiKey) {
    return jsonResponse(req, 500, {
      insights: [],
      gemini_configured: false,
      reason: "not_configured",
      error_status: 503,
      error: "Chave da API Gemini não configurada nos Secrets do Supabase (GEMINI_API_KEY)."
    });
  }

  const quota = consumeDailyQuota(userId);
  if (!quota.allowed) {
    return jsonResponse(req, 429, {
      insights: [],
      reason: "rate_limit",
      error: "Limite diário de consultas IA atingido."
    });
  }

  try {
    let summary = await fetchUserFinancialSummary(supabaseUrl, supabaseAnonKey, userId, token);
    if (summary.last_90_days.transactions_count === 0 && summary.goals_count === 0) {
      const clientSummary = sanitizeClientSummary(body?.clientSummary);
      if (clientSummary) {
        summary = clientSummary;
      }
    }

    const promptText =
      `Analise estes dados financeiros reais do usuário (separados entre mês atual "${summary.reference_month}" e acumulado dos últimos 90 dias): ${JSON.stringify(summary)}.\n` +
      `Gere EXATAMENTE 3 insights coerentes entre si, em português natural (18 a 32 palavras cada), seguindo estes 3 papéis complementares:\n` +
      `1) Fluxo do mês atual: explique o caixa real separando consumo (real_consumption_expense) de aportes/investimentos (invested_outflows), deixando claro quando um saldo negativo vem de investimentos/aportes e nunca chamando aporte de gasto supérfluo.\n` +
      `2) Maior concentração ou alavanca do mês: cite a principal categoria real e exemplos de top_items (sem assumir juros/banco se for gasto familiar ou pessoal), ou destaque o peso da renda extra (extra_income).\n` +
      `3) Próxima ação prática: se houver contas vencidas (overdue_bills_total / overdue_bill_names) ou contas pendentes no mês (pending_bills_total), oriente priorizar exatamente elas; caso tudo esteja em dia, conecte com uma meta ativa (active_goals).\n` +
      `Regras obrigatórias: sempre especifique se o valor citado é "neste mês" ou "nos últimos 90 dias"; nunca confunda pct_of_outflows com pct_of_income; não repita números entre os 3 cards; proibido usar chavões como "corte de supérfluos" ou "juros abusivos" sem evidência direta.\n` +
      `Retorne APENAS JSON válido no formato {"insights": [{"type": "warning|success|info", "text": "..."}]}.`;

    const ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const { response, modelUsed } = await generateInsightsWithRetry(ai, promptText);
    const parsedInsights = parseAiInsightsResponse(response?.text);
    const generatedAt = new Date().toISOString();

    if (parsedInsights) {
      setCachedInsights(cacheKey, parsedInsights, generatedAt);
      console.log(`[edge:insights] source=ai model=${modelUsed}`);
      return jsonResponse(req, 200, {
        insights: parsedInsights,
        source: "ai",
        generated_at: generatedAt
      });
    }

    return jsonResponse(req, 200, {
      insights: FALLBACK_INSIGHTS,
      source: "fallback",
      generated_at: generatedAt
    });
  } catch (err) {
    const classified = classifyGeminiError(err);
    if (classified.reason === "api_key_invalid") {
      const entry = dailyRateLimit.get(userId);
      if (entry && entry.count > 0) entry.count -= 1;
    }
    console.warn(`[edge:insights] error reason=${classified.reason} status=${classified.httpStatus}`);
    return jsonResponse(req, classified.httpStatus, {
      insights: [],
      reason: classified.reason,
      error_status: classified.httpStatus,
      error: classified.userMessage
    });
  }
});
