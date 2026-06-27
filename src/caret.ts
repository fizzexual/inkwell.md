// Pixel coordinates of the caret inside a <textarea>, measured with a mirror
// element that mimics the textarea's box and typography. Standard technique —
// the browser gives no direct API for this.

const MIRRORED_PROPS = [
  "boxSizing",
  "width",
  "height",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "whiteSpace",
  "wordWrap",
  "tabSize",
] as const;

export interface CaretCoords {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(el: HTMLTextAreaElement, position: number): CaretCoords {
  const mirror = document.createElement("div");
  const style = mirror.style;
  const computed = getComputedStyle(el);

  style.position = "absolute";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.overflow = "hidden";

  for (const prop of MIRRORED_PROPS) {
    style[prop as never] = computed[prop as never];
  }

  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const coords: CaretCoords = {
    top: marker.offsetTop - el.scrollTop,
    left: marker.offsetLeft - el.scrollLeft,
    height: parseInt(computed.lineHeight) || parseInt(computed.fontSize) * 1.4,
  };
  document.body.removeChild(mirror);
  return coords;
}
