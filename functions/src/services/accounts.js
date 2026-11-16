const { db } = require("../db");
const { resolveCustomer, getAgentMemory, getActiveLocalEvents } = require("../lib/customers");
const { getRegionIdForStore } = require("../lib/regions");
const { DEMO_CUSTOMER_KEY, DEMO_STORE_NAME } = require("../config");
const { toDate, formatWhen } = require("../lib/format");
const { stateRef } = require("./cart");

const WEIGHT_LABELS = {
  dairy_and_eggs: "Dairy and eggs",
  bottled_water: "Bottled water",
  batteries_and_lighting: "Batteries and lighting",
  bread_and_bakery: "Bread and bakery",
  snacks: "Snacks",
  produce: "Produce",
  organic_produce: "Organic produce",
  prepared_meals: "Prepared meals",
  baby_formula: "Baby formula",
  diapers: "Diapers",
  canned_soup: "Canned soup",
  store_brand: "Store brand",
};

function labelForWeight(key) {
  return WEIGHT_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function listAccounts() {
  const snap = await db.collection("customers").get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.demoKey || doc.id,
      name: data.name,
      tier: data.membership?.tier || "Customer",
      store: DEMO_STORE_NAME,
      summary: data.agentSummary || "",
      demo: data.demoKey === DEMO_CUSTOMER_KEY,
    };
  });
}

async function getAccountDetail(demoKey) {
  const customer = await resolveCustomer(demoKey);
  if (!customer) return null;

  const regionId = customer.homeStoreId ? await getRegionIdForStore(customer.homeStoreId) : null;
  const [memory, summariesSnap, localEvents, stateSnap] = await Promise.all([
    getAgentMemory(customer.id),
    db.collection("customers").doc(customer.id).collection("sessionSummaries").limit(8).get(),
    getActiveLocalEvents({ zip: customer.zip, regionId }),
    stateRef(customer.demoKey || demoKey).get(),
  ]);

  const weights = Object.entries(customer.preferenceWeights || {}).map(([key, after]) => ({
    label: labelForWeight(key),
    before: Math.max(0, Number(after) - 0.15),
    after: Number(after),
  }));

  const signals = [];
  for (const event of localEvents.slice(0, 3)) {
    signals.push({
      id: event.id,
      source: event.sourceLabel || event.source || event.type,
      at: formatWhen(toDate(event.issuedAt) || new Date()),
      title: event.headline,
      detail: event.body || "",
      effect: `Affected products: ${(event.affectedProductIds || []).join(", ")}`,
    });
  }

  for (const doc of summariesSnap.docs) {
    const summary = doc.data();
    for (const derived of summary.signalsDerived || []) {
      signals.push({
        id: `${doc.id}-${derived.type}`,
        source: derived.type,
        at: formatWhen(toDate(summary.endedAt) || new Date()),
        title: derived.detail || derived.type,
        detail: summary.headline || "",
        effect: derived.weight
          ? `Weight ${derived.weight}: ${derived.before ?? "?"} → ${derived.after ?? "?"}`
          : summary.followUps?.[0] || "",
      });
    }
  }

  const liveSignals = stateSnap.exists ? stateSnap.data().liveSignals || [] : [];
  signals.unshift(...liveSignals);

  const fields = [
    ["Household", customer.household?.label || `${customer.household?.size || "?"} people`],
    ["Home store", DEMO_STORE_NAME],
    ["Membership", customer.membership?.tier || "Customer"],
    ["Agent memory", memory?.summary || customer.agentSummary || ""],
    ["Open threads", (memory?.openThreads || []).join("; ") || "None"],
    ["Local events", localEvents.map((e) => e.headline).join("; ") || "None"],
  ];

  return {
    id: customer.demoKey || demoKey,
    name: customer.name,
    first: (customer.name || "").split(" ")[0],
    household: customer.household?.label || "",
    store: DEMO_STORE_NAME,
    tier: customer.membership?.tier || "Customer",
    memberSince: customer.membership?.since?.toDate?.()?.getFullYear?.()?.toString?.() || "",
    city: customer.city,
    spend90d: customer.spend90d,
    trips90d: customer.orders90d,
    lastTrip: customer.lastOrderAt ? formatWhen(toDate(customer.lastOrderAt)) : "",
    demo: customer.demoKey === DEMO_CUSTOMER_KEY,
    summary: customer.agentSummary || memory?.summary || "",
    weights,
    fields,
    signals,
  };
}

async function getSessionPayload() {
  const account = await getAccountDetail(DEMO_CUSTOMER_KEY);
  if (!account) {
    return {
      first: "Doug",
      name: "Doug Martinez",
      store: DEMO_STORE_NAME,
      city: "Columbia, 29209",
      tier: "Walmart+",
    };
  }
  return {
    first: account.first,
    name: account.name,
    store: account.store,
    city: account.city,
    tier: account.tier,
  };
}

module.exports = { listAccounts, getAccountDetail, getSessionPayload };
