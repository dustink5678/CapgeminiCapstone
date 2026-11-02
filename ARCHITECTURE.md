# Capstone Project Architecture

## Overview

The front end will be two separate React sites that share one API and one
database.

| Site | Audience | Pages | Purpose |
|---|---|---|---|
| Customer site | Shoppers | Shop, Cart | Personalized picks, with a reason for each, and bundle suggestions for the shopper's order |
| Company site | Store employees and data analysts | Data Layer, Insights | Each customer's signals and preference weights, sales charts, AI notes, and draft replenishment orders |

Every read and write will go through the API. Firestore security rules will
block direct client access.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Front end | React + Vite | Customer and company sites |
| Hosting | Firebase Hosting | Serves both sites |
| API | Cloud Functions (Express) | Shared REST API |
| Auth | Firebase Auth | Sign-in and access for each site |
| Database | Cloud Firestore | All application data |
| AI | Gemini on Vertex AI | Session summaries and insight notes |
| Jobs | Scheduled functions | Pull in weather, news, and social signals |

---

## Data Model

Firestore has no foreign keys, so a reference (**FK**) will be another
document's ID stored as a string. Times will use `timestamp`, money will use
`number` (USD), and nested data will use a `map` or an `array`.

### Relationships

```text
customers ─┬─ sessionSummaries   (subcollection)
           ├─ agentMemory        (subcollection, one doc)
           ├─ pantry             (subcollection)
           ├─ sessions ── events, recommendations
           └─ orders

stores ────┬─ inventory          (subcollection)
           ├─ dailySales         (subcollection)
           ├─ storeOrders
           └─ insightNotes

localEvents ── referenced by sessions, storeOrders, insightNotes
products    ── referenced by events, orders, recommendations, pantry, inventory
```

### `customers`

One profile per shopper.

| Attribute | Type | Description |
|---|---|---|
| `name`, `email`, `zip`, `city` | string | Contact details |
| `homeStoreId` | string (FK) | The store the customer usually shops at |
| `household` | map | Household size and makeup |
| `preferredChannel` | string | Pickup, delivery, or in-store |
| `priceSensitivity` | string | From `low` to `very_high` |
| `spend90d`, `orders90d`, `avgBasket` | number | Spending over the last 90 days |
| `preferenceWeights` | map | Category weights from 0 to 1, learned by the agent |
| `consent` | map | Personalization and data-retention choices |
| `agentSummary` | string | The agent's short profile of the shopper |

#### `customers/sessionSummaries`

One summary per past visit.

| Attribute | Type | Description |
|---|---|---|
| `headline`, `summary` | string | One-line and full summaries |
| `intents` | array | Inferred shopping goals |
| `productsViewed` | array | Products viewed, with time spent on each |
| `outcome` | string | `purchased`, `abandoned_cart`, or `browse_only` |
| `signalsDerived` | array | Preference-weight changes, before and after |
| `followUps` | array | Suggested next steps |

#### `customers/agentMemory`

A single document that combines all of a customer's summaries.

| Attribute | Type | Description |
|---|---|---|
| `summary` | string | Overall picture of the customer |
| `keyFacts`, `openThreads` | array | Lasting facts and unresolved items |
| `updatedAt` | timestamp | Last update |

#### `customers/pantry`

The estimated stock of each product at the customer's home.

| Attribute | Type | Description |
|---|---|---|
| `lastPurchasedAt` | timestamp | Last purchase |
| `estimatedRunOutAt` | timestamp | Predicted run-out date |
| `avgIntervalDays` | number | Average days between purchases |
| `confidence` | number | Confidence in the estimate, from 0 to 1 |

### `sessions`

One record per visit.

| Attribute | Type | Description |
|---|---|---|
| `customerId`, `storeId`, `orderId` | string (FK) | The customer, their store, and the order placed, if any |
| `loginAt`, `endedAt` | timestamp | Visit start and end |
| `authMethod`, `channel`, `device`, `entryPoint` | string | How the visit started |
| `counts` | map | Views, searches, cart adds, and recommendations |
| `localEventIds` | array | Outside events active during the visit |

### `events`

Each action within a session.

| Attribute | Type | Description |
|---|---|---|
| `type` | string | Login, page view, product view, search, recommendation shown, add to or remove from cart, checkout, or session end |
| `at` | timestamp | When the action happened |
| `productId` | string (FK) | The product involved, if any |
| `dwellMs` | number | Time spent viewing a product |
| `query` | string | Search text |
| `detail` | map | Extra data for that event type |

### `orders`

Completed purchases.

| Attribute | Type | Description |
|---|---|---|
| `placedAt` | timestamp | Checkout time |
| `fulfillment` | map | Pickup or delivery details |
| `items` | array | Products with quantity, price, and whether each was recommended |
| `subtotal`, `savings`, `tax`, `total` | number | Order totals |

### `recommendations`

Every product the agent shows a shopper.

| Attribute | Type | Description |
|---|---|---|
| `surface` | string | Where it was shown: `for_you` or `cart_bundle` |
| `rank` | number | Position in the list |
| `reason` | string | The explanation the shopper sees |
| `signalsUsed` | array | Inputs behind the recommendation |
| `outcome` | string | `added`, `clicked`, or `ignored` |

### `products`

The product catalog.

| Attribute | Type | Description |
|---|---|---|
| `name`, `brand`, `category`, `aisle` | string | Product details |
| `price`, `wasPrice` | number | Current and previous price |
| `unitPrice`, `badge` | string | Unit price and label, such as Rollback |
| `image` | string | Product photo |
| `caseSize` | number | Units per case, for replenishment |

### `stores`

Physical store locations.

| Attribute | Type | Description |
|---|---|---|
| `name`, `type`, `address`, `county` | string | Store details, used to match stores to local events |

| Subcollection | Attributes (all number) | Description |
|---|---|---|
| `inventory` | `onHand`, `dailyRate`, `daysOfSupply` | Current stock of each product |
| `dailySales` | `units`, `baselineUnits`, `revenue` | Daily sales of each product, compared with normal demand |

### `localEvents`

Outside signals such as weather alerts, news, social trends, and school closures.

| Attribute | Type | Description |
|---|---|---|
| `type`, `source` | string | Kind of signal and who published it |
| `headline` | string | Summary of the event |
| `validFrom`, `validTo` | timestamp | When the event applies |
| `county`, `zips` | string, array | Affected area |
| `severity` | string | How serious the event is |
| `affectedProductIds` | array | Products likely to see more demand |
| `personalAccountsRead` | boolean | Always `false`, because social data will come only from combined public posts |

### `storeOrders`

Replenishment orders drafted by the agent.

| Attribute | Type | Description |
|---|---|---|
| `status` | string | `draft` or `approved` |
| `reason` | string | Why the order is needed |
| `lines` | array | For each product: stock on hand, 72-hour demand forecast, and cases to order |
| `totalCases` | number | Order size |
| `approvedAt` | timestamp | When a manager approved it |

### `insightNotes`

Short AI notes shown with the Insights charts.

| Attribute | Type | Description |
|---|---|---|
| `chart` | string | The chart the note belongs to |
| `text` | string | Note text |
| `createdAt` | timestamp | When the note was written |

---

## Agent Logic

| Process | Inputs | Output |
|---|---|---|
| Personalization | Events, orders, local events, pantry, agent memory | Ranked products on the customer site, each with a reason |
| Replenishment | Local events, inventory, sales history | A draft order on the company site for a manager to approve |
| Session memory | Events and orders from a finished session | A new `sessionSummaries` entry and an updated `agentMemory` |

---

## Build and Deployment

| Step | Tool |
|---|---|
| Build both sites | Vite |
| Host both sites | Firebase Hosting |
| Deploy the API | Cloud Functions |
| Deploy security rules | Firebase CLI |
| CI/CD | GitHub Actions: preview builds for pull requests, and live deploys on merge to `main` |
