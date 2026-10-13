// Optional git history for a disk vault: the vault folder itself is the repository (never a path
// from JS). Inkwell only ever commits its own files (notes and the top-level `Attachments` folder) to
// the current branch, and never pushes, pulls, or changes a repository's config or branches.
use crate::{current_root, resolve_rel, VaultRoot};
use git2::build::TreeUpdateBuilder;
use git2::{
    ErrorCode, FileMode, ObjectType, Repository, RepositoryOpenFlags, RepositoryState, Signature, Sort, Status,
    StatusOptions,
};
use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};
use tauri::State;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitInfo {
    /// the vault folder is a git repository
    repo: bool,
    /// Inkwell just made it one (false: it already was)
    created: bool,
    /// the current branch, if HEAD is on one
    branch: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommit {
    id: String,
    /// ms since the Unix epoch
    time: i64,
    /// the first line of the message
    summary: String,
    author: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Committed {
    id: String,
    summary: String,
    /// vault-relative paths, forward slashes, sorted
    files: Vec<String>,
}

/// One git write at a time: the debounced commit, "Commit now" and enabling can overlap.
static GIT_LOCK: Mutex<()> = Mutex::new(());

/// Written only into a repository Inkwell creates. Attachments are deliberately not ignored.
const GITIGNORE: &str =
    "# Written by Inkwell when git history was turned on\n.DS_Store\nThumbs.db\ndesktop.ini\n*.inkwell-tmp\n";

/// How many changed files a commit message lists by name.
const LIST_MAX: usize = 50;
/// A note's history lists at most this many commits, looking back at most `SCAN_MAX` commits.
const LOG_MAX: usize = 200;
const SCAN_MAX: usize = 5000;

fn lock() -> Result<MutexGuard<'static, ()>, String> {
    GIT_LOCK.lock().map_err(|e| e.to_string())
}

fn err(e: git2::Error) -> String {
    e.message().to_string()
}

/// The vault's own repository (`<vault>/.git`) — never one found by searching parent folders.
fn open_repo(root: &Path) -> Result<Repository, String> {
    let repo = Repository::open_ext(root, RepositoryOpenFlags::NO_SEARCH, std::iter::empty::<&OsStr>())
        .map_err(|_| "This vault doesn't keep git history yet".to_string())?;
    let same = repo
        .workdir()
        .and_then(|w| w.canonicalize().ok())
        .is_some_and(|w| w == root);
    if repo.is_bare() || !same {
        return Err("The vault folder isn't the top of its git repository".into());
    }
    Ok(repo)
}

/// The branch HEAD is on (also before its first commit); None when HEAD is detached.
fn branch_of(repo: &Repository) -> Option<String> {
    let head = repo.find_reference("HEAD").ok()?;
    head.symbolic_target()
        .and_then(|t| t.strip_prefix("refs/heads/"))
        .map(String::from)
}

fn info_in(root: &Path) -> Result<GitInfo, String> {
    Ok(match open_repo(root) {
        Ok(repo) => GitInfo { repo: true, created: false, branch: branch_of(&repo) },
        Err(_) => GitInfo { repo: false, created: false, branch: None },
    })
}

/// Make the vault a git repository if it isn't one; an existing repository is used as it is.
fn enable_in(root: &Path) -> Result<GitInfo, String> {
    let _g = lock()?;
    if let Ok(repo) = open_repo(root) {
        return Ok(GitInfo { repo: true, created: false, branch: branch_of(&repo) });
    }
    if root.join(".git").exists() {
        return Err("This vault's .git folder can't be opened as a repository".into());
    }
    if let Ok(outer) = Repository::discover(root) {
        let at = outer.workdir().unwrap_or(outer.path()).display().to_string();
        let at = at.trim_start_matches(r"\\?\").trim_end_matches(['\\', '/']).to_string();
        return Err(format!(
            "This folder is inside another git repository ({at}); Inkwell keeps git history only for a vault that is its own repository"
        ));
    }
    let repo = Repository::init(root).map_err(err)?;
    let ignore = root.join(".gitignore");
    if !ignore.exists() {
        fs::write(&ignore, GITIGNORE).map_err(|e| e.to_string())?;
    }
    Ok(GitInfo { repo: true, created: true, branch: branch_of(&repo) })
}

/// What Inkwell commits: notes anywhere, and everything in the top-level `Attachments` folder.
/// Hidden folders/files and `node_modules` are skipped, as the vault reader does.
fn in_scope(rel: &str) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.iter().any(|p| p.is_empty() || p.starts_with('.') || *p == "node_modules") {
        return false;
    }
    let md = Path::new(rel)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    md || (parts.len() > 1 && parts[0].eq_ignore_ascii_case("attachments"))
}

/// The root .gitignore is committed only when Inkwell wrote it (a repo it created); an owner's own
/// .gitignore in an existing repository is never touched.
fn is_inkwells_gitignore(root: &Path) -> bool {
    let first = GITIGNORE.lines().next().unwrap_or_default();
    fs::read_to_string(root.join(".gitignore")).is_ok_and(|t| t.starts_with(first))
}

/// The repository's own user.name/user.email when both are set, else "Inkwell <inkwell@local>".
fn author_for(name: Option<String>, email: Option<String>) -> (String, String) {
    match (name, email) {
        (Some(n), Some(e)) if !n.trim().is_empty() && !e.trim().is_empty() => (n, e),
        _ => ("Inkwell".into(), "inkwell@local".into()),
    }
}

fn plural(n: usize, word: &str) -> String {
    format!("{n} {word}{}", if n == 1 { "" } else { "s" })
}

/// "Inkwell: 2 notes, 1 attachment changed", a blank line, then the files (the first 50).
fn message_for(files: &[String]) -> String {
    let notes = files.iter().filter(|f| f.to_lowercase().ends_with(".md")).count();
    let attachments = files.iter().filter(|f| f.to_lowercase().starts_with("attachments/")).count();
    let mut what = Vec::new();
    if notes > 0 {
        what.push(plural(notes, "note"));
    }
    if attachments > 0 {
        what.push(plural(attachments, "attachment"));
    }
    let mut msg = format!("Inkwell: {} changed\n\n", what.join(", "));
    for f in files.iter().take(LIST_MAX) {
        msg.push_str(&format!("- {f}\n"));
    }
    if files.len() > LIST_MAX {
        msg.push_str(&format!("…and {} more\n", files.len() - LIST_MAX));
    }
    msg
}

/// Commit every note/attachment whose file differs from the last commit, to the current branch.
/// Returns None when nothing changed. Everything else in the repository (the owner's own staged or
/// unstaged work, config, branches) is left exactly as it is.
fn commit_in(root: &Path) -> Result<Option<Committed>, String> {
    let _g = lock()?;
    let repo = open_repo(root)?;
    if repo.state() != RepositoryState::Clean {
        return Err("The git repository is in the middle of a merge or rebase; Inkwell commits once it's finished".into());
    }
    if repo.head_detached().unwrap_or(false) {
        return Err("The git repository isn't on a branch (detached HEAD); Inkwell only commits to a branch".into());
    }
    let parent = match repo.head() {
        Ok(h) => Some(h.peel_to_commit().map_err(err)?),
        Err(e) if e.code() == ErrorCode::UnbornBranch => None,
        Err(e) => return Err(err(e)),
    };
    let base = match &parent {
        Some(c) => c.tree().map_err(err)?,
        None => repo.find_tree(repo.treebuilder(None).map_err(err)?.write().map_err(err)?).map_err(err)?,
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .exclude_submodules(true);
    let mut paths: Vec<String> = repo
        .statuses(Some(&mut opts))
        .map_err(err)?
        .iter()
        .filter(|s| !s.status().contains(Status::IGNORED))
        .filter_map(|s| s.path().map(String::from))
        .filter(|p| in_scope(p) || (p == ".gitignore" && is_inkwells_gitignore(root)))
        .collect();
    paths.sort();
    paths.dedup();

    let mut index = repo.index().map_err(err)?;
    let mut update = TreeUpdateBuilder::new();
    let mut files = Vec::new();
    for rel in paths {
        let meta = fs::symlink_metadata(root.join(&rel)).ok();
        if meta.as_ref().is_some_and(|m| m.file_type().is_symlink()) {
            continue; // links are never followed or committed
        }
        let now = if meta.is_some_and(|m| m.is_file()) {
            index.add_path(Path::new(&rel)).map_err(err)?;
            index.get_path(Path::new(&rel), 0).map(|e| (e.id, e.mode))
        } else {
            let _ = index.remove_path(Path::new(&rel));
            None
        };
        let before = base.get_path(Path::new(&rel)).ok().map(|e| e.id());
        if now.map(|n| n.0) == before {
            continue;
        }
        match now {
            Some((id, mode)) => {
                let mode = if mode == 0o100755 { FileMode::BlobExecutable } else { FileMode::Blob };
                update.upsert(&rel, id, mode);
            }
            None => {
                update.remove(&rel);
            }
        }
        files.push(rel);
    }
    if files.is_empty() {
        return Ok(None);
    }

    let tree = repo.find_tree(update.create_updated(&repo, &base).map_err(err)?).map_err(err)?;
    let cfg = repo.config().map_err(err)?;
    let (name, email) = author_for(cfg.get_string("user.name").ok(), cfg.get_string("user.email").ok());
    let sig = Signature::now(&name, &email).map_err(err)?;
    let message = message_for(&files);
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let id = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents).map_err(err)?;
    // the index now matches the commit for these files, so `git status` doesn't list them
    if let Err(e) = index.write() {
        eprintln!("Inkwell: committed, but couldn't update the git index: {e}");
    }
    Ok(Some(Committed {
        id: id.to_string(),
        summary: message.lines().next().unwrap_or_default().to_string(),
        files,
    }))
}

/// The blob id of `rel` in `tree`, if it is there.
fn blob_at(tree: &git2::Tree, rel: &str) -> Option<git2::Oid> {
    tree.get_path(Path::new(rel))
        .ok()
        .filter(|e| e.kind() == Some(ObjectType::Blob))
        .map(|e| e.id())
}

/// Commits on the current branch that changed the note at `rel`, newest first (renames aren't followed).
fn log_in(root: &Path, rel: &str) -> Result<Vec<GitCommit>, String> {
    resolve_rel(root, rel)?;
    let repo = open_repo(root)?;
    if repo.head().is_err() {
        return Ok(Vec::new()); // no commits yet
    }
    let mut walk = repo.revwalk().map_err(err)?;
    walk.push_head().map_err(err)?;
    walk.set_sorting(Sort::TIME).map_err(err)?;
    let mut out = Vec::new();
    for oid in walk.take(SCAN_MAX) {
        let commit = repo.find_commit(oid.map_err(err)?).map_err(err)?;
        let now = blob_at(&commit.tree().map_err(err)?, rel);
        let before = commit.parent(0).ok().and_then(|p| p.tree().ok()).and_then(|t| blob_at(&t, rel));
        if now.is_none() || now == before {
            continue;
        }
        out.push(GitCommit {
            id: commit.id().to_string(),
            time: commit.time().seconds() * 1000,
            summary: commit.summary().unwrap_or_default().to_string(),
            author: commit.author().name().unwrap_or_default().to_string(),
        });
        if out.len() >= LOG_MAX {
            break;
        }
    }
    Ok(out)
}

/// The note's text at `rel` as it was in commit `id` (a full 40-hex commit id, nothing else).
fn show_in(root: &Path, rel: &str, id: &str) -> Result<String, String> {
    resolve_rel(root, rel)?;
    if id.len() != 40 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(format!("Not a commit id: {id}"));
    }
    let repo = open_repo(root)?;
    let commit = repo.find_commit(git2::Oid::from_str(id).map_err(err)?).map_err(err)?;
    let blob = blob_at(&commit.tree().map_err(err)?, rel).ok_or_else(|| format!("{rel} isn't in that commit"))?;
    let blob = repo.find_blob(blob).map_err(err)?;
    String::from_utf8(blob.content().to_vec()).map_err(|_| format!("{rel} isn't text in that commit"))
}

#[tauri::command]
pub(crate) async fn git_info(state: State<'_, VaultRoot>) -> Result<GitInfo, String> {
    info_in(&current_root(&state)?)
}

#[tauri::command]
pub(crate) async fn git_enable(state: State<'_, VaultRoot>) -> Result<GitInfo, String> {
    enable_in(&current_root(&state)?)
}

#[tauri::command]
pub(crate) async fn git_commit(state: State<'_, VaultRoot>) -> Result<Option<Committed>, String> {
    commit_in(&current_root(&state)?)
}

#[tauri::command]
pub(crate) async fn git_log(rel: String, state: State<'_, VaultRoot>) -> Result<Vec<GitCommit>, String> {
    log_in(&current_root(&state)?, &rel)
}

#[tauri::command]
pub(crate) async fn git_show(rel: String, id: String, state: State<'_, VaultRoot>) -> Result<String, String> {
    show_in(&current_root(&state)?, &rel, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Repository;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-git-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    /// Every path in HEAD's tree, sorted.
    fn head_files(root: &Path) -> Vec<String> {
        let repo = Repository::open(root).unwrap();
        let tree = repo.head().unwrap().peel_to_tree().unwrap();
        let mut out = Vec::new();
        tree.walk(git2::TreeWalkMode::PreOrder, |dir, e| {
            if e.kind() == Some(git2::ObjectType::Blob) {
                out.push(format!("{dir}{}", e.name().unwrap()));
            }
            git2::TreeWalkResult::Ok
        })
        .unwrap();
        out.sort();
        out
    }

    #[test]
    fn enabling_a_plain_folder_makes_it_a_repo_with_a_gitignore() {
        let root = tmp_root("init");
        assert!(!info_in(&root).unwrap().repo);
        let info = enable_in(&root).unwrap();
        assert!(info.repo && info.created);
        assert!(root.join(".git").is_dir());
        let ignore = fs::read_to_string(root.join(".gitignore")).unwrap();
        assert!(ignore.contains(".DS_Store") && ignore.contains("Thumbs.db"), "{ignore}");
        assert!(!ignore.to_lowercase().contains("attachments"), "attachments must be kept: {ignore}");
        // enabling again is a no-op that reports the same repo
        let again = enable_in(&root).unwrap();
        assert!(again.repo && !again.created);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn commits_only_changed_notes_and_attachments() {
        let root = tmp_root("commit");
        enable_in(&root).unwrap();
        put(&root, "a.md", "# A\none");
        put(&root, "sub/b.md", "# B");
        put(&root, "Attachments/paper.pdf", "%PDF-1");
        put(&root, "other.txt", "not a note");
        put(&root, ".obsidian/x.md", "hidden");
        put(&root, "Thumbs.db", "junk");
        let c = commit_in(&root).unwrap().expect("a first commit");
        // Inkwell's own .gitignore goes in with the first commit (else `git status` shows it untracked)
        assert_eq!(c.files, vec![".gitignore", "Attachments/paper.pdf", "a.md", "sub/b.md"]);
        assert_eq!(c.summary, "Inkwell: 2 notes, 1 attachment changed");
        assert_eq!(head_files(&root), vec![".gitignore", "Attachments/paper.pdf", "a.md", "sub/b.md"]);
        let repo = Repository::open(&root).unwrap();
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert!(head.message().unwrap().contains("\n- sub/b.md"), "{:?}", head.message());
        assert_eq!(head.author().name(), Some("Inkwell"));
        assert_eq!(head.author().email(), Some("inkwell@local"));

        // nothing changed → no commit
        assert_eq!(commit_in(&root).unwrap(), None);

        // one edit → a commit with just that file; the index matches, so `git status` is clean for it
        put(&root, "a.md", "# A\ntwo");
        let c2 = commit_in(&root).unwrap().unwrap();
        assert_eq!(c2.files, vec!["a.md"]);
        assert_eq!(c2.summary, "Inkwell: 1 note changed");
        let dirty: Vec<String> = repo
            .statuses(None)
            .unwrap()
            .iter()
            .filter_map(|s| s.path().map(String::from))
            .filter(|p| p.ends_with(".md") && !p.starts_with(".")) // the hidden one stays untracked, as meant
            .collect();
        assert!(dirty.is_empty(), "{dirty:?}");

        // a deleted note is removed from the tree
        fs::remove_file(root.join("sub/b.md")).unwrap();
        let c3 = commit_in(&root).unwrap().unwrap();
        assert_eq!(c3.files, vec!["sub/b.md"]);
        assert_eq!(head_files(&root), vec![".gitignore", "Attachments/paper.pdf", "a.md"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn log_and_show_one_notes_old_versions() {
        let root = tmp_root("log");
        enable_in(&root).unwrap();
        put(&root, "n.md", "first");
        put(&root, "other.md", "x");
        commit_in(&root).unwrap().unwrap();
        put(&root, "other.md", "y"); // does not touch n.md
        commit_in(&root).unwrap().unwrap();
        put(&root, "n.md", "second");
        commit_in(&root).unwrap().unwrap();

        let log = log_in(&root, "n.md").unwrap();
        assert_eq!(log.len(), 2, "{log:?}");
        assert_eq!(show_in(&root, "n.md", &log[0].id).unwrap(), "second"); // newest first
        assert_eq!(show_in(&root, "n.md", &log[1].id).unwrap(), "first");
        assert!(log[0].summary.starts_with("Inkwell: 1 note changed"));
        assert!(log[0].time > 0);
        assert_eq!(log_in(&root, "other.md").unwrap().len(), 2);
        assert!(log_in(&root, "never.md").unwrap().is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn paths_and_ids_are_checked() {
        let root = tmp_root("checks");
        enable_in(&root).unwrap();
        put(&root, "n.md", "text");
        let c = commit_in(&root).unwrap().unwrap();
        for bad in ["../x.md", "C:/x.md", "a.txt", ""] {
            assert!(log_in(&root, bad).is_err(), "log should refuse {bad:?}");
            assert!(show_in(&root, bad, &c.id).is_err(), "show should refuse {bad:?}");
        }
        assert!(show_in(&root, "n.md", "HEAD~1").is_err());
        assert!(show_in(&root, "n.md", "not-hex").is_err());
        assert!(show_in(&root, "missing.md", &c.id).is_err());
        // no repo → a clear error, not a crash
        let plain = tmp_root("checks-plain");
        assert!(log_in(&plain, "n.md").is_err());
        assert!(commit_in(&plain).is_err());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&plain);
    }

    #[test]
    fn only_inkwells_own_gitignore_is_ever_committed() {
        // a repo Inkwell created: its .gitignore is committed, so `git status` is clean afterwards
        let root = tmp_root("ignore-own");
        enable_in(&root).unwrap();
        put(&root, "a.md", "# A");
        commit_in(&root).unwrap().expect("first commit");
        let repo = Repository::open(&root).unwrap();
        let dirty: Vec<String> = repo.statuses(None).unwrap().iter().filter_map(|s| s.path().map(String::from)).collect();
        assert!(dirty.is_empty(), "{dirty:?}");
        let _ = fs::remove_dir_all(&root);

        // the owner's own .gitignore in an existing repo is never committed by Inkwell
        let root = tmp_root("ignore-theirs");
        Repository::init(&root).unwrap();
        put(&root, ".gitignore", "*.log
");
        put(&root, "a.md", "# A");
        let c = commit_in(&root).unwrap().expect("commit");
        assert_eq!(c.files, vec!["a.md"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_existing_repo_is_used_as_it_is() {
        let root = tmp_root("existing");
        let repo = Repository::init(&root).unwrap();
        {
            let mut cfg = repo.config().unwrap();
            cfg.set_str("user.name", "Owner").unwrap();
            cfg.set_str("user.email", "owner@example.com").unwrap();
            cfg.set_str("inkwell.test", "keep").unwrap();
        }
        put(&root, ".gitignore", "secret/\n");
        put(&root, "code.rs", "fn main() {}");
        // the owner's own first commit, on their own branch
        let mut idx = repo.index().unwrap();
        idx.add_path(Path::new(".gitignore")).unwrap();
        idx.add_path(Path::new("code.rs")).unwrap();
        idx.write().unwrap();
        let tree = repo.find_tree(idx.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::now("Owner", "owner@example.com").unwrap();
        repo.commit(Some("refs/heads/notes"), &sig, &sig, "owner commit", &tree, &[]).unwrap();
        repo.set_head("refs/heads/notes").unwrap();
        // something the owner staged but hasn't committed stays staged, and out of Inkwell's commit
        put(&root, "staged.rs", "// wip");
        idx.add_path(Path::new("staged.rs")).unwrap();
        idx.write().unwrap();
        let cfg_before = fs::read_to_string(root.join(".git/config")).unwrap();

        let info = enable_in(&root).unwrap();
        assert!(info.repo && !info.created);
        assert_eq!(info.branch.as_deref(), Some("notes"));
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), "secret/\n");
        put(&root, "n.md", "note");
        put(&root, "secret/s.md", "ignored by the owner's .gitignore");
        let c = commit_in(&root).unwrap().unwrap();
        assert_eq!(c.files, vec!["n.md"]);

        let repo = Repository::open(&root).unwrap();
        let head = repo.head().unwrap();
        assert_eq!(head.shorthand(), Some("notes"));
        let commit = head.peel_to_commit().unwrap();
        assert_eq!(commit.author().name(), Some("Owner"));
        assert_eq!(commit.parent(0).unwrap().message(), Some("owner commit"));
        assert_eq!(head_files(&root), vec![".gitignore", "code.rs", "n.md"]);
        let status = repo.status_file(Path::new("staged.rs")).unwrap();
        assert!(status.contains(git2::Status::INDEX_NEW), "{status:?}");
        assert_eq!(fs::read_to_string(root.join(".git/config")).unwrap(), cfg_before);
        assert_eq!(repo.branches(None).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_vault_inside_another_repo_is_refused() {
        let outer = tmp_root("outer");
        Repository::init(&outer).unwrap();
        let vault = outer.join("vault");
        fs::create_dir_all(&vault).unwrap();
        let err = enable_in(&vault).unwrap_err();
        assert!(err.contains("inside another git repository"), "{err}");
        assert!(!vault.join(".git").exists());
        assert!(!info_in(&vault).unwrap().repo);
        let _ = fs::remove_dir_all(&outer);
    }

    #[test]
    fn author_and_message() {
        assert_eq!(author_for(None, None), ("Inkwell".into(), "inkwell@local".into()));
        assert_eq!(author_for(Some("Ann".into()), None), ("Inkwell".into(), "inkwell@local".into()));
        assert_eq!(
            author_for(Some("Ann".into()), Some("ann@x.org".into())),
            ("Ann".into(), "ann@x.org".into())
        );
        let m = message_for(&["a.md".into(), "Attachments/p.png".into()]);
        assert_eq!(m, "Inkwell: 1 note, 1 attachment changed\n\n- a.md\n- Attachments/p.png\n");
        let many: Vec<String> = (0..60).map(|i| format!("n{i}.md")).collect();
        let m = message_for(&many);
        assert!(m.starts_with("Inkwell: 60 notes changed\n\n"));
        assert!(m.contains("- n49.md\n") && !m.contains("- n50.md") && m.ends_with("…and 10 more\n"), "{m}");
    }
}
