# Spark Agent: an agentic AI layer for a Walmart-style store

Spark Agent is a demonstration prototype of an AI layer added to a traditional
retailer. It has three parts:

1. **Customer storefront** (Shop and Cart). Personalized recommendations, each
   with a written reason ("Doug spent 8.2 seconds on eggs last night…").
2. **Data layer**. What the agent stores about each shopper and how every signal
   changes what that shopper sees.
3. **Store insights dashboard**. Demand charts with AI-written notes, plus a
   drafted replenishment order a store manager can edit and approve.

The demo story: News 10 issues a **Hurricane Rose** warning for Richland County,
SC. Local social media panics, and milk, eggs, and water sell at 4–10× a normal
day. The agent re-ranks shoppers' pages and drafts a larger store order before
the Thursday night truck.

- Live site: <https://capgeminidemo2.web.app>
- Firebase project: `capgeminidemo2` ([console](https://console.firebase.google.com/project/capgeminidemo2/overview))
- Architecture map: [ARCHITECTURE.md](ARCHITECTURE.md)
- Full database map: [database/SCHEMA.md](database/SCHEMA.md)

> **Status.** Two modes:
>
> - **`VITE_API_MODE=demo`** (default in local Vite): in-browser `demoStore.js`, no
>   network. Good for UI work offline.
> - **`VITE_API_MODE=live`** (default in production builds): `/api/**` hits Cloud
>   Functions (`functions/`), which read/write Firestore and run three **finite**
>   Gemini agents (personalization, replenishment, session memory). Agents never
>   run on ordinary page GETs — only on explicit refresh / regenerate / session end.
>
> Firebase Auth and scheduled weather/news pollers are still **planned**.
>
---

## 1. Technologies and how they tie together

This is a **React single-page web app written in JavaScript**, built with
**Vite** and hosted on **Firebase Hosting**. **Cloud Firestore** is the cloud
database. **Firebase Authentication** (planned) will handle shopper and
associate accounts. **Cloud Functions for Firebase** (planned) will serve the
REST API and run the AI agent jobs.

| Layer | Technology | Status | Role |
|---|---|---|---|
| Language | JavaScript (ES modules), JSX, CSS | Built | All app, script, and data code |
| UI framework | React 19 | Built | Components for every page and view |
| Routing | React Router 7 (`react-router-dom`) | Built | Client-side URLs: `/`, `/cart`, `/data`, `/insights` |
| Charts | Recharts 2 | Built | Line, area, and bar charts on the Insights page |
| Build tool / dev server | Vite 6 with `@vitejs/plugin-react` | Built | Dev server with hot reload; production bundle in `dist/` |
| Runtime for tooling | Node.js 23 | Built | Runs Vite, the seed script, and the Firebase CLI |
| Static hosting / CDN | Firebase Hosting | Built | Serves `dist/` at `capgeminidemo2.web.app` |
| Cloud database | Cloud Firestore (Native mode, `nam5`) | Built (seeded) | Customers, sessions, events, session summaries, orders, store data |
| Security | Firestore Security Rules | Built | Currently deny all client access |
| Database API | Firestore REST API (`documents:commit`) | Built | Used only by `database/seed.mjs` to upload demo data |
| CLI / auth for scripts | Firebase CLI (`firebase-tools` 14) | Built | Deploys hosting and rules; its login provides the seed script's OAuth token |
| Product images | Open Food Facts / Open Products Facts | Built | Product photos (CC BY-SA), downloaded once into `public/products/` |
| User accounts | Firebase Authentication | Planned | Shopper sign-in; associate sign-in with a `role` custom claim |
| Server API | Cloud Functions for Firebase (Node.js + Express) | Built (prototype) | Hosts `/api/*`; scale-to-zero (`minInstances: 0`), 120s timeout |
| AI model | Gemini Flash via Google AI Studio API key | Built (prototype) | Reasons, replenishment notes, session summaries, region market briefs — one call per agent job |
| News | [GNews API](https://gnews.io) free tier (secret `GNEWS_API_KEY`) | Built (prototype) | US headlines + per-region searches, fetched server-side by the market-context agent |
| Calendar | Pure code (`functions/src/lib/calendar.js`) | Built | US holidays with buying lead times, seasons, back-to-school, cold-and-flu, hurricane season |
| Outside signals | `localEvents` written per region by the market-context agent, plus seeded Hurricane Rose | Built | Scoped by `regionId` |
| Scheduling | None in this prototype | Deferred | `POST /api/agents/market-context` with no body is ready for a once-a-day Cloud Scheduler job |

**Org → region → store**

`orgs/walmart` is the global root. `regions/{regionId}` group stores that share
local news and calendar context (seeded: `sc_richland` = stores 4127, 4128, 2210;
`sc_lexington` = store 3302). Stores keep their own inventory, sales, and
replenishment drafts. The product catalog (84 tagged SKUs) is org-global.

The **market-context agent** runs once per active region, never per store or per
shopper. One org-wide refresh: 1 shared US-headlines call + up to 2 GNews searches
and 1 Gemini call per region, then it writes `regions/{id}.marketBrief` and that
region's `localEvents`. A 6-hour cache skips GNews and Gemini entirely on repeat
runs. Personalize, replenish, and session memory only read the region's events
(customer → `homeStoreId` → `stores.regionId`).

**How the pieces connect (live / production)**

1. Hosting serves the SPA; `/api/**` rewrites to the `api` Cloud Function.
2. `GET` handlers **read** Firestore only (catalog, insights, cart, accounts).
3. Agents run only on:
   - `POST /api/agents/personalize` (Shop “Refresh picks”, or first visit if cache empty)
   - `POST /api/agents/replenish` (Insights “Regenerate draft order”)
   - `POST /api/agents/market-context` (Insights “Refresh market context”, one job per region)
   - `POST /api/sessions/:id/end` (tab close / Reset demo / checkout)
4. Each agent: lock → score/prepare → optional **one** Gemini call → write → exit.
5. Fingerprint/TTL caches and in-flight locks prevent double-click spend.

**How to demo the agents**

1. Create a free Gemini key at [Google AI Studio](https://aistudio.google.com/apikey).
2. `firebase functions:secrets:set GEMINI_API_KEY` (paste the key).
3. Create a free GNews key at [gnews.io/register](https://gnews.io/register) (no card; 100 requests/day, ~12h delayed articles, non-commercial use), then `firebase functions:secrets:set GNEWS_API_KEY`. For the emulator, add `GNEWS_API_KEY=...` to `functions/.secret.local`. Without a key the agent still runs on calendar signals only.
4. `npm run seed` so Firestore has the org, regions, catalog, and Hurricane Rose context.
5. `npm run deploy` (hosting + functions).
6. On the live site: open Insights → Refresh market context (runs every region once); open Shop → Refresh picks; browse/add items; check out, Reset demo, or leave the tab to end the session; Insights → Regenerate draft order; check Data layer for updated summary/weights.

To test other dates, `POST /api/agents/market-context` with `{ "regionId": "sc_richland", "asOf": "2027-07-01" }` (July 4) or `"2027-02-05"` (Super Bowl + Valentine's).

**Simulate without an API key (mock Gemini)**

No real Gemini key needed. `GEMINI_MODE=mock` (auto when key is unset) returns
realistic JSON after a short simulated latency and logs token/latency metrics.

```bash
cp functions/.env.example functions/.env   # GEMINI_MODE=mock, leave GEMINI_API_KEY empty

# terminal 1
npm run emulators

# terminal 2 (after emulators are up)
npm run seed:emulator
npm run simulate
```

`npm run simulate` walks a finite path: health → session → events → market context (all regions) → personalize →
catalog/bundles → replenish → insights → session end → account → cache skip.
It prints PASS/FAIL and mock model performance totals. Exit code is non-zero on failure.

Emulator logs are structured JSON (`agent` / `phase` / `durationMs` / `metrics`).

**Local UI against emulator**

```bash
# terminal 1 — emulators already running + seeded
# terminal 2
echo "VITE_API_MODE=live" > .env.local
npm run dev
```

**Cost posture**

- No min instances, no schedulers, no Gemini on chart/catalog GETs.
- Mock or Flash + `maxOutputTokens` cap + one retry max, then deterministic fallback.
- Do not mash Refresh / Regenerate; locks and cache fingerprints skip duplicate runs.
- Insights “Regenerate draft order” uses `force=false` by default (Shift-click to force).

## 2. Package and build manager

- **npm** (with `package-lock.json`) for all dependencies and scripts.
- **Vite** is the build tool. `npm run build` produces the static `dist/`
  folder.
- **Firebase CLI**, installed globally through npm, for deploys.

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `vite --port 5173` | Local dev server with hot reload |
| `npm run build` | `vite build` | Production bundle in `dist/` |
| `npm run preview` | `vite preview --port 4173` | Serve the built bundle locally |
| `npm run seed:dry` | `node database/seed.mjs --dry-run` | Count the seed documents per collection without writing |
| `npm run seed` | `node database/seed.mjs` | Upload the demo data to cloud Firestore |
| `npm run seed:emulator` | `node database/seed-emulator.mjs` | Seed the local Firestore emulator |
| `npm run simulate` | `node scripts/simulate-agent-flow.mjs` | Finite mock-agent E2E against the emulator API |
| `npm run deploy` | `vite build && firebase deploy --only hosting,functions` | Build and publish the site + API |
| `npm run deploy:hosting` | `vite build && firebase deploy --only hosting` | Hosting only |
| `npm run deploy:functions` | `firebase deploy --only functions` | Functions only |
| `npm run emulators` | `firebase emulators:start --only functions,firestore` | Local Functions + Firestore |

## 3. Team breakdown (5 members)

| # | Role | Owns | Main files / services |
|---|---|---|---|
| 1 | **Customer front end** | Walmart-style header, Shop page, Cart page, product cards, search, responsive layout, design fidelity | `src/App.jsx` (`CustomerHeader`, `Footer`), `src/pages/Shop.jsx`, `src/pages/CartPage.jsx`, `src/components/*`, `src/styles.css` |
| 2 | **Associate front end** | Data layer page, Insights dashboard, charts, drafted-order editor, associate header | `src/pages/DataLayer.jsx`, `src/pages/Dashboard.jsx`, `AssociateHeader`, Recharts |
| 3 | **Database management** | Firestore schema, security rules, indexes, seed data, data retention, consent fields | `database/SCHEMA.md`, `database/seed-data.mjs`, `database/seed.mjs`, `firestore.rules`, `firestore.indexes.json` |
| 4 | **AI agent and data signals** | Recommendation ranking and weights, session summarizer, agent memory, local-event ingestion (weather, news, social), demand forecast and order sizing, dashboard notes | `src/data/demoStore.js` (logic to move server-side), planned `functions/agent/*`, Gemini prompts |
| 5 | **API, auth, and DevOps** | REST API on Cloud Functions, Firebase Auth, `src/api.js` switch-over, Hosting config, CI/CD, environments | `src/api.js`, `firebase.json`, `.firebaserc`, planned `functions/index.js`, planned GitHub Actions workflow |

## 4. Deployment

**Hosting provider:** Firebase Hosting (Google Cloud), project `capgeminidemo2`.
It serves `dist/` from Google's CDN over HTTPS at
<https://capgeminidemo2.web.app> and <https://capgeminidemo2.firebaseapp.com>.

**Configuration**

- `.firebaserc` selects the default project, `capgeminidemo2`.
- `firebase.json` sets the following:
  - `hosting.public = "dist"`.
  - A catch-all rewrite `** → /index.html`. This makes deep links like `/insights` load the SPA.
  - Firestore rules and indexes files.
- `firestore.rules` is deployed with `firebase deploy --only firestore:rules`.

**Manual deploy (today)**

```bash
firebase login             # once per machine
npm install
npm run deploy             # vite build && firebase deploy --only hosting
npm run seed               # optional: refresh the Firestore demo data
```

To replace the Firestore demo data completely (for example, after document IDs
change), run the following first:
`firebase firestore:delete --all-collections --force --project capgeminidemo2`

**Automation (planned)**

- A GitHub Actions workflow using `FirebaseExtended/action-hosting-deploy`:
  - Each pull request runs `npm ci && npm run build` and deploys to a **preview
    channel**, a temporary URL posted on the PR.
  - A merge to `main` deploys to the **live** channel.
- A Firebase service-account key stored as a GitHub secret
  (`FIREBASE_SERVICE_ACCOUNT_CAPGEMINIDEMO2`) replaces the personal CLI login.
- When Cloud Functions are added, the workflow also runs
  `firebase deploy --only functions,firestore`.

## 5. Virtual machines or containers

**Neither is used, for development or deployment.**

- **Development:** the app is plain Node.js and npm on each developer's
  machine. The only system requirement is Node 20+. A VM or a Docker image would
  add setup time without isolating anything the lockfile doesn't already pin.
- **Deployment:** Firebase Hosting and Cloud Functions are fully managed and
  serverless. We upload files and function source; Google runs them, so we don't
  build or manage containers or servers. Cloud Functions (2nd gen) runs on
  Cloud Run containers internally, but Google builds and manages those.
- **Local backend testing (planned):** the Firebase Local Emulator Suite
  (`firebase emulators:start`) will emulate Firestore, Auth, and Functions on
  localhost. It runs as Java and Node processes, not in Docker.

## 6. SPA or traditional?

**It is a Single-Page Application (SPA).**

- The server sends one HTML document (`index.html`) and one JavaScript bundle
  once. After that, every navigation (Shop → Cart → Data layer → Insights) is
  handled in the browser by React Router. It changes the URL with the History
  API and swaps React components, with no full page reload.
- State persists across views because the page never reloads. The cart count
  in the header updates as soon as an item is added on any page.
- The server never renders pages. Data is fetched as JSON (`/api/...`) and the
  browser renders it, unlike a traditional multi-page app where each URL returns
  a new server-rendered HTML page.
- The Firebase Hosting rewrite (`** → /index.html`) makes the SPA support deep
  links. Opening `/insights` directly still loads `index.html`, and React Router
  then shows the Insights view.
- It is not a "mix": there is no server-side rendering or static page
  generation. Only the build step pre-processes files.

## 7. URLs

### 7.1 Page URLs (client-side routes)

| URL | Page | Description |
|---|---|---|
| [`/`](https://capgeminidemo2.web.app/) | Shop | Walmart-style home page for the demo shopper (Doug). Shows the hurricane banner, "Picked for you, Doug" recommendations with reasons, a Storm prep rail, and an Everyday grocery rail. |
| [`/?q=water`](https://capgeminidemo2.web.app/?q=water) | Shop, search results | Same page with a "Results for …" grid above the rails. |
| [`/cart`](https://capgeminidemo2.web.app/cart) | Cart | Cart line items with quantity steppers, a "Recommended with your order" rail with a reason per item, and the order summary. |
| [`/data`](https://capgeminidemo2.web.app/data) | Data layer | Associate view of the 5 demo accounts. Choose an account to see its profile, signals collected, preference weights (before → after), and stored fields. |
| [`/insights`](https://capgeminidemo2.web.app/insights) | Store insights | Store 4127 dashboard: hurricane alert, KPIs, units-per-day chart, social-posts chart, days-of-supply chart, AI notes, and the drafted store order (edit / approve / reset). |

**Search argument**

- `q` (optional, on `/`): the shopper's search text, from the header search box.
  The page lists every product whose name or aisle contains that text,
  ignoring case. For example, `/?q=dairy` shows milk, eggs, and butter. An
  empty or missing `q` shows the normal home page.

Unknown paths fall back to `index.html` and render the app shell with no page
content. A "not found" view is planned.

### 7.2 Console URLs for the data (not part of the site)

- Firestore data: <https://console.firebase.google.com/project/capgeminidemo2/firestore/data>
- Hosting releases: <https://console.firebase.google.com/project/capgeminidemo2/hosting>

## 8. REST API

All endpoints are under `/api` and exchange JSON (`Content-Type: application/json`).

- **Today:** the endpoints are answered in the browser by `src/api.js` from
  `src/data/demoStore.js`, using the exact paths, methods, and response shapes
  below.
- **Planned:** the same contract moves to an Express app on Cloud Functions.
  Requests will carry a Firebase Auth ID token (`Authorization: Bearer <token>`).
  Shopper endpoints use the signed-in shopper's ID. Associate endpoints
  (`/accounts`, `/insights`, `/store-order*`) require the `associate` role.

Errors return `{ "error": "<message>" }`. For example, an unknown product or
account is HTTP 404 on the planned server; the in-browser router throws instead.

### Shopper endpoints

| Method | Path | Parameters | Description |
|---|---|---|---|
| `GET` | `/api/session` | none | Returns the signed-in shopper's display info: `first`, `name`, `store`, `city`, `tier`. Used by the header ("Hi, Doug"). |
| `GET` | `/api/catalog` | none | Returns every product with price, was-price, unit price, aisle, shelf (`staples` / `storm`), badge, and image. Each recommended product has a `recommendation` object with `rank`, `label`, and `reason`; it is `null` otherwise. |
| `GET` | `/api/cart` | none | Returns the cart: `lines[]` (product plus `qty`, `lineTotal`, `lineWas`), `subtotal`, `listTotal`, `savings`, and `count` (total units). |
| `POST` | `/api/cart` | body `{ productId: string }` | Adds one unit of the product to the cart, or increases its quantity if it's already there. Also logs an "Added to cart" signal on the shopper's data-layer profile. Returns the updated cart. |
| `PATCH` | `/api/cart/:productId` | path `productId`; body `{ qty: number }` | Sets the quantity of a cart line. A `qty` of 0 or less removes the line. Returns the updated cart. |
| `GET` | `/api/bundles` | none | Returns products recommended to go with the current cart, each with a written `reason`. Items already in the cart are excluded. |

### Associate endpoints

| Method | Path | Parameters | Description |
|---|---|---|---|
| `GET` | `/api/accounts` | none | Lists the customer accounts (summary rows): `id`, `name`, `tier`, `store`, agent `summary`, and `demo` flag. |
| `GET` | `/api/accounts/:id` | path `id` (for example `doug`) | Returns one account in full: household, membership, 90-day spend and trips, last trip, agent summary, `weights[]` (`label`, `before`, `after`), `fields[]` (label/value pairs), and `signals[]` (`source`, `at`, `title`, `detail`, `effect`). |
| `GET` | `/api/insights` | none | Returns the store dashboard data: store name and number, `updated` time, `alert`, `kpis[]`, `daily[]` (milk/eggs/water units per day), `social[]` (posts per 6 hours), `cover[]` (days of supply per item), and `notes` (AI text for each chart). |
| `GET` | `/api/store-order` | none | Returns the agent-drafted purchase order: `id`, `status` (`draft` / `approved`), `createdAt`, `truck`, `lines[]` (`onHand`, `normal`, `forecast`, `qty`, `pack`, `caseSize`), and `approvedAt`. |
| `POST` | `/api/store-order/approve` | body `{ lines?: [{ id: string, qty: number }] }` | Approves the drafted order. Any quantity overrides the manager entered are applied first (rounded; values below 0 are ignored). The order is then marked `approved` with a timestamp. Calling it again has no further effect. |
| `POST` | `/api/store-order/reset` | none | Discards edits and approval and restores the original agent draft. |
| `POST` | `/api/demo/reset` | none | Demo control: restores the starting cart (bread and bananas), the original store order, and removes live signals added during the demo. |

### Agent and session endpoints (prototype)

| Method | Path | Parameters | Description |
|---|---|---|---|
| `POST` | `/api/events` | body `{ events: [...] }` or one event | Cheap clickstream writes only (no Gemini). Client batches dwells. |
| `POST` | `/api/sessions` | body `{ channel, device, entryPoint }` | Starts a demo session; returns `sessionId`. |
| `POST` | `/api/sessions/:id/end` | path `id` | Ends the session and runs the **session memory** agent once (idempotent). |
| `POST` | `/api/agents/personalize` | body `{ force?: boolean }` | Runs the **personalization** agent once; skipped if cache fingerprint is fresh. |
| `POST` | `/api/agents/replenish` | body `{ force?: boolean, storeId?: string }` | Runs the **replenishment** agent once; never called by Insights GETs. |
| `POST` | `/api/agents/market-context` | body `{ regionId?, storeId?, force?, asOf? }` | No body: runs the **market-context** agent once for every active region in `orgs/walmart`. `regionId` or `storeId`: just that region. `asOf` (`YYYY-MM-DD`) tests other calendar dates. Skips GNews and Gemini while a region's brief is under 6 hours old. |
| `GET` | `/api/market-context` | query `storeId?` | Read-only: the org, every region's `marketBrief`, and the brief for the given store's region. |
| `POST` | `/api/checkout` | body `{ sessionId }` | Mock checkout: writes an order, clears the cart, and ends the session as `purchased`. |

## 9. Views (React components)

Every view is a React function component. The components nest like this:

| View | File | Shown on | What it renders |
|---|---|---|---|
| `App` | `src/App.jsx` | All | Root layout. Holds shared state (`session`, `cart`, `resetKey`) and the route table. |
| Demo bar (inside `App`) | `src/App.jsx` | All | Top white strip with the "Spark Agent prototype" label, the Shop / Cart / Data layer / Insights tabs, and Reset demo. Sticks to the top. |
| `CustomerHeader` | `src/App.jsx` | `/`, `/cart` | Walmart blue header with spark logo, pickup/store selector, search form, Reorder/My Items, "Hi, Doug" account, and cart icon with count and total. Below it, the light-blue department pills. |
| `AssociateHeader` | `src/App.jsx` | `/data`, `/insights` | Blue associate header with page title, Store 4127 selector, and "Store manager J. Reyes". |
| `Footer` | `src/App.jsx` | `/`, `/cart` | Footer links and the Open Food Facts image credit. |
| `Shop` | `src/pages/Shop.jsx` | `/` | Hurricane hero banner, search results, "Picked for you" grid, Storm prep rail, Everyday grocery rail. |
| `CartPage` | `src/pages/CartPage.jsx` | `/cart` | Fulfillment header, cart lines, "Recommended with your order" rail, order summary card, Walmart+ card. |
| `DataLayer` | `src/pages/DataLayer.jsx` | `/data` | "What we collect" strip, accounts list, profile card, signals table, preference-weight bars, stored-fields list. |
| `Dashboard` | `src/pages/Dashboard.jsx` | `/insights` | Alert banner, KPI tiles, three charts each followed by an AI note, and `DraftOrder`. |
| `DraftOrder` | `src/pages/Dashboard.jsx` | `/insights` | Editable order table (on hand, normal, forecast, order qty, cases), with Approve and send, Edit quantities, and Undo actions. |
| `ProductCard` | `src/components/ProductCard.jsx` | Shop, Cart | Image, badge, save heart, "+ Add" button or `Stepper`, `Price`, two-line title, and an optional `WhyBox`. |
| `Badge` | `src/components/ProductCard.jsx` | Cards | "Deal" (red), "Best seller" (blue), or any other label as an outlined tag. |
| `Stepper` | `src/components/ProductCard.jsx` | Cards, cart lines | − qty + control. |
| `WhyBox` | `src/components/ProductCard.jsx` | Cards, Data layer, Insights | Light-blue "Spark Agent" box with a label and the reasoning text. |
| `Price` | `src/components/Price.jsx` | Cards, cart | Walmart price format: superscript `$` and cents, green "Now" with struck-through was-price, unit price. |
| `Rail` | `src/components/Rail.jsx` | Shop, Cart | Horizontal product carousel with left/right scroll arrows. |
| `Spark` | `src/components/Spark.jsx` | Headers | Six-petal yellow Walmart spark logo (SVG). |
| Icons | `src/components/Icons.jsx` | Headers | `SearchIcon`, `HeartIcon`, `PersonIcon`, `CartIcon`, `ChevronDown`, `ChevronRight`, `StoreIcon` (SVG). |

## 10. Database schema (Cloud Firestore)

Firestore is a document database, so each "table" below is a **collection** of
JSON-like documents. Some collections are **subcollections** nested under a
parent document. Types are Firestore types:

- `string`, `number`, `boolean`, `timestamp`, `null`
- `array` (a list)
- `map` (a nested object)

`id` is the document ID, part of the path rather than a field. Fields marked
`→` hold another document's ID; Firestore has no foreign keys, so these are
references by convention.

Current seed (412 documents): 25 products, 4 stores, 5 customers, 15 sessions,
167 events, 17 recommendations, 10 orders, 15 session summaries, 5 agent
memories, 10 pantry rows, 4 local events, 126 daily-sales rows, 5 inventory
rows, 1 store order, and 3 insight notes.

### `customers/{customerId}`
One document per shopper account. It describes who they are and how the agent should treat them.

| Attribute | Type | Description |
|---|---|---|
| `demoKey` | string | Short key used by the website demo (`doug`). |
| `name` | string | Full name. |
| `email` | string | Contact email (fake `example.com` addresses in the demo). |
| `zip` | string | Home ZIP code; matched against local weather and news alerts. |
| `city` | string | City and ZIP for display. |
| `household` | map | `size`, `adults`, `children` (numbers), `childAges` (array of numbers), `label` (string). Used for quantity and pantry math. |
| `homeStoreId` | string → `stores` | Store used for pickup, inventory, and local events. |
| `membership` | map | `tier` (string, for example `Walmart+`) and `since` (timestamp or null). |
| `createdAt` | timestamp | When the account was created. |
| `lastLoginAt` | timestamp | Most recent login time. |
| `loginCount90d` | number | Logins in the last 90 days (engagement). |
| `preferredChannel` | string | Usual fulfillment: `pickup`, `inhome_delivery`, `in_store`. |
| `usualShoppingWindow` | map | When they normally shop, for example `{ daysOfMonth: [1, 7], dayOfWeek: "Tue", hours: "16:00-18:00" }`. |
| `priceSensitivity` | string | `low` / `medium` / `high` / `very_high`. How much a Rollback changes ranking. |
| `preferenceWeights` | map<string, number> | Category weights from 0 to 1 (for example `dairy_and_eggs: 0.81`) that decide what ranks first. |
| `spend90d` | number | Dollars spent in the last 90 days. |
| `orders90d` | number | Orders in the last 90 days. |
| `avgBasket` | number | Average order value (`spend90d / orders90d`). |
| `lastOrderAt` | timestamp or null | Date of the most recent purchase. |
| `consent` | map | `personalization`, `localEvents`, `marketingEmail` (booleans) and `dataRetentionDays` (number). Checked before any signal is used. |
| `agentSummary` | string | One-paragraph description of the shopper for associates. |

### `customers/{customerId}/sessionSummaries/{sessionId}`: past session storage
One AI-written summary per finished session. Future agent runs read these
instead of replaying thousands of raw events.

| Attribute | Type | Description |
|---|---|---|
| `sessionId` | string → `sessions` | The raw session this summarizes. |
| `customerId` | string → `customers` | The shopper. |
| `startedAt` | timestamp | Session start (login time). |
| `endedAt` | timestamp | Session end. |
| `durationSec` | number | Length of the session in seconds. |
| `channel` | string | `app` or `web`. |
| `device` | string | `iPhone`, `Android`, `iPad`, `desktop`. |
| `outcome` | string | `purchased`, `abandoned_cart`, or `browse_only`. |
| `headline` | string | One-line summary for lists. |
| `summary` | string | A plain-language paragraph describing what happened and why. |
| `intents` | array<string> | What the shopper was trying to do: `storm_prep`, `monthly_grocery`, `price_check`, and so on. |
| `productsViewed` | array<map> | `{ productId, name, dwellSec }`: every product looked at and for how long. |
| `productsAdded` | array<string> | Product IDs added to the cart. |
| `productsAbandoned` | array<string> | Products added, or viewed for at least 5 seconds, but not bought. |
| `orderId` | string or null → `orders` | The order, if the session ended in a purchase. |
| `spend` | number | Order total, or 0. |
| `context` | map | `localEventIds` (array → `localEvents`) and `storeId`: what was happening locally. |
| `signalsDerived` | array<map> | `{ type, detail, weight, before, after }`: what the agent learned and how weights moved. |
| `followUps` | array<string> | Instructions for the next session's agent, for example "Rank milk, eggs, and water first." |
| `generatedBy` | string | Summarizer model version. |
| `generatedAt` | timestamp | When the summary was written. |

### `customers/{customerId}/agentMemory/current`
A rolled-up memory across all of the shopper's summaries, rewritten after each session.

| Attribute | Type | Description |
|---|---|---|
| `summary` | string | Long-term description of the shopper's habits. |
| `keyFacts` | array<string> | Short facts the agent should always know. |
| `openThreads` | array<string> | Unfinished business, such as a basket not yet bought. |
| `customerId` | string → `customers` | Owner. |
| `lastSessionId` | string → `sessions` | Most recent session included. |
| `sessionsSummarized` | number | How many summaries were rolled up. |
| `updatedAt` | timestamp | When the memory was last rewritten. |

### `customers/{customerId}/pantry/{productId}`
Estimates of when staples will run out.

| Attribute | Type | Description |
|---|---|---|
| `productId` | string → `products` | The product. |
| `lastPurchasedAt` | timestamp | Date it was last bought. |
| `avgIntervalDays` | number | Typical number of days between purchases. |
| `estimatedRunOutAt` | timestamp | `lastPurchasedAt` plus the interval. |
| `confidence` | number | Confidence in the estimate, from 0 to 1. |

### `sessions/{sessionId}`
One visit, from login to exit.

| Attribute | Type | Description |
|---|---|---|
| `customerId` | string → `customers` | Who visited. |
| `storeId` | string → `stores` | The shopper's store at the time. |
| `loginAt` | timestamp | Login time. |
| `authMethod` | string | `passkey`, `password`, or `remembered`. |
| `endedAt` | timestamp | When the session ended. |
| `durationSec` | number | Session length in seconds. |
| `channel` | string | `app` or `web`. |
| `device` | string | Device type. |
| `appVersion` | string or null | App build, for app sessions. |
| `entryPoint` | string | How they arrived: `push_notification`, `direct`, `email`, `search_engine`. |
| `counts` | map | `productViews`, `searches`, `cartAdds`, `recsShown`, `recsAccepted` (numbers). |
| `totalDwellSec` | number | Total seconds spent looking at products. |
| `outcome` | string | `purchased`, `abandoned_cart`, or `browse_only`. |
| `orderId` | string or null → `orders` | The resulting order, if any. |
| `localEventIds` | array<string> → `localEvents` | Local events active during the session. |

### `events/{eventId}`
The raw clickstream. Every other shopper metric can be rebuilt from it.

| Attribute | Type | Description |
|---|---|---|
| `customerId` | string → `customers` | Who did it. |
| `sessionId` | string → `sessions` | Which visit. |
| `type` | string | `login`, `page_view`, `search`, `product_view`, `recommendation_shown`, `recommendation_click`, `add_to_cart`, `remove_from_cart`, `checkout`, `session_end`. |
| `at` | timestamp | When it happened. |
| `productId` | string or null → `products` | Product involved, if any. |
| `dwellMs` | number or null | Milliseconds spent viewing the product (view time). |
| `source` | string or null | Where on the site: `home`, `search`, `for_you`, `cart_bundle`. |
| `position` | number or null | Position of the item on the page. |
| `query` | string or null | Search text, for `search` events. |
| `detail` | map | Event-specific extras: `qty`, `nutritionOpened`, `recommendationId`, `authMethod`, `resultsCount`. |

### `orders/{orderId}`
Completed purchases.

| Attribute | Type | Description |
|---|---|---|
| `customerId` | string → `customers` | Buyer. |
| `sessionId` | string → `sessions` | Session where it was placed. |
| `storeId` | string → `stores` | Fulfilling store. |
| `placedAt` | timestamp | Date and time of purchase. |
| `fulfillment` | map | `type` (`pickup`, `inhome_delivery`, `in_store_scan_and_go`), `window` (string or null), `date` (string). |
| `items` | array<map> | `{ productId, name, qty, unitPrice, wasPrice, recommended (boolean), recommendationId }`: line items, and whether the agent recommended them. |
| `itemCount` | number | Number of lines. |
| `subtotal` | number | Before tax. |
| `savings` | number | Was-price minus price, summed. |
| `tax` | number | Sales tax. |
| `total` | number | Amount charged. |
| `status` | string | `picked_up`, `delivered`, `completed`. |

### `recommendations/{recommendationId}`
Every time the agent showed a product, and what happened next.

| Attribute | Type | Description |
|---|---|---|
| `customerId` | string → `customers` | Who saw it. |
| `sessionId` | string → `sessions` | When. |
| `productId` | string → `products` | What was recommended. |
| `surface` | string | `for_you` (Shop page) or `cart_bundle` (Cart page). |
| `rank` | number | Position in that list. |
| `reason` | string | The justification shown to the shopper. |
| `signalsUsed` | array<string> | Signal types behind it (`dwell`, `local_event`, `pantry`, and so on). |
| `shownAt` | timestamp or null | When it was displayed. |
| `clickedAt` | timestamp or null | When it was opened. |
| `addedAt` | timestamp or null | When it was added to the cart. |
| `outcome` | string | `added`, `clicked`, or `ignored`. |

### `orgs/{orgId}`
The global retailer root (`orgs/walmart`): `name`, `status`, `timezone`, `catalogPolicy`, `marketContext` settings, and `nationalNews` (a cached copy of US top headlines that every region reuses).

### `regions/{regionId}`
A group of stores that share local news and calendar context: `orgId`, `name`, `status`, `state`, `county`, `cities`, `zips`, `storeIds`, `timezone`, `newsQueries` (GNews searches), `seasonalRisks`, and `marketBrief` (headline, summary, `activeTags`, upcoming holidays, article titles and links, event ids, `newsStatus`, fingerprint, `generatedAt`). See `database/SCHEMA.md`.

### `products/{productId}`
The org-global catalog (84 SKUs).

| Attribute | Type | Description |
|---|---|---|
| `orgId` | string → `orgs` | Owning retailer. |
| `name` | string | Full product name. |
| `brand` | string | Brand (for example `Great Value`). |
| `category` | string | `grocery` or `storm_prep`. |
| `shelf` | string | `staples`, `storm`, or `seasonal` (Shop rails). |
| `tags` | array<string> | Holiday, season, and occasion tags (`thanksgiving`, `july4`, `superbowl`, `bbq`, `back_to_school`, `cold_flu`, `storm`, …) matched against region events. |
| `aisle` | string | Store aisle or department. |
| `price` | number | Current price. |
| `wasPrice` | number or null | Previous price, when on Deal or Rollback. |
| `unitPrice` | string or null | Display unit price, for example "23.8 ¢/each". |
| `badge` | string or null | `Deal`, `Best seller`. |
| `image` | string or null | Image path on the site. |
| `imageSource` | string or null | Open Food Facts page for the image credit. |
| `caseSize` | number | Units per case, used when sizing store orders. |

### `stores/{storeId}`

| Attribute | Type | Description |
|---|---|---|
| `orgId`, `regionId` | string → `orgs`, `regions` | Where the store sits in the hierarchy; `regionId` decides which market events it sees. |
| `name` | string | Store name. |
| `type` | string | `Supercenter` or `Neighborhood Market`. |
| `address`, `city`, `state`, `zip`, `county` | string | Location; `county` is matched against weather and news alerts. |
| `distributionCenter` | string | Which DC supplies its trucks. |

### `stores/{storeId}/inventory/{productId}`

| Attribute | Type | Description |
|---|---|---|
| `productId` | string → `products` | Product. |
| `onHand` | number | Units in the store now. |
| `dailyRate` | number | Units sold per day at the current pace. |
| `daysOfSupply` | number | `onHand / dailyRate`. Below 1 means it sells out within a day. |
| `updatedAt` | timestamp | Last recount. |

### `stores/{storeId}/dailySales/{date_productId}`

| Attribute | Type | Description |
|---|---|---|
| `date` | string | `yyyy-mm-dd`. |
| `productId` | string → `products` | Product. |
| `units` | number | Units sold that day. |
| `baselineUnits` | number | A normal day's units, for comparison. |
| `revenue` | number | Dollars. |

### `localEvents/{eventId}`
News, weather, school closures, and area-wide social trends. No personal social accounts are stored.

| Attribute | Type | Description |
|---|---|---|
| `type` | string | `news_alert`, `weather_forecast`, `social_trend`, `school_closure`, `holiday`, `seasonal`. |
| `source` | string | News 10, National Weather Service, school district, aggregated public posts, or `market_context` for agent-written events. |
| `sourceLabel`, `label`, `tags`, `articleUrl` | string, string, array, string | Market-context events only: display source (`Calendar`, `GNews · outlet`), short shopper label, matching product tags, and the article link. |
| `orgId`, `regionId`, `regionIds` | string, string, array | Region scope. Readers filter by the store's region. |
| `headline`, `body` | string | What happened. |
| `issuedAt` | timestamp | When it was published. |
| `validFrom`, `validTo` | timestamp | The window it applies to (for example, the hurricane's arrival). |
| `county` | string | Affected county. |
| `zips` | array<string> | Affected ZIP codes (matched to `customers.zip`). |
| `severity` | string | `info`, `moderate`, `high`, `warning`. |
| `affectedProductIds` | array<string> → `products` | Products expected to see demand changes. |
| `series` | array<map> | Social trends only: `{ label, posts }` volume over time. |
| `topTerms` | map<string, number> | Social trends only: share of posts mentioning each term. |
| `personalAccountsRead` | boolean | Always `false`; documents the privacy rule. |

### `storeOrders/{poId}`
Replenishment orders drafted by the agent for a manager to approve.

| Attribute | Type | Description |
|---|---|---|
| `storeId` | string → `stores` | Ordering store. |
| `status` | string | `draft`, `approved`, `dismissed`. |
| `createdBy` | string | `spark-agent`. |
| `createdAt` | timestamp | When it was drafted. |
| `truck` | string | Delivery truck and on-shelf time. |
| `reason` | string | Why the agent drafted it. |
| `localEventIds` | array<string> → `localEvents` | Events that justify it. |
| `lines` | array<map> | `{ productId, name, onHand, normal72h, forecast72h, qty, unit, caseSize, cases }`. |
| `totalCases` | number | Sum of cases. |
| `normalAutoOrderCases` | number | What the normal automatic order would have sent. |
| `approvedBy` | string or null | Manager who approved it. |
| `approvedAt` | timestamp or null | When it was approved. |

### `insightNotes/{noteId}`
The AI notes shown under each dashboard chart.

| Attribute | Type | Description |
|---|---|---|
| `storeId` | string → `stores` | Store. |
| `chart` | string | `daily`, `social`, `cover`. |
| `text` | string | The note. |
| `createdAt` | timestamp | When it was generated. |
| `localEventIds` | array<string> → `localEvents` | Events it references. |

## 11. Common queries

Firestore **has no server-side joins**. Data that must be combined is handled in
one of two ways:

- **Denormalized**: copied into the document that needs it. Examples are
  `orders.items[].name`, `sessionSummaries.productsViewed[].name`, and
  `storeOrders.lines[].name`.
- **Joined in code**: a second query or `getAll` by ID, run in a Cloud Function
  or the client.

The "Join?" column below shows which queries need the second approach.

| # | Purpose | Query | Join? |
|---|---|---|---|
| 1 | Agent context at login: the shopper's last 10 sessions | `customers/{id}/sessionSummaries` `orderBy(startedAt, desc).limit(10)` + `agentMemory/current` | No. The subcollection is already scoped to the shopper. |
| 2 | Login history | `sessions where customerId == X orderBy loginAt desc` | No. Needs a composite index (`customerId` + `loginAt`). |
| 3 | View time per product in a session | `events where sessionId == S and type in [product_view, recommendation_click]` | No |
| 4 | Products the shopper lingered on but didn't buy | `events where customerId == X and type == product_view and dwellMs >= 5000`, minus product IDs in the shopper's `orders` | **Yes**: events against orders, done in code. `sessionSummaries.productsAbandoned` stores the answer precomputed. |
| 5 | Purchase history, newest first | `orders where customerId == X orderBy placedAt desc` | No. Composite index. |
| 6 | Staples due to run out this week | `customers/{id}/pantry where estimatedRunOutAt <= now + 7d` | No |
| 7 | Build "Picked for you" | `customers/{id}` weights + active `localEvents where zips array-contains zip and validTo >= now` + `products` by ID + store `inventory` | **Yes**: customer, local events, products, and inventory combined in a Function. |
| 8 | Recommendation attach rate | `recommendations where surface == for_you and shownAt >= T`, then count `outcome == added` (aggregation query) | No |
| 9 | Did a recommendation turn into a sale? | `orders` items with `recommendationId != null`, looked up in `recommendations` | **Yes**: order items to recommendations by ID. |
| 10 | Dashboard units per day | `stores/{id}/dailySales where date >= D and productId in [milk, eggs, water]` | No |
| 11 | Days of supply chart | `stores/{id}/inventory` (all docs) | No |
| 12 | Active local events for a store | `localEvents where county == C and validTo >= now` | No |
| 13 | The drafted store order to review | `storeOrders where storeId == S and status == draft orderBy createdAt desc limit 1` | No (product names are copied into `lines`) |
| 14 | Dashboard AI notes | `insightNotes where storeId == S orderBy createdAt desc` | No |
| 15 | Shoppers affected by an event (for push alerts) | `customers where zip in event.zips and consent.localEvents == true` | **Yes**: a local event to customers, by ZIP. |
| 16 | Data layer account view | `customers/{id}` + latest `sessionSummaries` + `pantry` | **Yes**: parent document plus subcollections, read in parallel. |

The composite indexes needed for queries 2, 5, 12, 13, and 14 will be added to
`firestore.indexes.json` when the Functions start running these queries.

---

## Project layout

```
.
├── index.html                  SPA entry document
├── vite.config.js              Vite + React plugin (+ /api proxy to Functions emulator)
├── package.json                npm scripts and dependencies
├── firebase.json / .firebaserc Hosting + Functions + Firestore + emulators
├── firestore.rules             Deny-all client rules (Admin SDK only)
├── firestore.indexes.json      Composite indexes (empty for now)
├── public/products/*.jpg       21 product photos (Open Food Facts, CC BY-SA)
├── functions/                  Cloud Functions Express API + 3 finite Gemini agents
│   ├── index.js                onRequest export (minInstances 0, secrets)
│   └── src/agents/             personalize, replenish, sessionMemory
├── src/
│   ├── main.jsx                React root + BrowserRouter
│   ├── App.jsx                 Demo bar, session lifecycle, routes, cart state
│   ├── api.js                  fetchJson(): demo store or live /api
│   ├── session.js              Session start/end + batched events
│   ├── data/demoStore.js       In-memory fallback for VITE_API_MODE=demo
│   ├── pages/                  Shop, CartPage, DataLayer, Dashboard (+ DraftOrder)
│   ├── components/             ProductCard, Badge, Stepper, WhyBox, Price, Rail, Spark, Icons
│   └── styles.css              Walmart design tokens and layout
└── database/
    ├── SCHEMA.md               Database map with ER diagram
    ├── seed-data.mjs           Builds the ~412 seed documents
    ├── seed.mjs                Uploads them through the Firestore REST API
    └── firebaseConfig.mjs      Project id for seed tooling (no API keys)
```
