import { useEffect, useState } from "react";
import { fetchJson, money } from "../api";
import { WhyBox } from "../components/ProductCard";

const collected = [
  ["Profile", "Household size, home store, membership"],
  ["Shopping pattern", "When and how they usually shop"],
  ["Viewed items", "Seconds spent on a product, even if not bought"],
  ["Order history", "What tends to be bought together"],
  ["Pantry estimates", "When staples are likely to run out"],
  ["Local events", "News alerts and area-wide social trends"],
];

export default function DataLayer() {
  const [list, setList] = useState([]);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson("/api/accounts")
      .then(async (accounts) => {
        setList(accounts);
        const first = accounts.find((item) => item.demo) || accounts[0];
        if (first) setAccount(await fetchJson(`/api/accounts/${first.id}`));
      })
      .catch((err) => setError(err.message));
  }, []);

  async function open(id) {
    setAccount(await fetchJson(`/api/accounts/${id}`));
  }

  return (
    <main className="wm-page assoc-page">
      <div className="page-head">
        <h1>Customer data</h1>
        <p>What Spark Agent stores on each Walmart account, and how each signal changes what that customer sees.</p>
      </div>

      {error && <p className="notice error">{error}</p>}

      <section className="card collected">
        {collected.map(([title, copy]) => (
          <div key={title}>
            <strong>{title}</strong>
            <span>{copy}</span>
          </div>
        ))}
      </section>

      <div className="data-layout">
        <aside className="card account-list">
          <h2>Accounts ({list.length})</h2>
          {list.map((person) => (
            <button key={person.id} className={account?.id === person.id ? "acct on" : "acct"} onClick={() => open(person.id)}>
              <span className="acct-name">
                {person.name}
                {person.demo && <span className="badge badge-deal">Demo shopper</span>}
              </span>
              <span className="acct-meta">
                {person.tier} · {person.store}
              </span>
            </button>
          ))}
        </aside>

        {account && (
          <div className="data-main">
            <section className="card profile">
              <div className="profile-top">
                <div>
                  <h2>{account.name}</h2>
                  <p>
                    {account.household} · {account.city}
                  </p>
                  <p className="muted">
                    {account.tier} member since {account.memberSince} · Home store: {account.store}
                  </p>
                </div>
                <dl className="stats">
                  <div>
                    <dt>Spent, last 90 days</dt>
                    <dd>{money(account.spend90d)}</dd>
                  </div>
                  <div>
                    <dt>Orders, last 90 days</dt>
                    <dd>{account.trips90d}</dd>
                  </div>
                  <div>
                    <dt>Last order</dt>
                    <dd>{account.lastTrip}</dd>
                  </div>
                </dl>
              </div>
              <WhyBox label="Spark Agent summary">{account.summary}</WhyBox>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Signals collected</h2>
                <span className="muted">{account.signals.length} this week</span>
              </div>
              <div className="signal-table">
                <div className="signal-row head">
                  <span>When</span>
                  <span>What happened</span>
                  <span>What changed</span>
                </div>
                {account.signals.map((signal) => (
                  <div key={signal.id} className={signal.live ? "signal-row live" : "signal-row"}>
                    <span className="signal-when">
                      {signal.at}
                      {signal.live && <span className="badge badge-best">New</span>}
                    </span>
                    <span>
                      <span className="signal-source">{signal.source}</span>
                      <strong>{signal.title}</strong>
                      <span className="signal-detail">{signal.detail}</span>
                    </span>
                    <span className="signal-effect">{signal.effect}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="data-pair">
              <section className="card">
                <div className="card-head">
                  <h2>Preference weights</h2>
                  <span className="legend">
                    <i className="lg-before" /> Last week <i className="lg-after" /> Now
                  </span>
                </div>
                <ul className="weights">
                  {account.weights.map((weight) => (
                    <li key={weight.label}>
                      <span className="w-label">{weight.label}</span>
                      <span className="w-bars">
                        <i className="before" style={{ width: `${weight.before * 100}%` }} />
                        <i className="after" style={{ width: `${weight.after * 100}%` }} />
                      </span>
                      <span className="w-num">
                        {weight.before.toFixed(2)} → <strong>{weight.after.toFixed(2)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>Stored on this account</h2>
                </div>
                <dl className="fields">
                  {account.fields.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
