import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJson } from "../api";
import { WhyBox } from "../components/ProductCard";

const axis = { fill: "#46474a", fontSize: 12 };
const grid = <CartesianGrid stroke="#e3e4e5" vertical={false} />;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [agentStatus, setAgentStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [market, setMarket] = useState(null);
  const [marketStatus, setMarketStatus] = useState("");
  const [marketBusy, setMarketBusy] = useState(false);
  const orderRef = useRef(null);

  async function loadInsights() {
    const [insights, draft, context] = await Promise.all([
      fetchJson("/api/insights"),
      fetchJson("/api/store-order"),
      fetchJson("/api/market-context?storeId=4127").catch(() => null),
    ]);
    setData(insights);
    setOrder(draft);
    setMarket(context);
  }

  async function refreshMarket(event) {
    // One run per active region (not per store or shopper). Shift-click forces past the 6h cache.
    const force = Boolean(event?.shiftKey);
    setMarketBusy(true);
    setMarketStatus(force ? "Force-refreshing every region…" : "Refreshing market context for every region…");
    try {
      const result = await fetchJson("/api/agents/market-context", {
        method: "POST",
        body: JSON.stringify({ force }),
      });
      await loadInsights();
      const ran = (result.regions || []).filter((r) => !r.skipped && !r.error);
      const skipped = (result.regions || []).filter((r) => r.skipped);
      const failed = (result.regions || []).filter((r) => r.error);
      setMarketStatus(
        [
          ran.length && `${ran.length} region${ran.length === 1 ? "" : "s"} updated`,
          skipped.length && `${skipped.length} still fresh`,
          failed.length && `${failed.length} failed`,
          `news: ${result.national?.status || "unknown"}`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (err) {
      setMarketStatus(err.message);
    } finally {
      setMarketBusy(false);
    }
  }

  useEffect(() => {
    // Read-only on load — never auto-run replenishment (avoids Gemini spend on every visit).
    loadInsights().catch((err) => setError(err.message));
  }, []);

  async function regenerateDraft(event) {
    // Default: force=false so same-event drafts skip Gemini. Shift-click forces a full regen.
    const force = Boolean(event?.shiftKey);
    setBusy(true);
    setAgentStatus(force ? "Force-regenerating draft…" : "Running replenishment agent…");
    try {
      const result = await fetchJson("/api/agents/replenish", {
        method: "POST",
        body: JSON.stringify({ force }),
      });
      await loadInsights();
      if (result.skipped) setAgentStatus(`Skipped (${result.reason})`);
      else if (result.usedGemini || result.mode === "mock") {
        setAgentStatus(result.mode === "mock" ? "Draft regenerated (mock model)" : "Draft regenerated with Gemini");
      } else {
        setAgentStatus("Draft regenerated (fallback notes)");
      }
    } catch (err) {
      setAgentStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="wm-page assoc-page"><p className="notice error">{error}</p></main>;
  if (!data || !order) return <main className="wm-page assoc-page"><p className="empty">Loading store insights…</p></main>;

  return (
    <main className="wm-page assoc-page">
      <div className="page-head">
        <div>
          <h1>Store insights</h1>
          <p>
            {data.storeNo} · {data.store} · Updated {data.updated}
          </p>
          {agentStatus && <p className="muted agent-status">{agentStatus}</p>}
        </div>
        <button
          className="pill-btn"
          disabled={busy}
          onClick={regenerateDraft}
          title="Click to regenerate if needed. Hold Shift to force a full Gemini/mock run."
        >
          {busy ? "Working…" : "Regenerate draft order"}
        </button>
      </div>

      <section className="alert">
        <div>
          <strong>{data.alert.title}</strong>
          <p>
            {data.alert.window}. {data.alert.body}
          </p>
        </div>
        <button className="pill-btn dark" onClick={() => orderRef.current?.scrollIntoView({ behavior: "smooth" })}>
          Review drafted order
        </button>
      </section>

      <MarketContext
        market={market}
        status={marketStatus}
        busy={marketBusy}
        onRefresh={refreshMarket}
      />

      <div className="kpis">
        {data.kpis.map((kpi) => (
          <section key={kpi.label} className="card kpi">
            <p>{kpi.label}</p>
            <strong>{kpi.value}</strong>
            <span>{kpi.delta}</span>
          </section>
        ))}
      </div>

      <section className="card chart-card">
        <div className="card-head">
          <div>
            <h2>Units sold per day: milk, eggs, and water</h2>
            <p className="muted">Oct 1–6 · this store, all channels</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.daily} margin={{ top: 24, right: 24, left: 0, bottom: 0 }}>
            {grid}
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "#c4c5c8" }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} />
            <Tooltip />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} />
            <ReferenceLine x="Tue 5" stroke="#de1c24" strokeDasharray="4 4" label={{ value: "Hurricane warning, 6:12pm", position: "top", fill: "#de1c24", fontSize: 12 }} />
            <Line type="monotone" dataKey="milk" name="Milk (gal)" stroke="#002d58" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="eggs" name="Eggs (dozen)" stroke="#0071dc" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="water" name="Water (40 ct)" stroke="#ffc220" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <WhyBox label="Spark Agent note">{data.notes.daily}</WhyBox>
      </section>

      <div className="chart-pair">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h2>Local social posts about the hurricane</h2>
              <p className="muted">Public posts tagged to Columbia, every 6 hours</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.social} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              {grid}
              <XAxis dataKey="time" tick={axis} tickLine={false} axisLine={{ stroke: "#c4c5c8" }} interval={1} />
              <YAxis tick={axis} tickLine={false} axisLine={false} />
              <Tooltip />
              <ReferenceLine x="Tue 6pm" stroke="#de1c24" strokeDasharray="4 4" label={{ value: "News broadcast", position: "top", fill: "#de1c24", fontSize: 12 }} />
              <Area type="monotone" dataKey="posts" name="Posts" stroke="#0071dc" fill="#0071dc" fillOpacity={0.12} strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
          <WhyBox label="Spark Agent note">{data.notes.social}</WhyBox>
        </section>

        <section className="card chart-card">
          <div className="card-head">
            <div>
              <h2>Days of supply on hand</h2>
              <p className="muted">At the current sales rate · target is 3 days</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.cover} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              {grid}
              <XAxis dataKey="item" tick={axis} tickLine={false} axisLine={{ stroke: "#c4c5c8" }} />
              <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 3.5]} ticks={[0, 1, 2, 3]} />
              <Tooltip />
              <ReferenceLine y={3} stroke="#2a8703" strokeDasharray="4 4" label={{ value: "Target", position: "insideTopRight", fill: "#2a8703", fontSize: 12 }} />
              <Bar dataKey="days" name="Days on hand" radius={[4, 4, 0, 0]} barSize={36}>
                {data.cover.map((row) => (
                  <Cell key={row.item} fill={row.days < 1 ? "#de1c24" : "#0071dc"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <WhyBox label="Spark Agent note">{data.notes.cover}</WhyBox>
        </section>
      </div>

      <div ref={orderRef}>
        <DraftOrder order={order} onChange={setOrder} />
      </div>
    </main>
  );
}

const NEWS_STATUS = {
  live: "Live GNews headlines",
  cached: "Cached GNews headlines",
  no_key: "Calendar only (no GNews key)",
  error: "GNews unavailable, calendar only",
};

function MarketContext({ market, status, busy, onRefresh }) {
  const regions = market?.regions || [];
  return (
    <section className="card market">
      <div className="card-head">
        <div>
          <h2>Market context by region</h2>
          <p className="muted">
            {market?.org?.name || "Walmart"} · {regions.length} active region{regions.length === 1 ? "" : "s"} · One news and
            calendar check per region, shared by every store in it
          </p>
          {status && <p className="muted agent-status">{status}</p>}
        </div>
        <button
          className="pill-btn"
          disabled={busy}
          onClick={onRefresh}
          title="Runs once per active region. Hold Shift to force past the 6-hour cache."
        >
          {busy ? "Working…" : "Refresh market context"}
        </button>
      </div>
      <div className="market-grid">
        {regions.map((region) => {
          const brief = region.marketBrief;
          const isHome = region.id === market?.storeRegion?.id;
          return (
            <article key={region.id} className={isHome ? "region-card home" : "region-card"}>
              <p className="region-name">
                {region.name}
                {isHome && <span className="region-home">This store</span>}
              </p>
              <p className="muted">Stores {region.storeIds.join(", ")}</p>
              {brief ? (
                <>
                  <h3>{brief.headline}</h3>
                  {brief.summary && <p>{brief.summary}</p>}
                  <div className="chips">
                    {(brief.calendar || []).map((c) => (
                      <span key={c.key} className="chip holiday">
                        {c.label} · {c.daysUntil === 0 ? "today" : `${c.daysUntil}d`}
                      </span>
                    ))}
                    {(brief.windows || []).map((label) => (
                      <span key={label} className="chip">
                        {label}
                      </span>
                    ))}
                  </div>
                  {brief.articles?.length > 0 && (
                    <ul className="headlines">
                      {brief.articles.slice(0, 3).map((article) => (
                        <li key={article.url}>
                          <a href={article.url} target="_blank" rel="noreferrer">
                            {article.title}
                          </a>{" "}
                          <span className="muted">{article.source}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="muted small">
                    {NEWS_STATUS[brief.newsStatus] || brief.newsStatus} · {brief.mode === "live" ? "Gemini" : brief.mode} ·{" "}
                    {brief.eventIds?.length || 0} events · as of {brief.asOf}
                  </p>
                </>
              ) : (
                <p className="empty">No brief yet. Refresh market context to run this region once.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DraftOrder({ order, onChange }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(() => Object.fromEntries(order.lines.map((line) => [line.id, line.qty])));
  const [busy, setBusy] = useState(false);
  const approved = order.status === "approved";

  const value = (line) => (approved ? line.qty : Number(qty[line.id]) || 0);
  const cases = (line) => Math.ceil(value(line) / line.caseSize);
  const totalCases = order.lines.reduce((sum, line) => sum + cases(line), 0);

  async function approve() {
    setBusy(true);
    const lines = order.lines.map((line) => ({ id: line.id, qty: value(line) }));
    const next = await fetchJson("/api/store-order/approve", { method: "POST", body: JSON.stringify({ lines }) });
    setEditing(false);
    setBusy(false);
    onChange(next);
  }

  async function reset() {
    const next = await fetchJson("/api/store-order/reset", { method: "POST" });
    setQty(Object.fromEntries(next.lines.map((line) => [line.id, line.qty])));
    onChange(next);
  }

  return (
    <section className="card order">
      <div className="order-head">
        <div>
          <h2>Drafted store order based on demand</h2>
          <p className="muted">
            {order.id} · Drafted by Spark Agent {order.createdAt} · {order.truck}
          </p>
        </div>
        <span className={approved ? "status approved" : "status draft"}>{approved ? "Approved" : "Needs review"}</span>
      </div>

      {approved && (
        <p className="notice success">
          Approved at {order.approvedAt} and sent to the regional grocery DC. {totalCases.toLocaleString()} cases are booked on Thursday’s 11:00pm truck and will be on the shelf before the store opens Friday.{" "}
          <button className="text-link" onClick={reset}>
            Undo
          </button>
        </p>
      )}

      <div className="table-wrap">
        <table className="order-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">On hand</th>
              <th className="num">Normal 72 hrs</th>
              <th className="num">Forecast 72 hrs</th>
              <th className="num">Suggested order</th>
              <th className="num">Cases</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <span className="order-item">
                    <img src={line.image || `/products/${line.id}.jpg`} alt="" />
                    <span>
                      {line.item}
                      {line.driver && <span className="line-driver">{line.driver}</span>}
                    </span>
                  </span>
                </td>
                <td className="num">{line.onHand.toLocaleString()}</td>
                <td className="num">{line.normal.toLocaleString()}</td>
                <td className="num">
                  <strong>{line.forecast.toLocaleString()}</strong>
                  <span className="mult">{(line.forecast / line.normal).toFixed(1)}×</span>
                </td>
                <td className="num">
                  {editing && !approved ? (
                    <input
                      className="qty-input"
                      type="number"
                      min="0"
                      value={qty[line.id]}
                      onChange={(event) => setQty({ ...qty, [line.id]: event.target.value })}
                      aria-label={`Order quantity for ${line.item}`}
                    />
                  ) : (
                    <strong>{value(line).toLocaleString()}</strong>
                  )}{" "}
                  <span className="muted">{line.pack}</span>
                </td>
                <td className="num">
                  {cases(line).toLocaleString()} <span className="muted">of {line.caseSize}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Total</td>
              <td className="num">
                <strong>{totalCases.toLocaleString()} cases</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <WhyBox label="How the agent sized this order">
        Each quantity is the 72-hour forecast minus what’s on hand, plus a 10–15% buffer for the second wave of buying, rounded up to full cases. The normal automatic order for these items is about 110 cases, which would leave milk, eggs, and water empty by Thursday afternoon.
      </WhyBox>

      {!approved && (
        <div className="order-actions">
          <button className="pill-btn dark" onClick={approve} disabled={busy}>
            {busy ? "Sending…" : "Approve and send"}
          </button>
          <button className="pill-btn" onClick={() => setEditing((on) => !on)}>
            {editing ? "Done editing" : "Edit quantities"}
          </button>
        </div>
      )}
    </section>
  );
}
