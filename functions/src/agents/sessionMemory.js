const { db, admin, FieldValue, Timestamp } = require("../db");
const { generateJson } = require("../ai/gemini");
const { acquireLock, releaseLock } = require("../lib/locks");
const { agentLog } = require("../lib/agentLog");
const { getAgentMemory, getActiveLocalEvents, getProducts } = require("../lib/customers");
const { toDate } = require("../lib/format");
const { getRegionIdForStore } = require("../lib/regions");

async function loadSessionEvents(sessionId) {
  const snap = await db.collection("events").where("sessionId", "==", sessionId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (toDate(a.at)?.getTime() || 0) - (toDate(b.at)?.getTime() || 0));
}

function compressEvents(events, productById) {
  return events.slice(0, 80).map((event) => ({
    type: event.type,
    productId: event.productId || null,
    productName: event.productId ? productById[event.productId]?.name : null,
    dwellMs: event.dwellMs ?? null,
    query: event.query ?? null,
  }));
}

function fallbackSummary({ session, events, productById, order }) {
  const views = events.filter((e) => e.type === "product_view");
  const adds = events.filter((e) => e.type === "add_to_cart");
  const checkedOut = Boolean(order || session.orderId || events.some((e) => e.type === "checkout"));
  const topView = views.sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0))[0];
  const names = adds.map((e) => productById[e.productId]?.name || e.productId).filter(Boolean);
  const orderNames = (order?.items || []).map((item) => item.name).filter(Boolean);
  const headline = checkedOut
    ? `Checked out ${orderNames.slice(0, 3).join(", ") || names.slice(0, 3).join(", ") || "cart"}`
    : adds.length
      ? `Browsed and added ${names.slice(0, 3).join(", ") || "items"}`
      : topView
        ? `Viewed ${productById[topView.productId]?.name || topView.productId} without buying`
        : "Short browse session";
  const summary = checkedOut
    ? `Completed mock checkout for session ${session.id}: ${order?.itemCount || adds.length} items, $${Number(order?.total || 0).toFixed(2)} total.`
    : `Fallback summary for session ${session.id}: ${events.length} events, ${adds.length} cart adds. ${
        topView ? `Longest dwell was ${(topView.dwellMs / 1000).toFixed(1)}s on ${productById[topView.productId]?.name || topView.productId}.` : ""
      }`;
  return {
    headline,
    summary,
    intents: checkedOut || adds.length ? ["storm_prep", "grocery"] : ["browse_only"],
    productsViewed: views.map((e) => ({
      productId: e.productId,
      name: productById[e.productId]?.name || e.productId,
      dwellSec: round1((e.dwellMs || 0) / 1000),
    })),
    productsAdded: adds.map((e) => e.productId).filter(Boolean),
    productsAbandoned: checkedOut
      ? []
      : views.map((e) => e.productId).filter((id) => id && !adds.some((a) => a.productId === id)),
    signalsDerived: topView
      ? [
          {
            type: "dwell",
            detail: `${round1((topView.dwellMs || 0) / 1000)}s on ${topView.productId}`,
            weight: topView.productId,
            before: 0.5,
            after: 0.62,
          },
        ]
      : [],
    followUps: checkedOut
      ? ["Use purchased storm staples to refine next-trip ranking."]
      : ["Keep storm staples ranked when a local warning is active."],
    keyFacts: checkedOut
      ? [`Checked out order ${order?.id || session.orderId}`, ...(orderNames.length ? [`Bought: ${orderNames.join(", ")}`] : [])]
      : names.length
        ? [`Recently added: ${names.join(", ")}`]
        : ["Browse-only session"],
    openThreads: checkedOut ? [] : adds.length ? ["Cart not checked out in this demo session"] : [],
    weightDeltas: {},
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Finite session-memory job. Trigger: POST /api/sessions/:id/end only.
 * Idempotent via sessions.summarizedAt.
 */
async function runSessionMemory(sessionId) {
  const started = Date.now();
  agentLog("sessionMemory", "start", { sessionId });
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return { error: "Unknown session", status: 404 };
  const session = { id: sessionSnap.id, ...sessionSnap.data() };

  if (session.summarizedAt) {
    const existing = await db
      .collection("customers")
      .doc(session.customerId)
      .collection("sessionSummaries")
      .doc(sessionId)
      .get();
    agentLog("sessionMemory", "end", {
      skipped: true,
      reason: "already_summarized",
      sessionId,
      durationMs: Date.now() - started,
    });
    return {
      skipped: true,
      reason: "already_summarized",
      summary: existing.exists ? existing.data() : null,
    };
  }

  const lockId = `sessionMemory:${sessionId}`;
  const lock = await acquireLock(lockId);
  if (!lock.ok) {
    agentLog("sessionMemory", "end", { skipped: true, reason: lock.reason, durationMs: Date.now() - started });
    return { skipped: true, reason: lock.reason };
  }

  try {
    const regionId = session.storeId ? await getRegionIdForStore(session.storeId) : null;
    const [events, products, memory, localEvents] = await Promise.all([
      loadSessionEvents(sessionId),
      getProducts(),
      getAgentMemory(session.customerId),
      getActiveLocalEvents({ regionId }),
    ]);
    const productById = Object.fromEntries(products.map((p) => [p.id, p]));
    const endedAt = new Date();
    const loginAt = toDate(session.loginAt) || endedAt;
    const durationSec = Math.max(1, Math.round((endedAt.getTime() - loginAt.getTime()) / 1000));

    let order = null;
    if (session.orderId) {
      const orderSnap = await db.collection("orders").doc(session.orderId).get();
      if (orderSnap.exists) order = { id: orderSnap.id, ...orderSnap.data() };
    }

    let payload = fallbackSummary({ session, events, productById, order });
    let usedGemini = false;
    let mode = "fallback";

    agentLog("sessionMemory", "gemini_call", { sessionId, eventCount: events.length });
    const ai = await generateJson({
      system:
        "You are Spark Agent summarizing one grocery shopping session for long-term memory. Be concise and factual. No markdown. If checkout/order is present, outcome is a completed purchase — do not treat the cart as abandoned, and leave openThreads empty or non-cart.",
      schemaHint:
        '{"headline":"...","summary":"...","intents":["storm_prep"],"productsViewed":[{"productId":"eggs","name":"...","dwellSec":8.2}],"productsAdded":["milk"],"productsAbandoned":["eggs"],"signalsDerived":[{"type":"dwell","detail":"...","weight":"dairy_and_eggs","before":0.5,"after":0.7}],"followUps":["..."],"keyFacts":["..."],"openThreads":["..."],"weightDeltas":{"dairy_and_eggs":0.05}}',
      user: JSON.stringify({
        session: {
          id: session.id,
          customerId: session.customerId,
          channel: session.channel,
          device: session.device,
          entryPoint: session.entryPoint,
          orderId: session.orderId || null,
          outcomeHint: session.outcome || null,
        },
        order: order
          ? {
              id: order.id,
              total: order.total,
              itemCount: order.itemCount,
              items: (order.items || []).map((item) => ({
                productId: item.productId,
                name: item.name,
                qty: item.qty,
              })),
            }
          : null,
        priorMemory: memory
          ? { summary: memory.summary, keyFacts: memory.keyFacts, openThreads: memory.openThreads }
          : null,
        localEvents: localEvents.map((e) => e.headline),
        events: compressEvents(events, productById),
      }),
    });

    if (ai.ok && ai.data) {
      usedGemini = true;
      mode = ai.mode || "live";
      payload = { ...payload, ...ai.data };
      agentLog("sessionMemory", "gemini_ok", { mode, metrics: ai.metrics });
    } else {
      agentLog("sessionMemory", "fallback", { mode: ai.mode || "off", error: ai.error });
    }

    const generatedBy =
      mode === "mock" ? "spark-agent-mock" : usedGemini ? "spark-agent-gemini" : "spark-agent-fallback";

    const customerRef = db.collection("customers").doc(session.customerId);
    const customerSnap = await customerRef.get();
    const customer = customerSnap.data() || {};
    const weights = { ...(customer.preferenceWeights || {}) };
    for (const [key, delta] of Object.entries(payload.weightDeltas || {})) {
      const next = Math.min(1, Math.max(0, (weights[key] || 0.3) + Number(delta || 0)));
      weights[key] = Math.round(next * 100) / 100;
    }
    // Soft bump from dwell signals if model omitted weightDeltas.
    for (const signal of payload.signalsDerived || []) {
      if (signal.weight && typeof signal.after === "number") {
        weights[signal.weight] = signal.after;
      }
    }

    // Reload session in case checkout just attached an orderId / purchased outcome.
    const freshSessionSnap = await sessionRef.get();
    const freshSession = freshSessionSnap.exists ? freshSessionSnap.data() : session;
    if (!order && freshSession.orderId) {
      const orderSnap = await db.collection("orders").doc(freshSession.orderId).get();
      if (orderSnap.exists) order = { id: orderSnap.id, ...orderSnap.data() };
    }

    const outcome =
      freshSession.orderId || freshSession.outcome === "purchased" || order
        ? "purchased"
        : payload.productsAdded?.length
          ? "abandoned_cart"
          : "browse_only";

    const summaryDoc = {
      sessionId,
      customerId: session.customerId,
      startedAt: session.loginAt || Timestamp.fromDate(loginAt),
      endedAt: Timestamp.fromDate(endedAt),
      durationSec,
      channel: session.channel || "web",
      device: session.device || "desktop",
      outcome,
      headline: payload.headline,
      summary: payload.summary,
      intents: payload.intents || [],
      productsViewed: payload.productsViewed || [],
      productsAdded: payload.productsAdded || [],
      productsAbandoned: outcome === "purchased" ? [] : payload.productsAbandoned || [],
      orderId: freshSession.orderId || null,
      spend: order?.total || 0,
      context: { localEventIds: localEvents.map((e) => e.id), storeId: session.storeId },
      signalsDerived: payload.signalsDerived || [],
      followUps: payload.followUps || [],
      generatedBy,
      generatedAt: FieldValue.serverTimestamp(),
    };

    const priorFacts = memory?.keyFacts || [];
    const mergedFacts = [...new Set([...(payload.keyFacts || []), ...priorFacts])].slice(0, 12);
    const rawThreads = payload.openThreads || memory?.openThreads || [];
    const openThreads =
      outcome === "purchased"
        ? rawThreads.filter((thread) => !/abandon|without checkout|not check|left in cart/i.test(String(thread)))
        : rawThreads;

    agentLog("sessionMemory", "write", {
      sessionId,
      eventCount: events.length,
      outcome,
      orderId: freshSession.orderId || null,
      spend: summaryDoc.spend,
    });
    const batch = db.batch();
    batch.set(customerRef.collection("sessionSummaries").doc(sessionId), summaryDoc);
    batch.set(
      customerRef.collection("agentMemory").doc("current"),
      {
        summary: payload.summary,
        keyFacts: mergedFacts,
        openThreads,
        customerId: session.customerId,
        lastSessionId: sessionId,
        sessionsSummarized: (memory?.sessionsSummarized || 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batch.update(customerRef, {
      preferenceWeights: weights,
      agentSummary: payload.summary,
      lastLoginAt: Timestamp.fromDate(endedAt),
    });
    batch.update(sessionRef, {
      endedAt: Timestamp.fromDate(endedAt),
      durationSec,
      outcome: summaryDoc.outcome,
      summarizedAt: FieldValue.serverTimestamp(),
      counts: {
        productViews: events.filter((e) => e.type === "product_view").length,
        searches: events.filter((e) => e.type === "search").length,
        cartAdds: events.filter((e) => e.type === "add_to_cart").length,
        recsShown: events.filter((e) => e.type === "recommendation_shown").length,
        recsAccepted: events.filter((e) => e.type === "recommendation_click").length,
      },
    });

    await batch.commit();
    await releaseLock(lockId, { skipped: false, usedGemini, mode });

    const result = {
      skipped: false,
      usedGemini,
      mode,
      metrics: ai.metrics || null,
      geminiError: usedGemini ? null : ai.error || null,
      summary: summaryDoc,
    };
    agentLog("sessionMemory", "end", {
      skipped: false,
      mode,
      usedGemini,
      sessionId,
      durationMs: Date.now() - started,
      metrics: ai.metrics || null,
    });
    return result;
  } catch (err) {
    agentLog("sessionMemory", "error", { error: err.message, durationMs: Date.now() - started });
    await releaseLock(lockId, { status: "error", error: err.message });
    throw err;
  }
}

module.exports = { runSessionMemory };
