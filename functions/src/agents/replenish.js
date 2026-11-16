const { db, admin, FieldValue, Timestamp } = require("../db");
const { generateJson } = require("../ai/gemini");
const { fingerprint } = require("../lib/hash");
const { acquireLock, releaseLock } = require("../lib/locks");
const { agentLog } = require("../lib/agentLog");
const { getActiveLocalEvents, getProducts } = require("../lib/customers");
const { getRegionIdForStore } = require("../lib/regions");
const { DEMO_STORE_ID } = require("../config");
const { formatWhen } = require("../lib/format");

const FOCUS_PRODUCTS = ["milk", "eggs", "water", "bread", "batteries"];

function orderUiShape(order) {
  return {
    status: order.status,
    id: order.id,
    createdAt: order.createdAtLabel || formatWhen(order.createdAt?.toDate?.() || new Date()),
    truck: order.truck,
    lines: (order.lines || []).map((line) => ({
      id: line.productId,
      item: line.name,
      image: line.image || null,
      driver: line.driver || null,
      onHand: line.onHand,
      normal: line.normal72h,
      forecast: line.forecast72h,
      qty: line.qty,
      pack: line.unit,
      caseSize: line.caseSize,
    })),
    approvedAt: order.approvedAtLabel || null,
    reason: order.reason || null,
  };
}

async function loadInventory(storeId) {
  const snap = await db.collection("stores").doc(storeId).collection("inventory").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function loadDailySales(storeId) {
  const snap = await db.collection("stores").doc(storeId).collection("dailySales").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const EVENT_LINE_BOOST = { warning: 2.4, high: 1.9, moderate: 1.6, info: 1.25 };
const MAX_EVENT_LINES = 4;

/**
 * Extra lines beyond the storm staples: products named by high/moderate/warning region events
 * (holiday, news, weather), strongest event first.
 */
function eventDrivenProducts(localEvents, products) {
  const known = new Set(products.map((p) => p.id));
  const picks = new Map();
  for (const event of localEvents) {
    if (!["warning", "high", "moderate"].includes(event.severity)) continue;
    for (const productId of event.affectedProductIds || []) {
      if (FOCUS_PRODUCTS.includes(productId) || !known.has(productId) || picks.has(productId)) continue;
      picks.set(productId, event);
    }
  }
  return [...picks.entries()].slice(0, MAX_EVENT_LINES);
}

function computeLines({ inventory, dailySales, products, localEvents }) {
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const packById = { milk: "gal", eggs: "dozen", water: "packs", bread: "loaves", batteries: "packs" };
  const stormBoost = localEvents.some((e) => e.severity === "warning")
    ? 2.4
    : localEvents.some((e) => e.severity === "high")
      ? 1.8
      : 1.2;
  const extra = eventDrivenProducts(localEvents, products);
  const boostById = Object.fromEntries(extra.map(([id, event]) => [id, EVENT_LINE_BOOST[event.severity] || 1.25]));
  const eventById = Object.fromEntries(extra.map(([id, event]) => [id, event]));

  return [...FOCUS_PRODUCTS, ...extra.map(([id]) => id)].map((productId) => {
    const eventBoost = boostById[productId] || stormBoost;
    const inv = inventory.find((row) => row.productId === productId || row.id === productId);
    const sales = dailySales.filter((row) => row.productId === productId);
    const baseline =
      sales.length > 0
        ? Math.round(sales.reduce((s, row) => s + (row.baselineUnits || 0), 0) / Math.max(sales.length, 1))
        : 100;
    const recent =
      sales.length > 0
        ? Math.round(sales.slice(-2).reduce((s, row) => s + row.units, 0) / Math.min(2, sales.length))
        : baseline;
    const onHand = inv?.onHand ?? 0;
    const normal72h = baseline * 3;
    const forecast72h = Math.round(Math.max(recent * 3 * eventBoost, normal72h * 1.5));
    const caseSize = productById[productId]?.caseSize || 12;
    const need = Math.max(forecast72h - onHand, 0);
    const qty = Math.ceil((need * 1.12) / caseSize) * caseSize;
    return {
      productId,
      name: productById[productId]?.name || productId,
      image: productById[productId]?.image || null,
      onHand,
      normal72h,
      forecast72h,
      qty,
      unit: packById[productId] || "units",
      caseSize,
      cases: Math.ceil(qty / caseSize),
      driver: eventById[productId]?.label || eventById[productId]?.headline || null,
    };
  });
}

function fallbackNotes(localEvents, lines) {
  const headline = localEvents[0]?.headline || "Local demand surge";
  const milk = lines.find((l) => l.productId === "milk");
  return {
    daily: `${headline}. Deterministic forecast shows milk/eggs/water well above baseline. Fallback note (Gemini unavailable).`,
    social: `Public storm posts remain elevated around Columbia. Fallback note tied to ${localEvents.map((e) => e.type).join(", ") || "local events"}.`,
    cover: milk
      ? `At the current pace, milk on hand (${milk.onHand}) covers under a day of the ${milk.forecast72h}-unit 72h forecast. Fallback cover note.`
      : "Days of supply are below target for storm staples. Fallback cover note.",
  };
}

/**
 * Finite replenishment job. Trigger: POST /api/agents/replenish only — never on GET.
 */
async function runReplenish({ storeId = DEMO_STORE_ID, force = false } = {}) {
  const started = Date.now();
  agentLog("replenish", "start", { storeId, force });
  const lockId = `replenish:${storeId}`;
  const lock = await acquireLock(lockId);
  if (!lock.ok) {
    const existing = await getLatestStoreOrder(storeId);
    agentLog("replenish", "end", { skipped: true, reason: lock.reason, durationMs: Date.now() - started });
    return { skipped: true, reason: lock.reason, order: existing ? orderUiShape(existing) : null };
  }

  try {
    const regionId = await getRegionIdForStore(storeId);
    const [inventory, dailySales, products, localEvents] = await Promise.all([
      loadInventory(storeId),
      loadDailySales(storeId),
      getProducts(),
      getActiveLocalEvents({ regionId }),
    ]);

    const eventIds = localEvents.map((e) => e.id).sort();
    const fp = fingerprint({ storeId, regionId, localEventIds: eventIds });
    const existing = await getLatestStoreOrder(storeId);

    if (
      !force &&
      existing &&
      existing.status === "draft" &&
      existing.fingerprint === fp
    ) {
      agentLog("replenish", "cache_hit", { reason: "same_event_draft", fingerprint: fp });
      await releaseLock(lockId, { skipped: true, reason: "same_event_draft" });
      agentLog("replenish", "end", {
        skipped: true,
        reason: "same_event_draft",
        fingerprint: fp,
        durationMs: Date.now() - started,
      });
      return { skipped: true, reason: "same_event_draft", order: orderUiShape(existing), usedGemini: false };
    }

    const lines = computeLines({ inventory, dailySales, products, localEvents });
    let reason =
      "Drafted from inventory, recent daily sales vs baseline, and active local events (deterministic).";
    let notes = fallbackNotes(localEvents, lines);
    let usedGemini = false;
    let mode = "fallback";

    agentLog("replenish", "gemini_call", { fingerprint: fp, lineCount: lines.length });
    const ai = await generateJson({
      system:
        "You are Spark Agent writing a short store-manager replenishment reason and three dashboard notes (daily, social, cover). Be concrete, and name the region event (storm, holiday, news) driving any line that has a driver. No markdown.",
      schemaHint:
        '{"reason":"...","notes":{"daily":"...","social":"...","cover":"..."}}',
      user: JSON.stringify({
        storeId,
        regionId,
        localEvents: localEvents.map((e) => ({
          type: e.type,
          label: e.label || null,
          headline: e.headline,
          severity: e.severity,
        })),
        lines,
      }),
    });

    if (ai.ok && ai.data) {
      usedGemini = true;
      mode = ai.mode || "live";
      if (ai.data.reason) reason = ai.data.reason;
      if (ai.data.notes) notes = { ...notes, ...ai.data.notes };
      agentLog("replenish", "gemini_ok", { mode, metrics: ai.metrics });
    } else {
      agentLog("replenish", "fallback", { mode: ai.mode || "off", error: ai.error });
    }

    const generatedBy =
      mode === "mock" ? "spark-agent-mock" : usedGemini ? "spark-agent-gemini" : "spark-agent-fallback";

    const orderId = existing?.id || `PO-${storeId}-LIVE`;
    const createdAtLabel = formatWhen(new Date());
    const order = {
      storeId,
      status: "draft",
      createdBy: "spark-agent",
      createdAt: FieldValue.serverTimestamp(),
      createdAtLabel,
      truck: "Thursday, 11:00pm truck from the regional grocery DC · on shelf before Friday 7am",
      reason,
      localEventIds: eventIds,
      fingerprint: fp,
      lines,
      totalCases: lines.reduce((sum, line) => sum + line.cases, 0),
      normalAutoOrderCases: 110,
      approvedBy: null,
      approvedAt: null,
      approvedAtLabel: null,
      usedGemini,
      mode,
    };

    agentLog("replenish", "write", { orderId, totalCases: order.totalCases });
    const batch = db.batch();
    batch.set(db.collection("storeOrders").doc(orderId), order, { merge: true });

    for (const [chart, text] of Object.entries(notes)) {
      const noteId = `note_${storeId}_live_${chart}`;
      batch.set(db.collection("insightNotes").doc(noteId), {
        storeId,
        chart,
        text,
        createdAt: FieldValue.serverTimestamp(),
        localEventIds: eventIds,
        generatedBy,
      });
    }

    await batch.commit();
    await releaseLock(lockId, { skipped: false, usedGemini, fingerprint: fp, mode });

    const result = {
      skipped: false,
      usedGemini,
      mode,
      metrics: ai.metrics || null,
      geminiError: usedGemini ? null : ai.error || null,
      order: orderUiShape({ id: orderId, ...order }),
      notes,
    };
    agentLog("replenish", "end", {
      skipped: false,
      mode,
      usedGemini,
      fingerprint: fp,
      durationMs: Date.now() - started,
      metrics: ai.metrics || null,
    });
    return result;
  } catch (err) {
    agentLog("replenish", "error", { error: err.message, durationMs: Date.now() - started });
    await releaseLock(lockId, { status: "error", error: err.message });
    throw err;
  }
}

async function getLatestStoreOrder(storeId = DEMO_STORE_ID) {
  const snap = await db.collection("storeOrders").where("storeId", "==", storeId).get();
  if (snap.empty) return null;
  const docs = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });
  return docs[0];
}

module.exports = { runReplenish, getLatestStoreOrder, orderUiShape };
