/** `href` as an absolute http(s)/mailto URL safe to hand to the system, or null for anything else. */
export function externalUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href.trim());
  } catch {
    return null;
  }
  return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? u.href : null;
}

/**
 * Keep link clicks from navigating the app window. In-app `#…` links pass through to their own
 * handlers; web links go to `open` (the system browser); everything else (javascript:, file:,
 * relative paths, custom schemes) is swallowed.
 */
export function installLinkGuard(root: Document | HTMLElement, open: (url: string) => void): () => void {
  const onClick = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) return;
    if (href.startsWith("blob:") && a.hasAttribute("download")) return; // our own exports
    e.preventDefault();
    if (e.type === "auxclick" && (e as MouseEvent).button !== 1) return;
    const url = externalUrl(href);
    if (url) open(url);
  };
  root.addEventListener("click", onClick, true);
  root.addEventListener("auxclick", onClick, true);
  return () => {
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("auxclick", onClick, true);
  };
}
