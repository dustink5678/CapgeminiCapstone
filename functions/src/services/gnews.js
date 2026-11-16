const { agentLog } = require("../lib/agentLog");
const { GNEWS_TIMEOUT_MS, GNEWS_MIN_INTERVAL_MS, GNEWS_MAX_ARTICLES } = require("../config");

const BASE_URL = "https://gnews.io/api/v4";

function getGnewsKey() {
  return process.env.GNEWS_API_KEY || "";
}

// Free tier allows 1 request/second per key, so every call in this instance shares one queue.
let queue = Promise.resolve();
let lastRequestAt = 0;

function schedule(task) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + GNEWS_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

function toArticle(raw) {
  return {
    title: raw.title || "",
    description: (raw.description || "").slice(0, 280),
    url: raw.url || "",
    publishedAt: raw.publishedAt || null,
    source: raw.source?.name || "",
  };
}

async function request(endpoint, params) {
  const apiKey = getGnewsKey();
  if (!apiKey) return { ok: false, status: "no_key", articles: [] };

  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [key, value] of Object.entries({ lang: "en", country: "us", max: GNEWS_MAX_ARTICLES, ...params })) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  const logUrl = url.toString();
  url.searchParams.set("apikey", apiKey);

  return schedule(async () => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GNEWS_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = Array.isArray(body.errors) ? body.errors.join("; ") : body.errors || res.statusText;
        agentLog("gnews", "error", { endpoint, status: res.status, error, latencyMs: Date.now() - started });
        return { ok: false, status: "error", httpStatus: res.status, error: String(error), articles: [] };
      }
      const articles = (body.articles || []).map(toArticle).filter((a) => a.title && a.url);
      agentLog("gnews", "ok", { endpoint, url: logUrl, count: articles.length, latencyMs: Date.now() - started });
      return { ok: true, status: "live", articles };
    } catch (err) {
      const error = err.name === "AbortError" ? "GNews timeout" : err.message;
      agentLog("gnews", "error", { endpoint, error, latencyMs: Date.now() - started });
      return { ok: false, status: "error", error, articles: [] };
    } finally {
      clearTimeout(timer);
    }
  });
}

/** US top headlines (shared across every region in an org refresh). */
function topHeadlines({ country = "us", lang = "en", category = "general" } = {}) {
  return request("top-headlines", { country, lang, category });
}

/** Keyword search, e.g. a region's `newsQueries` entry. */
function searchNews(q, { country = "us", lang = "en", from } = {}) {
  return request("search", { q, country, lang, from, sortby: "publishedAt" });
}

module.exports = { getGnewsKey, topHeadlines, searchNews };
