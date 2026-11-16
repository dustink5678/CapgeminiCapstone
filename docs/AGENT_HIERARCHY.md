# Spark Agent — Agent Hierarchy

Companion to [AGENT_REPORT.md](AGENT_REPORT.md). Diagrams show where each agent lives, what it reads/writes, and the skip gates that keep it cheap.

---

## 1. Full system: org → region → store → customer

```mermaid
flowchart TB
  subgraph ORG["orgs/walmart — global"]
    orgdoc["org config<br/>timezone, active, nationalNews cache"]
    catalog["products/* — 84 SKUs<br/>tags[] + shelf"]
  end

  subgraph R1["regions/sc_richland"]
    brief1["marketBrief<br/>headline, calendar, articles, fingerprint"]
    ev1["localEvents regionId=sc_richland<br/>holiday / seasonal / news_alert / weather"]
    subgraph S1["stores 4127 · 4128 · 2210"]
      inv1["inventory + dailySales"]
      po1["storeOrders draft"]
    end
  end

  subgraph R2["regions/sc_lexington"]
    brief2["marketBrief"]
    ev2["localEvents regionId=sc_lexington"]
    subgraph S2["store 3302"]
      inv2["inventory + dailySales"]
    end
  end

  subgraph CUST["customers/cust_doug — homeStoreId 4127"]
    weights["preferenceWeights"]
    pantry["pantry run-out dates"]
    memory["agentMemory/current<br/>summary, keyFacts, openThreads"]
    sessions["sessions + events"]
  end

  MC(["AGENT: marketContext<br/>1 run per region"])
  PZ(["AGENT: personalize<br/>1 run per customer"])
  RP(["AGENT: replenish<br/>1 run per store"])
  SM(["AGENT: sessionMemory<br/>1 run per session"])
  CO["checkout service — no AI"]

  orgdoc --> MC
  catalog --> MC
  MC ==> brief1
  MC ==> ev1
  MC ==> brief2
  MC ==> ev2

  ev1 -. "store 4127 → sc_richland" .-> PZ
  weights --> PZ
  pantry --> PZ
  memory --> PZ
  catalog --> PZ
  PZ ==> recs["recommendations<br/>for_you + cart_bundle"]

  ev1 -. "store.regionId" .-> RP
  inv1 --> RP
  RP ==> po1

  sessions --> CO
  CO ==> orders["orders/ord_live_*"]
  CO --> SM
  sessions --> SM
  ev1 -.-> SM
  SM ==> weights
  SM ==> memory
```

**Legend:** `==>` writes · `-->` reads · `-.->` region-resolved read · rounded boxes = agents (one Gemini call each, max).

---

## 2. Who runs where

| Layer | Agent | Unit of work | Trigger | Gemini calls |
|---|---|---|---|---|
| Org | — | fan-out only | `POST /api/agents/market-context` | 0 |
| Region | **marketContext** | 1 per active region | org fan-out or `{regionId}` | ≤1 per region |
| Store | **replenish** | 1 per store | `POST /api/agents/replenish` | ≤1 per store |
| Customer | **personalize** | 1 per shopper | `POST /api/agents/personalize` | ≤1 per shopper |
| Session | **sessionMemory** | 1 per session | end session / checkout | ≤1 per session |

---

## 3. marketContext — per-region job with two skip gates

```mermaid
flowchart TB
  trig["POST /api/agents/market-context"] --> scope{"regionId / storeId given?"}
  scope -- no --> list["listActiveRegions orgId=walmart<br/>cap 10"]
  scope -- yes --> one["single region"]
  list --> nat["getNationalHeadlines<br/>1 GNews call for whole org<br/>cached on orgs/walmart 6h"]
  one --> nat
  nat --> fan["Promise.all over regions"]
  fan --> lock{"lock marketContext:regionId<br/>60s TTL"}
  lock -- held --> skipL["skip: locked"]
  lock -- ok --> cal["calendarSignals — pure code<br/>holidays in lead window, season,<br/>cold_flu, heat, back_to_school, hurricane"]
  cal --> g1{"GATE 1: same 6h bucket<br/>AND same calendar keys?"}
  g1 -- yes --> skip1["skip: brief_fresh<br/>0 GNews · 0 Gemini"]
  g1 -- no --> news["GNews search × ≤2 newsQueries<br/>shared 1.1s rate queue"]
  news --> fp["fingerprint: regionId + bucket<br/>+ calendarKeys + article URLs"]
  fp --> g2{"GATE 2: fingerprint unchanged?"}
  g2 -- yes --> skip2["skip: same_inputs<br/>0 Gemini"]
  g2 -- no --> gem["1 Gemini call<br/>calendar + articles + tagged catalog"]
  gem -- fail / 503 --> det["deterministicMarket<br/>calendar + NEWS_RULES keywords"]
  gem -- ok --> norm["normalizeMarket<br/>validate types, severity, productIds"]
  det --> norm
  norm --> ens["ensureCalendarEvents<br/>re-add holidays model dropped"]
  ens --> w1["write regions/id.marketBrief"]
  ens --> w2["replace localEvents mkt_regionId_key"]
```

**Severity rule (calendar):** ≤3 days → `high` · ≤10 days or major food holiday → `moderate` · else `info`.
Major food holidays: Thanksgiving, Christmas, Easter, July 4, Super Bowl.

**Product mapping:** event tags → `productsForTags`: products whose *first* tag is the occasion outrank ones that merely carry it; ties → higher price (anchor item: turkey, ham, wings).

---

## 4. Region resolution (readers)

```mermaid
flowchart LR
  cust["customer.homeStoreId = 4127"] --> store["stores/4127.regionId"]
  store --> reg["sc_richland"]
  reg --> q["getActiveLocalEvents zip + regionId"]
  q --> f1{"market_context event?"}
  f1 -- yes --> win["must be inside validFrom..validTo"]
  f1 -- no --> seed["seeded event — demo bypass"]
  win --> sort["sort by severity: warning > high > moderate > info"]
  seed --> sort
  sort --> out["personalize · replenish · sessionMemory · insights"]
```

---

## 5. personalize — scoring then one Gemini call

```mermaid
flowchart TB
  start["POST personalize"] --> lk{"lock personalize:customerId"}
  lk -- held --> cache0["return cached recs"]
  lk -- ok --> load["load pantry · region events · memory · catalog"]
  load --> fp["fingerprint: preferenceWeights + eventIds<br/>+ pantry ids + cart ids"]
  fp --> g{"same fp AND under 15 min?"}
  g -- yes --> hit["skip: cache_fresh"]
  g -- no --> score["score every product"]
  score --> s1["+ weight × 2 — aisle matches preference"]
  score --> s2["+ 1.5 — pantry run-out"]
  score --> s3["+ severity boost — event names product<br/>warning 3 · high 2 · moderate 1.5 · info 1"]
  score --> s4["+ half boost — product tag matches event tag"]
  score --> s5["+ 1.2 storm_prep during warning<br/>− 5 already in cart"]
  s1 & s2 & s3 & s4 & s5 --> top["top 4 recs + 6 bundle candidates<br/>topEvent → eventLabel"]
  top --> gem["1 Gemini call: write reasons only"]
  gem -- fail --> fb["deterministic reasons"]
  gem -- ok --> wr["write recommendations + agentCaches"]
  fb --> wr
```

---

## 6. replenish — store draft PO

```mermaid
flowchart TB
  start["POST replenish storeId"] --> reg["store → regionId → events"]
  reg --> fp{"fingerprint storeId + regionId + eventIds<br/>same as draft?"}
  fp -- yes --> skip["skip: same_event_draft"]
  fp -- no --> base["5 focus staples<br/>milk eggs water bread batteries"]
  base --> extra["+ up to 4 event lines<br/>from warning / high / moderate events"]
  extra --> calc["per line: forecast72h = max of<br/>recent × 3 × boost, normal72h × 1.5"]
  calc --> qty["qty = need × 1.12 rounded up to case size"]
  qty --> gem["1 Gemini call: buyer notes"]
  gem --> po["storeOrders draft + line.driver label"]
```

---

## 7. Preference learning loop

```mermaid
flowchart LR
  shop["shopper views / adds / checks out"] --> ev["events: product_view dwellMs,<br/>add_to_cart, search, checkout"]
  ev --> endS["end session or checkout"]
  endS --> sm(["sessionMemory"])
  sm --> gem["1 Gemini call<br/>summary, intents, weightDeltas"]
  gem --> upd["preferenceWeights<br/>clamped 0–1, default 0.3"]
  gem --> mem["agentMemory keyFacts<br/>merged, max 12"]
  upd --> fpchange["personalize fingerprint changes"]
  mem --> ctx["personalize prompt context"]
  fpchange --> pz(["personalize re-ranks next visit"])
  ctx --> pz
  pz --> shop
```
