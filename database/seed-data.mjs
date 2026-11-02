import { getAccount, getAccounts, getCatalog, getInsights, getStoreOrder } from "../src/data/demoStore.js";

const at = (iso) => new Date(iso);
const addSec = (date, sec) => new Date(date.getTime() + sec * 1000);
const round2 = (n) => Math.round(n * 100) / 100;

const extraProducts = [
  { id: "formula", name: "Parent's Choice Infant Formula, 35 oz", price: 24.97, aisle: "Baby", unitPrice: "71.3 ¢/oz" },
  { id: "diapers", name: "Parent's Choice Diapers, Size 2, 104 Count", price: 19.97, aisle: "Baby", unitPrice: "19.2 ¢/each" },
  { id: "spinach", name: "Marketside Organic Baby Spinach, 10 oz", price: 3.98, aisle: "Produce", unitPrice: "39.8 ¢/oz" },
  { id: "sportsdrink", name: "Great Value Sports Drink, Fruit Punch, 12 Pack", price: 6.48, aisle: "Beverages", unitPrice: "2.7 ¢/fl oz" },
];

const caseSizes = { milk: 4, eggs: 15, water: 60, bread: 10, batteries: 12 };

const products = [
  ...getCatalog().map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.name.split(" ").slice(0, item.name.startsWith("Great Value") ? 2 : 1).join(" "),
    category: item.shelf === "storm" ? "storm_prep" : "grocery",
    aisle: item.aisle,
    price: item.price,
    wasPrice: item.was ?? null,
    unitPrice: item.unitPrice ?? null,
    badge: item.badge ?? null,
    image: item.image,
    imageSource: item.source,
    caseSize: caseSizes[item.id] ?? 12,
  })),
  ...extraProducts.map((item) => ({
    ...item,
    brand: item.name.split(" ")[0],
    category: "grocery",
    wasPrice: null,
    badge: null,
    image: null,
    imageSource: null,
    caseSize: 6,
  })),
];
const productById = Object.fromEntries(products.map((p) => [p.id, p]));

const stores = [
  { id: "4127", name: "Columbia Garners Ferry Rd Supercenter", type: "Supercenter", address: "Garners Ferry Rd", city: "Columbia", state: "SC", zip: "29209", county: "Richland", distributionCenter: "Regional grocery DC" },
  { id: "4128", name: "Columbia Forest Dr Neighborhood Market", type: "Neighborhood Market", address: "Forest Dr", city: "Forest Acres", state: "SC", zip: "29206", county: "Richland", distributionCenter: "Regional grocery DC" },
  { id: "3302", name: "Irmo Supercenter", type: "Supercenter", address: "Lake Murray Blvd", city: "Irmo", state: "SC", zip: "29063", county: "Lexington", distributionCenter: "Regional grocery DC" },
  { id: "2210", name: "Columbia Two Notch Rd Supercenter", type: "Supercenter", address: "Two Notch Rd", city: "Columbia", state: "SC", zip: "29223", county: "Richland", distributionCenter: "Regional grocery DC" },
];
const storeIdByName = Object.fromEntries(stores.map((s) => [s.name, s.id]));

const customerExtras = {
  doug: { id: "cust_doug", email: "doug.martinez@example.com", zip: "29209", household: { size: 4, adults: 2, children: 2, childAges: [7, 11] }, preferredChannel: "pickup", usualShoppingWindow: { daysOfMonth: [1, 7], dayOfWeek: "Tue", hours: "16:00-18:00" }, priceSensitivity: "medium", createdAt: "2019-03-14T10:12:00-05:00", memberSince: "2019-03-14T10:12:00-05:00" },
  priya: { id: "cust_priya", email: "priya.shah@example.com", zip: "29206", household: { size: 2, adults: 2, children: 0, childAges: [] }, preferredChannel: "inhome_delivery", usualShoppingWindow: { daysOfWeek: ["Sun", "Wed"], hours: "18:00-21:00" }, priceSensitivity: "low", createdAt: "2021-05-02T19:30:00-05:00", memberSince: "2021-05-02T19:30:00-05:00" },
  luis: { id: "cust_luis", email: "luis.ortega@example.com", zip: "29063", household: { size: 3, adults: 3, children: 0, childAges: [] }, preferredChannel: "in_store", usualShoppingWindow: { daysOfWeek: ["Sat"], hours: "10:00-13:00" }, priceSensitivity: "high", createdAt: "2024-02-17T11:05:00-05:00", memberSince: null },
  amina: { id: "cust_amina", email: "amina.hassan@example.com", zip: "29209", household: { size: 3, adults: 2, children: 1, childAges: [0] }, preferredChannel: "pickup", usualShoppingWindow: { intervalDays: 18, dayOfWeek: "Fri", hours: "17:00-19:00" }, priceSensitivity: "medium", createdAt: "2023-08-09T08:44:00-05:00", memberSince: "2023-08-09T08:44:00-05:00" },
  carol: { id: "cust_carol", email: "carol.bennett@example.com", zip: "29223", household: { size: 1, adults: 1, children: 0, childAges: [] }, preferredChannel: "in_store", usualShoppingWindow: { daysOfWeek: ["Thu"], hours: "08:00-10:00" }, priceSensitivity: "very_high", createdAt: "2016-06-21T09:15:00-05:00", memberSince: null },
};

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const ctx = {
  warning: "evt_news10_hurricane_warning_20271005",
  social: "evt_social_stockup_columbia_20271005",
  schools: "evt_school_closures_20271006",
  nws: "evt_nws_forecast_20271005",
};

// Each spec is one past session. The generator expands it into the session,
// raw events, recommendations, an order (if purchased), and the summary.
const sessionSpecs = [
  // Doug Martinez
  {
    customer: "doug", start: "2027-08-03T16:41:00-04:00", device: "iPhone", channel: "app", auth: "passkey", entry: "direct",
    searches: [],
    views: [["milk", 4], ["eggs", 5], ["bread", 3], ["cereal", 6], ["coffee", 9]],
    adds: ["milk", "eggs", "bread", "cereal", "coffee", "bananas"],
    recs: [["cereal", "for_you", "Bought on 5 of the last 6 first-week trips", "added"], ["oj", "cart_bundle", "Rides with milk and breakfast items", "ignored"]],
    order: { fulfillment: "pickup", window: "17:00-18:00" },
    intents: ["monthly_grocery", "breakfast_restock"],
    headline: "First-week grocery pickup, breakfast staples",
    summary: "Doug placed his usual first-week grocery pickup in about 6 minutes, with no searching. He went straight to milk, eggs, bread, cereal, and coffee, which shows he shops from memory. He ignored the orange juice suggestion.",
    signals: [{ type: "cadence", detail: "11th first-week order in 12 months" }],
    followUps: ["Keep breakfast staples pinned in the first week of each month.", "Orange juice suggestions are being ignored. Lower its rank."],
  },
  {
    customer: "doug", start: "2027-08-19T21:12:00-04:00", device: "iPhone", channel: "app", auth: "remembered", entry: "email",
    searches: ["folgers"],
    views: [["coffee", 11], ["coffee", 7]],
    adds: [],
    recs: [],
    order: null,
    intents: ["price_check"],
    headline: "Price-checked Folgers sizes, didn't buy",
    summary: "Doug opened the weekly ad email, searched for Folgers, and compared the 30.5 oz and 40.3 oz canisters for 18 seconds. He left without adding either. This looks like a price check ahead of his next grocery trip, not a lost sale.",
    signals: [{ type: "dwell", detail: "18s total on Folgers", weight: "coffee", before: 0.42, after: 0.55 }],
    followUps: ["Show the larger Folgers canister first next time, and mention it when it goes on Rollback."],
  },
  {
    customer: "doug", start: "2027-09-07T16:55:00-04:00", device: "iPhone", channel: "app", auth: "passkey", entry: "direct",
    searches: [],
    views: [["coffee", 4], ["milk", 3], ["eggs", 3], ["pb", 5]],
    adds: ["coffee", "milk", "eggs", "bread", "pb", "bacon"],
    recs: [["coffee", "for_you", "Larger can he compared on Aug 19, now on Rollback", "added"], ["bacon", "cart_bundle", "Bought every other grocery run", "added"]],
    order: { fulfillment: "pickup", window: "17:00-18:00" },
    intents: ["monthly_grocery"],
    headline: "First-week pickup, bought the Folgers he price-checked",
    summary: "Doug placed his September first-week order. He added the 40.3 oz Folgers he had compared in August, now on Rollback, and accepted the bacon suggestion. Two out of two recommendations were added.",
    signals: [{ type: "recommendation_accepted", detail: "Coffee and bacon suggestions were both added" }],
    followUps: ["Rollback-timed suggestions work for this customer."],
  },
  {
    customer: "doug", start: "2027-09-30T15:20:00-04:00", device: "desktop", channel: "web", auth: "password", entry: "search_engine",
    searches: ["milk", "bread"],
    views: [["milk", 3], ["bread", 2], ["bananas", 2]],
    adds: ["milk", "bread", "bananas"],
    recs: [["eggs", "cart_bundle", "Eggs ride with 74% of his bread orders", "ignored"]],
    order: { fulfillment: "pickup", window: "18:00-19:00" },
    intents: ["quick_top_up"],
    headline: "Small end-of-month top-up: milk, bread, bananas",
    summary: "Doug placed a quick 3-item pickup on the last day of September from his laptop. He skipped the egg suggestion, probably because he still had some from Sep 7. His last milk purchase was this order.",
    signals: [{ type: "pantry", detail: "Milk restocked Sep 30, so it should run out around Oct 4–7" }],
    followUps: ["Milk will be due again in the first week of October.", "He didn't buy eggs on Sep 30, so they're likely low by Oct 5–7."],
  },
  {
    customer: "doug", start: "2027-10-05T19:02:00-04:00", device: "iPhone", channel: "app", auth: "passkey", entry: "push_notification",
    searches: ["water", "hurricane rose"],
    views: [["water", 6], ["batteries", 4], ["flashlight", 3], ["milk", 5]],
    adds: ["water"],
    removes: ["water"],
    recs: [["water", "for_you", "Hurricane warning; no water purchase since March", "clicked"], ["batteries", "for_you", "No batteries in 14 months", "ignored"]],
    order: null,
    context: [ctx.warning, ctx.social, ctx.nws],
    intents: ["storm_prep"],
    headline: "Opened hurricane-prep alert 50 minutes after the news warning, left water in cart, then removed it",
    summary: "Doug opened the app from the hurricane-prep push notification 50 minutes after News 10 issued the Hurricane Rose warning. He searched for water and for 'hurricane rose', added a 40-pack of water, then removed it and left. Pickup times for Wednesday were already full, which likely explains why he didn't check out. He also looked at milk for 5 seconds.",
    signals: [
      { type: "local_event", detail: "Hurricane warning active for ZIP 29209" },
      { type: "abandoned_cart", detail: "Water added, then removed" },
      { type: "weight", detail: "Bottled water", weight: "bottled_water", before: 0.08, after: 0.52 },
    ],
    followUps: ["Offer him the first open pickup time when he comes back.", "Lead with water and milk. He showed intent for both."],
  },
  {
    customer: "doug", start: "2027-10-06T20:38:00-04:00", device: "iPhone", channel: "app", auth: "remembered", entry: "direct",
    searches: [],
    views: [["eggs", 8.2], ["milk", 4], ["water", 3]],
    adds: [],
    recs: [["milk", "for_you", "Hurricane warning; last gallon Sep 30", "clicked"], ["eggs", "for_you", "Hurricane warning; eggs up 184% at his store", "clicked"]],
    order: null,
    context: [ctx.warning, ctx.social, ctx.schools],
    detailOnFirstView: { nutritionOpened: true },
    intents: ["storm_prep", "breakfast_restock"],
    headline: "Spent 8.2 seconds on eggs and opened the nutrition panel, didn't buy",
    summary: "Doug came back the night after the warning and went straight to eggs. He spent 8.2 seconds on the Great Value 12-count, opened the nutrition panel, and left without adding it. He also tapped milk and water again. Schools had just announced Friday closures, and he has two school-age kids.",
    signals: [
      { type: "dwell", detail: "8.2s on eggs plus the nutrition panel", weight: "dairy_eggs", before: 0.52, after: 0.81 },
      { type: "local_event", detail: "School closures for Friday" },
    ],
    followUps: ["Rank milk, eggs, and water first on his next visit.", "Explain why each one is suggested (the storm, and his pantry timing)."],
  },

  // Priya Shah
  {
    customer: "priya", start: "2027-09-12T19:10:00-04:00", device: "iPad", channel: "app", auth: "passkey", entry: "direct",
    searches: ["organic spinach"],
    views: [["spinach", 9], ["apples", 4], ["bananas", 3], ["milk", 2]],
    adds: ["spinach", "apples", "bananas", "milk", "eggs"],
    recs: [["spinach", "for_you", "Produce weight 0.82", "added"]],
    order: { fulfillment: "inhome_delivery", window: "19:00-21:00" },
    intents: ["weekly_grocery", "produce"],
    headline: "Sunday InHome order, produce first",
    summary: "Priya placed her Sunday InHome order in under 8 minutes, starting with organic spinach and fresh fruit. She chooses organic when it's rated above 4.5 stars.",
    signals: [{ type: "dwell", detail: "9s on organic spinach", weight: "produce", before: 0.8, after: 0.82 }],
    followUps: ["Organic should be the default on her produce."],
  },
  {
    customer: "priya", start: "2027-09-29T18:44:00-04:00", device: "iPad", channel: "app", auth: "passkey", entry: "direct",
    searches: [],
    views: [["spinach", 14], ["oj", 3], ["butter", 2]],
    adds: ["spinach", "oj", "butter"],
    recs: [["oj", "cart_bundle", "Usually added on Wednesdays", "added"]],
    order: { fulfillment: "inhome_delivery", window: "19:00-21:00" },
    intents: ["midweek_top_up"],
    headline: "Midweek InHome top-up",
    summary: "Priya placed a small Wednesday top-up. She compared organic and regular spinach for 14 seconds and chose organic again.",
    signals: [{ type: "dwell", detail: "14s comparing spinach", weight: "organic_dairy", before: 0.5, after: 0.58 }],
    followUps: ["Keep paper goods off her Wednesday list."],
  },
  {
    customer: "priya", start: "2027-10-06T19:02:00-04:00", device: "iPad", channel: "app", auth: "passkey", entry: "push_notification",
    searches: ["water"],
    views: [["water", 5], ["milk", 3], ["eggs", 3]],
    adds: ["water", "milk", "eggs"],
    recs: [["water", "for_you", "Hurricane warning; Friday InHome routes may be suspended", "added"]],
    order: { fulfillment: "inhome_delivery", window: "19:00-21:00" },
    context: [ctx.warning, ctx.social],
    intents: ["storm_prep"],
    headline: "Moved Friday's delivery to Thursday and added storm basics",
    summary: "Priya accepted the offer to move her Friday InHome delivery to Thursday evening, before the hurricane arrives. She added water, milk, and eggs to the order.",
    signals: [{ type: "local_event", detail: "Delivery route at risk", weight: "bottled_water", before: 0.12, after: 0.41 }],
    followUps: ["Check after the storm whether her Sunday delivery is running again."],
  },

  // Luis Ortega
  {
    customer: "luis", start: "2027-09-18T10:48:00-04:00", device: "Android", channel: "app", auth: "password", entry: "direct",
    searches: ["sports drink"],
    views: [["sportsdrink", 6], ["ramen", 3]],
    adds: [],
    recs: [],
    order: { fulfillment: "in_store_scan_and_go", window: null, items: ["sportsdrink", "ramen", "crackers"] },
    intents: ["weekend_stock_up", "price_check"],
    headline: "Checked prices in the aisle, then bought in store",
    summary: "Luis used the app in the aisle to check the sports drink multipack price, then bought it in store with Scan & Go, along with ramen and saltines.",
    signals: [{ type: "dwell", detail: "6.4s on a sports drink multipack", weight: "sports_drinks", before: 0.71, after: 0.74 }],
    followUps: ["Only suggest the cheapest size per unit first."],
  },
  {
    customer: "luis", start: "2027-10-06T22:15:00-04:00", device: "Android", channel: "app", auth: "remembered", entry: "direct",
    searches: ["water 40 pack"],
    views: [["water", 6.4], ["ramen", 2]],
    adds: ["water"],
    recs: [["water", "for_you", "Hurricane warning; cheapest per bottle", "added"]],
    order: null,
    context: [ctx.warning, ctx.social],
    intents: ["storm_prep"],
    headline: "Added water and left it in the cart",
    summary: "Luis searched for a 40-pack of water late at night, compared the price per bottle, added it, and left it in his cart. He usually shops in store on Saturday, but the hurricane hits Friday.",
    signals: [{ type: "abandoned_cart", detail: "Water in cart, not checked out", weight: "bottled_water", before: 0.2, after: 0.52 }],
    followUps: ["Remind him Thursday that the storm comes before his usual Saturday trip."],
  },

  // Amina Hassan
  {
    customer: "amina", start: "2027-09-21T17:30:00-04:00", device: "iPhone", channel: "app", auth: "passkey", entry: "push_notification",
    searches: [],
    views: [["formula", 3], ["diapers", 4]],
    adds: ["formula", "diapers"],
    recs: [["formula", "for_you", "18-day formula cycle", "added"]],
    order: { fulfillment: "pickup", window: "18:00-19:00" },
    intents: ["baby_restock"],
    headline: "Formula reminder converted in 2 minutes",
    summary: "Amina tapped the formula reminder, re-ordered the same formula she always buys plus diapers, and checked out in about 2 minutes.",
    signals: [{ type: "cadence", detail: "Formula every 17–19 days" }],
    followUps: ["Next formula due around Oct 9."],
  },
  {
    customer: "amina", start: "2027-10-02T17:12:00-04:00", device: "iPhone", channel: "app", auth: "passkey", entry: "direct",
    searches: ["size 2 diapers"],
    views: [["diapers", 9], ["milk", 2], ["bread", 2]],
    adds: ["milk", "bread", "diapers"],
    recs: [],
    order: { fulfillment: "pickup", window: "17:00-18:00" },
    intents: ["weekly_grocery", "baby_restock"],
    headline: "Weekly pickup; looked at a larger diaper count",
    summary: "Amina placed her weekly pickup and spent 9 seconds on a larger diaper box she had not bought before. She kept the usual size this time.",
    signals: [{ type: "dwell", detail: "9s on the larger diaper count" }],
    followUps: ["Default to the larger diaper count next time."],
  },

  // Carol Bennett
  {
    customer: "carol", start: "2027-09-09T08:40:00-04:00", device: "desktop", channel: "web", auth: "password", entry: "email",
    searches: ["rollback soup"],
    views: [["soup", 12], ["crackers", 3]],
    adds: [],
    recs: [],
    order: null,
    intents: ["price_check", "weekly_ad"],
    headline: "Read the weekly ad, then shopped in store",
    summary: "Carol read the weekly ad on her computer and spent 12 seconds on the soup Rollback. She didn't order online and bought in store the same morning.",
    signals: [{ type: "dwell", detail: "12s on soup Rollback", weight: "canned_soup", before: 0.44, after: 0.48 }],
    followUps: ["She plans from the ad. Show Rollback items first."],
  },
  {
    customer: "carol", start: "2027-10-06T09:05:00-04:00", device: "desktop", channel: "web", auth: "password", entry: "email",
    searches: ["soup", "batteries"],
    views: [["soup", 7], ["water", 4], ["batteries", 5]],
    adds: ["soup", "water", "batteries"],
    recs: [["soup", "for_you", "Pre-filled storm list for first-time pickup", "added"], ["water", "for_you", "Pre-filled storm list", "added"], ["batteries", "for_you", "Pre-filled storm list", "added"]],
    order: { fulfillment: "pickup", window: "10:00-11:00" },
    context: [ctx.warning],
    intents: ["storm_prep", "first_pickup"],
    headline: "First pickup order ever, from the pre-filled storm list",
    summary: "Carol accepted the free first-time pickup offer and kept all three pre-filled items: soup, water, and batteries. It is her first online order in 10 years as a customer, so she doesn't have to drive in the storm.",
    signals: [{ type: "channel_change", detail: "First pickup order", weight: "bottled_water", before: 0.1, after: 0.44 }],
    followUps: ["Send a short how-pickup-works message before her time slot.", "Don't assume she will keep using pickup after the storm."],
  },
];

function buildSession(spec) {
  const account = getAccount(spec.customer);
  const extra = customerExtras[spec.customer];
  const customerId = extra.id;
  const storeId = storeIdByName[account.store];
  const start = at(spec.start);
  const stamp = spec.start.slice(0, 16).replace(/[-:T]/g, "");
  const sessionId = `sess_${spec.customer}_${stamp}`;

  const events = [];
  let t = start;
  let n = 0;
  const push = (type, fields = {}, gapSec = 4) => {
    t = addSec(t, gapSec);
    n += 1;
    events.push({
      id: `${sessionId}_e${String(n).padStart(3, "0")}`,
      customerId,
      sessionId,
      type,
      at: t,
      productId: null,
      dwellMs: null,
      source: null,
      position: null,
      query: null,
      detail: {},
      ...fields,
    });
  };

  t = addSec(start, -4);
  push("login", { detail: { authMethod: spec.auth, device: spec.device, channel: spec.channel, entryPoint: spec.entry } });
  push("page_view", { detail: { page: "home" } }, 3);

  const recs = (spec.recs || []).map(([productId, surface, reason, outcome], index) => ({
    id: `rec_${sessionId}_${productId}`,
    customerId,
    sessionId,
    productId,
    surface,
    rank: index + 1,
    reason,
    signalsUsed: (spec.signals || []).map((signal) => signal.type),
    outcome,
    shownAt: null,
    clickedAt: null,
    addedAt: null,
  }));

  for (const rec of recs.filter((r) => r.surface === "for_you")) {
    push("recommendation_shown", { productId: rec.productId, source: "for_you", position: rec.rank, detail: { recommendationId: rec.id } }, 1);
    rec.shownAt = t;
  }

  for (const query of spec.searches || []) {
    push("search", { query, source: "search", detail: { resultsCount: 8 + query.length } }, 6);
  }

  let totalDwell = 0;
  spec.views.forEach(([productId, dwellSec], index) => {
    const rec = recs.find((r) => r.productId === productId && !r.clickedAt && r.outcome !== "ignored");
    const source = rec ? rec.surface : spec.searches?.length ? "search" : "home";
    push(rec ? "recommendation_click" : "product_view", {
      productId,
      dwellMs: Math.round(dwellSec * 1000),
      source,
      position: index + 1,
      detail: index === 0 && spec.detailOnFirstView ? spec.detailOnFirstView : {},
    }, 5);
    if (rec) rec.clickedAt = t;
    totalDwell += dwellSec;
    t = addSec(t, dwellSec);
  });

  for (const rec of recs.filter((r) => r.surface === "cart_bundle")) {
    push("recommendation_shown", { productId: rec.productId, source: "cart_bundle", position: rec.rank, detail: { recommendationId: rec.id } }, 2);
    rec.shownAt = t;
  }

  for (const productId of spec.adds) {
    const rec = recs.find((r) => r.productId === productId);
    push("add_to_cart", { productId, source: rec ? rec.surface : "home", detail: { qty: 1, ...(rec ? { recommendationId: rec.id } : {}) } }, 6);
    if (rec && rec.outcome === "added") rec.addedAt = t;
  }

  for (const productId of spec.removes || []) {
    push("remove_from_cart", { productId, detail: { qty: 1 } }, 20);
  }

  let order = null;
  if (spec.order) {
    const itemIds = spec.order.items || spec.adds;
    const items = itemIds.map((productId) => {
      const product = productById[productId];
      const rec = recs.find((r) => r.productId === productId && r.outcome === "added");
      return {
        productId,
        name: product.name,
        qty: 1,
        unitPrice: product.price,
        wasPrice: product.wasPrice,
        recommended: Boolean(rec),
        recommendationId: rec ? rec.id : null,
      };
    });
    const subtotal = round2(items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0));
    const listTotal = round2(items.reduce((sum, item) => sum + (item.wasPrice ?? item.unitPrice) * item.qty, 0));
    const tax = round2(subtotal * 0.03);
    push("checkout", { detail: { itemCount: items.length, subtotal } }, 15);
    order = {
      id: `ord_${spec.customer}_${stamp}`,
      customerId,
      sessionId,
      storeId,
      placedAt: t,
      fulfillment: { type: spec.order.fulfillment, window: spec.order.window, date: spec.start.slice(0, 10) },
      items,
      itemCount: items.length,
      subtotal,
      savings: round2(listTotal - subtotal),
      tax,
      total: round2(subtotal + tax),
      status: spec.order.fulfillment === "inhome_delivery" ? "delivered" : spec.order.fulfillment.startsWith("in_store") ? "completed" : "picked_up",
    };
  }

  push("session_end", { detail: { reason: order ? "checkout_complete" : "app_backgrounded" } }, 5);
  const end = t;
  const durationSec = Math.round((end - start) / 1000);
  const outcome = order ? "purchased" : spec.adds.length && !(spec.removes || []).length ? "abandoned_cart" : "browse_only";
  const localEventIds = spec.context || [];

  const session = {
    id: sessionId,
    customerId,
    storeId,
    loginAt: start,
    authMethod: spec.auth,
    endedAt: end,
    durationSec,
    channel: spec.channel,
    device: spec.device,
    appVersion: spec.channel === "app" ? "26.12.1" : null,
    entryPoint: spec.entry,
    counts: {
      productViews: spec.views.length,
      searches: (spec.searches || []).length,
      cartAdds: spec.adds.length,
      recsShown: recs.length,
      recsAccepted: recs.filter((r) => r.outcome === "added").length,
    },
    totalDwellSec: round2(totalDwell),
    outcome,
    orderId: order ? order.id : null,
    localEventIds,
  };

  const viewed = {};
  for (const [productId, dwellSec] of spec.views) viewed[productId] = round2((viewed[productId] || 0) + dwellSec);
  const bought = new Set(order ? order.items.map((i) => i.productId) : []);
  const abandoned = [...new Set([...spec.adds, ...Object.keys(viewed).filter((id) => viewed[id] >= 5)])].filter((id) => !bought.has(id));

  const summary = {
    id: sessionId,
    sessionId,
    customerId,
    startedAt: start,
    endedAt: end,
    durationSec,
    channel: spec.channel,
    device: spec.device,
    outcome,
    headline: spec.headline,
    summary: spec.summary,
    intents: spec.intents,
    productsViewed: Object.entries(viewed).map(([productId, dwellSec]) => ({ productId, name: productById[productId].name, dwellSec })),
    productsAdded: spec.adds,
    productsAbandoned: abandoned,
    orderId: order ? order.id : null,
    spend: order ? order.total : 0,
    context: { localEventIds, storeId },
    signalsDerived: (spec.signals || []).map((signal) => ({ weight: null, before: null, after: null, ...signal })),
    followUps: spec.followUps,
    generatedBy: "spark-agent-summarizer-v0",
    generatedAt: addSec(end, 90),
  };

  return { session, events, recs, order, summary };
}

const built = sessionSpecs.map(buildSession);

const agentMemory = {
  doug: {
    summary: "Shops groceries in the first week of each month by pickup, usually Tuesday 4–6pm. Shops breakfast staples from memory. Accepts Rollback-timed suggestions and ignores orange juice. During the October hurricane warning he showed intent for water, milk, and eggs across two sessions without checking out, likely because pickup times were full.",
    keyFacts: ["Family of 4, kids aged 7 and 11", "Last milk purchase Sep 30", "Coffee: prefers the 40.3 oz Folgers when it's on Rollback", "No water, batteries, or flashlight in recent order history"],
    openThreads: ["Storm-prep basket (water, milk, eggs) not yet purchased", "Offer the first open pickup time"],
  },
  priya: {
    summary: "InHome delivery customer twice a week. Produce-first and prefers organic when it's well rated. Moved Friday's delivery to Thursday because of Hurricane Rose.",
    keyFacts: ["Organic is the default for produce", "Wednesday orders are perishables only"],
    openThreads: ["Confirm her Sunday delivery runs after the storm"],
  },
  luis: {
    summary: "Price-driven Saturday in-store shopper who checks prices in the app. Has a 40-pack of water left in his cart before the storm.",
    keyFacts: ["Cheapest size per unit wins", "Uses Scan & Go"],
    openThreads: ["Water still in cart; the storm comes before his Saturday trip"],
  },
  amina: {
    summary: "Formula on an 18-day cycle plus a weekly pickup. Always buys the same formula brand. Next formula is due during the storm window.",
    keyFacts: ["Formula next due around Oct 9", "Looked at a larger diaper count"],
    openThreads: ["Formula reminder 2 days early because of the storm"],
  },
  carol: {
    summary: "Long-time in-store shopper who plans from the weekly ad and mostly buys Rollback items. Placed her first-ever pickup order for the storm using a pre-filled list.",
    keyFacts: ["Very price sensitive", "First pickup Oct 6"],
    openThreads: ["Explain how pickup works before her slot", "Don't assume she will keep using pickup"],
  },
};

const pantrySeeds = {
  doug: [["milk", "2027-09-30T18:10:00-04:00", 4], ["eggs", "2027-09-07T17:20:00-04:00", 10], ["cereal", "2027-08-03T17:15:00-04:00", 16], ["coffee", "2027-09-07T17:20:00-04:00", 30]],
  priya: [["spinach", "2027-09-29T19:30:00-04:00", 5], ["milk", "2027-10-06T19:40:00-04:00", 7]],
  luis: [["sportsdrink", "2027-09-18T11:20:00-04:00", 10]],
  amina: [["formula", "2027-09-21T18:20:00-04:00", 18], ["diapers", "2027-10-02T17:40:00-04:00", 12]],
  carol: [["soup", "2027-10-06T10:30:00-04:00", 21]],
};

function buildCustomers() {
  return getAccounts().map(({ id }) => {
    const account = getAccount(id);
    const extra = customerExtras[id];
    const mine = built.filter((b) => b.session.customerId === extra.id);
    const lastLogin = mine.reduce((latest, b) => (b.session.loginAt > latest ? b.session.loginAt : latest), at("2000-01-01T00:00:00Z"));
    const orders = mine.filter((b) => b.order).map((b) => b.order);
    return {
      id: extra.id,
      demoKey: id,
      name: account.name,
      email: extra.email,
      zip: extra.zip,
      city: account.city,
      household: { ...extra.household, label: account.household },
      homeStoreId: storeIdByName[account.store],
      membership: { tier: account.tier, since: extra.memberSince ? at(extra.memberSince) : null },
      createdAt: at(extra.createdAt),
      lastLoginAt: lastLogin,
      loginCount90d: account.trips90d + mine.length * 2,
      preferredChannel: extra.preferredChannel,
      usualShoppingWindow: extra.usualShoppingWindow,
      priceSensitivity: extra.priceSensitivity,
      preferenceWeights: Object.fromEntries(account.weights.map((w) => [slug(w.label), w.after])),
      spend90d: account.spend90d,
      orders90d: account.trips90d,
      avgBasket: round2(account.spend90d / account.trips90d),
      lastOrderAt: orders.length ? orders[orders.length - 1].placedAt : null,
      consent: { personalization: true, localEvents: true, marketingEmail: id !== "carol", dataRetentionDays: 730 },
      agentSummary: account.summary,
    };
  });
}

function buildLocalEvents() {
  const insights = getInsights();
  const affected = ["milk", "eggs", "water", "bread", "batteries", "flashlight"];
  return [
    {
      id: ctx.warning,
      type: "news_alert",
      source: "News 10 (local TV)",
      headline: "Hurricane Rose warning for Richland County",
      body: "Hurricane Rose is forecast to bring tropical-storm-force winds and 6–10 inches of rain Friday afternoon through Saturday morning. Power outages and flooding likely.",
      issuedAt: at("2027-10-05T18:12:00-04:00"),
      validFrom: at("2027-10-08T14:00:00-04:00"),
      validTo: at("2027-10-09T10:00:00-04:00"),
      county: "Richland",
      zips: ["29201", "29204", "29205", "29206", "29209", "29223"],
      severity: "warning",
      affectedProductIds: affected,
    },
    {
      id: ctx.social,
      type: "social_trend",
      source: "Aggregated public posts, Columbia area",
      headline: "Stock-up posts jumped 9× after the hurricane broadcast",
      body: "A video of an empty milk case at another store spread Tuesday night. 41% of posts name milk, bread, or eggs.",
      issuedAt: at("2027-10-05T21:00:00-04:00"),
      validFrom: at("2027-10-05T18:00:00-04:00"),
      validTo: at("2027-10-07T06:00:00-04:00"),
      county: "Richland",
      zips: ["29201", "29204", "29205", "29206", "29209", "29223", "29063"],
      severity: "high",
      affectedProductIds: ["milk", "bread", "eggs", "water"],
      series: insights.social.map((point) => ({ label: point.time, posts: point.posts })),
      topTerms: { milk: 0.38, bread: 0.31, eggs: 0.24, water: 0.22, generator: 0.06 },
      personalAccountsRead: false,
    },
    {
      id: ctx.nws,
      type: "weather_forecast",
      source: "National Weather Service",
      headline: "Hurricane Rose inland forecast, Friday 2pm to Saturday 10am",
      body: "Sustained winds 40–55 mph with gusts to 70 mph and 6–10 in. of rain for Richland County. Track unchanged since Tuesday afternoon.",
      issuedAt: at("2027-10-05T15:30:00-04:00"),
      validFrom: at("2027-10-08T14:00:00-04:00"),
      validTo: at("2027-10-09T10:00:00-04:00"),
      county: "Richland",
      zips: ["29209", "29206", "29223"],
      severity: "moderate",
      affectedProductIds: affected,
    },
    {
      id: ctx.schools,
      type: "school_closure",
      source: "Richland County school districts",
      headline: "Schools closed Friday, Oct 8",
      body: "District announced closures Wednesday afternoon ahead of the hurricane.",
      issuedAt: at("2027-10-06T15:45:00-04:00"),
      validFrom: at("2027-10-08T00:00:00-04:00"),
      validTo: at("2027-10-08T23:59:00-04:00"),
      county: "Richland",
      zips: ["29209", "29206", "29223", "29204"],
      severity: "info",
      affectedProductIds: ["cocoa", "cereal", "pb", "bread"],
    },
  ];
}

function buildStoreData() {
  const insights = getInsights();
  const storeId = "4127";
  const dates = ["2027-10-01", "2027-10-02", "2027-10-03", "2027-10-04", "2027-10-05", "2027-10-06"];
  const baseline = { bread: 360, batteries: 20, flashlight: 6, soup: 70, crackers: 40, cocoa: 25, beans: 45, ramen: 120, pb: 60, coffee: 55, butter: 80, bacon: 70, oj: 65, cereal: 75, pasta: 50, bananas: 210, apples: 90, towels: 60 };
  const surge = { bread: [1, 1.1, 0.95, 1, 1.6, 3.2], batteries: [1, 1, 1, 1, 2.4, 5.8], flashlight: [1, 1, 1, 1, 2, 4.5], soup: [1, 1, 1, 1, 1.3, 2.1], crackers: [1, 1, 1, 1, 1.2, 1.9], cocoa: [1, 1, 1, 1, 1.1, 2.4] };

  const dailySales = [];
  insights.daily.forEach((row, i) => {
    for (const productId of ["milk", "eggs", "water"]) {
      const base = Math.round(insights.daily.slice(0, 4).reduce((s, r) => s + r[productId], 0) / 4);
      dailySales.push({ id: `${dates[i]}_${productId}`, date: dates[i], productId, units: row[productId], baselineUnits: base, revenue: round2(row[productId] * productById[productId].price) });
    }
    for (const [productId, base] of Object.entries(baseline)) {
      const factor = (surge[productId] || [1, 1, 1, 1, 1, 1])[i];
      const units = Math.round(base * factor * (i === 1 ? 1.08 : i === 2 ? 0.94 : 1));
      dailySales.push({ id: `${dates[i]}_${productId}`, date: dates[i], productId, units, baselineUnits: base, revenue: round2(units * productById[productId].price) });
    }
  });

  const draft = getStoreOrder();
  const inventory = draft.lines.map((line) => {
    const rate = insights.daily[insights.daily.length - 1][line.id] ?? Math.round(line.forecast / 3);
    return { id: line.id, productId: line.id, onHand: line.onHand, dailyRate: rate, daysOfSupply: round2(line.onHand / rate), updatedAt: at("2027-10-07T06:00:00-04:00") };
  });

  const storeOrder = {
    id: draft.id,
    storeId,
    status: "draft",
    createdBy: "spark-agent",
    createdAt: at("2027-10-07T06:04:00-04:00"),
    truck: draft.truck,
    reason: "Hurricane Rose warning and local social panic pushed milk, eggs, and water to 4–10× normal daily demand. Current stock runs out Thursday afternoon.",
    localEventIds: [ctx.warning, ctx.social, ctx.nws],
    lines: draft.lines.map((line) => ({ productId: line.id, name: line.item, onHand: line.onHand, normal72h: line.normal, forecast72h: line.forecast, qty: line.qty, unit: line.pack, caseSize: line.caseSize, cases: Math.ceil(line.qty / line.caseSize) })),
    totalCases: draft.lines.reduce((sum, line) => sum + Math.ceil(line.qty / line.caseSize), 0),
    normalAutoOrderCases: 110,
    approvedBy: null,
    approvedAt: null,
  };

  const insightNotes = Object.entries(insights.notes).map(([chart, text]) => ({
    id: `note_${storeId}_20271007_${chart}`,
    storeId,
    chart,
    text,
    createdAt: at("2027-10-07T06:00:00-04:00"),
    localEventIds: [ctx.warning, ctx.social],
  }));

  return { storeId, dailySales, inventory, storeOrder, insightNotes };
}

export function buildSeed() {
  const customers = buildCustomers();
  const docs = [];
  const put = (path, data) => docs.push({ path, data });

  for (const product of products) put(`products/${product.id}`, product);
  for (const store of stores) put(`stores/${store.id}`, store);
  for (const customer of customers) put(`customers/${customer.id}`, customer);

  for (const { session, events, recs, order, summary } of built) {
    put(`sessions/${session.id}`, session);
    for (const event of events) put(`events/${event.id}`, event);
    for (const rec of recs) put(`recommendations/${rec.id}`, rec);
    if (order) put(`orders/${order.id}`, order);
    put(`customers/${session.customerId}/sessionSummaries/${summary.id}`, summary);
  }

  for (const [key, memory] of Object.entries(agentMemory)) {
    const customerId = customerExtras[key].id;
    const mine = built.filter((b) => b.session.customerId === customerId);
    const last = mine[mine.length - 1];
    put(`customers/${customerId}/agentMemory/current`, {
      ...memory,
      customerId,
      lastSessionId: last.session.id,
      sessionsSummarized: mine.length,
      updatedAt: last.summary.generatedAt,
    });
  }

  for (const [key, rows] of Object.entries(pantrySeeds)) {
    const customerId = customerExtras[key].id;
    for (const [productId, last, interval] of rows) {
      const lastAt = at(last);
      put(`customers/${customerId}/pantry/${productId}`, {
        productId,
        lastPurchasedAt: lastAt,
        avgIntervalDays: interval,
        estimatedRunOutAt: addSec(lastAt, interval * 86400),
        confidence: interval <= 7 ? 0.82 : 0.68,
      });
    }
  }

  for (const event of buildLocalEvents()) put(`localEvents/${event.id}`, event);

  const store = buildStoreData();
  for (const row of store.dailySales) put(`stores/${store.storeId}/dailySales/${row.id}`, row);
  for (const row of store.inventory) put(`stores/${store.storeId}/inventory/${row.id}`, row);
  put(`storeOrders/${store.storeOrder.id}`, store.storeOrder);
  for (const note of store.insightNotes) put(`insightNotes/${note.id}`, note);

  return docs.map(({ path, data }) => {
    const { id, ...rest } = data;
    return { path, data: rest };
  });
}
