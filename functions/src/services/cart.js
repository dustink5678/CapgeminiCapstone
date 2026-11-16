const { db, admin, FieldValue, Timestamp } = require("../db");
const { DEMO_CUSTOMER_KEY } = require("../config");
const { getProducts, productToCatalogItem, resolveCustomer } = require("../lib/customers");
const { round2 } = require("../lib/format");

function stateRef(demoKey = DEMO_CUSTOMER_KEY) {
  return db.collection("demoState").doc(demoKey);
}

async function getCartLines(demoKey = DEMO_CUSTOMER_KEY) {
  const snap = await stateRef(demoKey).get();
  if (!snap.exists || !Array.isArray(snap.data().cart)) {
    return [
      { productId: "bread", qty: 1 },
      { productId: "bananas", qty: 1 },
    ];
  }
  return snap.data().cart;
}

async function saveCart(cart, demoKey = DEMO_CUSTOMER_KEY) {
  await stateRef(demoKey).set(
    { cart, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function buildCartResponse(demoKey = DEMO_CUSTOMER_KEY) {
  const [cart, products] = await Promise.all([getCartLines(demoKey), getProducts()]);
  const byId = Object.fromEntries(products.map((p) => [p.id, productToCatalogItem(p)]));
  const lines = cart
    .map((line) => {
      const product = byId[line.productId];
      if (!product) return null;
      return {
        ...product,
        qty: line.qty,
        lineTotal: round2(product.price * line.qty),
        lineWas: product.was ? round2(product.was * line.qty) : null,
      };
    })
    .filter(Boolean);

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const listTotal = round2(lines.reduce((sum, line) => sum + (line.lineWas ?? line.lineTotal), 0));
  return {
    lines,
    subtotal,
    listTotal,
    savings: round2(listTotal - subtotal),
    count: lines.reduce((sum, line) => sum + line.qty, 0),
  };
}

async function addToCart(productId, demoKey = DEMO_CUSTOMER_KEY) {
  const products = await getProducts();
  if (!products.some((p) => p.id === productId)) return { error: "Unknown item" };
  const cart = await getCartLines(demoKey);
  const existing = cart.find((line) => line.productId === productId);
  if (existing) existing.qty += 1;
  else cart.push({ productId, qty: 1 });
  await saveCart(cart, demoKey);

  const customer = await resolveCustomer(demoKey);
  if (customer) {
    const product = products.find((p) => p.id === productId);
    await db.collection("demoState").doc(demoKey).set(
      {
        liveSignals: FieldValue.arrayUnion({
          id: `live-${Date.now()}`,
          source: "Added to cart",
          at: "Just now",
          title: product.name,
          detail: `${customer.name.split(" ")[0]} added ${product.name} during this demo.`,
          effect: "The item is locked into this trip, and cart suggestions can be refreshed.",
          live: true,
        }),
      },
      { merge: true },
    );
  }

  return buildCartResponse(demoKey);
}

async function updateQty(productId, qty, demoKey = DEMO_CUSTOMER_KEY) {
  let cart = await getCartLines(demoKey);
  const line = cart.find((item) => item.productId === productId);
  if (!line) return { error: "Not in cart" };
  if (qty <= 0) cart = cart.filter((item) => item.productId !== productId);
  else line.qty = qty;
  await saveCart(cart, demoKey);
  return buildCartResponse(demoKey);
}

async function resetDemoState(demoKey = DEMO_CUSTOMER_KEY) {
  const customer = await resolveCustomer(demoKey);
  const batch = db.batch();
  batch.set(stateRef(demoKey), {
    cart: [
      { productId: "bread", qty: 1 },
      { productId: "bananas", qty: 1 },
    ],
    liveSignals: [],
    updatedAt: FieldValue.serverTimestamp(),
  });
  // Clear personalize cache so the next Shop visit can run one fresh agent job.
  if (customer?.id) {
    batch.delete(db.collection("agentCaches").doc(`personalize_${customer.id}`));
  }
  await batch.commit();
}

module.exports = {
  getCartLines,
  buildCartResponse,
  addToCart,
  updateQty,
  resetDemoState,
  stateRef,
};
