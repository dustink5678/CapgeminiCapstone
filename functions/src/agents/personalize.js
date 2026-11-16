const { db, admin, FieldValue, Timestamp } = require("../db");
const { generateJson } = require("../ai/gemini");
const { fingerprint } = require("../lib/hash");
const { acquireLock, releaseLock } = require("../lib/locks");
const { agentLog } = require("../lib/agentLog");
const {
  resolveCustomer,
  getActiveLocalEvents,
  getPantry,
  getAgentMemory,
  getProducts,
} = require("../lib/customers");
const { getRegionIdForStore } = require("../lib/regions");
const {
  DEMO_CUSTOMER_KEY,
  DEMO_STORE_ID,
  PERSONALIZE_TTL_MS,
  TOP_N_RECS,
  TOP_N_BUNDLES,
} = require("../config");

function cacheRef(customerId) {
  return db.collection("agentCaches").doc(`personalize_${customerId}`);
}

function scoreProduct(product, { weights, pantry, localEvents, cartIds }) {
  let score = 0;
  const signals = [];
  const aisleKey = (product.aisle || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const nameKey = (product.name || "").toLowerCase();

  for (const [key, weight] of Object.entries(weights || {})) {
    if (aisleKey.includes(key.slice(0, 6)) || key.includes(aisleKey.slice(0, 6))) {
      score += Number(weight) * 2;
      signals.push(`preference:${key}`);
    }
  }

  const pantryRow = pantry.find((row) => row.productId === product.id);
  if (pantryRow) {
    const runOut = pantryRow.estimatedRunOutAt?.toDate?.() || new Date(pantryRow.estimatedRunOutAt);
    const days = (runOut.getTime() - Date.now()) / 86400000;
    // Seeded pantry dates are in 2027 — treat near-term demo urgency for milk/eggs style staples.
    if (days < 3 || runOut.getFullYear() >= 2027) {
      score += 1.5;
      signals.push("pantry_runout");
    }
  }

  let topEvent = null;
  let topBoost = 0;
  const productTags = new Set(product.tags || []);
  for (const event of localEvents) {
    const severityBoost = SEVERITY_BOOST[event.severity] || 1;
    let boost = 0;
    if (event.affectedProductIds?.includes(product.id)) boost = severityBoost;
    else if ((event.tags || []).some((tag) => productTags.has(tag))) boost = severityBoost * 0.5;
    if (!boost) continue;
    score += boost;
    signals.push(`local_event:${event.type}`);
    if (event.type === "holiday") signals.push(`holiday:${(event.tags || [])[0] || "holiday"}`);
    if (boost > topBoost) {
      topBoost = boost;
      topEvent = event;
    }
  }

  if (product.category === "storm_prep" && localEvents.some((e) => e.severity === "warning" || e.type === "news_alert")) {
    score += 1.2;
    signals.push("storm_prep");
  }

  if (cartIds.has(product.id)) score -= 5;

  // Soft preference for demo narrative staples when scores are close.
  if (["milk", "eggs", "water", "batteries", "bread"].includes(product.id)) score += 0.4;

  if (nameKey.includes("orange juice") || product.id === "oj") score -= 0.5;

  return {
    score,
    signals: [...new Set(signals)],
    eventLabel: topEvent ? eventLabel(topEvent) : null,
    eventHeadline: topEvent?.headline || null,
  };
}

const SEVERITY_BOOST = { warning: 3, high: 2, moderate: 1.5, info: 1 };

function eventLabel(event) {
  if (event.label) return event.label;
  if (event.type === "news_alert" && event.severity === "warning") return "Hurricane warning";
  return { news_alert: "Local news", weather_forecast: "Weather", social_trend: "Area trend", school_closure: "Schools closed" }[event.type] || "Local event";
}

function fallbackReasons(candidates, localEvents) {
  const headline = localEvents[0]?.headline || "Local demand signal";
  return candidates.map((c, i) => ({
    productId: c.id,
    rank: i + 1,
    label: c.eventLabel || "Picked for you",
    reason: `${c.eventHeadline || headline}. Ranked ${c.id} using ${c.signals.join(", ") || "preference weights"} (deterministic fallback).`,
    signalsUsed: c.signals,
  }));
}

async function buildFingerprint(customer, pantry, localEvents, cartIds) {
  return fingerprint({
    preferenceWeights: customer.preferenceWeights || {},
    activeLocalEventIds: localEvents.map((e) => e.id).sort(),
    pantryRunOutIds: pantry.map((p) => p.productId).sort(),
    cartProductIds: [...cartIds].sort(),
  });
}

async function getCachedPersonalize(customerId) {
  const snap = await cacheRef(customerId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Finite personalization job. Trigger: POST /api/agents/personalize only.
 * Ends after one optional Gemini call + Firestore writes.
 */
async function runPersonalize({ demoKey = DEMO_CUSTOMER_KEY, force = false, cartProductIds = [] } = {}) {
  const started = Date.now();
  agentLog("personalize", "start", { force, cartCount: cartProductIds.length });

  const customer = await resolveCustomer(demoKey);
  if (!customer) return { error: "Unknown customer", status: 404 };

  const lockId = `personalize:${customer.id}`;
  const lock = await acquireLock(lockId);
  if (!lock.ok) {
    const cached = await getCachedPersonalize(customer.id);
    agentLog("personalize", "end", {
      skipped: true,
      reason: lock.reason,
      durationMs: Date.now() - started,
      recCount: cached?.recommendations?.length || 0,
    });
    return {
      skipped: true,
      reason: lock.reason,
      cached: true,
      recommendations: cached?.recommendations || [],
      bundles: cached?.bundles || [],
    };
  }

  try {
    const regionId = await getRegionIdForStore(customer.homeStoreId || DEMO_STORE_ID);
    const [pantry, localEvents, memory, products] = await Promise.all([
      getPantry(customer.id),
      getActiveLocalEvents({ zip: customer.zip, regionId }),
      getAgentMemory(customer.id),
      getProducts(),
    ]);
    const cartIds = new Set(cartProductIds);
    const fp = await buildFingerprint(customer, pantry, localEvents, cartIds);
    const cached = await getCachedPersonalize(customer.id);
    const fresh =
      cached &&
      cached.fingerprint === fp &&
      cached.updatedAt?.toMillis?.() > Date.now() - PERSONALIZE_TTL_MS;

    if (!force && fresh) {
      agentLog("personalize", "cache_hit", { fingerprint: fp });
      await releaseLock(lockId, { skipped: true, reason: "cache_fresh" });
      agentLog("personalize", "end", {
        skipped: true,
        reason: "cache_fresh",
        fingerprint: fp,
        durationMs: Date.now() - started,
        recCount: cached.recommendations?.length || 0,
      });
      return {
        skipped: true,
        reason: "cache_fresh",
        fingerprint: fp,
        recommendations: cached.recommendations,
        bundles: cached.bundles,
        usedGemini: false,
      };
    }

    const scored = products
      .map((product) => {
        const scoredProduct = scoreProduct(product, {
          weights: customer.preferenceWeights,
          pantry,
          localEvents,
          cartIds,
        });
        return { ...product, ...scoredProduct };
      })
      .filter((p) => !cartIds.has(p.id))
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, TOP_N_RECS);
    const bundlePool = scored.filter((p) => !top.some((t) => t.id === p.id)).slice(0, TOP_N_BUNDLES);

    const context = {
      customer: {
        name: customer.name,
        zip: customer.zip,
        household: customer.household,
        preferenceWeights: customer.preferenceWeights,
        agentSummary: customer.agentSummary,
        memorySummary: memory?.summary,
        keyFacts: memory?.keyFacts,
      },
      regionId,
      localEvents: localEvents.map((e) => ({
        id: e.id,
        type: e.type,
        label: e.label || null,
        headline: e.headline,
        severity: e.severity,
        tags: e.tags || [],
        affectedProductIds: e.affectedProductIds,
      })),
      pantry: pantry.map((p) => ({ productId: p.productId, avgIntervalDays: p.avgIntervalDays })),
      candidates: top.map((p) => ({
        id: p.id,
        name: p.name,
        aisle: p.aisle,
        tags: p.tags || [],
        score: p.score,
        signals: p.signals,
        eventLabel: p.eventLabel,
        eventHeadline: p.eventHeadline,
      })),
      bundleCandidates: bundlePool.map((p) => ({ id: p.id, name: p.name, signals: p.signals })),
    };

    let recommendations = fallbackReasons(top, localEvents);
    let bundles = bundlePool.slice(0, 4).map((p) => ({
      productId: p.id,
      reason: `Pairs with the current basket given ${p.signals.join(", ") || "shopping patterns"} (fallback).`,
    }));
    let usedGemini = false;
    let mode = "fallback";

    agentLog("personalize", "gemini_call", {
      fingerprint: fp,
      candidateCount: top.length,
      contextBytes: JSON.stringify(context).length,
    });

    const ai = await generateJson({
      system:
        "You are Spark Agent for a Walmart-style grocery store. Write short shopper-facing recommendation reasons. Be concrete about the local news, weather, upcoming holidays, seasonal signals, and pantry habits behind each pick; use the candidate's eventLabel as the label when it has one. No markdown.",
      schemaHint:
        '{"recommendations":[{"productId":"milk","rank":1,"label":"Hurricane warning","reason":"...","signalsUsed":["local_event"]}],"bundles":[{"productId":"eggs","reason":"..."}]}',
      user: JSON.stringify(context),
    });

    if (ai.ok && ai.data) {
      usedGemini = true;
      mode = ai.mode || "live";
      if (Array.isArray(ai.data.recommendations) && ai.data.recommendations.length) {
        recommendations = ai.data.recommendations.map((row, i) => ({
          productId: row.productId,
          rank: row.rank || i + 1,
          label: row.label || "Picked for you",
          reason: row.reason || recommendations[i]?.reason,
          signalsUsed: row.signalsUsed || top.find((t) => t.id === row.productId)?.signals || [],
        }));
      }
      if (Array.isArray(ai.data.bundles) && ai.data.bundles.length) {
        bundles = ai.data.bundles.map((row) => ({
          productId: row.productId,
          reason: row.reason,
        }));
      }
      agentLog("personalize", "gemini_ok", { mode, metrics: ai.metrics, recCount: recommendations.length });
    } else {
      agentLog("personalize", "fallback", { mode: ai.mode || "off", error: ai.error });
    }

    const generatedBy =
      mode === "mock" ? "spark-agent-mock" : usedGemini ? "spark-agent-gemini" : "spark-agent-fallback";

    agentLog("personalize", "write", { recCount: recommendations.length, bundleCount: bundles.length });
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    for (const rec of recommendations) {
      const id = `live_${customer.id}_${rec.productId}_for_you`;
      batch.set(db.collection("recommendations").doc(id), {
        customerId: customer.id,
        sessionId: null,
        productId: rec.productId,
        surface: "for_you",
        rank: rec.rank,
        reason: rec.reason,
        signalsUsed: rec.signalsUsed || [],
        label: rec.label,
        shownAt: now,
        clickedAt: null,
        addedAt: null,
        outcome: "ignored",
        generatedBy,
      });
    }
    for (const bundle of bundles) {
      const id = `live_${customer.id}_${bundle.productId}_cart_bundle`;
      batch.set(db.collection("recommendations").doc(id), {
        customerId: customer.id,
        sessionId: null,
        productId: bundle.productId,
        surface: "cart_bundle",
        rank: 0,
        reason: bundle.reason,
        signalsUsed: [],
        shownAt: now,
        outcome: "ignored",
        generatedBy,
      });
    }

    batch.set(cacheRef(customer.id), {
      customerId: customer.id,
      fingerprint: fp,
      updatedAt: now,
      usedGemini,
      mode,
      recommendations,
      bundles,
      status: "complete",
    });

    await batch.commit();
    await releaseLock(lockId, { skipped: false, usedGemini, fingerprint: fp, mode });

    const result = {
      skipped: false,
      fingerprint: fp,
      recommendations,
      bundles,
      usedGemini,
      mode,
      metrics: ai.metrics || null,
      geminiError: usedGemini ? null : ai.error || null,
    };
    agentLog("personalize", "end", {
      skipped: false,
      mode,
      usedGemini,
      fingerprint: fp,
      durationMs: Date.now() - started,
      recCount: recommendations.length,
      metrics: ai.metrics || null,
    });
    return result;
  } catch (err) {
    agentLog("personalize", "error", { error: err.message, durationMs: Date.now() - started });
    await releaseLock(lockId, { status: "error", error: err.message });
    throw err;
  }
}

module.exports = { runPersonalize, getCachedPersonalize, cacheRef };
