// Which filesystem events the vault watcher passes on to the app (as `vault-fs-change`).
//
// The app re-reads the vault on any reported path, so this only has to answer "could the notes or
// the folder list have changed?": a `.md` file was touched, a folder appeared, or something went
// away that may have been a folder. On Windows a removed path can't be told apart as file or folder
// (it no longer exists, and the OS reports both the same way), so every vanished path is reported;
// a needless re-read is cheap. Hidden entries (Inkwell's own `.x.inkwell-tmp` save files, `.git`,
// `.obsidian`…) and `node_modules` are never reported — the vault reader skips them too.
use notify::event::{EventKind, ModifyKind};
use std::path::{Component, Path, PathBuf};

fn is_md(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
}

/// The path is (inside) a hidden entry or `node_modules`, relative to the vault root.
fn skipped(root: &Path, p: &Path) -> bool {
    let rel = p.strip_prefix(root).unwrap_or(p);
    rel.components().any(|c| match c {
        Component::Normal(name) => {
            let name = name.to_string_lossy();
            name.starts_with('.') || name == "node_modules"
        }
        _ => false,
    })
}

/// The paths of one watcher event the app must hear about (full paths, as strings).
pub(crate) fn reported(root: &Path, kind: &EventKind, paths: &[PathBuf]) -> Vec<String> {
    let appeared = matches!(
        kind,
        EventKind::Create(_) | EventKind::Modify(ModifyKind::Name(_))
    );
    let removed = matches!(
        kind,
        EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    );
    paths
        .iter()
        .filter(|p| !skipped(root, p))
        .filter(|p| is_md(p) || (appeared && p.is_dir()) || (removed && !p.exists()))
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, RemoveKind, RenameMode};
    use std::fs;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-watch-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    fn one(root: &Path, kind: &EventKind, p: &Path) -> Vec<String> {
        reported(root, kind, &[p.to_path_buf()])
    }

    // Windows reports kinds as `Any`: the decision must not depend on the backend knowing file/folder
    const CREATE: EventKind = EventKind::Create(CreateKind::Any);
    const REMOVE: EventKind = EventKind::Remove(RemoveKind::Any);
    const RENAMED_FROM: EventKind = EventKind::Modify(ModifyKind::Name(RenameMode::From));
    const RENAMED_TO: EventKind = EventKind::Modify(ModifyKind::Name(RenameMode::To));
    const EDIT: EventKind = EventKind::Modify(ModifyKind::Data(DataChange::Any));

    #[test]
    fn markdown_files_are_always_reported() {
        let root = tmp_root("md");
        for kind in [CREATE, REMOVE, EDIT, RENAMED_FROM, RENAMED_TO] {
            let p = root.join("a").join("Note.MD");
            assert_eq!(one(&root, &kind, &p), vec![p.to_string_lossy().to_string()]);
        }
    }

    #[test]
    fn a_folder_that_appears_is_reported() {
        let root = tmp_root("mkdir");
        let dir = root.join("Projects");
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(one(&root, &CREATE, &dir).len(), 1);
        assert_eq!(one(&root, &RENAMED_TO, &dir).len(), 1);
        // a folder's own "modified" (a child changed) is not news: the child's event covers it
        assert!(one(&root, &EDIT, &dir).is_empty());
    }

    #[test]
    fn a_path_that_went_away_is_reported_as_it_may_have_been_a_folder() {
        let root = tmp_root("rmdir");
        let gone = root.join("Old");
        assert_eq!(one(&root, &REMOVE, &gone).len(), 1);
        assert_eq!(one(&root, &RENAMED_FROM, &gone).len(), 1);
    }

    #[test]
    fn other_files_hidden_entries_and_node_modules_are_not_reported() {
        let root = tmp_root("skip");
        let png = root.join("pic.png");
        fs::write(&png, b"x").unwrap();
        assert!(one(&root, &CREATE, &png).is_empty());
        assert!(one(&root, &EDIT, &png).is_empty());
        // Inkwell's own atomic-save temp file, created and renamed away on every save
        let tmp = root.join(".note.md.inkwell-tmp");
        assert!(one(&root, &CREATE, &tmp).is_empty());
        assert!(one(&root, &RENAMED_FROM, &tmp).is_empty());
        let git = root.join(".git");
        fs::create_dir_all(&git).unwrap();
        assert!(one(&root, &CREATE, &git).is_empty());
        assert!(one(&root, &EDIT, &git.join("x.md")).is_empty());
        assert!(one(&root, &REMOVE, &root.join("node_modules").join("pkg")).is_empty());
        assert!(one(
            &root,
            &CREATE,
            &root.join("sub").join(".obsidian").join("a.md")
        )
        .is_empty());
    }
}
