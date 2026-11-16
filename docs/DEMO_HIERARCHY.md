# Spark Agent — Demo Hierarchy

Paste the code below into Lucidchart (Insert → Diagram as code → Mermaid). Rounded boxes are agents.

```mermaid
flowchart TD
    subgraph Inputs[Outside Signals]
        Calendar[Holidays and Seasons]
        News[GNews Local and National News]
    end

    Walmart[Walmart HQ - shared product catalog]

    subgraph RegionLayer[Regions]
        Richland[Richland Region]
        Lexington[Lexington Region]
    end

    subgraph StoreLayer[Stores]
        S4127[Store 4127 Garners Ferry]
        S4128[Store 4128]
        S2210[Store 2210]
        S3302[Store 3302 Irmo]
    end

    Market([Market Context Agent])
    Replenish([Replenish Agent])
    Personalize([Personalize Agent])
    Memory([Session Memory Agent])

    Shopper[Shopper - Doug]
    Checkout[Checkout]
    Profile[Shopper Profile - preferences and memory]

    Walmart -->|owns| Richland
    Walmart -->|owns| Lexington
    Richland -->|contains| S4127
    Richland -->|contains| S4128
    Richland -->|contains| S2210
    Lexington -->|contains| S3302

    Calendar -->|what day is it| Market
    News -->|what is happening locally| Market
    Walmart -->|runs once per region| Market
    Market -->|regional brief and events| Richland
    Market -->|regional brief and events| Lexington

    Richland -->|hurricane and Thanksgiving signals| Replenish
    S4127 -->|inventory and sales| Replenish
    Replenish -->|draft restock order| S4127

    S4127 -->|home store| Shopper
    Richland -->|local events| Personalize
    Profile -->|likes and habits| Personalize
    Personalize -->|top picks with reasons| Shopper

    Shopper -->|browses and adds to cart| Checkout
    Checkout -->|ends session| Memory
    Memory -->|updates preferences| Profile
```

**How to read it:** news and the calendar feed one Market Context run per region. Every store and shopper in that region shares the result. Replenish uses it to restock the store, and Personalize combines it with the shopper's profile to recommend products. After checkout, Session Memory updates the profile, so the next visit's picks are better.
