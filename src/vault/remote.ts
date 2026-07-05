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
  type: "hello" | "ping" | "upsert" | "delete";
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

// ---- connection resilience (keep the link alive across sleeps, drops, server restarts) ----
let lastBeat = 0; // ms of the last SSE message/ping — the server pings every 25s
let hadConnection = false; // have we ever been online? → a reopen is a *reconnect* and must catch up
let watchdog: ReturnType<typeof setInterval> | null = null;
const STALE_MS = 45000; // no beat for this long ⇒ the (possibly half-dead) stream is force-reconnected

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

/** Pull the whole vault from the server: `initial` load, or a live catch-up after reconnecting. */
async function fetchVault(initial: boolean): Promise<void> {
  const { notes } = (await (await apiGet("/api/vault")).json()) as { notes: DiskNote[] };
  baseline = new Map(notes.map((n) => [n.rel, { rel: n.rel, content: n.content }]));
  const mapped = notes.map((n) => diskNoteToNote(n));
  const v = useVault.getState();
  if (initial) v.loadRemoteVault(baseUrl, token, mapped);
  else v.reconcileDisk(mapped); // keep the user on their current note
  lastNotes = useVault.getState().notes; // don't let this programmatic change trigger a push
}

/** After a reconnect: flush edits we made during the outage, then catch up on what we missed. */
async function catchUp(): Promise<void> {
  try {
    await pushNow(); // send local changes first (SSE has no replay, so re-fetch can't see them)
    await fetchVault(false);
  } catch (e) {
    console.error("Inkwell sync: catch-up failed", e);
  }
}

function openEvents() {
  events?.close();
  // EventSource can't set headers, so the token rides in the query string (server accepts ?token=)
  events = new EventSource(`${baseUrl}/api/events?token=${encodeURIComponent(token)}`);
  events.onopen = () => {
    lastBeat = Date.now();
    useVault.getState().setRemoteStatus("online");
    if (hadConnection) catchUp(); // this is a *re*connection — reconcile whatever changed while gone
    hadConnection = true;
  };
  events.onmessage = (e) => {
    lastBeat = Date.now(); // any message (incl. the server's keepalive ping) proves the link is alive
    let msg: RemoteEvent;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === "hello" || msg.type === "ping") return;
    if (msg.origin === clientId) return; // our own write echoing back — ignore
    applyRemote(msg);
  };
  events.onerror = () => {
    // EventSource retries on its own; the watchdog forces a fresh stream if it stays dead
    if (useVault.getState().remoteStatus === "online") useVault.getState().setRemoteStatus("connecting");
  };
}

/** Reopen the stream if it looks dead — the phone woke, the network flapped, or pings stopped. */
function resume() {
  if (!baseUrl) return;
  const stale = Date.now() - lastBeat > STALE_MS;
  const dead = !events || events.readyState === 2; // 2 = CLOSED
  if (stale || dead) openEvents();
}

let onlineHandler: (() => void) | null = null;
let visHandler: (() => void) | null = null;

function startWatchdog() {
  stopWatchdog();
  // periodically make sure the stream is really alive; mobile connections die silently after sleep
  watchdog = setInterval(() => {
    if (!baseUrl) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      useVault.getState().setRemoteStatus("connecting");
      return; // no point reopening with no network; `online` will fire when it's back
    }
    if (Date.now() - lastBeat > STALE_MS || !events || events.readyState === 2) openEvents();
  }, 15000);

  if (typeof window !== "undefined") {
    onlineHandler = () => resume();
    visHandler = () => document.visibilityState === "visible" && resume();
    window.addEventListener("online", onlineHandler);
    document.addEventListener("visibilitychange", visHandler);
  }
}

function stopWatchdog() {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
  if (typeof window !== "undefined") {
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    if (visHandler) document.removeEventListener("visibilitychange", visHandler);
  }
  onlineHandler = null;
  visHandler = null;
}

/** Connect to a sync server: load its vault, go live, push local edits, and stay connected. */
export async function connectRemote(url: string, tok: string): Promise<void> {
  disconnectRemote(false);
  baseUrl = url.replace(/\/+$/, "");
  token = tok;
  hadConnection = false;
  const v = useVault.getState();
  v.setRemoteStatus("connecting");
  try {
    await fetchVault(true);
    openEvents();
    unsub = useVault.subscribe((s) => {
      if (!baseUrl || s.notes === lastNotes) return;
      lastNotes = s.notes;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(pushNow, 500);
    });
    startWatchdog();
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
  stopWatchdog();
  if (pushTimer) clearTimeout(pushTimer);
  baseUrl = "";
  token = "";
  baseline = new Map();
  lastNotes = null;
  hadConnection = false;
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
