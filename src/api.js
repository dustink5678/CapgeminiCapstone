import {
  addToCart,
  approveStoreOrder,
  getAccount,
  getAccounts,
  getBundles,
  getCart,
  getCatalog,
  getInsights,
  getMarketContext,
  getSession,
  getStoreOrder,
  resetDemo,
  resetStoreOrder,
  checkout,
  updateQty,
} from "./data/demoStore";

const API_MODE = import.meta.env.VITE_API_MODE || (import.meta.env.PROD ? "live" : "demo");
const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

// In-browser demo router (no network). Used when VITE_API_MODE=demo.
const routes = [
  ["GET", /^\/api\/session$/, () => getSession()],
  ["GET", /^\/api\/catalog$/, () => getCatalog()],
  ["GET", /^\/api\/cart$/, () => getCart()],
  ["GET", /^\/api\/bundles$/, () => getBundles()],
  ["POST", /^\/api\/cart$/, (_m, body) => addToCart(body?.productId)],
  ["PATCH", /^\/api\/cart\/([\w-]+)$/, ([, id], body) => updateQty(id, Number(body?.qty))],
  ["GET", /^\/api\/accounts$/, () => getAccounts()],
  ["GET", /^\/api\/accounts\/([\w-]+)$/, ([, id]) => getAccount(id) || { error: "Unknown account" }],
  ["GET", /^\/api\/insights$/, () => getInsights()],
  ["GET", /^\/api\/store-order$/, () => getStoreOrder()],
  ["POST", /^\/api\/store-order\/approve$/, (_m, body) => approveStoreOrder(body?.lines)],
  ["POST", /^\/api\/store-order\/reset$/, () => resetStoreOrder()],
  ["POST", /^\/api\/demo\/reset$/, () => (resetDemo(), { ok: true })],
  // Agent/session stubs so the UI can call the same paths in demo mode without hanging.
  ["POST", /^\/api\/sessions$/, () => ({ sessionId: `demo_${Date.now()}`, customerId: "cust_doug", storeId: "4127" })],
  ["POST", /^\/api\/sessions\/([\w-]+)\/end$/, () => ({ skipped: true, reason: "demo_mode" })],
  ["POST", /^\/api\/checkout$/, (_m, body) => checkout(body)],
  ["POST", /^\/api\/events$/, () => ({ ok: true, count: 0 })],
  [
    "POST",
    /^\/api\/agents\/personalize$/,
    () => {
      // Mirror live cache shape using static demo recommendations so Shop isn't empty.
      const catalog = getCatalog();
      const recommendations = catalog
        .filter((item) => item.recommendation)
        .map((item) => ({
          productId: item.id,
          rank: item.recommendation.rank,
          label: item.recommendation.label,
          reason: item.recommendation.reason,
          signalsUsed: ["demo_store"],
        }));
      const bundles = getBundles().map((item) => ({ productId: item.id, reason: item.reason }));
      return {
        skipped: true,
        reason: "demo_mode",
        recommendations,
        bundles,
        usedGemini: false,
        mode: "demo",
      };
    },
  ],
  ["POST", /^\/api\/agents\/replenish$/, () => ({ skipped: true, reason: "demo_mode", order: getStoreOrder(), mode: "demo" })],
  ["GET", /^\/api\/market-context(\?.*)?$/, () => getMarketContext()],
  [
    "POST",
    /^\/api\/agents\/market-context$/,
    () => ({ skipped: true, reason: "demo_mode", national: { status: "no_key", count: 0 }, regions: [] }),
  ],
];

async function demoFetchJson(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : undefined;
  for (const [routeMethod, pattern, handler] of routes) {
    const match = routeMethod === method && path.match(pattern);
    if (match) {
      const result = handler(match, body);
      if (result?.error) throw new Error(result.error);
      return structuredClone(result);
    }
  }
  throw new Error(`No demo data for ${method} ${path}`);
}

async function liveFetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchJson(path, options = {}) {
  if (API_MODE === "live") return liveFetchJson(path, options);
  return demoFetchJson(path, options);
}

export const apiMode = API_MODE;

export const money = (value) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
