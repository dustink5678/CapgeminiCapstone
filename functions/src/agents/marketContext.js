const { db, FieldValue } = require("../db");
const { generateJson } = require("../ai/gemini");
const { fingerprint } = require("../lib/hash");
const { acquireLock, releaseLock } = require("../lib/locks");
const { agentLog } = require("../lib/agentLog");
const { getProducts } = require("../lib/customers");
const { calendarSignals } = require("../lib/calendar");
const { deterministicMarket, normalizeMarket } = require("../lib/marketRules");
const { getOrg, getRegion, listActiveRegions, getRegionIdForStore } = require("../lib/regions");
const { topHeadlines, searchNews, getGnewsKey } = require("../services/gnews");
const { toDate } = require("../lib/format");
const { ORG_ID, MARKET_CONTEXT_TTL_MS, MARKET_MAX_REGIONS, MARKET_TIMEZONE } = require("../config");

const MAX_REGION_QUERIES = 2;
const MAX_ARTICLES_IN_PROMPT = 12;
const MAX_ARTICLES_STORED = 15;

function fresh(timestamp) {
  const at = toDate(timestamp);
  return Boolean(at) && Date.now() - at.getTime() < MARKET_CONTEXT_TTL_MS;
}

/** 6-hour bucket in the region's timezone so a brief is reused within the same slot. */
function dateBucket(calendar, timeZone, asOf) {
  if (asOf) return `${calendar.asOf}_asof`;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  return `${calendar.asOf}_${Math.floor(hour / 6)}`;
}

function sameList(a = [], b = []) {
  return a.length === b.length && [...a].sort().every((value, i) => value === [...b].sort()[i]);
}

function dedupe(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    if (!article.url || seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}

/**
 * US top headlines, fetched at most once per TTL for the whole org and cached on orgs/{orgId}.
 * Every region in a fan-out reuses this one GNews call.
 */
async function getNationalHeadlines(org, { force = false } = {}) {
  const cached = org?.nationalNews;
  if (!force && cached && fresh(cached.fetchedAt)) {
    return { status: "cached", articles: cached.articles || [] };
  }
  if (!getGnewsKey()) return { status: "no_key", articles: cached?.articles || [] };

  const result = await topHeadlines({
    country: org?.marketContext?.nationalCountry || "us",
    lang: org?.marketContext?.nationalLang || "en",
  });
  if (!result.ok) return { status: "error", error: result.error, articles: cached?.articles || [] };

  await db
    .collection("orgs")
    .doc(org?.id || ORG_ID)
    .set({ nationalNews: { fetchedAt: FieldValue.serverTimestamp(), articles: result.articles } }, { merge: true });
  return { status: "live", articles: result.articles };
}

async function fetchRegionArticles(region) {
  if (!getGnewsKey()) return { status: "no_key", articles: [] };
  const from = new Date(Date.now() - 3 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const queries = (region.newsQueries || []).slice(0, MAX_REGION_QUERIES);
  const results = [];
  for (const q of queries) results.push(await searchNews(q, { from }));
  const articles = dedupe(results.flatMap((r) => r.articles));
  const status = results.some((r) => r.ok) ? "live" : results.length ? "error" : "no_queries";
  return { status, articles, errors: results.filter((r) => !r.ok).map((r) => r.error) };
}

/** Keep calendar holidays even if the model forgot them; they are free, certain signals. */
function ensureCalendarEvents(market, ctx) {
  const rules = deterministicMarket(ctx);
  const covered = new Set(market.events.flatMap((e) => e.tags || []));
  const missing = rules.events.filter(
    (e) => e.type === "holiday" && !(e.tags || []).some((tag) => covered.has(tag)),
  );
  return { ...market, events: [...market.events, ...missing] };
}

async function replaceRegionEvents({ region, orgId, events, generatedBy }) {
  const existing = await db.collection("localEvents").where("regionId", "==", region.id).get();
  const batch = db.batch();
  for (const doc of existing.docs) {
    if (doc.data().source === "market_context") batch.delete(doc.ref);
  }
  const ids = [];
  for (const event of events) {
    const id = `mkt_${region.id}_${event.key}`;
    ids.push(id);
    batch.set(db.collection("localEvents").doc(id), {
      type: event.type,
      source: "market_context",
      sourceLabel: event.sourceLabel,
      label: event.label,
      headline: event.headline,
      body: event.body,
      severity: event.severity,
      tags: event.tags,
      affectedProductIds: event.affectedProductIds,
      issuedAt: FieldValue.serverTimestamp(),
      validFrom: event.validFrom,
      validTo: event.validTo,
      orgId,
      regionId: region.id,
      county: region.county || null,
      zips: region.zips || [],
      articleUrl: event.articleUrl,
      generatedBy,
    });
  }
  return { batch, ids };
}

/**
 * Finite per-region job: calendar (free) + GNews (2–3 calls) + one Gemini call, then writes the
 * region's marketBrief and its localEvents. Skips GNews entirely when the brief is still fresh.
 */
async function runRegionMarketContext({ region, org, national, force = false, asOf } = {}) {
  const started = Date.now();
  const orgId = region.orgId || org?.id || ORG_ID;
  const timeZone = region.timezone || org?.timezone || MARKET_TIMEZONE;
  agentLog("marketContext", "start", { regionId: region.id, force, asOf: asOf || null });

  const lockId = `marketContext:${region.id}`;
  const lock = await acquireLock(lockId);
  if (!lock.ok) {
    agentLog("marketContext", "end", { regionId: region.id, skipped: true, reason: lock.reason });
    return { regionId: region.id, skipped: true, reason: lock.reason };
  }

  try {
    const calendar = calendarSignals({ asOf, timeZone, seasonalRisks: region.seasonalRisks || [] });
    const bucket = dateBucket(calendar, timeZone, asOf);
    const brief = region.marketBrief;

    if (!force && brief && brief.dateBucket === bucket && sameList(brief.calendarKeys, calendar.keys)) {
      await releaseLock(lockId, { skipped: true, reason: "brief_fresh" });
      agentLog("marketContext", "end", { regionId: region.id, skipped: true, reason: "brief_fresh", durationMs: Date.now() - started });
      return { regionId: region.id, skipped: true, reason: "brief_fresh", headline: brief.headline };
    }

    const nationalNews = national || (await getNationalHeadlines(org, { force: false }));
    const regionNews = await fetchRegionArticles(region);
    const newsStatus = regionNews.status === "live" || nationalNews.status === "live"
      ? "live"
      : nationalNews.status === "cached"
        ? "cached"
        : regionNews.status === "no_key"
          ? "no_key"
          : "error";

    const articleUrls = [...regionNews.articles, ...nationalNews.articles].map((a) => a.url).sort();
    const fp = fingerprint({ regionId: region.id, dateBucket: bucket, calendarKeys: calendar.keys, articleUrls });

    if (!force && brief?.fingerprint === fp) {
      await db.collection("regions").doc(region.id).set(
        { marketBrief: { dateBucket: bucket, fetchedAt: FieldValue.serverTimestamp() } },
        { merge: true },
      );
      await releaseLock(lockId, { skipped: true, reason: "same_inputs" });
      agentLog("marketContext", "end", { regionId: region.id, skipped: true, reason: "same_inputs", durationMs: Date.now() - started });
      return { regionId: region.id, skipped: true, reason: "same_inputs", headline: brief.headline };
    }

    const products = await getProducts();
    const ctx = {
      region: {
        id: region.id,
        name: region.name,
        state: region.stateName || region.state,
        county: region.county,
        cities: region.cities || [],
        seasonalRisks: region.seasonalRisks || [],
      },
      today: calendar.asOf,
      calendar: { signals: calendar.signals },
      regionArticles: regionNews.articles.slice(0, MAX_ARTICLES_IN_PROMPT),
      nationalArticles: nationalNews.articles.slice(0, 8),
      catalog: products.map((p) => ({ id: p.id, name: (p.name || "").slice(0, 48), price: p.price, tags: p.tags || [] })),
    };

    agentLog("marketContext", "gemini_call", {
      regionId: region.id,
      calendarKeys: calendar.keys,
      regionArticles: ctx.regionArticles.length,
      nationalArticles: ctx.nationalArticles.length,
    });
    const ai = await generateJson({
      system:
        "You are Spark Agent's market-context analyst for Walmart. For ONE region, combine today's date, the upcoming holidays and seasonal windows, and recent news headlines into grocery demand signals. Keep only news that plausibly changes what local shoppers buy this week (weather, closures, outbreaks, local events, big games). Use type holiday for calendar holidays and seasonal for seasons or recurring windows. affectedProductIds must come from the provided catalog. Severity: warning only for imminent dangerous weather; high for something within 3 days; moderate within 10 days; info otherwise. headline is shopper-facing and under 8 words (e.g. \"Thanksgiving is 17 days away\"); summary is 1-2 sentences for store managers; label is 2-3 words. No markdown.",
      schemaHint:
        '{"headline":"...","summary":"...","activeTags":["thanksgiving"],"events":[{"key":"thanksgiving","type":"holiday","severity":"moderate","label":"Thanksgiving prep","headline":"...","body":"...","tags":["thanksgiving"],"affectedProductIds":["turkey"],"validDays":18,"sourceLabel":"Calendar","articleUrl":null}]}',
      user: JSON.stringify(ctx),
    });

    let mode = "fallback";
    let raw;
    if (ai.ok && ai.data) {
      mode = ai.mode || "live";
      raw = ai.data;
      agentLog("marketContext", "gemini_ok", { regionId: region.id, mode, metrics: ai.metrics });
    } else {
      raw = deterministicMarket(ctx);
      agentLog("marketContext", "fallback", { regionId: region.id, mode: ai.mode || "off", error: ai.error });
    }
    const generatedBy =
      mode === "mock" ? "spark-agent-mock" : mode === "live" ? "spark-agent-gemini" : "spark-agent-fallback";

    const market = normalizeMarket(ensureCalendarEvents(normalizeMarket(raw, { catalog: products }), ctx), {
      catalog: products,
    });

    const { batch, ids } = await replaceRegionEvents({ region, orgId, events: market.events, generatedBy });
    const marketBrief = {
      headline: market.headline,
      summary: market.summary,
      activeTags: market.activeTags,
      calendar: calendar.signals
        .filter((s) => s.kind === "holiday")
        .map((s) => ({ key: s.key, label: s.label, date: s.date, daysUntil: s.daysUntil, tags: s.tags })),
      windows: calendar.signals.filter((s) => s.kind !== "holiday").map((s) => s.label),
      articles: dedupe([...regionNews.articles, ...nationalNews.articles])
        .slice(0, MAX_ARTICLES_STORED)
        .map((a) => ({ title: a.title, source: a.source, url: a.url, publishedAt: a.publishedAt })),
      regionArticleCount: regionNews.articles.length,
      nationalArticleCount: nationalNews.articles.length,
      eventIds: ids,
      asOf: calendar.asOf,
      dateBucket: bucket,
      calendarKeys: calendar.keys,
      fingerprint: fp,
      newsStatus,
      newsError: regionNews.errors?.[0] || nationalNews.error || null,
      mode,
      generatedBy,
      metrics: ai.metrics || null,
      generatedAt: FieldValue.serverTimestamp(),
      fetchedAt: FieldValue.serverTimestamp(),
    };
    batch.set(db.collection("regions").doc(region.id), { marketBrief }, { merge: true });
    await batch.commit();
    await releaseLock(lockId, { skipped: false, mode, fingerprint: fp, eventCount: ids.length });

    agentLog("marketContext", "end", {
      regionId: region.id,
      skipped: false,
      mode,
      newsStatus,
      eventCount: ids.length,
      durationMs: Date.now() - started,
    });
    return {
      regionId: region.id,
      skipped: false,
      mode,
      newsStatus,
      headline: market.headline,
      activeTags: market.activeTags,
      eventIds: ids,
      articleCount: marketBrief.articles.length,
      metrics: ai.metrics || null,
      geminiError: mode === "fallback" ? ai.error || null : null,
    };
  } catch (err) {
    agentLog("marketContext", "error", { regionId: region.id, error: err.message, durationMs: Date.now() - started });
    await releaseLock(lockId, { status: "error", error: err.message });
    throw err;
  }
}

/**
 * Entry point. With regionId: one region. Without: fan out across every active region in the org,
 * sharing one national-headlines fetch. Regions run in parallel; GNews calls queue at 1 rps.
 */
async function runMarketContext({ orgId = ORG_ID, regionId, storeId, force = false, asOf } = {}) {
  const started = Date.now();
  const org = await getOrg(orgId);
  const targetRegionId = regionId || (storeId ? await getRegionIdForStore(storeId) : null);

  let regions;
  if (targetRegionId) {
    const region = await getRegion(targetRegionId);
    if (!region) return { error: `Unknown region ${targetRegionId}`, status: 404 };
    regions = [region];
  } else {
    regions = (await listActiveRegions(orgId)).slice(0, MARKET_MAX_REGIONS);
    if (!regions.length) return { error: `No active regions for org ${orgId}`, status: 404 };
  }

  const national = await getNationalHeadlines(org || { id: orgId }, { force });
  const results = await Promise.all(
    regions.map((region) =>
      runRegionMarketContext({ region, org: org || { id: orgId }, national, force, asOf }).catch((err) => ({
        regionId: region.id,
        error: err.message,
      })),
    ),
  );

  return {
    orgId,
    scope: targetRegionId ? "region" : "org",
    national: { status: national.status, count: national.articles.length, error: national.error || null },
    regions: results,
    durationMs: Date.now() - started,
  };
}

function serializeBrief(brief) {
  if (!brief) return null;
  const iso = (value) => toDate(value)?.toISOString?.() || null;
  return { ...brief, generatedAt: iso(brief.generatedAt), fetchedAt: iso(brief.fetchedAt) };
}

/** Read-only view for the UI: org, every region's brief, and the requested store's region. */
async function getMarketContext({ orgId = ORG_ID, storeId } = {}) {
  const [org, regions, storeRegionId] = await Promise.all([
    getOrg(orgId),
    listActiveRegions(orgId),
    storeId ? getRegionIdForStore(storeId) : null,
  ]);
  const shaped = regions.map((region) => ({
    id: region.id,
    name: region.name,
    storeIds: region.storeIds || [],
    marketBrief: serializeBrief(region.marketBrief),
  }));
  return {
    org: org
      ? {
          id: org.id,
          name: org.name,
          nationalNews: {
            fetchedAt: toDate(org.nationalNews?.fetchedAt)?.toISOString?.() || null,
            count: org.nationalNews?.articles?.length || 0,
          },
        }
      : null,
    regions: shaped,
    storeRegion: shaped.find((region) => region.id === storeRegionId) || null,
  };
}

module.exports = { runMarketContext, runRegionMarketContext, getMarketContext, getNationalHeadlines };
