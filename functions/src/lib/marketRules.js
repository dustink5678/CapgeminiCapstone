/**
 * Deterministic market-context synthesis. Used as the mock model, and as the fallback when
 * Gemini is off or fails, so the region brief always has calendar-grounded events.
 */

const EVENT_TYPES = new Set(["news_alert", "weather_forecast", "social_trend", "school_closure", "holiday", "seasonal"]);
const SEVERITIES = new Set(["warning", "high", "moderate", "info"]);
const MAX_EVENTS = 8;
const MAX_PRODUCTS_PER_EVENT = 8;

const HOLIDAY_LABELS = {
  thanksgiving: "Thanksgiving prep",
  christmas: "Holiday baking",
  new_years: "New Year's",
  new_years_eve: "New Year's Eve",
  superbowl: "Game day",
  valentines: "Valentine's Day",
  st_patricks: "St. Patrick's Day",
  easter: "Easter",
  cinco_de_mayo: "Cinco de Mayo",
  mothers_day: "Mother's Day",
  memorial_day: "Memorial Day cookout",
  fathers_day: "Father's Day cookout",
  july4: "Fourth of July",
  labor_day: "Labor Day cookout",
  halloween: "Halloween",
};

const NEWS_RULES = [
  { pattern: /hurricane|tropical storm/i, type: "weather_forecast", severity: "warning", tags: ["storm"], label: "Storm watch" },
  { pattern: /winter storm|ice storm|snow|freez/i, type: "weather_forecast", severity: "high", tags: ["storm", "winter"], label: "Winter weather" },
  { pattern: /flood|tornado|severe (weather|storm)|power outage/i, type: "weather_forecast", severity: "high", tags: ["storm"], label: "Severe weather" },
  { pattern: /heat (wave|advisory|warning)|extreme heat|record heat/i, type: "weather_forecast", severity: "moderate", tags: ["heat_wave"], label: "Heat advisory" },
  { pattern: /\bflu\b|influenza|rsv|covid|outbreak/i, type: "news_alert", severity: "moderate", tags: ["cold_flu"], label: "Cold and flu" },
  { pattern: /schools? (closed|closing|closure|cancel)|school closure|e-learning day/i, type: "school_closure", severity: "moderate", tags: ["breakfast", "snacks"], label: "Schools closed" },
  { pattern: /super bowl|playoff|gamecocks|clemson|tailgat/i, type: "news_alert", severity: "info", tags: ["game_day"], label: "Game day" },
];

function slug(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}

function productsForTags(catalog, tags, limit = MAX_PRODUCTS_PER_EVENT) {
  const want = new Set(tags);
  // Core items list the occasion as their first tag (turkey → thanksgiving); they outrank
  // staples that merely carry the tag (milk, butter). Ties go to pricier anchor items.
  return catalog
    .map((p) => {
      const own = p.tags || [];
      const hits = own.filter((t) => want.has(t)).length;
      return { id: p.id, hits, price: Number(p.price) || 0, score: (own.includes(tags[0]) ? 10 : 0) + (own[0] === tags[0] ? 5 : 0) };
    })
    .filter((p) => p.hits > 0)
    .sort((a, b) => b.score - a.score || b.price - a.price)
    .slice(0, limit)
    .map((p) => p.id);
}

/**
 * ctx: { region, calendar: { signals }, regionArticles[], nationalArticles[], catalog: [{ id, tags }] }
 * Returns the same shape the Gemini prompt asks for.
 */
function deterministicMarket(ctx) {
  const catalog = ctx.catalog || [];
  const signals = ctx.calendar?.signals || [];
  const events = [];

  for (const signal of signals) {
    const isHoliday = signal.kind === "holiday";
    const label = isHoliday ? HOLIDAY_LABELS[signal.key] || signal.label : signal.label;
    events.push({
      key: `cal_${signal.key}`,
      type: isHoliday ? "holiday" : "seasonal",
      severity: signal.severity || "info",
      label,
      headline: isHoliday
        ? signal.daysUntil === 0
          ? `${signal.label} is today`
          : `${signal.label} is ${signal.daysUntil} day${signal.daysUntil === 1 ? "" : "s"} away`
        : signal.label,
      body: isHoliday
        ? `Shoppers in ${ctx.region?.name || "the region"} start buying for ${signal.label} about ${signal.daysUntil} days out. Surface the staples early.`
        : `${signal.label} is shaping baskets in ${ctx.region?.name || "the region"} this week.`,
      tags: signal.tags,
      affectedProductIds: productsForTags(catalog, signal.tags),
      validDays: isHoliday ? signal.daysUntil + 1 : 7,
      sourceLabel: "Calendar",
      articleUrl: null,
    });
  }

  const seen = new Set();
  const articles = [
    ...(ctx.regionArticles || []).map((a) => ({ ...a, scope: "region" })),
    ...(ctx.nationalArticles || []).map((a) => ({ ...a, scope: "national" })),
  ];
  for (const article of articles) {
    const text = `${article.title} ${article.description || ""}`;
    const rule = NEWS_RULES.find((r) => r.pattern.test(text));
    if (!rule) continue;
    // National stories only count for things that are not location-bound.
    if (article.scope === "national" && !["cold_flu", "game_day"].includes(rule.tags[0])) continue;
    if (seen.has(rule.label)) continue;
    seen.add(rule.label);
    events.push({
      key: `news_${slug(rule.label)}`,
      type: rule.type,
      severity: article.scope === "region" ? rule.severity : "info",
      label: rule.label,
      headline: article.title.slice(0, 140),
      body: (article.description || article.title).slice(0, 240),
      tags: rule.tags,
      affectedProductIds: productsForTags(catalog, rule.tags),
      validDays: 3,
      sourceLabel: `GNews · ${article.source || "news"}`,
      articleUrl: article.url || null,
    });
  }

  const holidays = signals.filter((s) => s.kind === "holiday");
  const headline = holidays.length
    ? `${holidays[0].label} in ${holidays[0].daysUntil} days`
    : `${signals[0]?.label || "Everyday essentials"} this week`;
  const newsCount = events.filter((e) => e.sourceLabel !== "Calendar").length;
  return {
    headline,
    summary: `${ctx.region?.name || "Region"}: ${signals.map((s) => s.label).join(", ") || "no calendar signals"}. ${
      newsCount ? `${newsCount} local news signal${newsCount === 1 ? "" : "s"} matched.` : "No grocery-relevant local headlines matched."
    }`,
    activeTags: [...new Set(events.flatMap((e) => e.tags || []))],
    events,
  };
}

/** Validate and clamp model or rule output before it is written to Firestore. */
function normalizeMarket(raw, { catalog, now = new Date() }) {
  const productIds = new Set(catalog.map((p) => p.id));
  const tagsById = Object.fromEntries(catalog.map((p) => [p.id, p.tags || []]));
  const events = (Array.isArray(raw?.events) ? raw.events : [])
    .filter((e) => e && e.headline)
    .slice(0, MAX_EVENTS)
    .map((e, i) => {
      const affected = [...new Set((e.affectedProductIds || []).filter((id) => productIds.has(id)))].slice(0, MAX_PRODUCTS_PER_EVENT);
      const tags = Array.isArray(e.tags) && e.tags.length
        ? e.tags.map(String)
        : [...new Set(affected.flatMap((id) => tagsById[id]))].slice(0, 4);
      const validDays = Math.min(Math.max(Number(e.validDays) || 3, 1), 45);
      return {
        key: slug(e.key || `${e.type}_${e.label || e.headline}`) || `event_${i}`,
        type: EVENT_TYPES.has(e.type) ? e.type : "news_alert",
        severity: SEVERITIES.has(e.severity) ? e.severity : "info",
        label: String(e.label || e.headline).slice(0, 40),
        headline: String(e.headline).slice(0, 160),
        body: String(e.body || "").slice(0, 400),
        tags,
        affectedProductIds: affected,
        validFrom: now,
        validTo: new Date(now.getTime() + validDays * 86_400_000),
        sourceLabel: String(e.sourceLabel || "Spark market context").slice(0, 80),
        articleUrl: e.articleUrl || null,
      };
    });
  return {
    headline: String(raw?.headline || events[0]?.headline || "Market context").slice(0, 120),
    summary: String(raw?.summary || "").slice(0, 600),
    activeTags: [...new Set([...(raw?.activeTags || []), ...events.flatMap((e) => e.tags)])].slice(0, 16),
    events,
  };
}

module.exports = { deterministicMarket, normalizeMarket, productsForTags, HOLIDAY_LABELS };
