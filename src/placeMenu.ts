/** Top-left for a w×h popup opened at (x, y) so it stays inside a vw×vh window, `margin` from the edges. */
export function placeMenu(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  margin = 8,
): { left: number; top: number } {
  return {
    left: Math.max(margin, Math.min(x, vw - w - margin)),
    top: Math.max(margin, Math.min(y, vh - h - margin)),
  };
}
