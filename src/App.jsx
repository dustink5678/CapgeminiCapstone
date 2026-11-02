import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { fetchJson, money } from "./api";
import Spark from "./components/Spark";
import { CartIcon, ChevronDown, HeartIcon, PersonIcon, SearchIcon, StoreIcon } from "./components/Icons";
import Shop from "./pages/Shop";
import CartPage from "./pages/CartPage";
import DataLayer from "./pages/DataLayer";
import Dashboard from "./pages/Dashboard";

const tabs = [
  { to: "/", label: "Shop", end: true },
  { to: "/cart", label: "Cart" },
  { to: "/data", label: "Data layer" },
  { to: "/insights", label: "Insights" },
];

const departments = [
  "Deals & More",
  "Hurricane Prep",
  "Grocery",
  "Get it Fast",
  "Pharmacy",
  "New Arrivals",
  "Household Essentials",
  "Walmart+",
];

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState({ lines: [], count: 0, subtotal: 0 });
  const [resetKey, setResetKey] = useState(0);

  const refreshCart = useCallback(async () => {
    const next = await fetchJson("/api/cart");
    setCart(next);
    return next;
  }, []);

  useEffect(() => {
    fetchJson("/api/session").then(setSession).catch(() => {});
    refreshCart().catch(() => {});
  }, [refreshCart]);

  const add = useCallback(async (productId) => {
    setCart(await fetchJson("/api/cart", { method: "POST", body: JSON.stringify({ productId }) }));
  }, []);

  const setQty = useCallback(async (productId, qty) => {
    setCart(await fetchJson(`/api/cart/${productId}`, { method: "PATCH", body: JSON.stringify({ qty }) }));
  }, []);

  async function resetDemo() {
    await fetchJson("/api/demo/reset", { method: "POST" });
    await refreshCart();
    setResetKey((key) => key + 1);
  }

  const isCustomer = location.pathname === "/" || location.pathname === "/cart";
  const cartApi = { cart, add, setQty };

  return (
    <div className={isCustomer ? "app customer" : "app associate"}>
      <div className="demo-bar">
        <div className="demo-inner">
          <span className="demo-label">Spark Agent prototype</span>
          <nav className="demo-tabs" aria-label="Prototype sections">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className="demo-tab">
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <button className="demo-reset" onClick={resetDemo}>
            Reset demo
          </button>
        </div>
      </div>

      {isCustomer ? (
        <CustomerHeader session={session} cart={cart} />
      ) : (
        <AssociateHeader title={location.pathname === "/data" ? "Customer Data" : "Store Insights"} />
      )}

      <Routes>
        <Route path="/" element={<Shop key={resetKey} {...cartApi} />} />
        <Route path="/cart" element={<CartPage key={resetKey} {...cartApi} />} />
        <Route path="/data" element={<DataLayer key={resetKey} />} />
        <Route path="/insights" element={<Dashboard key={resetKey} />} />
      </Routes>

      {isCustomer && <Footer />}
    </div>
  );
}

function CustomerHeader({ session, cart }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState(new URLSearchParams(location.search).get("q") || "");

  function onSearch(event) {
    event.preventDefault();
    navigate(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/");
  }

  return (
    <header className="wm-header">
      <div className="wm-bar">
        <button className="wm-logo" onClick={() => navigate("/")} aria-label="Walmart homepage">
          <Spark size={40} />
        </button>
        <button className="wm-pickup">
          <span className="wm-pickup-icon">
            <StoreIcon size={18} />
          </span>
          <span className="wm-pickup-text">
            <strong>Pickup or delivery?</strong>
            <span>
              {session?.city || "Columbia, 29209"} • {session?.store || "Columbia Garners Ferry Rd Supercenter"}
            </span>
          </span>
          <ChevronDown />
        </button>
        <form className="wm-search" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search everything at Walmart online and in store"
            aria-label="Search"
          />
          <button type="submit" aria-label="Search">
            <SearchIcon />
          </button>
        </form>
        <button className="wm-tool">
          <HeartIcon />
          <span>
            <small>Reorder</small>
            <strong>My Items</strong>
          </span>
        </button>
        <button className="wm-tool">
          <PersonIcon />
          <span>
            <small>Hi, {session?.first || "Doug"}</small>
            <strong>Account</strong>
          </span>
        </button>
        <button className="wm-cart" onClick={() => navigate("/cart")} aria-label={`Cart, ${cart.count} items`}>
          <span className="wm-cart-icon">
            <CartIcon />
            <span className="wm-cart-count">{cart.count}</span>
          </span>
          <span className="wm-cart-total">{money(cart.subtotal || 0)}</span>
        </button>
      </div>
      <div className="wm-depts">
        <div className="wm-depts-inner">
          <button className="dept-pill strong">
            Departments <ChevronDown size={12} />
          </button>
          <button className="dept-pill strong">
            Services <ChevronDown size={12} />
          </button>
          {departments.map((name) => (
            <button key={name} className="dept-pill">
              {name}
            </button>
          ))}
          <button className="dept-pill strong push">
            More <ChevronDown size={12} />
          </button>
        </div>
      </div>
    </header>
  );
}

function AssociateHeader({ title }) {
  return (
    <header className="wm-header">
      <div className="wm-bar">
        <span className="wm-logo">
          <Spark size={40} />
        </span>
        <span className="assoc-title">
          <strong>Walmart</strong>
          <span>{title}</span>
        </span>
        <button className="wm-pickup assoc-store">
          <span className="wm-pickup-icon">
            <StoreIcon size={18} />
          </span>
          <span className="wm-pickup-text">
            <strong>Store 4127</strong>
            <span>Columbia Garners Ferry Rd Supercenter</span>
          </span>
          <ChevronDown />
        </button>
        <span className="assoc-spacer" />
        <span className="wm-tool static">
          <PersonIcon />
          <span>
            <small>Store manager</small>
            <strong>J. Reyes</strong>
          </span>
        </span>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="wm-footer">
      <nav>
        {["All Departments", "Store Directory", "Careers", "Our Company", "Sell on Walmart.com", "Help", "Product Recalls", "Privacy Notice", "Terms of Use"].map((link) => (
          <span key={link}>{link}</span>
        ))}
      </nav>
      <p>
        Product photos from{" "}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
          Open Food Facts
        </a>{" "}
        and{" "}
        <a href="https://world.openproductsfacts.org" target="_blank" rel="noreferrer">
          Open Products Facts
        </a>{" "}
        contributors, CC BY-SA. Prototype for demonstration only.
      </p>
      <p>© 2026 Walmart. All Rights Reserved.</p>
    </footer>
  );
}
