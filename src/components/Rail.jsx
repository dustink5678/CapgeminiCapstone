import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "./Icons";

export default function Rail({ children, className = "" }) {
  const ref = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function update() {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  });

  function scroll(direction) {
    const el = ref.current;
    el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="rail-wrap">
      <div className={`rail ${className}`} ref={ref} onScroll={update}>
        {children}
      </div>
      {!atStart && (
        <button className="rail-arrow left" aria-label="Scroll left" onClick={() => scroll(-1)}>
          <ChevronRight />
        </button>
      )}
      {!atEnd && (
        <button className="rail-arrow" aria-label="Scroll right" onClick={() => scroll(1)}>
          <ChevronRight />
        </button>
      )}
    </div>
  );
}
