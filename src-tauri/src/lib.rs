// Inkwell — Rust backend: on-disk vault filesystem commands.
mod sync_server;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

/// Holds the live folder watcher so it keeps running; replacing it stops the previous watch.
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

/// Holds the embedded sync server while it's running (device sharing).
struct SyncState(Mutex<Option<sync_server::SyncServer>>);

#[derive(Serialize)]
struct SyncInfo {
    running: bool,
    port: u16,
    token: String,
    /// full URLs a device can connect to, e.g. http://192.168.1.20:8787
    urls: Vec<String>,
}

/// A stable per-vault token: read `.inkwell-sync-token` if present, else make one and save it.
fn vault_token(vault: &Path) -> String {
    let file = vault.join(".inkwell-sync-token");
    if let Ok(saved) = fs::read_to_string(&file) {
        let t = saved.trim().to_string();
        if !t.is_empty() {
            return t;
        }
    }
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let token = format!("{:016x}", (nanos as u64) ^ (std::process::id() as u64).rotate_left(21));
    let _ = fs::create_dir_all(vault);
    let _ = fs::write(&file, &token);
    token
}

#[derive(Serialize)]
struct DiskNote {
    rel: String,
    content: String,
}

/// Recursively read every `.md` file under `path`, returning each file's
/// vault-relative path (forward-slashed) and its text.
#[tauri::command]
fn read_vault(path: String) -> Result<Vec<DiskNote>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("Not a folder".into());
    }
    let mut out: Vec<DiskNote> = Vec::new();
    walk(&root, &root, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<DiskNote>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let p = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        if p.is_dir() {
            walk(&p, root, out)?;
        } else if p.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(content) = fs::read_to_string(&p) {
                let rel = p
                    .strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push(DiskNote { rel, content });
            }
        }
    }
    Ok(())
}

/// Write (creating parent dirs) a single note file at `path`/`rel`.
#[tauri::command]
fn write_note(path: String, rel: String, content: String) -> Result<(), String> {
    let full = PathBuf::from(&path).join(&rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, content).map_err(|e| e.to_string())
}

/// Delete a note file if it exists (a missing file is not an error).
#[tauri::command]
fn delete_note(path: String, rel: String) -> Result<(), String> {
    let full = PathBuf::from(&path).join(&rel);
    if full.exists() {
        fs::remove_file(&full).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Move/rename a note file from one relative path to another.
#[tauri::command]
fn rename_note(path: String, from: String, to: String) -> Result<(), String> {
    let root = PathBuf::from(&path);
    let src = root.join(&from);
    let dst = root.join(&to);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

/// Start watching a vault folder recursively; emits `vault-fs-change` with the changed `.md`
/// paths whenever files are created, edited, or removed by anything on the system.
#[tauri::command]
fn watch_vault(path: String, app: AppHandle, state: State<WatcherState>) -> Result<(), String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("Not a folder".into());
    }
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            let touched: Vec<String> = event
                .paths
                .iter()
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if !touched.is_empty() {
                let _ = handle.emit("vault-fs-change", touched);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

/// Stop watching the current vault folder (dropping the watcher ends the OS-level watch).
#[tauri::command]
fn unwatch_vault(state: State<WatcherState>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Start sharing a vault folder over the local network so other devices can sync to it.
#[tauri::command]
fn start_sync(vault: String, port: Option<u16>, state: State<SyncState>) -> Result<SyncInfo, String> {
    let vault_path = PathBuf::from(&vault);
    if !vault_path.is_dir() {
        fs::create_dir_all(&vault_path).map_err(|e| e.to_string())?;
    }
    let port = port.unwrap_or(8787);
    let token = vault_token(&vault_path);
    let server = sync_server::SyncServer::start(vault_path, port, token.clone())
        .map_err(|e| format!("Couldn't start on port {port}: {e}"))?;
    let info = SyncInfo {
        running: true,
        port,
        token,
        urls: sync_server::local_ips()
            .iter()
            .map(|ip| format!("http://{ip}:{port}"))
            .collect(),
    };
    *state.0.lock().map_err(|e| e.to_string())? = Some(server);
    Ok(info)
}

/// Stop sharing (dropping the server ends its background threads).
#[tauri::command]
fn stop_sync(state: State<SyncState>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Current sharing state + connect info for the UI.
#[tauri::command]
fn sync_status(state: State<SyncState>) -> SyncInfo {
    if let Ok(guard) = state.0.lock() {
        if let Some(s) = guard.as_ref() {
            return SyncInfo {
                running: true,
                port: s.port,
                token: s.token.clone(),
                urls: sync_server::local_ips()
                    .iter()
                    .map(|ip| format!("http://{ip}:{}", s.port))
                    .collect(),
            };
        }
    }
    SyncInfo { running: false, port: 0, token: String::new(), urls: vec![] }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState(Mutex::new(None)))
        .manage(SyncState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            read_vault,
            write_note,
            delete_note,
            rename_note,
            watch_vault,
            unwatch_vault,
            start_sync,
            stop_sync,
            sync_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
