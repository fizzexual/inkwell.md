// Inkwell — Rust backend: on-disk vault filesystem commands.
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_vault,
            write_note,
            delete_note,
            rename_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
