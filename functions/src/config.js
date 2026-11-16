/** Demo defaults and cost guards for the finite agent jobs. */

const DEMO_CUSTOMER_KEY = "doug";
const DEMO_CUSTOMER_ID = "cust_doug";
const DEMO_STORE_ID = "4127";
const DEMO_STORE_NAME = "Columbia Garners Ferry Rd Supercenter";
const DEMO_STORE_NO = "Store 4127";

/** Personalization cache TTL — skip Gemini if fingerprint matches within this window. */
const PERSONALIZE_TTL_MS = 15 * 60 * 1000;

/** Gemini Flash for structured JSON (cheap, finite). */
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
// Keep headroom: Gemini 3.x may spend output budget on internal thinking before JSON.
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 4096);
const GEMINI_TIMEOUT_MS = 45_000;
const GEMINI_MAX_RETRIES = 1;
/** Simulated model latency when GEMINI_MODE=mock (or no API key). */
const GEMINI_MOCK_LATENCY_MS = Number(process.env.GEMINI_MOCK_LATENCY_MS || 250);

const TOP_N_RECS = 4;
const TOP_N_BUNDLES = 6;

const ORG_ID = "walmart";
const MARKET_TIMEZONE = "America/New_York";
/** Region briefs are reused for this long before GNews / Gemini run again. */
const MARKET_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;
/** Safety cap on org-wide fan-out per request. */
const MARKET_MAX_REGIONS = 10;
const GNEWS_TIMEOUT_MS = 10_000;
/** Free tier allows 1 request/second; leave a little headroom. */
const GNEWS_MIN_INTERVAL_MS = 1_100;
const GNEWS_MAX_ARTICLES = 10;

module.exports = {
  ORG_ID,
  MARKET_TIMEZONE,
  MARKET_CONTEXT_TTL_MS,
  MARKET_MAX_REGIONS,
  GNEWS_TIMEOUT_MS,
  GNEWS_MIN_INTERVAL_MS,
  GNEWS_MAX_ARTICLES,
  DEMO_CUSTOMER_KEY,
  DEMO_CUSTOMER_ID,
  DEMO_STORE_ID,
  DEMO_STORE_NAME,
  DEMO_STORE_NO,
  PERSONALIZE_TTL_MS,
  GEMINI_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_TIMEOUT_MS,
  GEMINI_MAX_RETRIES,
  GEMINI_MOCK_LATENCY_MS,
  TOP_N_RECS,
  TOP_N_BUNDLES,
};
