import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVault } from "./store/useVault";
import { useMath } from "./math/useMath";
import { isFresh, renderTracked, watchedBy, type Rendered } from "./renderCtx";

/**
 * Render markdown for one note (the whole note, or its blocks one by one), re-rendering a piece
 * only when something it read changed: its text, links/citations/math, a note it embeds, or —
 * only for a ```query — what queries can see (metaRev). Typing elsewhere in the vault costs nothing.
 * Returns `html(text)`; call it during render.
 */
export function useNoteHtml(noteId: string, md: string): (text: string) => string {
  const resolve = useVault((s) => s.resolve);
  const citeMap = useVault((s) => s.citeMap);
  const mathResult = useMath((s) => s.result);
  const last = useRef(new Map<string, Rendered>());
  // re-render when a note a piece embedded changes, or metaRev when a piece ran a query
  useVault(useShallow((s) => watchedBy(last.current.values(), s)));
  const next = new Map<string, Rendered>();
  useEffect(() => {
    last.current = next;
  });
  return (text) => {
    const { notes, notesById, metaRev } = useVault.getState();
    const env = { md, noteId, notes, notesById, resolve, citeMap, mathResult, metaRev };
    let r = next.get(text) ?? last.current.get(text);
    if (!r || !isFresh(r, env)) r = renderTracked(text, env);
    next.set(text, r);
    return r.html;
  };
}
