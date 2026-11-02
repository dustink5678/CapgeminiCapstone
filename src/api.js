import {
  addToCart,
  approveStoreOrder,
  getAccount,
  getAccounts,
  getBundles,
  getCart,
  getCatalog,
  getInsights,
  getSession,
  getStoreOrder,
  resetDemo,
  resetStoreOrder,
  updateQty,
} from "./data/demoStore";

// The site is static for now: requests are answered from in-memory demo data,
// which resets on page reload. Nothing here talks to Firebase.
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
];

export async function fetchJson(path, options = {}) {
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

export const money = (value) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });
