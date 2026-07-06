// Inkwell — Rust backend: on-disk vault filesystem commands.
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Holds the live folder watcher so it keeps running; replacing it stops the previous watch.
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            read_vault,
            write_note,
            delete_note,
            rename_note,
            watch_vault,
            unwatch_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
