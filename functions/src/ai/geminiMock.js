const { GEMINI_MOCK_LATENCY_MS } = require("../config");
const { deterministicMarket } = require("../lib/marketRules");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

function detectIntent({ system, schemaHint }) {
  const blob = `${system || ""} ${schemaHint || ""}`.toLowerCase();
  if (blob.includes("market-context") || blob.includes("activetags")) return "market";
  if (blob.includes("replenishment") || blob.includes('"notes"') || blob.includes("store-manager")) {
    return "replenish";
  }
  if (blob.includes("session") || blob.includes("weightDeltas") || blob.includes("long-term memory")) {
    return "session";
  }
  return "personalize";
}

function parseUser(user) {
  try {
    return typeof user === "string" ? JSON.parse(user) : user || {};
  } catch {
    return {};
  }
}

function mockPersonalize(ctx) {
  const candidates = ctx.candidates || [];
  const events = ctx.localEvents || [];
  const headline = events[0]?.headline || "Local demand signal";
  const recommendations = candidates.map((c, i) => ({
    productId: c.id,
    rank: i + 1,
    label: c.eventLabel || "Picked for you",
    reason: `${c.eventHeadline || headline}. Mock model ranked ${c.name || c.id} using ${(c.signals || []).join(", ") || "preference weights"}.`,
    signalsUsed: c.signals || ["mock"],
  }));
  const bundles = (ctx.bundleCandidates || []).slice(0, 4).map((b) => ({
    productId: b.id,
    reason: `Mock bundle: ${b.name || b.id} pairs with the current basket given ${(b.signals || []).join(", ") || "patterns"}.`,
  }));
  return { recommendations, bundles };
}

function mockReplenish(ctx) {
  const lines = ctx.lines || [];
  const events = ctx.localEvents || [];
  const headline = events[0]?.headline || "Local demand surge";
  const milk = lines.find((l) => l.productId === "milk");
  return {
    reason: `Mock draft: ${headline}. Ordered ${lines.reduce((s, l) => s + (l.cases || 0), 0)} cases across storm staples.`,
    notes: {
      daily: `Mock note: sales for milk/eggs/water spiked after the warning. Forecast uses recent dailySales vs baseline.`,
      social: `Mock note: social volume remains elevated (${events.map((e) => e.type).join(", ") || "local events"}).`,
      cover: milk
        ? `Mock note: milk on hand (${milk.onHand}) vs 72h forecast (${milk.forecast72h}) is below target days of supply.`
        : "Mock note: days of supply are below target for storm staples.",
    },
  };
}

function mockSession(ctx) {
  const events = ctx.events || [];
  const views = events.filter((e) => e.type === "product_view");
  const adds = events.filter((e) => e.type === "add_to_cart");
  const topView = [...views].sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))[0];
  const names = adds.map((e) => e.productName || e.productId).filter(Boolean);
  return {
    headline: adds.length
      ? `Mock summary: added ${names.slice(0, 3).join(", ") || "items"}`
      : topView
        ? `Mock summary: viewed ${topView.productName || topView.productId}`
        : "Mock summary: short browse",
    summary: `Mock session memory over ${events.length} events (${adds.length} cart adds). ${
      topView ? `Longest dwell ${(Number(topView.dwellMs || 0) / 1000).toFixed(1)}s on ${topView.productName || topView.productId}.` : ""
    }`,
    intents: adds.length ? ["storm_prep", "grocery"] : ["browse_only"],
    productsViewed: views.map((e) => ({
      productId: e.productId,
      name: e.productName || e.productId,
      dwellSec: Math.round(((e.dwellMs || 0) / 1000) * 10) / 10,
    })),
    productsAdded: adds.map((e) => e.productId).filter(Boolean),
    productsAbandoned: views
      .map((e) => e.productId)
      .filter((id) => id && !adds.some((a) => a.productId === id)),
    signalsDerived: topView
      ? [
          {
            type: "dwell",
            detail: `${Math.round((topView.dwellMs || 0) / 100) / 10}s on ${topView.productId}`,
            weight: "dairy_and_eggs",
            before: 0.5,
            after: 0.62,
          },
        ]
      : [],
    followUps: ["Keep storm staples ranked when a local warning is active."],
    keyFacts: names.length ? [`Recently added: ${names.join(", ")}`] : ["Browse-only session"],
    openThreads: adds.length ? ["Cart not checked out in this demo session"] : [],
    weightDeltas: topView ? { dairy_and_eggs: 0.05 } : {},
  };
}

/**
 * Finite mock model call: one awaited delay, then JSON. No background work.
 */
async function generateMockJson({ system, user, schemaHint }) {
  const started = Date.now();
  const latency = Number(GEMINI_MOCK_LATENCY_MS) || 250;
  await sleep(latency);

  const intent = detectIntent({ system, schemaHint });
  const ctx = parseUser(user);
  let data;
  if (intent === "market") data = deterministicMarket(ctx);
  else if (intent === "replenish") data = mockReplenish(ctx);
  else if (intent === "session") data = mockSession(ctx);
  else data = mockPersonalize(ctx);

  const promptTokens = estimateTokens(system) + estimateTokens(user) + estimateTokens(schemaHint);
  const completionTokens = estimateTokens(JSON.stringify(data));
  const latencyMs = Date.now() - started;

  return {
    ok: true,
    data,
    model: "mock-flash",
    mode: "mock",
    metrics: {
      model: "mock-flash",
      intent,
      promptTokens,
      completionTokens,
      latencyMs,
    },
  };
}

module.exports = { generateMockJson, detectIntent };
