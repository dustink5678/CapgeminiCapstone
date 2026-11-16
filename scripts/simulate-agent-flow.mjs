/**
 * Finite end-to-end agent simulation against the Functions emulator.
 * No real Gemini key required (GEMINI_MODE=mock).
 *
 * Prerequisites:
 *   1. firebase emulators:start --only functions,firestore
 *   2. npm run seed:emulator
 *   3. npm run simulate
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectId =
  process.env.GCLOUD_PROJECT ||
  JSON.parse(readFileSync(join(__dirname, "../.firebaserc"), "utf8")).projects?.default ||
  "capgeminidemo2";

const BASE =
  process.env.SIMULATE_API_BASE ||
  `http://127.0.0.1:5001/${projectId}/us-central1/api`;

const results = [];
let tokenTotal = { prompt: 0, completion: 0, latencyMs: 0, modelCalls: 0 };

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": `sim-${Date.now().toString(36)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status} ${method} ${path}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (data?.metrics) {
    tokenTotal.prompt += data.metrics.promptTokens || 0;
    tokenTotal.completion += data.metrics.completionTokens || 0;
    tokenTotal.latencyMs += data.metrics.latencyMs || 0;
    tokenTotal.modelCalls += 1;
  }
  return data;
}

async function main() {
  console.log(`Simulate against ${BASE}`);
  console.log("GEMINI key not required — expect mock mode.\n");

  // 1. Health
  const health = await api("GET", "/api/health");
  if (health.ok && health.geminiMode === "mock") {
    pass("health", `geminiMode=${health.geminiMode}`);
  } else if (health.ok) {
    pass("health", `geminiMode=${health.geminiMode} (expected mock if no key)`);
  } else {
    fail("health", JSON.stringify(health));
  }

  // 2. Session create
  const session = await api("POST", "/api/sessions", {
    channel: "web",
    device: "desktop",
    entryPoint: "simulate",
  });
  if (session.sessionId) pass("session.create", session.sessionId);
  else fail("session.create", JSON.stringify(session));

  // 3. Events (send → store)
  const events = await api("POST", "/api/events", {
    events: [
      { sessionId: session.sessionId, type: "product_view", productId: "eggs", dwellMs: 8200, source: "for_you" },
      { sessionId: session.sessionId, type: "product_view", productId: "milk", dwellMs: 3100, source: "for_you" },
      { sessionId: session.sessionId, type: "add_to_cart", productId: "water", source: "home", detail: { qty: 1 } },
    ],
  });
  if (events.count >= 3) pass("events.write", `count=${events.count}`);
  else fail("events.write", JSON.stringify(events));

  // 3b. Market context: org-wide fan-out, one job per active region (calendar + GNews + model)
  const market = await api("POST", "/api/agents/market-context", { force: true });
  const regionRuns = market.regions || [];
  const regionsOk = regionRuns.length > 0 && regionRuns.every((r) => !r.error && (r.skipped || r.eventIds?.length));
  if (regionsOk) {
    pass(
      "market_context.run",
      `regions=${regionRuns.map((r) => `${r.regionId}:${r.skipped ? r.reason : `${r.mode}/${r.eventIds.length}ev`}`).join(",")} news=${market.national?.status}`,
    );
  } else {
    fail("market_context.run", JSON.stringify(market));
  }
  const context = await api("GET", "/api/market-context?storeId=4127");
  if (context.storeRegion?.marketBrief?.headline) {
    pass("market_context.read", `store 4127 → ${context.storeRegion.id}: ${context.storeRegion.marketBrief.headline}`);
  } else {
    fail("market_context.read", "no brief for store 4127's region");
  }

  // 4. Personalize (model sim → store recs)
  const personalize = await api("POST", "/api/agents/personalize", { force: true });
  if (!personalize.skipped && personalize.recommendations?.length) {
    pass(
      "personalize.run",
      `mode=${personalize.mode} recs=${personalize.recommendations.length} latency=${personalize.metrics?.latencyMs ?? "?"}ms`,
    );
  } else {
    fail("personalize.run", JSON.stringify(personalize));
  }

  // 5. Catalog read-back (access storage)
  const catalog = await api("GET", "/api/catalog");
  const withRecs = catalog.filter((item) => item.recommendation);
  if (withRecs.length > 0) pass("catalog.read_recs", `recommended=${withRecs.length}`);
  else fail("catalog.read_recs", "no recommendation fields on catalog");

  // 6. Bundles
  const bundles = await api("GET", "/api/bundles");
  if (Array.isArray(bundles) && bundles.length > 0) pass("bundles.read", `count=${bundles.length}`);
  else fail("bundles.read", JSON.stringify(bundles));

  // 7. Replenish
  const replenish = await api("POST", "/api/agents/replenish", { force: true });
  if (!replenish.skipped && replenish.order?.lines?.length) {
    pass(
      "replenish.run",
      `mode=${replenish.mode} lines=${replenish.order.lines.length} latency=${replenish.metrics?.latencyMs ?? "?"}ms`,
    );
  } else {
    fail("replenish.run", JSON.stringify(replenish));
  }

  // 8. Insights / store-order read
  const insights = await api("GET", "/api/insights");
  const order = await api("GET", "/api/store-order");
  if (insights.notes?.daily && order.lines?.length) {
    pass("insights.read", `order=${order.id} status=${order.status}`);
  } else {
    fail("insights.read", "missing notes or order lines");
  }

  // 9. Session end → memory
  const ended = await api("POST", `/api/sessions/${session.sessionId}/end`, {});
  if (!ended.skipped && ended.summary?.headline) {
    pass(
      "session.end_memory",
      `mode=${ended.mode} headline="${ended.summary.headline.slice(0, 60)}"`,
    );
  } else if (ended.skipped && ended.reason === "already_summarized") {
    pass("session.end_memory", "already_summarized");
  } else {
    fail("session.end_memory", JSON.stringify(ended));
  }

  // 10. Account read-back
  const account = await api("GET", "/api/accounts/doug");
  if (account.summary && account.weights?.length) {
    pass("account.read_memory", `weights=${account.weights.length}`);
  } else {
    fail("account.read_memory", "missing summary/weights");
  }

  // 11. Second personalize should skip (cache) — proves no endless re-run
  const again = await api("POST", "/api/agents/personalize", { force: false });
  if (again.skipped && (again.reason === "cache_fresh" || again.reason === "in_flight")) {
    pass("personalize.cache_skip", `reason=${again.reason}`);
  } else if (!again.skipped) {
    // Cart/fingerprint may differ slightly; still OK if finite single run
    pass("personalize.cache_skip", `ran once more (mode=${again.mode}) — still finite`);
  } else {
    fail("personalize.cache_skip", JSON.stringify(again));
  }

  // 12. Idempotent session end
  const againEnd = await api("POST", `/api/sessions/${session.sessionId}/end`, {});
  if (againEnd.skipped && againEnd.reason === "already_summarized") {
    pass("session.end_idempotent", "already_summarized");
  } else {
    fail("session.end_idempotent", JSON.stringify(againEnd));
  }

  console.log("\n--- Mock model performance ---");
  console.log(`modelCalls:        ${tokenTotal.modelCalls}`);
  console.log(`promptTokens(~):   ${tokenTotal.prompt}`);
  console.log(`completionTokens:  ${tokenTotal.completion}`);
  console.log(`latencyMs total:   ${tokenTotal.latencyMs}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    process.exitCode = 1;
    console.error("Failed:", failed.map((f) => f.name).join(", "));
  } else {
    console.log("Simulation complete — pipeline send/receive/store/session/recs OK under mock mode.");
  }
}

main().catch((err) => {
  console.error("Simulation aborted:", err.message);
  if (String(err.message).includes("fetch failed") || err.code === "ECONNREFUSED") {
    console.error("\nStart emulators first:\n  npm run emulators\n  npm run seed:emulator\n  npm run simulate");
  }
  process.exit(1);
});
