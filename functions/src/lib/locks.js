const { db, admin, FieldValue, Timestamp } = require("../db");

const LOCK_TTL_MS = 60_000;

/**
 * Acquire a short-lived in-flight lock so double-clicks don't launch parallel Gemini calls.
 * Returns { ok: true } or { ok: false, reason }.
 */
async function acquireLock(lockId) {
  const ref = db.collection("agentRuns").doc(lockId);
  const now = Date.now();

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data();
        if (data.status === "running" && data.expiresAt?.toMillis?.() > now) {
          throw new Error("IN_FLIGHT");
        }
      }
      tx.set(ref, {
        status: "running",
        startedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(now + LOCK_TTL_MS),
      });
    });
    return { ok: true };
  } catch (err) {
    if (err.message === "IN_FLIGHT") return { ok: false, reason: "in_flight" };
    throw err;
  }
}

async function releaseLock(lockId, result = {}) {
  const ref = db.collection("agentRuns").doc(lockId);
  await ref.set(
    {
      status: "complete",
      finishedAt: FieldValue.serverTimestamp(),
      ...result,
    },
    { merge: true },
  );
}

module.exports = { acquireLock, releaseLock };
