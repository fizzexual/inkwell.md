// The offline chat model: downloaded on demand, then served to the webview from disk.
//
// The weights are NOT bundled (the installer stays small). When the user clicks "Download", Rust —
// not the webview, whose CSP has no Hugging Face — fetches the files pinned in
// src/ml/chat-model.json (fixed revision, exact size + sha256) into
// `<app_data_dir>/models/<org>/<name>/`. A file is written as `<name>.part` (resumed with an HTTP
// Range request after a cancel or a dropped connection) and only renamed to its real name once its
// size and hash match, so a partial or corrupt file is never used.
//
// The chat worker then loads the model through the `inkmodel` URI scheme
// (`http://inkmodel.localhost/<org>/<name>/<file>` on Windows). That handler serves exactly the
// pinned files of that one model and nothing else: the URL path must equal `/<id>/<file path>` of a
// manifest entry, so no path from the webview is ever joined onto the disk path.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

/// The URI scheme the chat worker loads the model from.
pub const SCHEME: &str = "inkmodel";
/// Download progress, emitted to the webview.
const PROGRESS_EVENT: &str = "offline-model-progress";

#[derive(Deserialize, Clone, Debug)]
pub(crate) struct ModelFile {
    path: String,
    size: u64,
    sha256: String,
}

#[derive(Deserialize, Clone, Debug)]
pub(crate) struct Manifest {
    id: String,
    revision: String,
    files: Vec<ModelFile>,
}

impl Manifest {
    fn total(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
}

/// The pinned chat model (shared with the TypeScript side).
fn manifest() -> &'static Manifest {
    static M: OnceLock<Manifest> = OnceLock::new();
    M.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/ml/chat-model.json")).expect("chat-model.json is valid")
    })
}

/// `<root>/<org>/<name>` — the one folder this model lives in (and Delete removes).
fn model_dir(root: &Path, m: &Manifest) -> PathBuf {
    m.id.split('/').fold(root.to_path_buf(), |p, s| p.join(s))
}

fn file_path(dir: &Path, f: &ModelFile) -> PathBuf {
    f.path.split('/').fold(dir.to_path_buf(), |p, s| p.join(s))
}

fn part_path(dest: &Path) -> PathBuf {
    let mut s = dest.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}

/// The pinned (revision, never "main") download URL of a file.
fn remote_url(m: &Manifest, f: &ModelFile) -> String {
    format!("https://huggingface.co/{}/resolve/{}/{}", m.id, m.revision, f.path)
}

fn size_of(p: &Path) -> Option<u64> {
    fs::metadata(p).ok().filter(|md| md.is_file()).map(|md| md.len())
}

/// Ok when the file at `p` has the pinned size and sha256.
fn verify_file(p: &Path, f: &ModelFile) -> Result<(), String> {
    let got = size_of(p).ok_or_else(|| format!("{}: missing", f.path))?;
    if got != f.size {
        return Err(format!("{}: size {got}, expected {}", f.path, f.size));
    }
    let mut file = File::open(p).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let hex: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if hex != f.sha256 {
        return Err(format!("{}: sha256 {hex}, expected {}", f.path, f.sha256));
    }
    Ok(())
}

/// Every pinned file is in place under its real name with its exact size. (Hashes are checked
/// when a file is downloaded; only verified files ever get their real name.)
fn is_installed(dir: &Path, m: &Manifest) -> bool {
    m.files.iter().all(|f| size_of(&file_path(dir, f)) == Some(f.size))
}

/// Bytes this model takes on disk, including partial downloads.
fn bytes_on_disk(dir: &Path) -> u64 {
    fn walk(p: &Path) -> u64 {
        let Ok(rd) = fs::read_dir(p) else { return 0 };
        rd.flatten()
            .map(|e| match e.file_type() {
                Ok(t) if t.is_dir() => walk(&e.path()),
                Ok(t) if t.is_file() => e.metadata().map(|m| m.len()).unwrap_or(0),
                _ => 0,
            })
            .sum()
    }
    walk(dir)
}

/// A started HTTP download: the status and a body reader.
pub(crate) struct Fetched {
    status: u16,
    body: Box<dyn Read + Send>,
}

/// GET `url`, asking for the bytes from `from` on when `from > 0` (fakes in tests).
pub(crate) trait Fetcher {
    fn get(&self, url: &str, from: u64) -> Result<Fetched, String>;
}

/// The real network: ureq, which keeps the Range header across Hugging Face's CDN redirect.
struct Http(ureq::Agent);

impl Fetcher for Http {
    fn get(&self, url: &str, from: u64) -> Result<Fetched, String> {
        let mut req = self.0.get(url).set("User-Agent", "Inkwell");
        if from > 0 {
            req = req.set("Range", &format!("bytes={from}-"));
        }
        match req.call() {
            Ok(resp) => Ok(Fetched { status: resp.status(), body: Box::new(resp.into_reader()) }),
            // the server no longer accepts our offset: the caller restarts the file
            Err(ureq::Error::Status(416, _)) => Ok(Fetched { status: 416, body: Box::new(std::io::empty()) }),
            Err(ureq::Error::Status(code, _)) => Err(format!("HTTP {code} for {url}")),
            Err(e) => Err(format!("Download failed: {e}")),
        }
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Progress {
    received: u64,
    total: u64,
}

/// Download every missing file of `m` into `dir`. Resumes `.part` files, verifies each file before
/// giving it its real name, and stops (keeping the `.part`) as soon as `cancel` is set.
pub(crate) fn download_into(
    dir: &Path,
    m: &Manifest,
    fetcher: &dyn Fetcher,
    cancel: &AtomicBool,
    on_progress: &mut dyn FnMut(Progress),
) -> Result<(), String> {
    let total = m.total();
    let mut done: u64 = 0; // bytes of files already complete
    for f in &m.files {
        let dest = file_path(dir, f);
        if size_of(&dest) == Some(f.size) {
            done += f.size;
            on_progress(Progress { received: done, total });
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let part = part_path(&dest);
        let mut have = size_of(&part).unwrap_or(0);
        if have > f.size {
            have = 0; // longer than the file can be: start over
        }
        if have < f.size {
            let res = fetcher.get(&remote_url(m, f), have)?;
            let resumed = have > 0 && res.status == 206;
            let mut out = match res.status {
                // 206 continues the .part; a 200 (range ignored) or 416 (offset refused) restarts it
                206 if resumed => OpenOptions::new().append(true).open(&part),
                200 | 206 | 416 => File::create(&part),
                s => return Err(format!("HTTP {s} for {}", f.path)),
            }
            .map_err(|e| e.to_string())?;
            if !resumed {
                have = 0;
            }
            if res.status == 416 {
                drop(out);
                let _ = fs::remove_file(&part);
                return Err(format!("{}: the server refused to resume; click Download again", f.path));
            }
            let mut body = res.body;
            let mut buf = vec![0u8; 256 * 1024];
            let mut last = Instant::now();
            loop {
                if cancel.load(Ordering::SeqCst) {
                    out.flush().map_err(|e| e.to_string())?;
                    return Err("Download cancelled".into());
                }
                let n = match body.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => n,
                    Err(e) if e.kind() == ErrorKind::Interrupted => continue,
                    Err(e) => return Err(format!("Download interrupted ({e}); click Download to resume")),
                };
                have += n as u64;
                if have > f.size {
                    drop(out);
                    let _ = fs::remove_file(&part);
                    return Err(format!("{}: more bytes than the pinned size {}", f.path, f.size));
                }
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                if last.elapsed() >= Duration::from_millis(150) {
                    last = Instant::now();
                    on_progress(Progress { received: done + have, total });
                }
            }
            out.flush().map_err(|e| e.to_string())?;
        }
        // a wrong file is thrown away (never renamed into place), so the next try starts clean
        if let Err(e) = verify_file(&part, f) {
            let _ = fs::remove_file(&part);
            return Err(format!("Download check failed — {e}"));
        }
        fs::rename(&part, &dest).map_err(|e| e.to_string())?;
        done += f.size;
        on_progress(Progress { received: done, total });
    }
    Ok(())
}

/// The file a request for `url_path` may read: only the exact `/<id>/<file>` of a pinned file.
pub(crate) fn resolve_request(root: &Path, m: &Manifest, url_path: &str) -> Option<(PathBuf, u64)> {
    let f = m.files.iter().find(|f| url_path == format!("/{}/{}", m.id, f.path))?;
    let p = file_path(&model_dir(root, m), f);
    // a file that isn't complete yet is not served
    (size_of(&p) == Some(f.size)).then_some((p, f.size))
}

/// `Range: bytes=a-b` / `bytes=a-` / `bytes=-n` as an inclusive (start, end) inside `len`.
pub(crate) fn parse_range(h: &str, len: u64) -> Option<(u64, u64)> {
    let spec = h.trim().strip_prefix("bytes=")?;
    if spec.contains(',') || len == 0 {
        return None; // multi-range: not needed, served as the whole file
    }
    let (a, b) = spec.split_once('-')?;
    let (a, b) = (a.trim(), b.trim());
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        if n == 0 {
            return None;
        }
        (len.saturating_sub(n), len - 1)
    } else {
        let s: u64 = a.parse().ok()?;
        let e = if b.is_empty() { len - 1 } else { b.parse::<u64>().ok()?.min(len - 1) };
        (s, e)
    };
    (start <= end && start < len).then_some((start, end))
}

fn content_type(path: &str) -> &'static str {
    if path.ends_with(".json") {
        "application/json"
    } else {
        "application/octet-stream"
    }
}

/// Answer one `inkmodel` request (runs off the main thread).
pub(crate) fn respond(root: &Path, m: &Manifest, req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let base = || {
        Response::builder()
            // model weights are public and read-only; the chat worker's origin differs per platform
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Length, Content-Range, Accept-Ranges")
            .header(header::CACHE_CONTROL, "no-store")
    };
    let fail = |code: StatusCode| base().status(code).body(Vec::new()).expect("valid response");
    if req.method() == "OPTIONS" {
        return base()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET")
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
            .body(Vec::new())
            .expect("valid response");
    }
    if req.method() != "GET" {
        return fail(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = req.uri().path();
    let Some((file, len)) = resolve_request(root, m, path) else {
        return fail(StatusCode::NOT_FOUND);
    };
    let range = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok());
    let read = |start: u64, end: u64| -> std::io::Result<Vec<u8>> {
        let mut fh = File::open(&file)?;
        fh.seek(SeekFrom::Start(start))?;
        let mut buf = vec![0u8; (end - start + 1) as usize];
        fh.read_exact(&mut buf)?;
        Ok(buf)
    };
    let ok = base()
        .header(header::CONTENT_TYPE, content_type(path))
        .header(header::ACCEPT_RANGES, "bytes");
    match range {
        Some(h) => match parse_range(h, len) {
            Some((s, e)) => match read(s, e) {
                Ok(body) => ok
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_RANGE, format!("bytes {s}-{e}/{len}"))
                    .header(header::CONTENT_LENGTH, body.len())
                    .body(body),
                Err(_) => return fail(StatusCode::INTERNAL_SERVER_ERROR),
            },
            None => base()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{len}"))
                .body(Vec::new()),
        },
        None => match fs::read(&file) {
            Ok(body) => ok.status(StatusCode::OK).header(header::CONTENT_LENGTH, body.len()).body(body),
            Err(_) => return fail(StatusCode::INTERNAL_SERVER_ERROR),
        },
    }
    .expect("valid response")
}

fn models_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"))
}

/// The `inkmodel://` handler registered in lib.rs.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let root = models_root(ctx.app_handle());
    std::thread::spawn(move || {
        let res = match root {
            Ok(root) => respond(&root, manifest(), &req),
            Err(_) => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).expect("valid response"),
        };
        responder.respond(res);
    });
}

/// One download at a time; Cancel flips `cancel`.
#[derive(Default)]
pub struct DownloadState {
    busy: AtomicBool,
    cancel: AtomicBool,
}

#[derive(Serialize)]
pub struct Status {
    installed: bool,
    downloading: bool,
    bytes_on_disk: u64,
    total_bytes: u64,
}

fn status_of<R: Runtime>(app: &AppHandle<R>, state: &DownloadState) -> Result<Status, String> {
    let m = manifest();
    let dir = model_dir(&models_root(app)?, m);
    Ok(Status {
        installed: is_installed(&dir, m),
        downloading: state.busy.load(Ordering::SeqCst),
        bytes_on_disk: bytes_on_disk(&dir),
        total_bytes: m.total(),
    })
}

#[tauri::command]
pub fn offline_model_status(app: AppHandle, state: tauri::State<'_, DownloadState>) -> Result<Status, String> {
    status_of(&app, &state)
}

/// Download (or resume) the pinned model files; emits `offline-model-progress` while it runs.
#[tauri::command]
pub async fn offline_model_download(app: AppHandle) -> Result<Status, String> {
    let task = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = task.state::<DownloadState>();
        if state.busy.swap(true, Ordering::SeqCst) {
            return Err("The model is already downloading".to_string());
        }
        state.cancel.store(false, Ordering::SeqCst);
        let result = models_root(&task).and_then(|root| {
            let m = manifest();
            let agent = ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(20))
                .timeout_read(Duration::from_secs(60))
                .build();
            let mut emit = |p: Progress| {
                let _ = task.emit(PROGRESS_EVENT, p);
            };
            download_into(&model_dir(&root, m), m, &Http(agent), &state.cancel, &mut emit)
        });
        state.busy.store(false, Ordering::SeqCst);
        result.and_then(|()| status_of(&task, &state))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn offline_model_cancel(state: tauri::State<'_, DownloadState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// Remove the model folder (finished and partial files); returns the bytes freed.
#[tauri::command(async)]
pub fn offline_model_delete(app: AppHandle, state: tauri::State<'_, DownloadState>) -> Result<u64, String> {
    if state.busy.load(Ordering::SeqCst) {
        return Err("Cancel the download first".into());
    }
    let dir = model_dir(&models_root(&app)?, manifest());
    let freed = bytes_on_disk(&dir);
    match fs::remove_dir_all(&dir) {
        Ok(()) => Ok(freed),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(0),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn sha(bytes: &[u8]) -> String {
        Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
    }

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-offline-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    const A: &[u8] = b"{\"model_type\":\"qwen2\"}";
    const B: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

    fn manifest_for(files: &[(&str, &[u8])]) -> Manifest {
        Manifest {
            id: "org/tiny-chat".into(),
            revision: "0123abcd".into(),
            files: files
                .iter()
                .map(|(p, b)| ModelFile { path: (*p).into(), size: b.len() as u64, sha256: sha(b) })
                .collect(),
        }
    }

    /// Serves fixed bytes per URL; honours Range unless `ignore_range`; records every request.
    struct Fake {
        files: Vec<(String, Vec<u8>)>,
        ignore_range: bool,
        calls: Mutex<Vec<(String, u64)>>,
    }

    impl Fake {
        fn new(m: &Manifest, bodies: &[&[u8]]) -> Fake {
            Fake {
                files: m.files.iter().zip(bodies).map(|(f, b)| (remote_url(m, f), b.to_vec())).collect(),
                ignore_range: false,
                calls: Mutex::new(Vec::new()),
            }
        }
    }

    impl Fetcher for Fake {
        fn get(&self, url: &str, from: u64) -> Result<Fetched, String> {
            self.calls.lock().unwrap().push((url.to_string(), from));
            let body = self.files.iter().find(|(u, _)| u == url).ok_or("404")?.1.clone();
            if from > 0 && !self.ignore_range {
                return Ok(Fetched { status: 206, body: Box::new(std::io::Cursor::new(body[from as usize..].to_vec())) });
            }
            Ok(Fetched { status: 200, body: Box::new(std::io::Cursor::new(body)) })
        }
    }

    fn run(dir: &Path, m: &Manifest, f: &dyn Fetcher) -> (Result<(), String>, Vec<Progress>) {
        let mut seen = Vec::new();
        let r = download_into(dir, m, f, &AtomicBool::new(false), &mut |p| seen.push(p));
        (r, seen)
    }

    #[test]
    fn downloads_verifies_and_installs_every_pinned_file() {
        let root = tmp("ok");
        let m = manifest_for(&[("config.json", A), ("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        let (r, seen) = run(&dir, &m, &Fake::new(&m, &[A, B]));
        r.unwrap();
        assert_eq!(fs::read(dir.join("onnx").join("model.onnx")).unwrap(), B);
        assert!(is_installed(&dir, &m));
        assert!(!part_path(&dir.join("onnx").join("model.onnx")).exists());
        assert_eq!(seen.last(), Some(&Progress { received: m.total(), total: m.total() }));
        // the pinned revision is in every URL, never "main"
        assert!(remote_url(&m, &m.files[1]).ends_with("/org/tiny-chat/resolve/0123abcd/onnx/model.onnx"));
    }

    #[test]
    fn a_file_with_the_wrong_hash_is_rejected_and_never_installed() {
        let root = tmp("hash");
        let m = manifest_for(&[("config.json", A), ("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        let mut evil = B.to_vec();
        evil[3] ^= 1; // same size, different bytes
        let (r, _) = run(&dir, &m, &Fake::new(&m, &[A, &evil]));
        assert!(r.unwrap_err().contains("sha256"));
        let dest = dir.join("onnx").join("model.onnx");
        assert!(!dest.exists() && !part_path(&dest).exists());
        assert!(!is_installed(&dir, &m));
    }

    #[test]
    fn a_file_with_the_wrong_size_is_rejected() {
        let root = tmp("size");
        let m = manifest_for(&[("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        // short
        let (r, _) = run(&dir, &m, &Fake::new(&m, &[&B[..10]]));
        assert!(r.unwrap_err().contains("size"));
        // long
        let long = [B, b"extra"].concat();
        let (r, _) = run(&dir, &m, &Fake::new(&m, &[&long]));
        assert!(r.unwrap_err().contains("pinned size"));
        assert!(!is_installed(&dir, &m));
        assert!(!part_path(&dir.join("onnx").join("model.onnx")).exists());
    }

    #[test]
    fn a_partial_download_is_not_used_but_is_resumed() {
        let root = tmp("resume");
        let m = manifest_for(&[("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        let dest = dir.join("onnx").join("model.onnx");
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(part_path(&dest), &B[..12]).unwrap();
        // half a file is neither installed nor served
        assert!(!is_installed(&dir, &m));
        assert!(resolve_request(&root, &m, "/org/tiny-chat/onnx/model.onnx").is_none());

        let fake = Fake::new(&m, &[B]);
        run(&dir, &m, &fake).0.unwrap();
        assert_eq!(fake.calls.lock().unwrap()[0].1, 12, "asked only for the missing bytes");
        assert_eq!(fs::read(&dest).unwrap(), B);
        assert!(resolve_request(&root, &m, "/org/tiny-chat/onnx/model.onnx").is_some());
    }

    #[test]
    fn a_server_that_ignores_range_restarts_the_file_cleanly() {
        let root = tmp("norange");
        let m = manifest_for(&[("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        let dest = dir.join("onnx").join("model.onnx");
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(part_path(&dest), &B[..12]).unwrap();
        let mut fake = Fake::new(&m, &[B]);
        fake.ignore_range = true;
        run(&dir, &m, &fake).0.unwrap();
        assert_eq!(fs::read(&dest).unwrap(), B, "not the first 12 bytes twice");
    }

    #[test]
    fn cancel_stops_and_keeps_the_part_for_a_resume() {
        let root = tmp("cancel");
        let m = manifest_for(&[("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        let r = download_into(&dir, &m, &Fake::new(&m, &[B]), &AtomicBool::new(true), &mut |_| {});
        assert_eq!(r.unwrap_err(), "Download cancelled");
        assert!(!is_installed(&dir, &m));
    }

    #[test]
    fn files_already_in_place_are_not_downloaded_again() {
        let root = tmp("skip");
        let m = manifest_for(&[("config.json", A), ("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        run(&dir, &m, &Fake::new(&m, &[A, B])).0.unwrap();
        let fake = Fake::new(&m, &[A, B]);
        run(&dir, &m, &fake).0.unwrap();
        assert!(fake.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn the_scheme_serves_only_the_pinned_files_of_the_model() {
        let root = tmp("scope");
        let m = manifest_for(&[("config.json", A), ("onnx/model.onnx", B)]);
        let dir = model_dir(&root, &m);
        run(&dir, &m, &Fake::new(&m, &[A, B])).0.unwrap();
        // things that exist next to / above the model but are not pinned files
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        fs::write(root.join("secret.txt"), b"x").unwrap();

        let (p, len) = resolve_request(&root, &m, "/org/tiny-chat/onnx/model.onnx").unwrap();
        assert!(p.starts_with(&dir) && len == B.len() as u64);
        for bad in [
            "/org/tiny-chat/notes.txt",
            "/org/tiny-chat/../secret.txt",
            "/org/tiny-chat/onnx/../config.json",
            "/org/tiny-chat/onnx%2fmodel.onnx",
            "/org/tiny-chat/onnx\\model.onnx",
            "/org/tiny-chat/onnx/model.onnx.part",
            "/secret.txt",
            "/org/other/config.json",
            "/C:/Windows/win.ini",
            "//org/tiny-chat/config.json",
            "/org/tiny-chat/",
            "",
        ] {
            assert!(resolve_request(&root, &m, bad).is_none(), "{bad} must not be served");
        }
    }

    #[test]
    fn the_handler_answers_range_requests_and_404s_everything_else() {
        let root = tmp("respond");
        let m = manifest_for(&[("config.json", A), ("onnx/model.onnx", B)]);
        run(&model_dir(&root, &m), &m, &Fake::new(&m, &[A, B])).0.unwrap();
        let get = |path: &str, range: Option<&str>| {
            let mut r = Request::builder().method("GET").uri(format!("http://inkmodel.localhost{path}"));
            if let Some(h) = range {
                r = r.header("Range", h);
            }
            respond(&root, &m, &r.body(Vec::new()).unwrap())
        };
        let full = get("/org/tiny-chat/config.json", None);
        assert_eq!(full.status(), 200);
        assert_eq!(full.body().as_slice(), A);
        assert_eq!(full.headers()["content-type"], "application/json");

        // transformers.js probes sizes with `Range: bytes=0-0`; must not read the whole file
        let probe = get("/org/tiny-chat/onnx/model.onnx", Some("bytes=0-0"));
        assert_eq!(probe.status(), 206);
        assert_eq!(probe.body().as_slice(), b"0");
        assert_eq!(probe.headers()["content-range"], format!("bytes 0-0/{}", B.len()));

        assert_eq!(get("/org/tiny-chat/onnx/model.onnx", Some("bytes=999-")).status(), 416);
        assert_eq!(get("/org/tiny-chat/../../secret.txt", None).status(), 404);
        let post = Request::builder().method("POST").uri("http://inkmodel.localhost/org/tiny-chat/config.json");
        assert_eq!(respond(&root, &m, &post.body(Vec::new()).unwrap()).status(), 405);
    }

    #[test]
    fn range_headers_parse_like_http_says() {
        assert_eq!(parse_range("bytes=0-0", 10), Some((0, 0)));
        assert_eq!(parse_range("bytes=2-", 10), Some((2, 9)));
        assert_eq!(parse_range("bytes=2-100", 10), Some((2, 9)));
        assert_eq!(parse_range("bytes=-3", 10), Some((7, 9)));
        assert_eq!(parse_range("bytes=10-", 10), None);
        assert_eq!(parse_range("bytes=5-2", 10), None);
        assert_eq!(parse_range("bytes=0-1,4-5", 10), None);
        assert_eq!(parse_range("items=0-1", 10), None);
        assert_eq!(parse_range("bytes=-0", 10), None);
    }

    #[test]
    fn the_pinned_manifest_is_a_fixed_revision_with_a_hash_per_file() {
        let m = manifest();
        assert_eq!(m.revision.len(), 40, "a full commit sha, not a branch");
        assert!(m.revision.bytes().all(|b| b.is_ascii_hexdigit()));
        assert!(!m.files.is_empty());
        for f in &m.files {
            assert_eq!(f.sha256.len(), 64, "{}", f.path);
            assert!(f.size > 0);
            assert!(!f.path.contains("..") && !f.path.starts_with('/') && !f.path.contains('\\'));
        }
    }

    // Real network, real Hugging Face: `cargo test -- --ignored offline_model`. Fetches the small
    // pinned files (not the weights) and checks a Range resume through the CDN redirect.
    #[test]
    #[ignore]
    fn real_download_of_the_small_pinned_files() {
        let root = tmp("real");
        let full = manifest();
        let small = Manifest {
            id: full.id.clone(),
            revision: full.revision.clone(),
            files: full.files.iter().filter(|f| f.size < 20_000_000).cloned().collect(),
        };
        let dir = model_dir(&root, &small);
        // the tokenizer is an LFS file: its download goes through the CDN redirect
        let first = small.files.iter().max_by_key(|f| f.size).unwrap();
        let dest = file_path(&dir, first);
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        // pretend an earlier attempt got half of the first file
        let agent = ureq::AgentBuilder::new().build();
        let mut half = Vec::new();
        Http(agent.clone()).get(&remote_url(&small, first), 0).unwrap().body.read_to_end(&mut half).unwrap();
        fs::write(part_path(&dest), &half[..half.len() / 2]).unwrap();
        // a resumed request must get 206 (else the whole file would be fetched again)
        assert_eq!(Http(agent.clone()).get(&remote_url(&small, first), 10).unwrap().status, 206);
        download_into(&dir, &small, &Http(agent), &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert!(is_installed(&dir, &small));
    }
}
