const { getProducts, productToCatalogItem, resolveCustomer } = require("../lib/customers");
const { getCachedPersonalize } = require("../agents/personalize");
const { getCartLines } = require("./cart");
const { DEMO_CUSTOMER_KEY } = require("../config");

async function getCatalog(demoKey = DEMO_CUSTOMER_KEY) {
  const [products, customer] = await Promise.all([getProducts(), resolveCustomer(demoKey)]);
  const cache = customer ? await getCachedPersonalize(customer.id) : null;
  const byProduct = Object.fromEntries(
    (cache?.recommendations || []).map((rec) => [
      rec.productId,
      { rank: rec.rank, label: rec.label, reason: rec.reason },
    ]),
  );

  return products
    .filter((p) => p.image) // UI catalog items with images (seeded demo products)
    .map((product) => ({
      ...productToCatalogItem(product),
      recommendation: byProduct[product.id] || null,
    }));
}

async function getBundles(demoKey = DEMO_CUSTOMER_KEY) {
  const [products, customer, cart] = await Promise.all([
    getProducts(),
    resolveCustomer(demoKey),
    getCartLines(demoKey),
  ]);
  const inCart = new Set(cart.map((line) => line.productId));
  const cache = customer ? await getCachedPersonalize(customer.id) : null;
  const byId = Object.fromEntries(products.map((p) => [p.id, productToCatalogItem(p)]));

  if (cache?.bundles?.length) {
    return cache.bundles
      .filter((b) => !inCart.has(b.productId) && byId[b.productId])
      .map((b) => ({ ...byId[b.productId], reason: b.reason }));
  }

  // Seeded fallbacks if personalize has not run yet.
  const defaults = {
    milk: "Bread is already in this order. Milk often rides with bread during storm prep.",
    eggs: "Milk, bread, and eggs are the three items local posts tell people to grab before the hurricane.",
    water: "A 40-pack covers a family of 4 for about 3 days if a boil-water notice hits.",
    flashlight: "This ships with batteries, so it works on its own if the power goes out.",
    soup: "No-cook and easy-heat meals are the second wave of storm buying.",
    cocoa: "Schools are closed Friday, and families with kids add easy treats like hot cocoa.",
  };

  return Object.entries(defaults)
    .filter(([id]) => !inCart.has(id) && byId[id])
    .map(([id, reason]) => ({ ...byId[id], reason }));
}

module.exports = { getCatalog, getBundles };
