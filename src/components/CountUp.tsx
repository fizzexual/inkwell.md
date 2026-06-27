import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tween a number to its target with easeOutCubic. */
export default function CountUp({ value, ms = 650 }: { value: number; ms?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced()) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const start = performance.now();
    const startVal = fromRef.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startVal + (value - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return <>{Math.round(display)}</>;
}
