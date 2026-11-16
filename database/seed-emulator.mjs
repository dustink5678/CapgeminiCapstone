/**
 * Seed the local Firestore emulator (not cloud).
 *
 *   firebase emulators:start --only firestore
 *   npm run seed:emulator
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeed } from "./seed-data.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromFunctions = createRequire(join(__dirname, "../functions/package.json"));

process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

const admin = requireFromFunctions("firebase-admin");

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  JSON.parse(readFileSync(join(__dirname, "../.firebaserc"), "utf8")).projects?.default ||
  "capgeminidemo2";

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

function encodeValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const encoded = encodeValue(v);
      if (encoded !== undefined) out[k] = encoded;
    }
    return out;
  }
  return value;
}

async function main() {
  const docs = buildSeed();
  console.log(`Seeding emulator ${process.env.FIRESTORE_EMULATOR_HOST} project=${projectId}`);
  console.log(`${docs.length} documents`);

  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    const slice = docs.slice(i, i + chunkSize);
    for (const { path, data } of slice) {
      batch.set(db.doc(path), encodeValue(data), { merge: true });
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + chunkSize, docs.length)}/${docs.length}`);
  }

  console.log("Emulator seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
