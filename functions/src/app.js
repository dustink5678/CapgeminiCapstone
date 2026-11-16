const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { DEMO_CUSTOMER_KEY, DEMO_STORE_ID } = require("./config");
const { httpLog, store } = require("./lib/agentLog");
const { resolveMode } = require("./ai/gemini");
const { getCatalog, getBundles } = require("./services/catalog");
const {
  buildCartResponse,
  addToCart,
  updateQty,
  resetDemoState,
  getCartLines,
} = require("./services/cart");
const { listAccounts, getAccountDetail, getSessionPayload } = require("./services/accounts");
const {
  getInsights,
  getStoreOrderResponse,
  approveStoreOrder,
  resetStoreOrder,
} = require("./services/insights");
const { startSession, recordEvents, endSession } = require("./services/sessions");
const { checkout } = require("./services/checkout");
const { runPersonalize } = require("./agents/personalize");
const { runReplenish } = require("./agents/replenish");
const { runMarketContext, getMarketContext } = require("./agents/marketContext");
const { getGnewsKey } = require("./services/gnews");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "256kb" }));

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomBytes(6).toString("hex");
  const started = Date.now();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    httpLog({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
    });
  });
  // Keep requestId available across awaited agent work.
  store.run({ requestId }, next);
});

function asyncHandler(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        type: "error",
        requestId: req.requestId,
        error: err.message,
      }));
      res.status(500).json({ error: err.message || "Server error" });
    });
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "spark-agent-api",
    mode: "finite-agents",
    geminiMode: resolveMode(),
    gnewsConfigured: Boolean(getGnewsKey()),
  });
});

app.get(
  "/api/session",
  asyncHandler(async (_req, res) => {
    res.json(await getSessionPayload());
  }),
);

app.get(
  "/api/catalog",
  asyncHandler(async (_req, res) => {
    res.json(await getCatalog());
  }),
);

app.get(
  "/api/cart",
  asyncHandler(async (_req, res) => {
    res.json(await buildCartResponse());
  }),
);

app.post(
  "/api/cart",
  asyncHandler(async (req, res) => {
    const result = await addToCart(req.body?.productId);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  }),
);

app.patch(
  "/api/cart/:productId",
  asyncHandler(async (req, res) => {
    const result = await updateQty(req.params.productId, Number(req.body?.qty));
    if (result.error) return res.status(404).json(result);
    res.json(result);
  }),
);

app.get(
  "/api/bundles",
  asyncHandler(async (_req, res) => {
    res.json(await getBundles());
  }),
);

app.get(
  "/api/accounts",
  asyncHandler(async (_req, res) => {
    res.json(await listAccounts());
  }),
);

app.get(
  "/api/accounts/:id",
  asyncHandler(async (req, res) => {
    const account = await getAccountDetail(req.params.id);
    if (!account) return res.status(404).json({ error: "Unknown account" });
    res.json(account);
  }),
);

app.get(
  "/api/insights",
  asyncHandler(async (_req, res) => {
    res.json(await getInsights());
  }),
);

app.get(
  "/api/store-order",
  asyncHandler(async (_req, res) => {
    res.json(await getStoreOrderResponse());
  }),
);

app.post(
  "/api/store-order/approve",
  asyncHandler(async (req, res) => {
    const result = await approveStoreOrder(req.body?.lines);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  }),
);

app.post(
  "/api/store-order/reset",
  asyncHandler(async (_req, res) => {
    res.json(await resetStoreOrder());
  }),
);

app.post(
  "/api/demo/reset",
  asyncHandler(async (_req, res) => {
    await resetDemoState();
    await resetStoreOrder();
    res.json({ ok: true });
  }),
);

app.post(
  "/api/sessions",
  asyncHandler(async (req, res) => {
    const result = await startSession({
      demoKey: req.body?.demoKey || DEMO_CUSTOMER_KEY,
      channel: req.body?.channel,
      device: req.body?.device,
      entryPoint: req.body?.entryPoint,
    });
    res.json(result);
  }),
);

app.post(
  "/api/sessions/:id/end",
  asyncHandler(async (req, res) => {
    const result = await endSession(req.params.id);
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  }),
);

/** Mock checkout: place order, clear cart, end session (purchased). */
app.post(
  "/api/checkout",
  asyncHandler(async (req, res) => {
    const result = await checkout({
      sessionId: req.body?.sessionId,
      demoKey: req.body?.demoKey || DEMO_CUSTOMER_KEY,
      fulfillmentType: req.body?.fulfillmentType || "pickup",
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  }),
);

app.post(
  "/api/events",
  asyncHandler(async (req, res) => {
    res.json(await recordEvents(req.body));
  }),
);

/** Explicit personalization trigger — never called by ordinary GETs. */
app.post(
  "/api/agents/personalize",
  asyncHandler(async (req, res) => {
    const cart = await getCartLines();
    const result = await runPersonalize({
      demoKey: req.body?.demoKey || DEMO_CUSTOMER_KEY,
      force: Boolean(req.body?.force),
      cartProductIds: cart.map((line) => line.productId),
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  }),
);

/** Explicit replenishment trigger — never called by Insights GETs. */
app.post(
  "/api/agents/replenish",
  asyncHandler(async (req, res) => {
    const result = await runReplenish({
      storeId: req.body?.storeId || DEMO_STORE_ID,
      force: Boolean(req.body?.force),
    });
    res.json(result);
  }),
);

/** Read-only region briefs (never triggers GNews or Gemini). */
app.get(
  "/api/market-context",
  asyncHandler(async (req, res) => {
    res.json(await getMarketContext({ storeId: req.query.storeId || null }));
  }),
);

/**
 * Explicit market-context trigger. No body → fan out over every active region in the org.
 * `regionId` or `storeId` → just that region. `asOf` (YYYY-MM-DD) tests other calendar dates.
 */
app.post(
  "/api/agents/market-context",
  asyncHandler(async (req, res) => {
    const result = await runMarketContext({
      regionId: req.body?.regionId || null,
      storeId: req.body?.storeId || null,
      force: Boolean(req.body?.force),
      asOf: req.body?.asOf || null,
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  }),
);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

module.exports = { app };
