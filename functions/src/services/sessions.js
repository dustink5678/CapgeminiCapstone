const { db, admin, FieldValue, Timestamp } = require("../db");
const { DEMO_CUSTOMER_ID, DEMO_STORE_ID } = require("../config");
const { resolveCustomer } = require("../lib/customers");
const { runSessionMemory } = require("../agents/sessionMemory");

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function startSession({
  demoKey,
  channel = "web",
  device = "desktop",
  entryPoint = "direct",
} = {}) {
  const customer = await resolveCustomer(demoKey);
  const customerId = customer?.id || DEMO_CUSTOMER_ID;
  const storeId = customer?.homeStoreId || DEMO_STORE_ID;
  const sessionId = newId("sess_live");

  await db.collection("sessions").doc(sessionId).set({
    customerId,
    storeId,
    loginAt: FieldValue.serverTimestamp(),
    authMethod: "demo",
    endedAt: null,
    durationSec: null,
    channel,
    device,
    appVersion: null,
    entryPoint,
    counts: { productViews: 0, searches: 0, cartAdds: 0, recsShown: 0, recsAccepted: 0 },
    totalDwellSec: 0,
    outcome: null,
    orderId: null,
    localEventIds: [],
    summarizedAt: null,
  });

  await db.collection("events").doc(newId("evt")).set({
    customerId,
    sessionId,
    type: "login",
    at: FieldValue.serverTimestamp(),
    productId: null,
    dwellMs: null,
    source: null,
    position: null,
    query: null,
    detail: { authMethod: "demo" },
  });

  return { sessionId, customerId, storeId };
}

async function recordEvents(body) {
  const events = Array.isArray(body?.events) ? body.events : [body];
  const valid = events.filter((event) => event?.sessionId && event?.type);
  if (!valid.length) return { ok: true, count: 0, ids: [] };

  const sessionIds = [...new Set(valid.map((event) => event.sessionId))];
  const sessionSnaps = await Promise.all(sessionIds.map((id) => db.collection("sessions").doc(id).get()));
  const sessions = Object.fromEntries(
    sessionSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data()]),
  );

  const batch = db.batch();
  const written = [];
  for (const event of valid) {
    const session = sessions[event.sessionId];
    if (!session) continue;
    const id = newId("evt");
    batch.set(db.collection("events").doc(id), {
      customerId: session.customerId,
      sessionId: event.sessionId,
      type: event.type,
      at: FieldValue.serverTimestamp(),
      productId: event.productId || null,
      dwellMs: event.dwellMs ?? null,
      source: event.source || null,
      position: event.position ?? null,
      query: event.query || null,
      detail: event.detail || {},
    });
    written.push(id);
  }

  if (written.length) await batch.commit();
  return { ok: true, count: written.length, ids: written };
}

async function endSession(sessionId) {
  // Cheap session_end event, then one finite memory agent run.
  const sessionSnap = await db.collection("sessions").doc(sessionId).get();
  if (!sessionSnap.exists) return { error: "Unknown session", status: 404 };

  await db.collection("events").doc(newId("evt")).set({
    customerId: sessionSnap.data().customerId,
    sessionId,
    type: "session_end",
    at: FieldValue.serverTimestamp(),
    productId: null,
    dwellMs: null,
    source: null,
    position: null,
    query: null,
    detail: {},
  });

  return runSessionMemory(sessionId);
}

module.exports = { startSession, recordEvents, endSession };
