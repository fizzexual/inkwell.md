import { useEffect, type RefObject } from "react";

/** Eased (Lenis-style) mouse-wheel scrolling for a scroll container. */
export function useSmoothScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let target = el.scrollTop;
    let raf = 0;

    const animate = () => {
      const diff = target - el.scrollTop;
      if (Math.abs(diff) < 0.4) {
        el.scrollTop = target;
        raf = 0;
        return;
      }
      el.scrollTop += diff * 0.2;
      raf = requestAnimationFrame(animate);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1) return;
      // line/page wheel modes report small deltas — scale to pixels
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      if (!raf) target = el.scrollTop; // resync if user scrolled by other means
      const next = Math.max(0, Math.min(max, target + dy));
      if (next === target) return; // at an edge — let it pass through
      target = next;
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(animate);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
