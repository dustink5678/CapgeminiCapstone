# Spark Agent — Agent Implementation Report

Diagrams: [AGENT_HIERARCHY.md](AGENT_HIERARCHY.md).

## Overview

Four AI agents plus one non-AI service. Every agent is a **finite job**: triggered by an HTTP call, takes a lock, checks whether its inputs changed, makes **at most one Gemini call** (`gemini-3.5-flash`), writes to Firestore, and exits. Nothing polls or loops. If Gemini fails or times out, each agent has a deterministic fallback, so the UI never goes empty.

---

## 1. The agents

| Agent | Scope | Reads | Writes | What it does |
|---|---|---|---|---|
| **marketContext** | Region | Calendar, GNews, catalog tags | `regions/{id}.marketBrief`, `localEvents` | Turns the date and local news into demand events (holiday, seasonal, news, weather) with the products they affect. |
| **personalize** | Customer | Preference weights, pantry, region events, memory, catalog | `recommendations`, `agentCaches` | Scores the catalog for one shopper, picks the top 4 recs + bundles, and has Gemini write the "why". |
| **replenish** | Store | Inventory, daily sales, region events | `storeOrders` draft | Forecasts 72h demand and drafts a purchase order for staples plus event-driven lines. |
| **sessionMemory** | Session | Session events, order, prior memory, region events | `sessionSummaries`, `agentMemory`, `preferenceWeights` | Summarizes the visit and updates the shopper's long-term preferences. |
| checkout (service) | Session | Cart | `orders`, `checkout` event | Mock order (8% tax), marks the session purchased, then triggers sessionMemory. |

---

## 2. Regions and stores

**Structure.** One global root, `orgs/walmart`. It owns `regions/*`, and each region lists its `storeIds`. Stores carry `orgId` + `regionId`. The catalog is org-global, so all regions share 84 SKUs. Collections stay top-level and are linked by those ID fields rather than nested paths, which avoided rewriting every existing reader.

| Region | Stores | News queries |
|---|---|---|
| `sc_richland` | 4127 Garners Ferry, 4128, 2210 | Columbia / Richland County |
| `sc_lexington` | 3302 Irmo | Lexington / Irmo |

**Where each agent runs:**
- **Org level:** no agent, just the fan-out. One request runs marketContext for every active region in parallel (capped at 10). The US national headlines call happens once and is cached on the org doc for 6h, so every region reuses it.
- **Region level:** marketContext. It runs once per region, not per store or per shopper, because stores in the same county get the same hurricane or school-closure news. It writes one brief and a set of `localEvents` tagged with `regionId`.
- **Store level:** replenish. It reads its own inventory and sales, plus the events for its region.
- **Customer level:** personalize and sessionMemory. The shopper's region is resolved as `homeStoreId` → `stores.regionId`, and they receive only that region's events.

**What marketContext produces per region:**
- Holidays inside their lead window: Thanksgiving, Christmas, July 4, Super Bowl, Easter, and the rest, all computed in code with no API.
- Seasons and recurring windows: fall/winter, cold and flu (Oct–Mar), summer heat (Jun–Aug), back to school (Jul 15–Aug 25), hurricane season.
- News events from GNews articles, such as a heat advisory, a storm, or a local game.
- For each event: type, severity, shopper-facing headline, `tags`, `affectedProductIds`, and a validity window.

Example (Nov 9, Richland): "Thanksgiving prep" (moderate) → turkey, apple cider, pie crust, sweet potatoes… plus Hurricane Rose (warning) → water, batteries, flashlight.

---

## 3. How it was implemented

- **Calendar** (`lib/calendar.js`): pure date math. Covers nth-weekday holidays, Easter by computus, and seasonal windows in the region's timezone. Severity is `high` at ≤3 days, `moderate` at ≤10 days or for a major food holiday, otherwise `info`.
- **News** (`services/gnews.js`): GNews free tier, server-side only, key stored as the `GNEWS_API_KEY` secret. Requests go through a shared queue at 1.1s spacing, with a 10s timeout. A missing key or an error falls back to calendar-only events.
- **Synthesis** (`agents/marketContext.js`): one Gemini call per region. Its output is then cleaned in code:
  - `normalizeMarket` validates the result and drops unknown product IDs.
  - `ensureCalendarEvents` re-adds any holiday the model forgot.
  - On failure, `deterministicMarket` maps calendar signals and news keywords to tags and products instead.
- **Product mapping** (`lib/marketRules.js`): each event's tags are matched to catalog `tags`. Products whose primary tag is the occasion rank first (turkey for Thanksgiving, not milk), and ties go to the higher-priced anchor item.
- **Readers**: `getActiveLocalEvents({zip, regionId})` filters by region, enforces `validFrom`/`validTo` on market events, and sorts by severity.
- **Catalog**: expanded from 21 to 84 products. Each has `tags` and a `shelf` (staples / storm / seasonal), and store 4127 has inventory and sales history for all of them.
- **API/UI**: `GET /api/market-context?storeId=` and `POST /api/agents/market-context {regionId?, storeId?, force?, asOf?}`. The `asOf` parameter lets you test any date, e.g. `2027-07-01`. The Insights page shows per-region cards. The Shop page's seasonal rail follows the region's active tags ("Get ready for Thanksgiving").

---

## 4. Efficiency measures

| Measure | Effect |
|---|---|
| News runs per **region**, not per store or user | 2 jobs total for 4 stores and any number of shoppers |
| National headlines cached on the org for 6h | 1 GNews call shared by all regions |
| **Gate 1 `brief_fresh`**: same 6h bucket and same holiday keys | Skips GNews **and** Gemini entirely |
| **Gate 2 `same_inputs`**: article URLs unchanged | Skips Gemini even after fetching news |
| Calendar computed in code | Holidays cost nothing and are always correct |
| Locks (`agentRuns`, 60s TTL) | Double clicks or concurrent calls can't duplicate work |
| Personalize fingerprint + 15 min TTL | Repeat page loads cost 0 model calls |
| Replenish fingerprint (store + region + event IDs) | A new draft only when events change |
| sessionMemory is idempotent (`summarizedAt`) | Ending a session twice does nothing |
| Gemini writes **text only**; ranking and quantities are code | Small prompts (~1k tokens), deterministic numbers, safe fallback |
| Regions fan out in parallel, GNews serialized in a queue | ~8.5s for both regions, still within the free-tier rate limit |

GNews budget: a full refresh costs about 1 + 2 × regions requests (5 for the demo), and only when gate 1 misses. That's far under 100/day.

---

## 5. How recommendations adapt to the user

**Each personalize run scores every product:**
- **Preferences:** `preferenceWeights[aisle] × 2`, which is the learned part.
- **Pantry:** +1.5 when the shopper's item is about to run out.
- **Region events:** a full severity boost (warning 3, high 2, moderate 1.5, info 1) when the event names the product, and a half boost when only a tag matches. This is what makes Thanksgiving or game-day items surface.
- **Storm prep:** +1.2 while a warning is active.
- **Cart:** −5 for items already in the cart, so they aren't re-recommended.
- Gemini then explains the top picks using the event label ("Thanksgiving prep", "Hurricane warning") and the shopper's memory.

**Learning loop, which runs on every session end or checkout:**
1. Events are logged as the shopper browses: product views with dwell time, adds, searches, checkout.
2. sessionMemory has Gemini read the session and return `weightDeltas` plus derived signals. For example, long dwell on dairy raises that weight from 0.5 to 0.62.
3. Weights are updated on the customer, clamped to 0–1 with new keys starting at 0.3. Key facts are merged into `agentMemory`, keeping at most 12, and abandoned-cart threads are cleared after a purchase.
4. The weights are part of personalize's fingerprint, so **any learned change invalidates the cache**. The next visit re-ranks with the new weights, and the updated memory goes into the prompt.

Net effect: rankings combine what this shopper has shown they like (weights, pantry, memory) with what's happening in their region right now (holidays, season, news). Both update automatically without per-user model calls between visits.

**Current limits:**
- Weights match on aisle names, not individual product tags.
- Recommendation clicks are counted on the session (`recsAccepted`) but don't feed the weights directly yet.
- No scheduler yet. Market context refreshes when the endpoint is called; the org-wide endpoint is ready for Cloud Scheduler.
