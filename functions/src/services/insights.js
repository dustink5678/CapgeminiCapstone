const { db, admin, FieldValue, Timestamp } = require("../db");
const { DEMO_STORE_ID, DEMO_STORE_NAME, DEMO_STORE_NO } = require("../config");
const { getActiveLocalEvents } = require("../lib/customers");
const { getRegionIdForStore } = require("../lib/regions");
const { getLatestStoreOrder, orderUiShape } = require("../agents/replenish");
const { formatWhen, toDate, round2 } = require("../lib/format");

async function getInsightNotes(storeId = DEMO_STORE_ID) {
  const snap = await db.collection("insightNotes").where("storeId", "==", storeId).get();
  const notes = { daily: "", social: "", cover: "" };
  const sorted = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  for (const note of sorted) {
    if (note.chart && !notes[note.chart]) notes[note.chart] = note.text;
  }
  return notes;
}

/** Whole words up to ~16 characters so chart axis labels stay readable. */
function shortName(name) {
  let out = "";
  for (const word of String(name).split(",")[0].split(/\s+/)) {
    if (out && `${out} ${word}`.length > 16) break;
    out = out ? `${out} ${word}` : word;
  }
  return out;
}

async function getInsights(storeId = DEMO_STORE_ID) {
  const regionId = await getRegionIdForStore(storeId);
  const [localEvents, inventorySnap, salesSnap, notes, order] = await Promise.all([
    getActiveLocalEvents({ regionId }),
    db.collection("stores").doc(storeId).collection("inventory").get(),
    db.collection("stores").doc(storeId).collection("dailySales").get(),
    getInsightNotes(storeId),
    getLatestStoreOrder(storeId),
  ]);

  const warning = localEvents.find((e) => e.type === "news_alert") || localEvents[0];
  const social = localEvents.find((e) => e.type === "social_trend");

  const sales = salesSnap.docs.map((doc) => doc.data());
  const dates = [...new Set(sales.map((row) => row.date))].sort();
  const daily = dates.map((date, index) => {
    const row = { day: ["Fri 1", "Sat 2", "Sun 3", "Mon 4", "Tue 5", "Wed 6"][index] || date };
    for (const productId of ["milk", "eggs", "water"]) {
      const match = sales.find((s) => s.date === date && s.productId === productId);
      row[productId] = match?.units || 0;
    }
    return row;
  });

  const last48 = daily.slice(-2);
  const sum = (key) => last48.reduce((s, row) => s + (row[key] || 0), 0);
  const baselineAvg = (key) => {
    const early = daily.slice(0, 4);
    return early.length ? early.reduce((s, row) => s + (row[key] || 0), 0) / early.length : 1;
  };

  // Inventory covers the whole catalog; the chart shows only what the current draft order sizes.
  const coverIds = order?.lines?.length
    ? order.lines.map((line) => line.productId)
    : ["milk", "eggs", "water", "bread", "batteries"];
  const nameById = Object.fromEntries((order?.lines || []).map((line) => [line.productId, line.name]));
  const shortLabels = { milk: "Milk", eggs: "Eggs", water: "Water", bread: "Bread", batteries: "AAA" };
  const cover = inventorySnap.docs
    .map((doc) => doc.data())
    .filter((data) => coverIds.includes(data.productId))
    .sort((a, b) => coverIds.indexOf(a.productId) - coverIds.indexOf(b.productId))
    .map((data) => ({
      item: shortLabels[data.productId] || shortName(nameById[data.productId] || data.productId),
      days: round2(data.daysOfSupply || 0),
    }));

  return {
    store: DEMO_STORE_NAME,
    storeNo: DEMO_STORE_NO,
    updated: formatWhen(new Date()),
    alert: {
      title: warning?.headline || "Local demand alert",
      window: warning
        ? `${formatWhen(toDate(warning.validFrom))} through ${formatWhen(toDate(warning.validTo))}`
        : "",
      body: warning?.body || "Demand is elevated for storm staples.",
    },
    kpis: [
      {
        label: "Milk units, last 48 hrs",
        value: sum("milk").toLocaleString(),
        delta: `+${Math.round((sum("milk") / Math.max(baselineAvg("milk") * 2, 1) - 1) * 100)}% vs. normal`,
      },
      {
        label: "Egg units, last 48 hrs",
        value: sum("eggs").toLocaleString(),
        delta: `+${Math.round((sum("eggs") / Math.max(baselineAvg("eggs") * 2, 1) - 1) * 100)}% vs. normal`,
      },
      {
        label: "Water 40-packs, last 48 hrs",
        value: sum("water").toLocaleString(),
        delta: `+${Math.round((sum("water") / Math.max(baselineAvg("water") * 2, 1) - 1) * 100)}% vs. normal`,
      },
      {
        label: "Local storm posts, last 48 hrs",
        value: social?.series?.reduce((s, p) => s + (p.posts || 0), 0)?.toLocaleString?.() || "14.2K",
        delta: "Elevated vs Monday",
      },
    ],
    daily,
    social: social?.series?.map((p) => ({ time: p.label, posts: p.posts })) || [
      { time: "Tue 12pm", posts: 310 },
      { time: "Tue 6pm", posts: 1880 },
      { time: "Tue 9pm", posts: 4120 },
      { time: "Wed 12am", posts: 1460 },
      { time: "Wed 6am", posts: 980 },
      { time: "Wed 12pm", posts: 2240 },
      { time: "Wed 6pm", posts: 2310 },
      { time: "Thu 12am", posts: 900 },
    ],
    cover: cover.length
      ? cover
      : [
          { item: "Milk", days: 0.4 },
          { item: "Eggs", days: 0.7 },
          { item: "Water", days: 0.5 },
          { item: "Bread", days: 0.8 },
          { item: "AAA", days: 1.0 },
        ],
    notes: {
      daily: notes.daily || "Run the replenishment agent to generate a live note.",
      social: notes.social || "Run the replenishment agent to generate a live note.",
      cover: notes.cover || "Run the replenishment agent to generate a live note.",
    },
    draftOrderId: order?.id || null,
  };
}

async function getStoreOrderResponse(storeId = DEMO_STORE_ID) {
  const order = await getLatestStoreOrder(storeId);
  if (!order) {
    return {
      status: "draft",
      id: `PO-${storeId}-EMPTY`,
      createdAt: formatWhen(new Date()),
      truck: "Thursday, 11:00pm truck from the regional grocery DC · on shelf before Friday 7am",
      lines: [],
      approvedAt: null,
    };
  }
  return orderUiShape(order);
}

async function approveStoreOrder(lines, storeId = DEMO_STORE_ID) {
  const order = await getLatestStoreOrder(storeId);
  if (!order) return { error: "No store order" };
  if (order.status === "approved") return orderUiShape(order);

  if (Array.isArray(lines)) {
    for (const { id, qty } of lines) {
      const line = order.lines.find((item) => item.productId === id);
      const value = Number(qty);
      if (line && Number.isFinite(value) && value >= 0) {
        line.qty = Math.round(value);
        line.cases = Math.ceil(line.qty / line.caseSize);
      }
    }
  }

  const approvedAtLabel = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  await db
    .collection("storeOrders")
    .doc(order.id)
    .set(
      {
        status: "approved",
        lines: order.lines,
        totalCases: order.lines.reduce((sum, line) => sum + line.cases, 0),
        approvedBy: "J. Reyes",
        approvedAt: FieldValue.serverTimestamp(),
        approvedAtLabel,
      },
      { merge: true },
    );

  return orderUiShape({
    ...order,
    status: "approved",
    approvedAtLabel,
  });
}

async function resetStoreOrder(storeId = DEMO_STORE_ID) {
  const order = await getLatestStoreOrder(storeId);
  if (!order) return getStoreOrderResponse(storeId);
  await db.collection("storeOrders").doc(order.id).set(
    {
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      approvedAtLabel: null,
    },
    { merge: true },
  );
  return orderUiShape({ ...order, status: "draft", approvedAtLabel: null });
}

module.exports = {
  getInsights,
  getStoreOrderResponse,
  approveStoreOrder,
  resetStoreOrder,
};
