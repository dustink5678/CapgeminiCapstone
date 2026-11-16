const { db } = require("../db");
const { ORG_ID, DEMO_STORE_ID } = require("../config");

async function getOrg(orgId = ORG_ID) {
  const snap = await db.collection("orgs").doc(orgId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getRegion(regionId) {
  if (!regionId) return null;
  const snap = await db.collection("regions").doc(regionId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function listActiveRegions(orgId = ORG_ID) {
  const snap = await db.collection("regions").where("orgId", "==", orgId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((region) => (region.status || "active") === "active")
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function getStore(storeId = DEMO_STORE_ID) {
  const snap = await db.collection("stores").doc(String(storeId)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Store → regionId. Falls back to scanning regions.storeIds for stores seeded before regionId existed. */
async function getRegionIdForStore(storeId = DEMO_STORE_ID) {
  const store = await getStore(storeId);
  if (store?.regionId) return store.regionId;
  const regions = await listActiveRegions(store?.orgId || ORG_ID);
  return regions.find((region) => (region.storeIds || []).includes(String(storeId)))?.id || null;
}

module.exports = { getOrg, getRegion, listActiveRegions, getStore, getRegionIdForStore };
