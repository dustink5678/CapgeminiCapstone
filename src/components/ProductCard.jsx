import { HeartIcon } from "./Icons";
import Price from "./Price";
import Spark from "./Spark";

export function Badge({ kind }) {
  if (!kind) return null;
  const cls = kind === "Deal" ? "badge badge-deal" : kind === "Best seller" ? "badge badge-best" : "badge badge-outline";
  return <span className={cls}>{kind}</span>;
}

export function Stepper({ qty, onChange, size = "md" }) {
  return (
    <div className={`stepper stepper-${size}`}>
      <button onClick={() => onChange(qty - 1)} aria-label="Decrease quantity">
        −
      </button>
      <span>{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

export function WhyBox({ label, children }) {
  return (
    <div className="why">
      <p className="why-head">
        <Spark size={13} color="#0071dc" />
        <span>{label}</span>
      </p>
      <p>{children}</p>
    </div>
  );
}

export default function ProductCard({ item, qty = 0, onAdd, onQty, variant = "outline", why, whyLabel }) {
  return (
    <article className="pcard">
      <div className="pcard-media">
        <Badge kind={item.badge} />
        <button className="heart" aria-label="Save to My Items">
          <HeartIcon />
        </button>
        <img src={item.image} alt={item.name} loading="lazy" />
      </div>
      <div className="pcard-action">
        {qty > 0 ? (
          <Stepper qty={qty} onChange={(next) => onQty(item.id, next)} />
        ) : (
          <button className={variant === "filled" ? "add-btn filled" : "add-btn"} onClick={() => onAdd(item.id)}>
            <span aria-hidden="true">+</span> Add
          </button>
        )}
      </div>
      <Price price={item.price} was={item.was} unitPrice={item.unitPrice} />
      <h3 className="pcard-title">{item.name}</h3>
      {why && <WhyBox label={whyLabel}>{why}</WhyBox>}
    </article>
  );
}
