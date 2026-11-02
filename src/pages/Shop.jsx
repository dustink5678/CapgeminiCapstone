import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "../api";
import ProductCard from "../components/ProductCard";
import Rail from "../components/Rail";

export default function Shop({ cart, add, setQty }) {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const stormRef = useRef(null);

  useEffect(() => {
    fetchJson("/api/catalog")
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);

  const qtyById = useMemo(() => Object.fromEntries(cart.lines.map((line) => [line.id, line.qty])), [cart]);
  const query = (params.get("q") || "").trim().toLowerCase();

  const recommended = items.filter((item) => item.recommendation).sort((a, b) => a.recommendation.rank - b.recommendation.rank);
  const storm = items.filter((item) => item.shelf === "storm" && !item.recommendation);
  const staples = items.filter((item) => item.shelf === "staples" && !item.recommendation);
  const results = query ? items.filter((item) => `${item.name} ${item.aisle}`.toLowerCase().includes(query)) : [];

  const cardProps = (item) => ({ item, qty: qtyById[item.id] || 0, onAdd: add, onQty: setQty });

  if (error) return <main className="wm-page"><p className="notice error">{error}</p></main>;

  return (
    <main className="wm-page">
      {query ? (
        <section className="shelf">
          <div className="shelf-head">
            <div>
              <h2>Results for “{params.get("q")}”</h2>
              <p>{results.length} items at Columbia Garners Ferry Rd Supercenter</p>
            </div>
            <button className="link-btn" onClick={() => setParams({})}>
              Clear search
            </button>
          </div>
          <div className="pgrid six">
            {results.map((item) => (
              <ProductCard key={item.id} {...cardProps(item)} />
            ))}
          </div>
          {results.length === 0 && <p className="empty">No items match that search.</p>}
        </section>
      ) : (
        <>
          <section className="hero">
            <div className="hero-copy">
              <p className="hero-kicker">Hurricane alert · Richland County</p>
              <h1>Hurricane Rose is on the way. Stock up before Friday.</h1>
              <p>Strong winds and heavy rain are expected Friday afternoon. Pickup times at Columbia Garners Ferry Rd are filling quickly.</p>
              <button className="pill-btn" onClick={() => stormRef.current?.scrollIntoView({ behavior: "smooth" })}>
                Shop storm prep
              </button>
            </div>
            <div className="hero-art">
              {["water", "milk", "eggs", "batteries"].map((id) => (
                <img key={id} src={`/products/${id}.jpg`} alt="" />
              ))}
            </div>
          </section>

          <section className="shelf">
            <div className="shelf-head">
              <div>
                <h2>Picked for you, Doug</h2>
                <p>Based on your recent activity and the hurricane warning in your area.</p>
              </div>
              <span className="link-btn">View all</span>
            </div>
            <div className="pgrid four">
              {recommended.map((item) => (
                <ProductCard
                  key={item.id}
                  {...cardProps(item)}
                  whyLabel={item.recommendation.label}
                  why={item.recommendation.reason}
                />
              ))}
            </div>
          </section>

          <section className="shelf" ref={stormRef}>
            <div className="shelf-head">
              <div>
                <h2>Storm prep essentials</h2>
                <p>Get it before the hurricane hits. Pickup today or delivery in as soon as 1 hour.</p>
              </div>
              <span className="link-btn">View all</span>
            </div>
            <Rail className="six">
              {storm.map((item) => (
                <div key={item.id} className="rail-item">
                  <ProductCard {...cardProps(item)} />
                </div>
              ))}
            </Rail>
          </section>

          <section className="shelf">
            <div className="shelf-head">
              <div>
                <h2>Everyday grocery essentials</h2>
                <p>Low prices on the basics, every day.</p>
              </div>
              <span className="link-btn">View all</span>
            </div>
            <Rail className="six">
              {staples.map((item) => (
                <div key={item.id} className="rail-item">
                  <ProductCard {...cardProps(item)} />
                </div>
              ))}
            </Rail>
          </section>
        </>
      )}
    </main>
  );
}
