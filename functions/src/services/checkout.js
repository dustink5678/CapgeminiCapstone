const { db, FieldValue } = require("../db");
const { DEMO_CUSTOMER_KEY, DEMO_STORE_ID } = require("../config");
const { resolveCustomer, getProducts } = require("../lib/customers");
const { getCartLines, buildCartResponse, stateRef } = require("./cart");
const { endSession } = require("./sessions");
const { round2 } = require("../lib/format");
const { agentLog } = require("../lib/agentLog");

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mock checkout: write an order, clear the cart, end the session so
 * session-memory runs with outcome=purchased.
 */
async function checkout({
  sessionId,
  demoKey = DEMO_CUSTOMER_KEY,
  fulfillmentType = "pickup",
} = {}) {
  if (!sessionId) return { error: "sessionId required", status: 400 };

  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return { error: "Unknown session", status: 404 };
  const session = sessionSnap.data();

  if (session.summarizedAt) {
    return { error: "Session already ended", status: 409 };
  }
  if (session.orderId) {
    return { error: "Session already checked out", status: 409 };
  }

  const customer = await resolveCustomer(demoKey);
  const customerId = customer?.id || session.customerId;
  const storeId = session.storeId || customer?.homeStoreId || DEMO_STORE_ID;

  const [cartLines, products, cart] = await Promise.all([
    getCartLines(demoKey),
    getProducts(),
    buildCartResponse(demoKey),
  ]);

  if (!cartLines.length || cart.count <= 0) {
    return { error: "Cart is empty", status: 400 };
  }

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const tax = round2(cart.subtotal * 0.08);
  const total = round2(cart.subtotal + tax);
  const orderId = newId("ord_live");

  const items = cartLines.map((line) => {
    const product = productById[line.productId];
    return {
      productId: line.productId,
      name: product?.name || line.productId,
      qty: line.qty,
      unitPrice: product?.price || 0,
      wasPrice: product?.wasPrice ?? null,
      recommended: false,
      recommendationId: null,
    };
  });

  agentLog("checkout", "start", { sessionId, orderId, itemCount: items.length, total });

  const batch = db.batch();
  batch.set(db.collection("orders").doc(orderId), {
    customerId,
    sessionId,
    storeId,
    placedAt: FieldValue.serverTimestamp(),
    fulfillment: {
      type: fulfillmentType,
      window: "Today, 4pm–5pm",
      date: new Date().toISOString().slice(0, 10),
    },
    items,
    itemCount: items.length,
    subtotal: cart.subtotal,
    savings: cart.savings,
    tax,
    total,
    status: "picked_up",
    mock: true,
  });

  batch.set(db.collection("events").doc(newId("evt")), {
    customerId,
    sessionId,
    type: "checkout",
    at: FieldValue.serverTimestamp(),
    productId: null,
    dwellMs: null,
    source: "cart",
    position: null,
    query: null,
    detail: { orderId, total, itemCount: items.length },
  });

  batch.update(sessionRef, {
    orderId,
    outcome: "purchased",
  });

  // Empty the cart after purchase (Reset demo can restore the starter basket).
  batch.set(
    stateRef(demoKey),
    {
      cart: [],
      liveSignals: [],
      lastOrderId: orderId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  const memory = await endSession(sessionId);
  if (memory?.error) {
    return { error: memory.error, status: memory.status || 500, orderId };
  }

  agentLog("checkout", "end", {
    sessionId,
    orderId,
    total,
    summarized: !memory?.skipped,
    mode: memory?.mode,
  });

  return {
    ok: true,
    order: {
      id: orderId,
      status: "picked_up",
      subtotal: cart.subtotal,
      savings: cart.savings,
      tax,
      total,
      itemCount: items.length,
      fulfillment: {
        type: fulfillmentType,
        window: "Today, 4pm–5pm",
      },
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
    },
    cart: await buildCartResponse(demoKey),
    session: memory,
  };
}

module.exports = { checkout };
