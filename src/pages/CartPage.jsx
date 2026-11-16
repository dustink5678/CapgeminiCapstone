import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson, money } from "../api";
import ProductCard, { Badge, Stepper } from "../components/ProductCard";
import { StoreIcon } from "../components/Icons";
import Price from "../components/Price";
import Rail from "../components/Rail";

export default function CartPage({ cart, add, setQty, onCheckout }) {
  const navigate = useNavigate();
  const [bundles, setBundles] = useState([]);
  const [error, setError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const cartKey = cart.lines.map((line) => line.id).join(",");

  useEffect(() => {
    fetchJson("/api/bundles")
      .then(setBundles)
      .catch((err) => setError(err.message));
  }, [cartKey]);

  async function changeQty(id, qty) {
    setReceipt(null);
    await setQty(id, qty);
  }

  async function handleCheckout() {
    if (!onCheckout || cart.count === 0 || checkingOut) return;
    setError("");
    setCheckingOut(true);
    try {
      const result = await onCheckout();
      setReceipt(result?.order || null);
    } catch (err) {
      setError(err.message || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  }

  const itemWord = cart.count === 1 ? "item" : "items";
  const showEmpty = cart.lines.length === 0 && !receipt;

  return (
    <main className="wm-page cart-page">
      <h1 className="cart-title">
        Cart <span>({cart.count} {itemWord})</span>
      </h1>
      {error && <p className="notice error">{error}</p>}
      {receipt && (
        <p className="notice success">
          Order {receipt.id} placed for pickup today, 4pm–5pm · {money(receipt.total)} charged (mock).
          Session ended as purchased — Spark Agent wrote the session summary. A new browse session started
          automatically.
        </p>
      )}

      <div className="cart-layout">
        <div className="cart-main">
          <section className="card">
            <div className="fulfil">
              <span className="fulfil-icon">
                <StoreIcon />
              </span>
              <div>
                <strong>Pickup from Columbia Garners Ferry Rd Supercenter</strong>
                <p>Today, 4pm–5pm · Free with Walmart+</p>
              </div>
            </div>

            {showEmpty && (
              <div className="cart-empty">
                <p>Your cart is empty.</p>
                <button className="pill-btn" onClick={() => navigate("/")}>
                  Start shopping
                </button>
              </div>
            )}

            {cart.lines.map((line) => (
              <article key={line.id} className="cart-line">
                <p className="sold-by">
                  Sold and shipped by <u>Walmart.com</u>
                </p>
                <div className="cart-line-body">
                  <div className="cart-line-img">
                    <img src={line.image} alt={line.name} />
                  </div>
                  <div className="cart-line-info">
                    <Badge kind={line.badge} />
                    <Price price={line.lineTotal} was={line.lineWas} size="lg" />
                    {line.lineWas && <span className="you-save">You save {money(line.lineWas - line.lineTotal)}</span>}
                    <h3>{line.name}</h3>
                    {line.unitPrice && <p className="unit-price">{line.unitPrice}</p>}
                  </div>
                </div>
                <div className="cart-line-actions">
                  <button className="text-link" onClick={() => changeQty(line.id, 0)}>
                    Remove
                  </button>
                  <button className="text-link">Save for later</button>
                  <Stepper qty={line.qty} onChange={(qty) => changeQty(line.id, qty)} size="outline" />
                </div>
              </article>
            ))}

            {receipt && cart.lines.length === 0 && (
              <div className="cart-empty">
                <p>Thanks — your pickup order is confirmed.</p>
                <button className="pill-btn" onClick={() => navigate("/")}>
                  Keep shopping
                </button>
              </div>
            )}
          </section>

          <section className="card recs">
            <div className="recs-head">
              <h2>Recommended with your order</h2>
              <p>Picked by Spark Agent from what’s already in Doug’s cart.</p>
            </div>
            {bundles.length === 0 ? (
              <p className="empty">Every suggested item is already in the cart.</p>
            ) : (
              <Rail className="cart-rail">
                {bundles.map((item) => (
                  <div key={item.id} className="rail-item">
                    <ProductCard
                      item={item}
                      onAdd={add}
                      onQty={setQty}
                      variant="filled"
                      whyLabel="Why it’s suggested"
                      why={item.reason}
                    />
                  </div>
                ))}
              </Rail>
            )}
          </section>
        </div>

        <aside className="cart-side">
          <section className="card summary">
            <button
              className="checkout-btn"
              disabled={cart.count === 0 || checkingOut}
              onClick={handleCheckout}
            >
              {checkingOut ? "Placing order…" : "Continue to checkout"}
            </button>
            {cart.savings > 0 && !receipt && (
              <p className="notice info">Items in your cart have reduced prices. Check out now for extra savings!</p>
            )}
            <dl className="sum">
              <div>
                <dt>Subtotal ({cart.count} {itemWord})</dt>
                <dd>{cart.savings > 0 ? <s>{money(cart.listTotal)}</s> : money(cart.subtotal)}</dd>
              </div>
              {cart.savings > 0 && (
                <>
                  <div>
                    <dt>Savings</dt>
                    <dd>
                      <span className="savings">−{money(cart.savings)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <strong>Subtotal</strong>
                    </dt>
                    <dd className="green">
                      <strong>{money(cart.subtotal)}</strong>
                    </dd>
                  </div>
                </>
              )}
              <hr />
              <div>
                <dt>Pickup</dt>
                <dd className="green">Free</dd>
              </div>
              <div>
                <dt>Taxes</dt>
                <dd>{receipt ? money(receipt.tax) : "Calculated at checkout"}</dd>
              </div>
              <hr />
              <div className="est">
                <dt>Estimated total</dt>
                <dd>{money(receipt ? receipt.total : cart.subtotal)}</dd>
              </div>
            </dl>
          </section>
          <section className="card wplus">
            <p>
              <strong className="wplus-mark">Walmart+</strong> member benefits applied
            </p>
            <p className="muted">Free pickup and delivery on orders over $35.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
