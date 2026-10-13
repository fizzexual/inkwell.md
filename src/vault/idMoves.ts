// In a disk vault a note's id IS its file's vault-relative path, read fresh on every load. Inside
// one session a moved note keeps its id (the sync engine only tracks where its file went), so on
// the next load it comes back under its new path. Everything keyed by note id (pins, icons, canvas
// cards, version history, flashcard reviews) would stay behind under the old id. So the sync
// engine records "old id → file now" per vault folder, and the next load re-keys those stores once.
import { useVault } from "../store/useVault";
import { useHistory } from "../useHistory";
import { useFlashcards } from "../useFlashcards";

const KEY = "inkwell.idmoves.v1";

/** old note id → the vault-relative path its file has now */
export type IdMoves = Record<string, string>;

function loadAll(): Record<string, IdMoves> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, IdMoves>) {
  try {
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full/unavailable: the notes keep working, only their pins/icons may detach */
  }
}

/** Remember the moves of the open vault `vault` (replaces what was recorded for it before). */
export function saveMoves(vault: string, moves: IdMoves) {
  const all = loadAll();
  const had = JSON.stringify(all[vault] ?? {});
  if (had === JSON.stringify(moves)) return;
  if (Object.keys(moves).length) all[vault] = moves;
  else delete all[vault];
  saveAll(all);
}

/** The moves recorded for `vault`, forgotten as they are read (they are applied exactly once). */
export function takeMoves(vault: string): IdMoves {
  const all = loadAll();
  const moves = all[vault] ?? {};
  if (vault in all) {
    delete all[vault];
    saveAll(all);
  }
  return moves;
}

type IdMap = (id: string) => string | undefined;

/** Re-key a record; a moved entry wins over a stale one already sitting under its new id. */
export function remapKeys<V>(rec: Record<string, V>, to: IdMap): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(rec)) if (to(k) === undefined) out[k] = v;
  for (const [k, v] of Object.entries(rec)) {
    const n = to(k);
    if (n !== undefined) out[n] = v;
  }
  return out;
}

/** Flashcard ids are `<note id>#<hash>[~n]` (and legacy `<note id>:<line>`); re-key the note part. */
export function cardIdMap(to: IdMap): IdMap {
  return (cardId) => {
    for (const sep of ["#", ":"]) {
      const at = cardId.lastIndexOf(sep);
      if (at <= 0) continue;
      const n = to(cardId.slice(0, at));
      if (n !== undefined) return n + cardId.slice(at);
    }
    return undefined;
  };
}

/**
 * Re-key every store holding per-note data from the recorded old ids to the ids the notes are
 * loaded under now (`loadedIds`). A move whose file is gone is dropped; nothing else changes.
 */
export function applyIdMoves(moves: IdMoves, loadedIds: string[]) {
  const byLc = new Map(loadedIds.map((id) => [id.toLowerCase(), id]));
  const map = new Map<string, string>();
  for (const [from, rel] of Object.entries(moves)) {
    const to = byLc.get(rel.toLowerCase());
    if (to !== undefined && to !== from) map.set(from, to);
  }
  if (!map.size) return;
  const to: IdMap = (id) => map.get(id);
  const one = (id: string) => to(id) ?? id;

  const v = useVault.getState();
  const targets = new Set(map.values());
  useVault.setState({
    pinned: [...new Set(v.pinned.map(one))],
    noteIcons: remapKeys(v.noteIcons, to),
    canvas: {
      ...v.canvas,
      // a moved card replaces any stale card already under its new id
      cards: v.canvas.cards.filter((c) => map.has(c.id) || !targets.has(c.id)).map((c) => ({ ...c, id: one(c.id) })),
    },
  });
  useHistory.getState().rekey(to);
  useFlashcards.setState((s) => ({ reviews: remapKeys(s.reviews, cardIdMap(to)) }));
}
