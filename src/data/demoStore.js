const shopperId = "doug";

const STORE = "Columbia Garners Ferry Rd Supercenter";
const STORE_NO = "Store 4127";

const off = (code) => `https://world.openfoodfacts.org/product/${code}`;
const opf = (code) => `https://world.openproductsfacts.org/product/${code}`;

const catalog = [
  { id: "milk", name: "Whole Vitamin D Milk, 1 Gallon, 128 fl oz", price: 3.16, unitPrice: "2.5 ¢/fl oz", aisle: "Dairy", shelf: "staples", source: off("0070784006260") },
  { id: "eggs", name: "Great Value Large White Eggs, 12 Count", price: 2.86, was: 3.42, unitPrice: "23.8 ¢/each", aisle: "Dairy", shelf: "staples", badge: "Deal", source: off("0078742330624") },
  { id: "water", name: "Great Value Purified Drinking Water, 16.9 fl oz, 40 Count", price: 4.98, unitPrice: "0.7 ¢/fl oz", aisle: "Beverages", shelf: "storm", badge: "Best seller", source: off("07804816") },
  { id: "bread", name: "Great Value Round Top White Bread, 20 oz Loaf", price: 1.42, unitPrice: "7.1 ¢/oz", aisle: "Bakery", shelf: "staples", source: off("0078742285443") },
  { id: "batteries", name: "Energizer MAX AAA Batteries, 16 Pack", price: 14.97, was: 17.48, unitPrice: "93.6 ¢/each", aisle: "Electronics", shelf: "storm", badge: "Deal", source: opf("7638900438284") },
  { id: "flashlight", name: "Kodak Focus 159 LED Flashlight with Batteries", price: 9.97, aisle: "Hardware", shelf: "storm", source: opf("18789002981000000500") },
  { id: "soup", name: "Campbell's Condensed Family Size Chicken Noodle Soup, 22.4 oz", price: 2.98, unitPrice: "13.3 ¢/oz", aisle: "Pantry", shelf: "storm", source: off("0910001030486") },
  { id: "crackers", name: "Great Value Original Saltine Crackers, 16 oz", price: 1.98, unitPrice: "12.4 ¢/oz", aisle: "Pantry", shelf: "storm", source: off("0078742351834") },
  { id: "cocoa", name: "Swiss Miss Marshmallow Hot Cocoa Mix Canister, 30 Servings", price: 4.97, was: 5.98, unitPrice: "16.6 ¢/serving", aisle: "Beverages", shelf: "storm", badge: "Deal", source: off("0070920474410") },
  { id: "beans", name: "Bush's Original Baked Beans, 28 oz Can", price: 2.74, unitPrice: "9.8 ¢/oz", aisle: "Pantry", shelf: "storm", source: off("0039400016113") },
  { id: "ramen", name: "Maruchan Ramen Noodle Soup, Roast Chicken, 3 oz", price: 0.38, unitPrice: "12.7 ¢/oz", aisle: "Pantry", shelf: "storm", badge: "Best seller", source: off("0041789002571") },
  { id: "pb", name: "Great Value Creamy Peanut Butter, 40 oz Jar", price: 4.28, unitPrice: "10.7 ¢/oz", aisle: "Pantry", shelf: "staples", source: off("0078742369990") },
  { id: "coffee", name: "Folgers Classic Roast Ground Coffee, 40.3 oz Canister", price: 14.98, was: 16.48, unitPrice: "37.2 ¢/oz", aisle: "Coffee", shelf: "staples", badge: "Deal", source: off("0025500001982") },
  { id: "butter", name: "Land O Lakes Salted Butter, 4 Sticks, 16 oz", price: 5.47, unitPrice: "34.2 ¢/oz", aisle: "Dairy", shelf: "staples", source: off("0034500151641") },
  { id: "bacon", name: "Hickory Smoked Bacon, 16 oz", price: 5.24, unitPrice: "32.8 ¢/oz", aisle: "Meat", shelf: "staples", source: off("0070133005531") },
  { id: "oj", name: "Simply Orange Pulp Free Orange Juice, 52 fl oz", price: 4.38, unitPrice: "8.4 ¢/fl oz", aisle: "Beverages", shelf: "staples", source: off("0059600070029") },
  { id: "cereal", name: "Cheerios Heart Healthy Cereal, Mega Size, 29 oz", price: 6.98, unitPrice: "24.1 ¢/oz", aisle: "Breakfast", shelf: "staples", badge: "Best seller", source: off("0016000163928") },
  { id: "pasta", name: "Great Value Whole Wheat Spaghetti, 16 oz", price: 1.18, unitPrice: "7.4 ¢/oz", aisle: "Pantry", shelf: "staples", source: off("0078742118505") },
  { id: "bananas", name: "Fresh Bananas, Bunch", price: 1.42, unitPrice: "56 ¢/lb", aisle: "Produce", shelf: "staples", source: off("5010251953760") },
  { id: "apples", name: "Fresh Royal Gala Apples, 3 lb Bag", price: 3.97, unitPrice: "$1.32/lb", aisle: "Produce", shelf: "staples", source: off("0033383007410") },
  { id: "towels", name: "Bounty Select-A-Size Paper Towels, 6 Triple Plus Rolls", price: 19.97, unitPrice: "$3.33/roll", aisle: "Household", shelf: "storm", source: opf("0030772167748") },
].map((item) => ({ ...item, image: `/products/${item.id}.jpg` }));

const recommendations = {
  milk: {
    rank: 1,
    label: "Hurricane warning",
    reason:
      "News 10 issued a Hurricane Rose warning Tuesday at 6:12pm and local social posts telling people to stock up jumped 9×. Milk is the item mentioned most. Doug’s family of 4 goes through a gallon about every 4 days, and his last one was bought Sep 30.",
  },
  eggs: {
    rank: 2,
    label: "Hurricane warning · Viewed 8 sec",
    reason:
      "Doug spent 8.2 seconds on this carton last night and left without adding it. Egg sales at his store are up 184% since the warning, so the shelf is projected to be empty before Friday’s pickup window.",
  },
  water: {
    rank: 3,
    label: "Hurricane warning · Storm kit gap",
    reason:
      "Hurricanes in Richland County usually bring power outages and boil-water notices. Doug hasn’t bought bottled water since March, so this is the first gap in his storm kit.",
  },
  batteries: {
    rank: 4,
    label: "Area trend",
    reason:
      "There are no batteries in Doug’s last 14 months of orders. Storm-prep carts in ZIP 29209 are adding AAA packs at 4× the usual rate this week.",
  },
};

const bundleCopy = {
  milk: "Bread is already in this order. Since the hurricane warning, 78% of Columbia orders with bread have also included milk, and Doug’s last gallon was a week ago.",
  eggs: "Doug looked at eggs for 8 seconds yesterday without adding them. Milk, bread, and eggs are the three items local posts tell people to grab before the hurricane.",
  water: "A 40-pack covers his family of 4 for about 3 days if the hurricane causes a boil-water notice. Water is selling out fastest at this store.",
  flashlight: "His last flashlight purchase was in 2021. This ships with batteries, so it works on its own if the power goes out when the hurricane hits Friday night.",
  soup: "No-cook and easy-heat meals are the second wave of storm buying. Doug’s household picks Campbell’s on 3 of every 4 soup purchases.",
  cocoa: "Schools are closed Friday, and families with kids add easy treats like hot cocoa to hurricane orders 3× more often than other households.",
};

const accounts = [
  {
    id: "doug",
    name: "Doug Martinez",
    first: "Doug",
    household: "Family of 4 · 2 children, ages 7 and 11",
    store: STORE,
    tier: "Walmart+",
    memberSince: "2019",
    city: "Columbia, 29209",
    spend90d: 842.16,
    trips90d: 11,
    lastTrip: "Sep 30 · Pickup",
    demo: true,
    summary: "Storm-prep shopper this week. The hurricane warning plus an 8-second look at eggs moved milk, eggs, and water to the top of his page.",
    weights: [
      { label: "Dairy and eggs", before: 0.52, after: 0.81 },
      { label: "Bottled water", before: 0.08, after: 0.64 },
      { label: "Batteries and lighting", before: 0.05, after: 0.47 },
      { label: "Bread and bakery", before: 0.58, after: 0.66 },
      { label: "Snacks", before: 0.31, after: 0.24 },
    ],
    fields: [
      ["Household", "4 people · 2 children"],
      ["Home store", STORE],
      ["Membership", "Walmart+ since 2019"],
      ["Shopping pattern", "Groceries in the first week of the month, usually Tuesday pickup 4–6pm"],
      ["Local events", "Hurricane Rose warning, Richland County, Fri Oct 8 2pm – Sat 10am"],
      ["Last viewed", "Great Value Large White Eggs, 8.2 seconds, not added"],
      ["Bread → milk", "Milk is in 74% of his orders that include bread"],
      ["Price response", "Medium · takes Rollbacks and doesn’t trade down on breakfast items"],
    ],
    signals: [
      {
        id: "d1",
        source: "Local news",
        at: "Tue, Oct 5 · 6:12pm",
        title: "News 10 issues Hurricane Rose warning for Richland County",
        detail: "The warning covers Doug’s home ZIP of 29209 and his pickup store. Tropical-storm-force winds and heavy rain are expected Friday afternoon.",
        effect: "Storm-prep items became eligible to rank first for every account in the warning area.",
      },
      {
        id: "d2",
        source: "Area social trend",
        at: "Tue, Oct 5 · 9:00pm",
        title: "Local posts about stocking up jumped 9×",
        detail: "Aggregated public posts tagged to Columbia mention milk (38%), bread (31%), eggs (24%), and water (22%). No personal social accounts are read.",
        effect: "Milk, eggs, and water got an urgency boost for households in ZIP codes with low pickup availability.",
      },
      {
        id: "d3",
        source: "Viewed item",
        at: "Wed, Oct 6 · 8:41pm",
        title: "Great Value Large White Eggs, 12 Count",
        detail: "Doug spent 8.2 seconds on the product and opened the nutrition panel, then left without adding it.",
        effect: "Egg weight went from 0.52 to 0.81, moving eggs from position 14 to position 2 on his page.",
      },
      {
        id: "d4",
        source: "Pantry estimate",
        at: "Thu, Oct 7 · 6:00am",
        title: "Milk runs out in about 1 day",
        detail: "His family of 4 uses about a gallon every 4 days. The last gallon was bought Sep 30.",
        effect: "Milk placed first in recommendations, ahead of eggs.",
      },
      {
        id: "d5",
        source: "Order history",
        at: "Last 90 days",
        title: "No water, batteries, or flashlight on file",
        detail: "His last water order was in March, his last batteries 14 months ago, and his last flashlight in 2021.",
        effect: "Storm-kit items are surfaced as gaps, not upsells.",
      },
    ],
  },
  {
    id: "priya",
    name: "Priya Shah",
    first: "Priya",
    household: "Two adults",
    store: "Columbia Forest Dr Neighborhood Market",
    tier: "Walmart+ InHome",
    memberSince: "2021",
    city: "Forest Acres, 29206",
    spend90d: 1214.55,
    trips90d: 18,
    lastTrip: "Oct 6 · InHome",
    demo: false,
    summary: "InHome delivery customer. Her Friday delivery is moved up to Thursday so it arrives before the hurricane.",
    weights: [
      { label: "Produce", before: 0.82, after: 0.84 },
      { label: "Organic dairy", before: 0.5, after: 0.71 },
      { label: "Bottled water", before: 0.12, after: 0.41 },
    ],
    fields: [
      ["Household", "2 adults"],
      ["Home store", "Columbia Forest Dr Neighborhood Market"],
      ["Membership", "Walmart+ InHome since 2021"],
      ["Shopping pattern", "Delivery on Sunday and Wednesday evenings"],
      ["Last viewed", "Organic baby spinach, 14 seconds"],
    ],
    signals: [
      {
        id: "p1",
        source: "Local news",
        at: "Tue, Oct 5 · 6:12pm",
        title: "Hurricane warning covers her delivery route",
        detail: "Friday InHome routes in 29206 are expected to be suspended once the hurricane’s winds arrive.",
        effect: "The agent offered to move her Friday delivery to Thursday evening.",
      },
      {
        id: "p2",
        source: "Viewed item",
        at: "Wed, Oct 6 · 7:02pm",
        title: "Organic baby spinach, 10 oz",
        detail: "She spent 14 seconds comparing organic spinach with the regular container.",
        effect: "The organic version is preferred on her next list.",
      },
    ],
  },
  {
    id: "luis",
    name: "Luis Ortega",
    first: "Luis",
    household: "One adult · roommates",
    store: "Irmo Supercenter",
    tier: "Customer",
    memberSince: "2024",
    city: "Irmo, 29063",
    spend90d: 386.4,
    trips90d: 9,
    lastTrip: "Oct 2 · In store",
    demo: false,
    summary: "Price-driven weekend shopper. During the hurricane, only Rollback items rank first for him.",
    weights: [
      { label: "Sports drinks", before: 0.71, after: 0.74 },
      { label: "Frozen meals", before: 0.51, after: 0.62 },
      { label: "Bottled water", before: 0.2, after: 0.52 },
    ],
    fields: [
      ["Household", "1 adult, shared apartment"],
      ["Home store", "Irmo Supercenter"],
      ["Shopping pattern", "Saturday late morning, in store"],
      ["Price response", "High · Rollbacks change his ranking more than brands do"],
    ],
    signals: [
      {
        id: "l1",
        source: "Viewed item",
        at: "Wed, Oct 6 · 10:15pm",
        title: "Great Value Purified Drinking Water, 40 Count",
        detail: "He spent 6.4 seconds on the item and checked the price per bottle.",
        effect: "Water weight rose, and the cheapest size per bottle ranks first.",
      },
    ],
  },
  {
    id: "amina",
    name: "Amina Hassan",
    first: "Amina",
    household: "Two adults · infant",
    store: STORE,
    tier: "Walmart+",
    memberSince: "2023",
    city: "Columbia, 29209",
    spend90d: 690.22,
    trips90d: 14,
    lastTrip: "Oct 2 · Pickup",
    demo: false,
    summary: "Buys infant formula every 18 days. The hurricane could close stores on her next restock day, so formula is flagged now.",
    weights: [
      { label: "Infant formula", before: 0.82, after: 0.96 },
      { label: "Diapers", before: 0.78, after: 0.8 },
      { label: "Bottled water", before: 0.3, after: 0.58 },
    ],
    fields: [
      ["Household", "2 adults · 1 infant"],
      ["Home store", STORE],
      ["Formula interval", "Every 18 days · next due Oct 9"],
      ["Price response", "Medium · always buys the same formula brand, flexible on everything else"],
    ],
    signals: [
      {
        id: "a1",
        source: "Pantry estimate",
        at: "Thu, Oct 7 · 6:00am",
        title: "Formula is due on a day the store may close",
        detail: "Her next restock day is Oct 9, which falls inside the hurricane window.",
        effect: "Formula reminder sent 2 days early, ranked above every other item.",
      },
    ],
  },
  {
    id: "carol",
    name: "Carol Bennett",
    first: "Carol",
    household: "One adult · age 74",
    store: "Columbia Two Notch Rd Supercenter",
    tier: "Customer",
    memberSince: "2016",
    city: "Columbia, 29223",
    spend90d: 274.08,
    trips90d: 8,
    lastTrip: "Sep 30 · In store",
    demo: false,
    summary: "Shops in store with no delivery history. The agent suggests a one-time pickup so she doesn’t have to drive in the hurricane.",
    weights: [
      { label: "Canned soup", before: 0.48, after: 0.66 },
      { label: "Store brand", before: 0.84, after: 0.84 },
      { label: "Bottled water", before: 0.1, after: 0.44 },
    ],
    fields: [
      ["Household", "1 adult"],
      ["Home store", "Columbia Two Notch Rd Supercenter"],
      ["Shopping pattern", "Thursday morning in store, after the weekly ad"],
      ["Price response", "Very high · mostly buys Rollback items"],
    ],
    signals: [
      {
        id: "c1",
        source: "Local news",
        at: "Tue, Oct 5 · 6:12pm",
        title: "Hurricane warning on her usual shopping day",
        detail: "Her Thursday trip is the day before the hurricane arrives, and she has never used pickup.",
        effect: "A free first-time pickup offer was queued with soup, water, and batteries pre-filled.",
      },
    ],
  },
];

const initialCart = () => [
  { productId: "bread", qty: 1 },
  { productId: "bananas", qty: 1 },
];

let cart = initialCart();

const initialOrder = () => ({
  status: "draft",
  id: "PO-4127-1007-A",
  createdAt: "Thu, Oct 7 · 6:04am",
  truck: "Thursday, 11:00pm truck from the regional grocery DC · on shelf before Friday 7am",
  lines: [
    { id: "milk", item: "Whole Vitamin D Milk, Gallon", onHand: 610, normal: 930, forecast: 2340, qty: 1960, pack: "gal", caseSize: 4 },
    { id: "eggs", item: "Great Value Large White Eggs, 12 ct", onHand: 1150, normal: 1280, forecast: 3700, qty: 2880, pack: "dozen", caseSize: 15 },
    { id: "water", item: "Great Value Purified Water, 40 ct", onHand: 420, normal: 260, forecast: 1480, qty: 1200, pack: "packs", caseSize: 60 },
    { id: "bread", item: "Great Value Round Top White Bread", onHand: 900, normal: 1100, forecast: 2600, qty: 1900, pack: "loaves", caseSize: 10 },
    { id: "batteries", item: "Energizer MAX AAA, 16 pk", onHand: 140, normal: 60, forecast: 410, qty: 300, pack: "packs", caseSize: 12 },
  ],
  approvedAt: null,
});

let storeOrder = initialOrder();

function productById(id) {
  return catalog.find((item) => item.id === id);
}

function getCatalog() {
  return catalog.map((item) => ({ ...item, recommendation: recommendations[item.id] || null }));
}

function getCart() {
  const lines = cart
    .map((line) => {
      const product = productById(line.productId);
      if (!product) return null;
      return {
        ...product,
        qty: line.qty,
        lineTotal: round(product.price * line.qty),
        lineWas: product.was ? round(product.was * line.qty) : null,
      };
    })
    .filter(Boolean);

  const subtotal = round(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const listTotal = round(lines.reduce((sum, line) => sum + (line.lineWas ?? line.lineTotal), 0));
  return {
    lines,
    subtotal,
    listTotal,
    savings: round(listTotal - subtotal),
    count: lines.reduce((sum, line) => sum + line.qty, 0),
  };
}

function getBundles() {
  const inCart = new Set(cart.map((line) => line.productId));
  return Object.keys(bundleCopy)
    .filter((id) => !inCart.has(id))
    .map((id) => ({ ...productById(id), reason: bundleCopy[id] }));
}

function addToCart(productId) {
  const product = productById(productId);
  if (!product) return { error: "Unknown item" };
  const existing = cart.find((line) => line.productId === productId);
  if (existing) existing.qty += 1;
  else cart.push({ productId, qty: 1 });

  const doug = accounts.find((account) => account.id === shopperId);
  doug.signals.unshift({
    id: `live-${Date.now()}`,
    source: "Added to cart",
    at: "Just now",
    title: product.name,
    detail: `Doug added ${product.name} during this demo. Adding an item counts as a stronger signal than viewing it.`,
    effect: "The item is locked into this trip, and the cart suggestions are recalculated around the new basket.",
    live: true,
  });

  return getCart();
}

function updateQty(productId, qty) {
  const line = cart.find((item) => item.productId === productId);
  if (!line) return { error: "Not in cart" };
  if (qty <= 0) cart = cart.filter((item) => item.productId !== productId);
  else line.qty = qty;
  return getCart();
}

function getAccounts() {
  return accounts.map(({ id, name, tier, store, summary, demo }) => ({ id, name, tier, store, summary, demo }));
}

function getAccount(id) {
  return accounts.find((account) => account.id === id) || null;
}

function getStoreOrder() {
  return storeOrder;
}

function approveStoreOrder(lines) {
  if (storeOrder.status === "approved") return storeOrder;
  if (Array.isArray(lines)) {
    for (const { id, qty } of lines) {
      const line = storeOrder.lines.find((item) => item.id === id);
      const value = Number(qty);
      if (line && Number.isFinite(value) && value >= 0) line.qty = Math.round(value);
    }
  }
  storeOrder.status = "approved";
  storeOrder.approvedAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return storeOrder;
}

function resetStoreOrder() {
  storeOrder = initialOrder();
  return storeOrder;
}

function getInsights() {
  return {
    store: STORE,
    storeNo: STORE_NO,
    updated: "Thu, Oct 7 · 6:00am",
    alert: {
      title: "Hurricane Rose warning · Richland County",
      window: "Fri, Oct 8, 2pm through Sat, Oct 9, 10am",
      body: "Demand for milk, eggs, and water is running 4–10× a normal day. The jump started within 2 hours of the local news broadcast.",
    },
    kpis: [
      { label: "Milk units, last 48 hrs", value: "1,964", delta: "+212% vs. normal" },
      { label: "Egg units, last 48 hrs", value: "2,410", delta: "+184% vs. normal" },
      { label: "Water 40-packs, last 48 hrs", value: "1,120", delta: "+550% vs. normal" },
      { label: "Local storm posts, last 48 hrs", value: "14.2K", delta: "9× Monday’s volume" },
    ],
    daily: [
      { day: "Fri 1", milk: 300, eggs: 410, water: 80 },
      { day: "Sat 2", milk: 340, eggs: 450, water: 92 },
      { day: "Sun 3", milk: 290, eggs: 400, water: 85 },
      { day: "Mon 4", milk: 310, eggs: 420, water: 88 },
      { day: "Tue 5", milk: 540, eggs: 690, water: 270 },
      { day: "Wed 6", milk: 1424, eggs: 1720, water: 850 },
    ],
    social: [
      { time: "Tue 12pm", posts: 310 },
      { time: "Tue 6pm", posts: 1880 },
      { time: "Tue 9pm", posts: 4120 },
      { time: "Wed 12am", posts: 1460 },
      { time: "Wed 6am", posts: 980 },
      { time: "Wed 12pm", posts: 2240 },
      { time: "Wed 6pm", posts: 2310 },
      { time: "Thu 12am", posts: 900 },
    ],
    cover: [
      { item: "Milk", days: 0.4 },
      { item: "Eggs", days: 0.7 },
      { item: "Water", days: 0.5 },
      { item: "Bread", days: 0.8 },
      { item: "AAA", days: 1.0 },
    ],
    notes: {
      daily:
        "Milk, eggs, and water were flat through Monday. At 6:12pm Tuesday, the local news channel issued a Hurricane Rose warning, and sales started climbing within 2 hours. By Wednesday, milk was at 4.6× a normal day, eggs at 4.1×, and water at 9.7×. Weather data alone doesn’t explain this. The National Hurricane Center track hasn’t changed since Tuesday, so the jump is coming from shoppers reacting to the news.",
      social:
        "Public posts tagged to Columbia peaked Tuesday at 9pm, after a video of an empty milk case at another store spread on social media. 41% of posts name milk, bread, or eggs. A second wave came Wednesday afternoon when schools announced Friday closures. Each wave was followed 3–5 hours later by a jump in pickup orders at this store.",
      cover:
        "At Wednesday’s pace, milk sells out Thursday around 4pm and water by early evening, a full day before the hurricane arrives. The normal automatic order would bring in about an eighth of what’s needed. The agent drafted a larger order below so the Thursday night truck can cover Friday morning.",
    },
  };
}

function getSession() {
  const doug = getAccount(shopperId);
  return { first: doug.first, name: doug.name, store: doug.store, city: doug.city, tier: doug.tier };
}

function resetDemo() {
  cart = initialCart();
  storeOrder = initialOrder();
  const doug = getAccount(shopperId);
  doug.signals = doug.signals.filter((signal) => !signal.live);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

export {
  getCatalog,
  getCart,
  getBundles,
  addToCart,
  updateQty,
  getAccounts,
  getAccount,
  getInsights,
  getSession,
  getStoreOrder,
  approveStoreOrder,
  resetStoreOrder,
  resetDemo,
};
