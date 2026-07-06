// Native, dependency-free sync server embedded in the Inkwell desktop app.
//
// This is what lets your phone (and other devices) share the vault with your desktop — the SAME
// API as server/inkwell-sync.mjs, but built into the app so there's no script to run and the
// installer can set up the firewall for you. Serves only the JSON API + live push (SSE); the
// phone app ships its own UI (local-first), so no static hosting is needed here.
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::{fs, thread, time::Duration};

#[derive(Serialize)]
struct Note {
    rel: String,
    content: String,
}

/// A running sync server. Dropping / stopping it ends the background threads.
pub struct SyncServer {
    pub port: u16,
    pub token: String,
    stop: Arc<AtomicBool>,
    clients: Arc<Mutex<Vec<TcpStream>>>,
}

fn is_md(p: &str) -> bool {
    p.to_lowercase().ends_with(".md")
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<Note>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let p = entry.path();
        if p.is_dir() {
            walk(&p, root, out);
        } else if is_md(&name) {
            if let Ok(content) = fs::read_to_string(&p) {
                let rel = p
                    .strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(Note { rel, content });
            }
        }
    }
}

/// Resolve a client-supplied rel path to an absolute path INSIDE the vault, or None if it escapes.
fn safe_path(vault: &Path, rel: &str) -> Option<PathBuf> {
    if rel.is_empty() || !is_md(rel) {
        return None;
    }
    let clean = rel.replace('\\', "/");
    let clean = clean.trim_start_matches('/');
    if clean.split('/').any(|seg| seg == ".." || seg.is_empty()) {
        return None;
    }
    let abs = vault.join(clean);
    let root = fs::canonicalize(vault).ok()?;
    // canonicalize the parent (file may not exist yet), then confirm it stays under the vault root
    let parent = abs.parent()?;
    fs::create_dir_all(parent).ok()?;
    let cparent = fs::canonicalize(parent).ok()?;
    if cparent == root || cparent.starts_with(&root) {
        Some(abs)
    } else {
        None
    }
}

const CORS: &str = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type, authorization, x-inkwell-token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Private-Network: true\r\n";

fn respond(stream: &mut TcpStream, status: &str, ctype: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\n{CORS}Content-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(msg.as_bytes());
}
fn json(stream: &mut TcpStream, status: &str, body: &str) {
    respond(stream, status, "application/json", body);
}

/// Broadcast an SSE event to every connected client; drop the ones that have gone away.
fn broadcast(clients: &Arc<Mutex<Vec<TcpStream>>>, payload: &str) {
    let frame = format!("data: {payload}\n\n");
    if let Ok(mut list) = clients.lock() {
        list.retain_mut(|c| c.write_all(frame.as_bytes()).is_ok());
    }
}

struct Req {
    method: String,
    path: String,
    query: String,
    token: String,
    body: String,
}

fn parse_request(stream: &mut TcpStream) -> Option<Req> {
    // read headers up to the blank line, then the body per Content-Length
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    let mut header_end = 0;
    while stream.read(&mut byte).ok()? == 1 {
        buf.push(byte[0]);
        if buf.len() >= 4 && &buf[buf.len() - 4..] == b"\r\n\r\n" {
            header_end = buf.len();
            break;
        }
        if buf.len() > 65536 {
            return None; // header flood guard
        }
    }
    let head = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = head.lines();
    let first = lines.next()?;
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_string();
    let full = parts.next()?.to_string();
    let (path, query) = match full.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (full, String::new()),
    };

    let mut token = String::new();
    let mut content_len = 0usize;
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_lowercase();
            let val = v.trim();
            match key.as_str() {
                "x-inkwell-token" => token = val.to_string(),
                "authorization" => token = val.trim_start_matches("Bearer ").to_string(),
                "content-length" => content_len = val.parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    if token.is_empty() {
        for kv in query.split('&') {
            if let Some(v) = kv.strip_prefix("token=") {
                token = urldecode(v);
            }
        }
    }

    let mut body = String::new();
    if content_len > 0 && content_len < 8_000_000 {
        let mut b = vec![0u8; content_len];
        stream.read_exact(&mut b).ok()?;
        body = String::from_utf8_lossy(&b).to_string();
    }
    Some(Req { method, path, query, token, body })
}

fn urldecode(s: &str) -> String {
    let mut out = String::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(n) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(n as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

// minimal JSON field extraction for {"rel":"...","content":"...","clientId":"..."}
fn json_str(body: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let start = body.find(&needle)? + needle.len();
    let rest = &body[start..];
    let colon = rest.find(':')?;
    let after = rest[colon + 1..].trim_start();
    if !after.starts_with('"') {
        return None;
    }
    let mut out = String::new();
    let mut chars = after[1..].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => match chars.next() {
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('t') => out.push('\t'),
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('/') => out.push('/'),
                Some(other) => out.push(other),
                None => break,
            },
            '"' => return Some(out),
            _ => out.push(c),
        }
    }
    Some(out)
}

fn json_escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}

fn handle(mut stream: TcpStream, vault: &Path, token: &str, clients: &Arc<Mutex<Vec<TcpStream>>>) {
    let req = match parse_request(&mut stream) {
        Some(r) => r,
        None => return,
    };

    if req.method == "OPTIONS" {
        let _ = stream.write_all(format!("HTTP/1.1 204 No Content\r\n{CORS}Content-Length: 0\r\nConnection: close\r\n\r\n").as_bytes());
        return;
    }

    // health is open (liveness only), everything else needs the token
    if req.path == "/api/health" {
        return json(&mut stream, "200 OK", "{\"ok\":true}");
    }
    if req.path.starts_with("/api/") && req.token != token {
        return json(&mut stream, "401 Unauthorized", "{\"error\":\"bad or missing token\"}");
    }

    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/api/vault") => {
            let mut notes = Vec::new();
            walk(vault, vault, &mut notes);
            match serde_json::to_string(&serde_json::json!({ "notes": notes })) {
                Ok(s) => json(&mut stream, "200 OK", &s),
                Err(_) => json(&mut stream, "500 Internal Server Error", "{\"error\":\"encode\"}"),
            }
        }
        ("POST", "/api/note") => {
            let rel = json_str(&req.body, "rel").unwrap_or_default();
            let content = json_str(&req.body, "content").unwrap_or_default();
            let origin = json_str(&req.body, "clientId").unwrap_or_default();
            match safe_path(vault, &rel) {
                Some(abs) => {
                    if fs::write(&abs, &content).is_ok() {
                        broadcast(
                            clients,
                            &format!(
                                "{{\"type\":\"upsert\",\"rel\":\"{}\",\"content\":\"{}\",\"origin\":\"{}\"}}",
                                json_escape(&rel),
                                json_escape(&content),
                                json_escape(&origin)
                            ),
                        );
                        json(&mut stream, "200 OK", "{\"ok\":true}");
                    } else {
                        json(&mut stream, "500 Internal Server Error", "{\"error\":\"write\"}");
                    }
                }
                None => json(&mut stream, "400 Bad Request", "{\"error\":\"invalid path\"}"),
            }
        }
        ("POST", "/api/delete") => {
            let rel = json_str(&req.body, "rel").unwrap_or_default();
            let origin = json_str(&req.body, "clientId").unwrap_or_default();
            match safe_path(vault, &rel) {
                Some(abs) => {
                    let _ = fs::remove_file(&abs);
                    broadcast(
                        clients,
                        &format!(
                            "{{\"type\":\"delete\",\"rel\":\"{}\",\"origin\":\"{}\"}}",
                            json_escape(&rel),
                            json_escape(&origin)
                        ),
                    );
                    json(&mut stream, "200 OK", "{\"ok\":true}");
                }
                None => json(&mut stream, "400 Bad Request", "{\"error\":\"invalid path\"}"),
            }
        }
        ("GET", "/api/events") => {
            let head = format!("HTTP/1.1 200 OK\r\n{CORS}Content-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 3000\n\ndata: {{\"type\":\"hello\"}}\n\n");
            if stream.write_all(head.as_bytes()).is_ok() {
                // hand the still-open stream to the broadcaster; it lives until it errors on a write
                if let Ok(mut list) = clients.lock() {
                    list.push(stream);
                }
            }
        }
        _ => json(&mut stream, "404 Not Found", "{\"error\":\"unknown endpoint\"}"),
    }
    let _ = req.query; // reserved for future use
}

impl SyncServer {
    /// Bind 0.0.0.0:port and start serving in the background. Returns an error if the port is taken.
    pub fn start(vault: PathBuf, port: u16, token: String) -> std::io::Result<SyncServer> {
        let listener = TcpListener::bind(("0.0.0.0", port))?;
        listener.set_nonblocking(true)?;
        let stop = Arc::new(AtomicBool::new(false));
        let clients: Arc<Mutex<Vec<TcpStream>>> = Arc::new(Mutex::new(Vec::new()));

        // accept loop
        {
            let (vault_c, token_c, clients_c, stop_c) =
                (vault.clone(), token.clone(), clients.clone(), stop.clone());
            thread::spawn(move || {
                for incoming in listener.incoming() {
                    if stop_c.load(Ordering::Relaxed) {
                        break;
                    }
                    match incoming {
                        Ok(s) => {
                            let (v, t, c) = (vault_c.clone(), token_c.clone(), clients_c.clone());
                            thread::spawn(move || handle(s, &v, &t, &c));
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(120));
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        // keepalive: a ping every 25s doubles as a heartbeat for the client's reconnect watchdog
        {
            let (clients_c, stop_c) = (clients.clone(), stop.clone());
            thread::spawn(move || loop {
                for _ in 0..250 {
                    if stop_c.load(Ordering::Relaxed) {
                        return;
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                broadcast(&clients_c, "{\"type\":\"ping\"}");
            });
        }

        let _ = &vault; // vault is captured by the accept-loop closure above
        Ok(SyncServer { port, token, stop, clients })
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Ok(mut list) = self.clients.lock() {
            list.clear();
        }
    }
}

impl Drop for SyncServer {
    fn drop(&mut self) {
        self.stop();
    }
}

/// IPv4 addresses this machine is reachable at (LAN + Tailscale), best-effort, no dependencies.
pub fn local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    // a UDP "connect" doesn't send anything but picks the primary outbound interface address
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                ips.push(addr.ip().to_string());
            }
        }
    }
    ips
}
