// Inkwell — Rust backend: on-disk vault filesystem commands.
//
// The webview renders untrusted text (notes, web clips, imports, AI answers). So the vault root is
// owned here, not by JS: it is only ever set by the native folder picker (or restored from the
// file this side saved), and every note path is checked to stay inside it and end in `.md`.
mod attachments;
mod web;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

mod secrets;
mod backup;
mod folders;

/// Holds the live folder watcher so it keeps running; replacing it stops the previous watch.
struct WatcherState(Mutex<Option<RecommendedWatcher>>);

/// The open vault folder (canonical). None = no disk vault open.
pub(crate) struct VaultRoot(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct DiskNote {
    rel: String,
    content: String,
}

/// `rel` as a path inside `root`, or an error if it could leave the vault or isn't a `.md` file.
fn resolve_rel(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    let mut parts = 0;
    for c in rel_path.components() {
        match c {
            Component::Normal(_) => parts += 1,
            Component::CurDir => {}
            _ => return Err(format!("Path leaves the vault: {rel}")),
        }
    }
    // a bare `\\server\share` or `C:x` that Path didn't split as a prefix on this OS
    if parts == 0 || rel.contains(':') || rel.starts_with('\\') || rel.starts_with('/') {
        return Err(format!("Not a vault path: {rel}"));
    }
    let is_md = rel_path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    if !is_md || rel.ends_with('/') || rel.ends_with('\\') {
        return Err(format!("Only .md files can be changed: {rel}"));
    }
    Ok(root.join(rel_path))
}

/// After the parent folder exists: make sure it really is inside the vault (no junction/symlink escape).
pub(crate) fn check_parent_inside(root: &Path, full: &Path) -> Result<(), String> {
    let parent = full.parent().ok_or("No parent folder")?;
    let real = parent.canonicalize().map_err(|e| e.to_string())?;
    if real.starts_with(root) {
        Ok(())
    } else {
        Err("Path leaves the vault".into())
    }
}

pub(crate) fn current_root(state: &State<VaultRoot>) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No vault folder is open".to_string())
}

fn read_in(root: &Path) -> Result<Vec<DiskNote>, String> {
    let mut out: Vec<DiskNote> = Vec::new();
    walk(root, root, &mut out).map_err(|e| e.to_string())?;
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
        // file_type() does not follow links: skipping symlinks/junctions avoids loops and escapes
        let ft = entry.file_type()?;
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            walk(&p, root, out)?;
        } else if p
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("md"))
        {
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

fn write_in(root: &Path, rel: &str, content: &str) -> Result<(), String> {
    let full = resolve_rel(root, rel)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    check_parent_inside(root, &full)?;
    // write the new text next to the note, then swap it in: a crash or full disk mid-write leaves
    // the old note intact instead of a truncated one. The temp name starts with `.` and doesn't end
    // in `.md`, so neither the vault reader nor the watcher ever sees it.
    let name = full.file_name().ok_or("No file name")?.to_string_lossy().to_string();
    let tmp = full.with_file_name(format!(".{name}.inkwell-tmp"));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    if fs::rename(&tmp, &full).is_err() {
        // e.g. another app holds the note open without delete-sharing (Windows): save in place
        let _ = fs::remove_file(&tmp);
        fs::write(&full, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Deleting a note moves its file to the OS recycle bin / trash, so it can always be restored.
fn delete_in(root: &Path, rel: &str) -> Result<(), String> {
    let full = resolve_rel(root, rel)?;
    if full.exists() {
        check_parent_inside(root, &full)?;
        trash::delete(&full).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn rename_in(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let src = resolve_rel(root, from)?;
    let dst = resolve_rel(root, to)?;
    check_parent_inside(root, &src)?;
    // never replace another file (fs::rename overwrites on Windows); a case-only rename of the
    // same file is fine — it resolves to the same canonical path
    if dst.exists() && dst.canonicalize().ok() != src.canonicalize().ok() {
        return Err(format!("A file named {to} already exists"));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    check_parent_inside(root, &dst)?;
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

/// Where this side remembers the last vault folder (never taken from JS).
fn saved_root_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("vault-path.txt"))
}

pub(crate) fn set_root(app: &AppHandle, state: &State<VaultRoot>, dir: Option<PathBuf>) -> Result<Option<String>, String> {
    let canon = match dir {
        Some(d) => Some(d.canonicalize().map_err(|e| e.to_string())?),
        None => None,
    };
    if let Some(file) = saved_root_file(app) {
        match &canon {
            Some(d) => {
                if let Some(parent) = file.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&file, d.to_string_lossy().as_bytes());
            }
            None => {
                let _ = fs::remove_file(&file);
            }
        }
    }
    *state.0.lock().map_err(|e| e.to_string())? = canon.clone();
    Ok(canon.map(|d| d.to_string_lossy().to_string()))
}

/// Show the native folder picker and make the chosen folder the vault. Returns its path, or None.
#[tauri::command]
async fn pick_vault(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, VaultRoot>,
) -> Result<Option<String>, String> {
    // parented to the app window: modal, and opens over Inkwell instead of on the primary monitor
    let picked = app
        .dialog()
        .file()
        .set_title("Open a vault folder")
        .set_parent(&window)
        .blocking_pick_folder();
    let Some(picked) = picked else { return Ok(None) };
    let dir = picked.into_path().map_err(|e| e.to_string())?;
    if !dir.is_dir() {
        return Err("Not a folder".into());
    }
    set_root(&app, &state, Some(dir))
}

/// An arXiv id (new `1706.03762` or old `hep-th/9901001` style) — nothing that could add query
/// parameters or change the URL.
fn arxiv_id_ok(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 40
        && !id.contains("..")
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '/' | '-'))
}

/// arXiv's export API sends no CORS headers, so the webview can't read it; fetch it here.
#[tauri::command]
fn arxiv_query(id: String) -> Result<String, String> {
    if !arxiv_id_ok(&id) {
        return Err(format!("Not an arXiv id: {id}"));
    }
    ureq::get(&format!("https://export.arxiv.org/api/query?id_list={id}"))
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

/// Re-open the vault folder saved by the last `pick_vault`, if it still exists.
#[tauri::command]
fn restore_vault(app: AppHandle, state: State<VaultRoot>) -> Result<Option<String>, String> {
    let saved = saved_root_file(&app)
        .and_then(|f| fs::read_to_string(f).ok())
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| p.is_dir());
    match saved {
        Some(dir) => set_root(&app, &state, Some(dir)),
        None => Ok(None),
    }
}

/// Forget the vault folder.
#[tauri::command]
fn close_vault(app: AppHandle, state: State<VaultRoot>) -> Result<(), String> {
    set_root(&app, &state, None).map(|_| ())
}

/// Every `.md` file in the open vault: vault-relative path (forward-slashed) and text.
#[tauri::command]
fn read_vault(state: State<VaultRoot>) -> Result<Vec<DiskNote>, String> {
    read_in(&current_root(&state)?)
}

/// Write (creating parent dirs) one note file inside the open vault.
#[tauri::command]
fn write_note(rel: String, content: String, state: State<VaultRoot>) -> Result<(), String> {
    write_in(&current_root(&state)?, &rel, &content)
}

/// Delete one note file inside the open vault (a missing file is not an error).
#[tauri::command]
fn delete_note(rel: String, state: State<VaultRoot>) -> Result<(), String> {
    delete_in(&current_root(&state)?, &rel)
}

/// Move/rename a note file inside the open vault; refuses to replace an existing file.
#[tauri::command]
fn rename_note(from: String, to: String, state: State<VaultRoot>) -> Result<(), String> {
    rename_in(&current_root(&state)?, &from, &to)
}

/// Start watching the open vault folder recursively; emits `vault-fs-change` with the changed `.md`
/// paths whenever files are created, edited, or removed by anything on the system.
#[tauri::command]
fn watch_vault(app: AppHandle, roots: State<VaultRoot>, state: State<WatcherState>) -> Result<(), String> {
    let root = current_root(&roots)?;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WatcherState(Mutex::new(None)))
        .manage(VaultRoot(Mutex::new(None)))
        .setup(|app| {
            // system-wide hotkey: bring Inkwell to the front and open Quick Capture from anywhere
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.unminimize();
                                    let _ = w.set_focus();
                                }
                                let _ = app.emit("global-quick-capture", ());
                            }
                        })
                        .build(),
                )?;
                let _ = app.global_shortcut().register("CmdOrCtrl+Shift+Space");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_vault,
            restore_vault,
            close_vault,
            read_vault,
            write_note,
            delete_note,
            rename_note,
            watch_vault,
            unwatch_vault,
            arxiv_query,
            secrets::secret_set,
            secrets::secrets_get,
            secrets::secret_delete,
            web::fetch_page,
            attachments::write_attachment,
            attachments::read_attachment,
            folders::read_vault_dirs,
            folders::create_folder,
            folders::rename_folder,
            folders::delete_folder,
            backup::backup_vault,
            backup::list_backups,
            backup::restore_backup,
            backup::open_restored_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn rel_inside_the_vault_is_accepted() {
        let root = tmp_root("ok");
        let p = resolve_rel(&root, "Folder/Note.md").unwrap();
        assert_eq!(p, root.join("Folder").join("Note.md"));
        assert!(resolve_rel(&root, "a.MD").is_ok());
    }

    #[test]
    fn rel_escaping_the_vault_is_refused() {
        let root = tmp_root("escape");
        for bad in [
            "../x.md",
            "a/../../x.md",
            "C:/Windows/x.md",
            r"C:\Users\x.md",
            r"\\server\share\x.md",
            "/etc/x.md",
            "",
        ] {
            assert!(resolve_rel(&root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    #[test]
    fn only_markdown_files_can_be_touched() {
        let root = tmp_root("ext");
        for bad in ["a.bat", "a.exe", "a", "a.md.lnk", "folder/"] {
            assert!(resolve_rel(&root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    /// Put back whatever the tests sent to the recycle bin from `dir`, so test runs leave the
    /// real bin as they found it. Returns how many items came back.
    fn restore_from_bin(dir: &Path) -> usize {
        // the bin reports plain paths; ours are canonical (`\\?\C:\…` on Windows)
        let plain = |p: &Path| p.to_string_lossy().trim_start_matches("\\\\?\\").to_lowercase();
        let items: Vec<_> = trash::os_limited::list()
            .unwrap()
            .into_iter()
            .filter(|i| plain(&i.original_parent) == plain(dir))
            .collect();
        let n = items.len();
        if n > 0 {
            trash::os_limited::restore_all(items).unwrap();
        }
        n
    }

    #[test]
    fn write_read_delete_stay_in_the_vault() {
        let root = tmp_root("rw");
        write_in(&root, "sub/n.md", "hello").unwrap();
        let notes = read_in(&root).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].rel, "sub/n.md");
        assert_eq!(notes[0].content, "hello");
        assert!(write_in(&root, "../evil.md", "x").is_err());
        assert!(!root.parent().unwrap().join("evil.md").exists());
        delete_in(&root, "sub/n.md").unwrap();
        assert!(read_in(&root).unwrap().is_empty());
        restore_from_bin(&root.join("sub"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_sends_the_note_to_the_recycle_bin() {
        let root = tmp_root("trash");
        write_in(&root, "keep.md", "recover me").unwrap();
        delete_in(&root, "keep.md").unwrap();
        assert!(!root.join("keep.md").exists());
        // it is in the bin, and comes back from there with its text (the crate's restore may drop
        // the extension when Explorer hides extensions — restoring from Explorer itself does not)
        assert_eq!(restore_from_bin(&root), 1, "the deleted note should be in the recycle bin");
        let back: Vec<String> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| fs::read_to_string(e.unwrap().path()).ok())
            .collect();
        assert_eq!(back, vec!["recover me".to_string()]);
        // deleting outside the vault is still refused
        assert!(delete_in(&root, "../x.md").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn writes_replace_the_note_and_leave_no_temp_file() {
        let root = tmp_root("atomic");
        write_in(&root, "a.md", "one").unwrap();
        write_in(&root, "a.md", "two").unwrap();
        write_in(&root, "sub/b.md", "three").unwrap();
        assert_eq!(fs::read_to_string(root.join("a.md")).unwrap(), "two");
        let names = |d: &Path| -> Vec<String> {
            let mut v: Vec<String> = fs::read_dir(d)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
                .collect();
            v.sort();
            v
        };
        assert_eq!(names(&root), vec!["a.md", "sub"]);
        assert_eq!(names(&root.join("sub")), vec!["b.md"]);
        // the path checks still apply
        assert!(write_in(&root, "../evil.md", "x").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rename_never_overwrites_another_file() {
        let root = tmp_root("rename");
        write_in(&root, "a.md", "A").unwrap();
        write_in(&root, "b.md", "B").unwrap();
        assert!(rename_in(&root, "a.md", "b.md").is_err());
        assert_eq!(fs::read_to_string(root.join("b.md")).unwrap(), "B");
        rename_in(&root, "a.md", "c.md").unwrap();
        assert_eq!(fs::read_to_string(root.join("c.md")).unwrap(), "A");
        // a case-only rename of the same file is allowed
        rename_in(&root, "c.md", "C.md").unwrap();
        let names: Vec<String> = read_in(&root).unwrap().into_iter().map(|n| n.rel).collect();
        assert!(names.contains(&"C.md".to_string()), "{names:?}");
        assert!(names.contains(&"b.md".to_string()), "{names:?}");
    }
}

#[cfg(test)]
mod arxiv_tests {
    use super::arxiv_id_ok;

    #[test]
    fn arxiv_ids_are_accepted() {
        for ok in ["1706.03762", "2101.00001", "hep-th/9901001", "math.GT/0309136"] {
            assert!(arxiv_id_ok(ok), "{ok}");
        }
    }

    #[test]
    fn anything_that_could_change_the_request_is_refused() {
        for bad in ["", "1706.03762&max_results=9999", "x?y", "a#b", "../etc", "a b", "http://evil", &"9".repeat(41)] {
            assert!(!arxiv_id_ok(bad), "{bad}");
        }
    }
}
