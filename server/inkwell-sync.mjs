#!/usr/bin/env node
// Inkwell self-hosted sync server.
//
// Owns a vault folder of markdown files and lets any number of Inkwell clients
// (your desktop, your phone) read and write the SAME notes, with live push so a
// change on one device shows up on the others immediately. No cloud, no login —
// just a shared token. Binds 0.0.0.0 so it's reachable over your LAN or a mesh
// VPN like Tailscale (open the printed URL from your phone anywhere).
//
// Zero dependencies — Node built-ins only. Live updates use Server-Sent Events
// (one HTTP stream, auto-reconnecting) rather than WebSockets, so nothing to install.
//
// Usage:
//   node server/inkwell-sync.mjs [--vault ./vault] [--port 8787] [--token SECRET]
// The token defaults to $INKWELL_TOKEN, else one is generated and saved next to the vault.

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- args ----
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const VAULT = path.resolve(arg("vault", process.env.INKWELL_VAULT || "./vault"));
const PORT = Number(arg("port", process.env.INKWELL_PORT || 8787));
const DIST = path.resolve(HERE, "..", "dist"); // built web UI, served so the phone can just open the URL

// ---- token (shared secret; devices must present it) ----
async function resolveToken() {
  const cli = arg("token", process.env.INKWELL_TOKEN);
  if (cli) return cli;
  const tokenFile = path.join(VAULT, ".inkwell-sync-token");
  try {
    const saved = (await fs.readFile(tokenFile, "utf8")).trim();
    if (saved) return saved;
  } catch {
    /* none yet */
  }
  const fresh = crypto.randomBytes(16).toString("hex");
  await fs.mkdir(VAULT, { recursive: true });
  await fs.writeFile(tokenFile, fresh, "utf8");
  return fresh;
}

// ---- vault fs helpers ----
const isMd = (p) => p.toLowerCase().endsWith(".md");

async function walk(dir, root, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out);
    else if (isMd(e.name)) {
      const rel = path.relative(root, full).split(path.sep).join("/");
      try {
        out.push({ rel, content: await fs.readFile(full, "utf8") });
      } catch {
        /* unreadable — skip */
      }
    }
  }
}

async function readVault() {
  const out = [];
  await walk(VAULT, VAULT, out);
  return out;
}

/** Resolve a client-supplied relative path to an absolute path INSIDE the vault, or null if it escapes. */
function safePath(rel) {
  if (typeof rel !== "string" || !rel || !isMd(rel)) return null;
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(VAULT, clean);
  const root = path.resolve(VAULT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // path-traversal guard
  return abs;
}

// ---- live push (Server-Sent Events) ----
const clients = new Set(); // { res }
function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {
      /* dropped; cleaned up on close */
    }
  }
}

// ---- http plumbing ----
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization, x-inkwell-token",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(body);
}
const json = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { "content-type": "application/json" });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 8_000_000) reject(new Error("body too large")); // ~8MB note cap
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res, urlPath) {
  // serve the built web app from dist/; fall back to index.html for SPA routes
  let rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  let file = path.resolve(DIST, rel);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, "forbidden");
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(DIST, "index.html"); // SPA fallback
  }
  try {
    const buf = await fs.readFile(file);
    send(res, 200, buf, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  } catch {
    send(res, 404, "Inkwell web UI not built. Run `npm run build`, or open your local dev app and point it here.");
  }
}

function tokenOf(req, url) {
  return (
    req.headers["x-inkwell-token"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
    url.searchParams.get("token") ||
    ""
  );
}

async function main() {
  const TOKEN = await resolveToken();
  await fs.mkdir(VAULT, { recursive: true });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (req.method === "OPTIONS") return send(res, 204, "");

    // /api/health is open (no data, just liveness) so a client can detect it's served by a sync server
    if (p === "/api/health") return json(res, 200, { ok: true, vault: path.basename(VAULT) });

    // everything else under /api needs the token
    if (p.startsWith("/api/")) {
      if (tokenOf(req, url) !== TOKEN) return json(res, 401, { error: "bad or missing token" });
    }

    try {

      if (p === "/api/vault" && req.method === "GET") {
        return json(res, 200, { notes: await readVault() });
      }

      if (p === "/api/note" && req.method === "POST") {
        const { rel, content, clientId } = JSON.parse(await readBody(req));
        const abs = safePath(rel);
        if (abs == null) return json(res, 400, { error: "invalid path" });
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, typeof content === "string" ? content : "", "utf8");
        broadcast({ type: "upsert", rel: rel.replace(/\\/g, "/"), content, origin: clientId || null });
        return json(res, 200, { ok: true });
      }

      if (p === "/api/delete" && req.method === "POST") {
        const { rel, clientId } = JSON.parse(await readBody(req));
        const abs = safePath(rel);
        if (abs == null) return json(res, 400, { error: "invalid path" });
        await fs.rm(abs, { force: true });
        broadcast({ type: "delete", rel: rel.replace(/\\/g, "/"), origin: clientId || null });
        return json(res, 200, { ok: true });
      }

      if (p === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        res.write(`retry: 3000\n\n`);
        res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => {
          try {
            // a real data event (not an SSE comment) so the client's heartbeat/watchdog sees it
            res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
          } catch {
            /* ignore */
          }
        }, 25000);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      if (p.startsWith("/api/")) return json(res, 404, { error: "unknown endpoint" });

      // anything else: the web UI
      return await serveStatic(req, res, req.url);
    } catch (e) {
      return json(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    const nets = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal)
      .map((n) => n.address);
    console.log("\n  Inkwell sync server");
    console.log("  ───────────────────");
    console.log(`  vault:  ${VAULT}`);
    console.log(`  token:  ${TOKEN}`);
    console.log(`  local:  http://localhost:${PORT}`);
    for (const ip of nets) console.log(`  network: http://${ip}:${PORT}   (use this from your phone / over Tailscale)`);
    console.log("\n  Open the URL on another device, enter the token, and your vault syncs live.\n");
  });
}

main().catch((e) => {
  console.error("Inkwell sync server failed to start:", e);
  process.exit(1);
});
