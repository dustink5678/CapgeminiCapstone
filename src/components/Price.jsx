import { money } from "../api";

export default function Price({ price, was, unitPrice, size = "md" }) {
  const [dollars, cents] = price.toFixed(2).split(".");
  return (
    <div className={`price price-${size}`}>
      <span className={was ? "price-now deal" : "price-now"}>
        {was && <span className="now-word">Now </span>}
        <sup>$</sup>
        {dollars}
        <sup>{cents}</sup>
      </span>
      {was && <s className="price-was">{money(was)}</s>}
      {unitPrice && <span className="unit-price">{unitPrice}</span>}
    </div>
  );
}
