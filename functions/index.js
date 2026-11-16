const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { app } = require("./src/app");

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const gnewsApiKey = defineSecret("GNEWS_API_KEY");

function exposeSecret(secret, envName) {
  // Prefer the Functions secret; fall back to process.env for emulator/.env.
  try {
    const value = secret.value();
    if (value) process.env[envName] = value;
  } catch {
    // Secret unavailable in some local contexts; the env var still works.
  }
}

/**
 * Single Express API. Scale-to-zero (minInstances: 0).
 * Timeout capped so agent jobs cannot run unbounded.
 * Gemini and GNews are only invoked from explicit agent/session-end routes inside the app.
 */
exports.api = onRequest(
  {
    secrets: [geminiApiKey, gnewsApiKey],
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    minInstances: 0,
    maxInstances: 10,
    concurrency: 40,
  },
  (req, res) => {
    exposeSecret(geminiApiKey, "GEMINI_API_KEY");
    exposeSecret(gnewsApiKey, "GNEWS_API_KEY");
    return app(req, res);
  },
);
