// One-off upload of demo data to Firestore. Not used by the website.
// Uses the account signed in to the Firebase CLI (`firebase login`), so it
// writes as the project owner and is not affected by firestore.rules.
//
//   node database/seed.mjs --dry-run   count documents without writing
//   node database/seed.mjs             write everything to capgeminidemo2
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { firebaseConfig } from "./firebaseConfig.mjs";
import { buildSeed } from "./seed-data.mjs";

const PROJECT = firebaseConfig.projectId;
const BASE = `projects/${PROJECT}/databases/(default)/documents`;
const dryRun = process.argv.includes("--dry-run");

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  switch (typeof value) {
    case "boolean":
      return { booleanValue: value };
    case "number":
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case "string":
      return { stringValue: value };
    case "object":
      return { mapValue: { fields: encodeFields(value) } };
    default:
      throw new Error(`Cannot encode ${typeof value}`);
  }
}

function encodeFields(object) {
  const fields = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) fields[key] = encode(value);
  }
  return fields;
}

async function accessToken() {
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const require = createRequire(path.join(globalRoot, "firebase-tools", "package.json"));
  const auth = require("./lib/auth.js");
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Not signed in to the Firebase CLI. Run `firebase login` first.");
  }
  const token = await auth.getAccessToken(account.tokens.refresh_token, [
    "email",
    "openid",
    "https://www.googleapis.com/auth/cloud-platform",
  ]);
  return { token: token.access_token, user: account.user.email };
}

async function commit(token, writes) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${BASE}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (!response.ok) {
    throw new Error(`Firestore commit failed (${response.status}): ${await response.text()}`);
  }
}

const docs = buildSeed();

const counts = {};
for (const { path: docPath } of docs) {
  const parts = docPath.split("/");
  const collection = parts.filter((_, i) => i % 2 === 0).join("/*/");
  counts[collection] = (counts[collection] || 0) + 1;
}
console.table(counts);
console.log(`${docs.length} documents total`);

if (dryRun) process.exit(0);

const { token, user } = await accessToken();
console.log(`Writing to ${PROJECT} as ${user}`);

const BATCH = 400;
for (let i = 0; i < docs.length; i += BATCH) {
  const writes = docs.slice(i, i + BATCH).map(({ path: docPath, data }) => ({
    update: { name: `${BASE}/${docPath}`, fields: encodeFields(data) },
  }));
  await commit(token, writes);
  console.log(`  committed ${Math.min(i + BATCH, docs.length)} / ${docs.length}`);
}

console.log("Done.");
