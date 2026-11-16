const { db } = require("../db");
const { DEMO_CUSTOMER_ID, DEMO_CUSTOMER_KEY } = require("../config");

async function resolveCustomer(demoKey = DEMO_CUSTOMER_KEY) {
  if (demoKey === DEMO_CUSTOMER_KEY || demoKey === DEMO_CUSTOMER_ID) {
    const snap = await db.collection("customers").doc(DEMO_CUSTOMER_ID).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
  }

  const byKey = await db.collection("customers").where("demoKey", "==", demoKey).limit(1).get();
  if (!byKey.empty) {
    const doc = byKey.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  const byId = await db.collection("customers").doc(demoKey).get();
  if (byId.exists) return { id: byId.id, ...byId.data() };

  return null;
}

function asDate(value) {
  return value?.toDate?.() || (value ? new Date(value) : null);
}

/**
 * Active local events for a scope. Accepts a ZIP string (legacy) or `{ zip, regionId }`.
 * When regionId is known it wins over ZIP matching.
 */
async function getActiveLocalEvents(scope) {
  const { zip = null, regionId = null } =
    typeof scope === "string" || scope == null ? { zip: scope || null } : scope;
  const snap = await db.collection("localEvents").get();
  const now = Date.now();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((event) => {
      const validFrom = asDate(event.validFrom);
      const validTo = asDate(event.validTo);
      const live = event.source === "market_context";
      // Seeded Hurricane Rose events are dated 2027 and stay active for the classic demo.
      const inWindow = live
        ? (!validFrom || validFrom.getTime() <= now) && (!validTo || validTo.getTime() > now)
        : !validTo || validTo.getTime() > now || validTo.getFullYear() >= 2027;
      if (!inWindow) return false;

      const eventRegions = event.regionIds?.length ? event.regionIds : event.regionId ? [event.regionId] : [];
      if (regionId && eventRegions.length) return eventRegions.includes(regionId);
      return !zip || !event.zips?.length || event.zips.includes(zip);
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(severity) {
  return { warning: 4, high: 3, moderate: 2, info: 1 }[severity] || 0;
}

async function getPantry(customerId) {
  const snap = await db.collection("customers").doc(customerId).collection("pantry").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getAgentMemory(customerId) {
  const snap = await db.collection("customers").doc(customerId).collection("agentMemory").doc("current").get();
  return snap.exists ? snap.data() : null;
}

async function getProducts() {
  const snap = await db.collection("products").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function productToCatalogItem(product) {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    was: product.wasPrice ?? undefined,
    unitPrice: product.unitPrice ?? undefined,
    aisle: product.aisle,
    shelf: product.shelf || (product.category === "storm_prep" ? "storm" : "staples"),
    tags: product.tags || [],
    badge: product.badge ?? undefined,
    image: product.image || `/products/${product.id}.jpg`,
    source: product.imageSource,
  };
}

module.exports = {
  resolveCustomer,
  getActiveLocalEvents,
  severityRank,
  getPantry,
  getAgentMemory,
  getProducts,
  productToCatalogItem,
};
