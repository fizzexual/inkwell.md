// Client for the self-hosted Inkwell sync server (server/inkwell-sync.mjs).
// Loads the vault over HTTP, pushes local edits, and applies other devices'
// changes live via Server-Sent Events — so your phone and desktop share one
// vault. Works in the browser and the desktop app alike (plain fetch/EventSource).
import { useVault } from "../store/useVault";
import { relOf, diskNoteToNote } from "./disk";
import type { Note } from "../data/vault";

interface DiskNote {
  rel: string;
  content: string;
}
interface RemoteEvent {
  type: "hello" | "upsert" | "delete";
  rel?: string;
  content?: string;
  origin?: string | null;
}

// per-tab id so we can ignore the echo of our own writes coming back over SSE
const clientId = `web-${Math.random().toString(36).slice(2, 10)}`;

let baseUrl = "";
let token = "";
let events: EventSource | null = null;
let unsub: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let lastNotes: Note[] | null = null;
// what the server currently has, keyed by local note id → so we only push real changes
let baseline = new Map<string, { rel: string; content: string }>();

function headers(): Record<string, string> {
  return { "content-type": "application/json", "x-inkwell-token": token };
}

async function apiGet(path: string): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res;
}
function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
}

/** Find the local note whose on-disk path equals `rel` (mirrors how pushNow maps notes → files). */
function findByRel(notes: Note[], rel: string): Note | undefined {
  const used = new Set<string>();
  for (const n of notes) {
    const r = relOf(n, used);
    used.add(r);
    if (r === rel) return n;
  }
  return undefined;
}

/** Push any locally changed / new / removed notes up to the server (incremental, like disk sync). */
async function pushNow() {
  if (!baseUrl) return;
  const notes = useVault.getState().notes;
  const used = new Set<string>();
  const next = new Map<string, { rel: string; content: string }>();
  const liveIds = new Set(notes.map((n) => n.id));

  for (const n of notes) {
    const rel = relOf(n, used);
    used.add(rel);
    const content = n.content ?? "";
    const prev = baseline.get(n.id);
    next.set(n.id, { rel, content });
    if (!prev || prev.content !== content || prev.rel !== rel) {
      try {
        await apiPost("/api/note", { rel, content, clientId });
        if (prev && prev.rel !== rel) await apiPost("/api/delete", { rel: prev.rel, clientId }); // moved
      } catch (e) {
        console.error("Inkwell sync: push failed for", rel, e);
      }
    }
  }
  // notes deleted locally → delete on the server too
  for (const [id, prev] of baseline) {
    if (!liveIds.has(id)) {
      try {
        await apiPost("/api/delete", { rel: prev.rel, clientId });
      } catch {
        /* already gone */
      }
    }
  }
  baseline = next;
}

/** A change arrived from another device — fold it in and stay on the current note. */
function applyRemote(msg: RemoteEvent) {
  if (!msg.rel) return;
  const v = useVault.getState();
  const notes = v.notes.slice();

  if (msg.type === "upsert") {
    const content = msg.content ?? "";
    const existing = findByRel(notes, msg.rel);
    if (existing) {
      const heading = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
      const idx = notes.indexOf(existing);
      notes[idx] = { ...existing, content, title: heading || existing.title };
      baseline.set(existing.id, { rel: msg.rel, content });
    } else {
      const note = diskNoteToNote({ rel: msg.rel, content } as DiskNote);
      notes.push(note);
      baseline.set(note.id, { rel: msg.rel, content });
    }
    v.reconcileDisk(notes);
  } else if (msg.type === "delete") {
    const existing = findByRel(notes, msg.rel);
    if (existing) {
      baseline.delete(existing.id);
      v.reconcileDisk(notes.filter((n) => n !== existing));
    }
  }
}

function openEvents() {
  // EventSource can't set headers, so the token rides in the query string (server accepts ?token=)
  events = new EventSource(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`);
  events.onopen = () => useVault.getState().setRemoteStatus("online");
  events.onmessage = (e) => {
    let msg: RemoteEvent;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === "hello") return;
    if (msg.origin === clientId) return; // our own write echoing back — ignore
    applyRemote(msg);
  };
  events.onerror = () => {
    // EventSource reconnects on its own; reflect the blip in the UI
    if (useVault.getState().remoteStatus === "online") useVault.getState().setRemoteStatus("connecting");
  };
}

/** Connect to a sync server: load its vault, go live, and start pushing local edits. */
export async function connectRemote(url: string, tok: string): Promise<void> {
  disconnectRemote(false);
  baseUrl = url.replace(/\/+$/, "");
  token = tok;
  const v = useVault.getState();
  v.setRemoteStatus("connecting");
  try {
    const { notes } = (await (await apiGet("/api/vault")).json()) as { notes: DiskNote[] };
    baseline = new Map(notes.map((n) => [n.rel, { rel: n.rel, content: n.content }]));
    const mapped = notes.map((n) => diskNoteToNote(n));
    v.loadRemoteVault(baseUrl, token, mapped);
    lastNotes = useVault.getState().notes; // baseline the subscriber so the load itself isn't pushed
    openEvents();
    unsub = useVault.subscribe((s) => {
      if (!baseUrl || s.notes === lastNotes) return;
      lastNotes = s.notes;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 500);
    });
    v.setRemoteStatus("online");
  } catch (e) {
    v.setRemoteStatus("error");
    baseUrl = "";
    throw e;
  }
}

/** Tear down the live connection. When `reset`, also drop the vault and reload the local one. */
export function disconnectRemote(reset = true) {
  events?.close();
  events = null;
  unsub?.();
  unsub = null;
  if (pushTimer) clearTimeout(pushTimer);
  baseUrl = "";
  token = "";
  baseline = new Map();
  lastNotes = null;
  if (reset) useVault.getState().clearRemote();
}

/** On launch, reconnect to the last sync server if one was saved. */
export async function autoConnectRemote() {
  const v = useVault.getState();
  if (!v.remoteUrl || !v.remoteToken) return;
  try {
    await connectRemote(v.remoteUrl, v.remoteToken);
  } catch {
    v.setRemoteStatus("error"); // server down / unreachable — user can retry from the Sync panel
  }
}
