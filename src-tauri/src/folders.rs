// Folder commands for on-disk vaults: list, create, rename/move, and delete (to the recycle bin).
//
// Same rules as the note commands: a folder path comes from JS as vault-relative text, and is
// checked to stay inside the vault root Rust owns — no `..`, nothing absolute, no junction escape.
use crate::{check_parent_inside, current_root, VaultRoot};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::State;

/// `rel` as a folder path inside `root`, or an error if it could leave the vault. Hidden names
/// (`.git`), `node_modules`, and names Windows would silently trim (`a.`, `a `) are refused too:
/// the vault reader skips the first two, and the last would land on a different folder.
pub(crate) fn resolve_dir(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    let mut parts = 0;
    for c in rel_path.components() {
        match c {
            Component::Normal(name) => {
                let name = name.to_string_lossy();
                if name.starts_with('.') || name == "node_modules" || name.ends_with('.') || name.ends_with(' ') {
                    return Err(format!("Not a folder name Inkwell can use: {name}"));
                }
                parts += 1;
            }
            Component::CurDir => {}
            _ => return Err(format!("Path leaves the vault: {rel}")),
        }
    }
    // a bare `\\server\share` or `C:x` that Path didn't split as a prefix on this OS
    if parts == 0 || rel.contains(':') || rel.starts_with('\\') || rel.starts_with('/') {
        return Err(format!("Not a vault folder: {rel}"));
    }
    Ok(root.join(rel_path))
}

/// A real folder (not a junction/symlink) that exists inside the vault.
fn existing_dir(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let full = resolve_dir(root, rel)?;
    let meta = fs::symlink_metadata(&full).map_err(|_| format!("No folder named {rel}"))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err(format!("{rel} is not a folder"));
    }
    check_parent_inside(root, &full)?;
    Ok(full)
}

/// Make `dir` and its missing parents, but only below a folder that is really inside the vault
/// (the deepest existing one is resolved, so a junction pointing out is caught before anything
/// is created through it).
fn make_dirs_inside(root: &Path, dir: &Path) -> Result<(), String> {
    let mut existing = dir;
    while fs::symlink_metadata(existing).is_err() {
        existing = existing.parent().ok_or("No parent folder")?;
    }
    let real = existing.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root) {
        return Err("Path leaves the vault".into());
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())
}

/// Lowercased path parts, for the case-insensitive comparisons NTFS/APFS make.
fn parts_lc(rel: &str) -> Vec<String> {
    Path::new(rel)
        .components()
        .filter_map(|c| match c {
            Component::Normal(n) => Some(n.to_string_lossy().to_lowercase()),
            _ => None,
        })
        .collect()
}

fn list_in(root: &Path) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    walk_dirs(root, root, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn walk_dirs(dir: &Path, root: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        // file_type() does not follow links: junctions/symlinks are never listed or walked into
        let ft = entry.file_type()?;
        if ft.is_dir() && !ft.is_symlink() {
            let p = entry.path();
            out.push(p.strip_prefix(root).unwrap_or(&p).to_string_lossy().replace('\\', "/"));
            walk_dirs(&p, root, out)?;
        }
    }
    Ok(())
}

fn create_in(root: &Path, rel: &str) -> Result<(), String> {
    let full = resolve_dir(root, rel)?;
    if fs::symlink_metadata(&full).is_ok() {
        return Err(format!("A folder or file named {rel} already exists"));
    }
    make_dirs_inside(root, &full)
}

fn rename_in(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let src = existing_dir(root, from)?;
    let dst = resolve_dir(root, to)?;
    let (a, b) = (parts_lc(from), parts_lc(to));
    if b.len() > a.len() && b.starts_with(&a) {
        return Err("A folder can't be moved into itself".into());
    }
    // never replace anything (a case-only rename of the same folder resolves to the same path)
    if fs::symlink_metadata(&dst).is_ok() && dst.canonicalize().ok() != src.canonicalize().ok() {
        return Err(format!("A folder or file named {to} already exists"));
    }
    make_dirs_inside(root, dst.parent().ok_or("No parent folder")?)?;
    check_parent_inside(root, &dst)?;
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

/// Deleting a folder moves it, notes and all, to the OS recycle bin, so it can be restored.
fn delete_in(root: &Path, rel: &str) -> Result<(), String> {
    let full = resolve_dir(root, rel)?;
    if fs::symlink_metadata(&full).is_err() {
        return Ok(());
    }
    let full = existing_dir(root, rel)?;
    trash::delete(&full).map_err(|e| e.to_string())
}

/// Every folder in the open vault (vault-relative, forward-slashed), including empty ones.
#[tauri::command(async)]
pub(crate) fn read_vault_dirs(state: State<VaultRoot>) -> Result<Vec<String>, String> {
    list_in(&current_root(&state)?)
}

/// Make a folder (and any missing parents) inside the open vault; refuses one that exists.
#[tauri::command(async)]
pub(crate) fn create_folder(rel: String, state: State<VaultRoot>) -> Result<(), String> {
    create_in(&current_root(&state)?, &rel)
}

/// Rename or move a folder inside the open vault. Never replaces anything, never into itself.
#[tauri::command(async)]
pub(crate) fn rename_folder(from: String, to: String, state: State<VaultRoot>) -> Result<(), String> {
    rename_in(&current_root(&state)?, &from, &to)
}

/// Move a folder — with every note in it — to the recycle bin.
#[tauri::command(async)]
pub(crate) fn delete_folder(rel: String, state: State<VaultRoot>) -> Result<(), String> {
    delete_in(&current_root(&state)?, &rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-folders-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    /// Put back whatever a test sent to the recycle bin from `dir` (the real bin is left as found).
    fn restore_from_bin(dir: &Path) -> usize {
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
    fn folder_paths_inside_the_vault_are_accepted() {
        let root = tmp_root("ok");
        assert_eq!(resolve_dir(&root, "A/B").unwrap(), root.join("A").join("B"));
        assert_eq!(resolve_dir(&root, "Projects").unwrap(), root.join("Projects"));
    }

    #[test]
    fn folder_paths_leaving_the_vault_are_refused() {
        let root = tmp_root("escape");
        for bad in [
            "",
            "..",
            "../x",
            "a/../../x",
            "C:/Windows",
            r"C:\Users",
            r"\\server\share",
            "/etc",
            "a:b",
            ".git",
            "a/.hidden",
            "node_modules",
            "trailing.",
            "trailing ",
        ] {
            assert!(resolve_dir(&root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    #[test]
    fn create_makes_nested_empty_folders_that_are_listed() {
        let root = tmp_root("create");
        create_in(&root, "A/B/C").unwrap();
        create_in(&root, "Empty").unwrap();
        assert!(root.join("A").join("B").join("C").is_dir());
        let mut dirs = list_in(&root).unwrap();
        dirs.sort();
        assert_eq!(dirs, vec!["A", "A/B", "A/B/C", "Empty"]);
        // an existing folder is refused, and nothing is made outside the vault
        assert!(create_in(&root, "Empty").is_err());
        assert!(create_in(&root, "../outside").is_err());
        assert!(!root.parent().unwrap().join("outside").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn listing_skips_hidden_folders_and_node_modules() {
        let root = tmp_root("list");
        fs::create_dir_all(root.join(".git").join("objects")).unwrap();
        fs::create_dir_all(root.join("node_modules").join("x")).unwrap();
        fs::create_dir_all(root.join("Notes")).unwrap();
        assert_eq!(list_in(&root).unwrap(), vec!["Notes"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rename_moves_the_folder_with_its_notes() {
        let root = tmp_root("rename");
        put(&root, "A/n.md", "N");
        put(&root, "A/sub/m.md", "M");
        create_in(&root, "B").unwrap();
        rename_in(&root, "A", "Renamed").unwrap();
        assert!(!root.join("A").exists());
        assert_eq!(fs::read_to_string(root.join("Renamed/n.md")).unwrap(), "N");
        assert_eq!(fs::read_to_string(root.join("Renamed/sub/m.md")).unwrap(), "M");
        // move into another folder (its parent is made when missing)
        rename_in(&root, "Renamed", "B/Inner/Moved").unwrap();
        assert_eq!(fs::read_to_string(root.join("B/Inner/Moved/sub/m.md")).unwrap(), "M");
        // a case-only rename of the same folder is allowed
        rename_in(&root, "B", "b").unwrap();
        assert!(list_in(&root).unwrap().contains(&"b".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rename_never_replaces_an_existing_folder_or_file() {
        let root = tmp_root("noclobber");
        put(&root, "A/n.md", "mine");
        put(&root, "B/n.md", "keep me");
        put(&root, "C.md", "file");
        assert!(rename_in(&root, "A", "B").is_err());
        assert!(rename_in(&root, "A", "b").is_err(), "names compare case-insensitively");
        assert_eq!(fs::read_to_string(root.join("B/n.md")).unwrap(), "keep me");
        assert!(rename_in(&root, "A", "C.md").is_err());
        assert_eq!(fs::read_to_string(root.join("C.md")).unwrap(), "file");
        assert_eq!(fs::read_to_string(root.join("A/n.md")).unwrap(), "mine");
        // a missing source, and paths outside the vault, are refused
        assert!(rename_in(&root, "Nope", "Z").is_err());
        assert!(rename_in(&root, "A", "../A").is_err());
        assert!(rename_in(&root, "../x", "Z").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_folder_cannot_move_into_itself() {
        let root = tmp_root("itself");
        put(&root, "A/sub/n.md", "N");
        assert!(rename_in(&root, "A", "A/sub/A").is_err());
        assert!(rename_in(&root, "A", "a/x").is_err(), "case-insensitive on Windows/macOS");
        assert_eq!(fs::read_to_string(root.join("A/sub/n.md")).unwrap(), "N");
        // a sibling whose name merely starts the same is fine
        rename_in(&root, "A", "AB").unwrap();
        assert!(root.join("AB/sub/n.md").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_sends_the_folder_and_its_notes_to_the_recycle_bin() {
        let root = tmp_root("trash");
        put(&root, "Gone/a.md", "recover me");
        put(&root, "Gone/deep/b.md", "me too");
        delete_in(&root, "Gone").unwrap();
        assert!(!root.join("Gone").exists());
        assert_eq!(restore_from_bin(&root), 1, "the folder should be in the recycle bin");
        assert_eq!(fs::read_to_string(root.join("Gone/a.md")).unwrap(), "recover me");
        assert_eq!(fs::read_to_string(root.join("Gone/deep/b.md")).unwrap(), "me too");
        // a missing folder is not an error; outside the vault is refused
        delete_in(&root, "Never").unwrap();
        assert!(delete_in(&root, "..").is_err());
        assert!(delete_in(&root, "../x").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    /// A junction inside the vault that points outside it must not be a way out.
    #[cfg(windows)]
    #[test]
    fn junctions_out_of_the_vault_are_refused() {
        let root = tmp_root("junction");
        let outside = tmp_root("junction-target");
        let link = root.join("link");
        let made = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&outside)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !made {
            eprintln!("mklink /J unavailable — skipping");
            return;
        }
        put(&root, "A/n.md", "N");
        assert!(create_in(&root, "link/sub").is_err());
        assert!(!outside.join("sub").exists());
        assert!(rename_in(&root, "A", "link/A").is_err());
        assert!(!outside.join("A").exists());
        assert!(root.join("A/n.md").exists());
        assert!(rename_in(&root, "link", "other").is_err(), "a junction is not a vault folder");
        assert!(delete_in(&root, "link").is_err());
        assert!(!list_in(&root).unwrap().iter().any(|d| d.starts_with("link")));
        let _ = fs::remove_dir(&link);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }
}
