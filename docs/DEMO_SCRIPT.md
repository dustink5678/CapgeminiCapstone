# Spark Agent — Progress Update (talk track, ~3 min)

**Where we are**

Since last time, we've added three things: a mock checkout, a much bigger product catalog, and a new agent that understands what's going on in the world — holidays, seasons, and local news — and uses that to shape recommendations.

**The agents**

We now have four agents, and each one has a single job.

- **Market Context** looks at the date and the local news and figures out what shoppers will need. Thanksgiving is coming up, so turkey, pie crust, and sweet potatoes. A hurricane warning, so water and batteries.
- **Personalize** takes that, combines it with what we know about the shopper, and picks their top recommendations with a short reason for each.
- **Replenish** does the same thing on the store side — it drafts a restock order so the shelves are ready before the rush.
- **Session Memory** runs when a shopper checks out or leaves. It summarizes the visit and updates what we know about their preferences.

**How it's organized**

We set it up the way a real retailer would: one Walmart at the top, regions underneath, and stores inside each region. Right now we have two regions in South Carolina — Richland with three stores, and Lexington with one.

The key decision was to run the news agent **once per region**, not once per store or once per shopper. Three stores in the same county all hear about the same storm, so they share one brief. That's two agent runs total, no matter how many customers are shopping.

**Keeping it cheap**

Every agent runs once and stops — nothing is running in the background. Before doing any work, each one checks whether anything has actually changed. If it's the same day and the same news, it skips entirely and reuses what it already has. Holidays are calculated in code, so they're free. The AI only writes the explanations; the ranking and order quantities are plain math, so they're predictable and still work if the AI is unavailable.

We're using a free news API, GNews, and a full refresh across both regions uses about five requests out of a hundred per day.

**Getting smarter over time**

Each time a shopper finishes a session, Session Memory looks at what they browsed, how long they looked, and what they bought, and nudges their preferences. Next visit, Personalize sees those new preferences and re-ranks. So recommendations blend two things: what this person likes, and what's happening in their area right now.

**What's next**

A daily scheduler so the news refreshes on its own, learning directly from which recommendations people click, and adding more regions — which is just configuration, since the agent already fans out to every region automatically.
