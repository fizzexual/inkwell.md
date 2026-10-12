// Vault backups: zip the open disk vault's notes into the app's config folder, keep the newest 14
// per vault, and restore one into a NEW folder next to the vault (never over anything).
use crate::{current_root, set_root, VaultRoot};
use chrono::{Local, NaiveDateTime, TimeZone};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// How many backups are kept per vault; older ones are deleted when a new one is made.
pub(crate) const KEEP: usize = 14;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub(crate) struct BackupInfo {
    name: String,
    /// when it was made, ms since the Unix epoch
    time: i64,
    /// bytes
    size: u64,
    /// `.md` files inside
    notes: usize,
}

/// The folder Rust restored into last; only this one can be opened without the folder picker.
static LAST_RESTORED: Mutex<Option<PathBuf>> = Mutex::new(None);

fn stamp(t: NaiveDateTime) -> String {
    t.format("%Y%m%d-%H%M%S").to_string()
}

/// The vault folder's own name: backups are `<label>-YYYYMMDD-HHMMSS.zip`.
fn vault_label(vault: &Path) -> String {
    vault
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "vault".into())
}

/// `<label>-YYYYMMDD-HHMMSS[-N].zip` → (time, N); None for anything else (other vaults' backups too).
fn parse_backup(file_name: &str, label: &str) -> Option<(NaiveDateTime, u32)> {
    let rest = file_name.strip_prefix(label)?.strip_prefix('-')?.strip_suffix(".zip")?;
    if rest.len() < 15 || !rest.is_char_boundary(15) {
        return None;
    }
    let (when, extra) = rest.split_at(15);
    if !when.bytes().enumerate().all(|(i, b)| if i == 8 { b == b'-' } else { b.is_ascii_digit() }) {
        return None;
    }
    let time = NaiveDateTime::parse_from_str(when, "%Y%m%d-%H%M%S").ok()?;
    let n = match extra.strip_prefix('-') {
        None if extra.is_empty() => 0,
        Some(d) if !d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()) => d.parse().ok()?,
        _ => return None,
    };
    Some((time, n))
}

fn is_md(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
}

/// What goes in a backup: every `.md` file, plus everything in a top-level `Attachments` folder.
/// Hidden folders, `node_modules`, and links are skipped (as the vault reader does).
fn backup_files(dir: &Path, root: &Path, in_attachments: bool, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        let ft = entry.file_type()?;
        if ft.is_symlink() {
            continue;
        }
        let p = entry.path();
        if ft.is_dir() {
            let attachments = in_attachments || (dir == root && name.eq_ignore_ascii_case("attachments"));
            backup_files(&p, root, attachments, out)?;
        } else if in_attachments || is_md(&p) {
            out.push(p);
        }
    }
    Ok(())
}

/// This vault's backups in `dir`, newest first.
fn backups_of(dir: &Path, label: &str) -> Vec<(NaiveDateTime, u32, PathBuf)> {
    let mut found: Vec<_> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let (t, n) = parse_backup(&name, label)?;
            e.file_type().ok().filter(|ft| ft.is_file())?;
            Some((t, n, e.path()))
        })
        .collect();
    found.sort_by(|a, b| (b.0, b.1).cmp(&(a.0, a.1)));
    found
}

fn info_of(path: &Path, time: NaiveDateTime) -> Result<BackupInfo, String> {
    let size = fs::metadata(path).map_err(|e| e.to_string())?.len();
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let notes = archive.file_names().flatten().filter(|n| is_md(Path::new(n.as_ref()))).count();
    let time = Local
        .from_local_datetime(&time)
        .earliest()
        .map(|t| t.timestamp_millis())
        .unwrap_or_else(|| time.and_utc().timestamp_millis());
    Ok(BackupInfo {
        name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
        time,
        size,
        notes,
    })
}

fn write_zip(vault: &Path, files: &[PathBuf], part: &Path, now: NaiveDateTime) -> Result<(), String> {
    let file = fs::File::create_new(part).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let mut opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    if let Ok(t) = zip::DateTime::try_from(now) {
        opts = opts.last_modified_time(t);
    }
    for f in files {
        let rel = f
            .strip_prefix(vault)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let Ok(mut src) = fs::File::open(f) else {
            continue; // vanished or locked since the listing: back up the rest
        };
        zip.start_file(rel, opts).map_err(|e| e.to_string())?;
        std::io::copy(&mut src, &mut zip).map_err(|e| e.to_string())?;
    }
    zip.finish()
        .map_err(|e| e.to_string())?
        .sync_all()
        .map_err(|e| e.to_string())
}

fn create_in(vault: &Path, dir: &Path, now: NaiveDateTime) -> Result<BackupInfo, String> {
    let label = vault_label(vault);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    backup_files(vault, vault, false, &mut files).map_err(|e| e.to_string())?;
    files.sort();

    // a name no backup has yet (two in one second get `-1`, `-2`…)
    let base = format!("{label}-{}", stamp(now));
    let mut name = format!("{base}.zip");
    for i in 1.. {
        if !dir.join(&name).exists() {
            break;
        }
        name = format!("{base}-{i}.zip");
    }
    let path = dir.join(&name);
    // written under a temp name and renamed when complete: a crash never leaves a broken backup
    // that counts towards the 14 and pushes a good one out
    let part = dir.join(format!("{name}.part"));
    if let Err(e) = write_zip(vault, &files, &part, now).and_then(|_| fs::rename(&part, &path).map_err(|e| e.to_string())) {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    // keep this vault's newest KEEP; these are our own files, so a plain delete
    for (_, _, old) in backups_of(dir, &label).into_iter().skip(KEEP) {
        let _ = fs::remove_file(old);
    }
    info_of(&path, now)
}

fn list_in(dir: &Path, label: &str) -> Result<Vec<BackupInfo>, String> {
    // a zip that can't be read couldn't be restored either, so it isn't offered
    Ok(backups_of(dir, label)
        .into_iter()
        .filter_map(|(t, _, p)| info_of(&p, t).ok())
        .collect())
}

/// A zip entry name as a relative path, or None if it could land outside the folder it is
/// extracted into (`..`, absolute, a drive, a `name:stream`).
fn safe_entry(name: &str) -> Option<PathBuf> {
    if name.contains(':') || name.starts_with('/') || name.starts_with('\\') {
        return None;
    }
    let mut out = PathBuf::new();
    for part in name.split(['/', '\\']) {
        match part {
            "" => {}
            "." | ".." => return None,
            p => match Path::new(p).components().next() {
                Some(Component::Normal(_)) => out.push(p),
                _ => return None,
            },
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

fn restore_in(dir: &Path, vault: &Path, name: &str, now: NaiveDateTime) -> Result<PathBuf, String> {
    let label = vault_label(vault);
    // only one of this vault's backups, by its plain file name
    if name.contains(['/', '\\', ':']) || parse_backup(name, &label).is_none() {
        return Err(format!("Not a backup of this vault: {name}"));
    }
    let file = fs::File::open(dir.join(name)).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // every entry is checked before anything is written: one bad name refuses the whole restore
    let mut plan = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let raw = entry.name().map_err(|e| e.to_string())?.to_string();
        let rel = match (safe_entry(&raw), entry.enclosed_name()) {
            (Some(rel), Some(_)) => rel,
            _ => return Err(format!("Refusing to restore: unsafe path in the backup: {raw}")),
        };
        plan.push((i, rel, entry.is_dir()));
    }

    // a new folder next to the vault, never an existing one
    let parent = vault.parent().ok_or("The vault has no parent folder to restore next to")?;
    let base = format!("{label}-restored-{}", stamp(now));
    let mut target = parent.join(&base);
    for n in 1.. {
        match fs::create_dir(&target) {
            Ok(()) => break,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => target = parent.join(format!("{base}-{n}")),
            Err(e) => return Err(e.to_string()),
        }
    }

    for (i, rel, is_dir) in plan {
        let out = target.join(&rel);
        if is_dir {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = out.parent() {
            fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        // create_new: a duplicate name inside the zip never overwrites the first copy
        let mut f = fs::File::create_new(&out).map_err(|e| format!("{}: {e}", rel.display()))?;
        f.write_all(&buf).map_err(|e| e.to_string())?;
    }
    Ok(target)
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("backups"))
}

/// A path for showing to the user (Explorer doesn't take the `\\?\` form canonicalize returns).
fn display(p: &Path) -> String {
    let s = p.to_string_lossy();
    s.strip_prefix(r"\\?\").filter(|r| !r.starts_with("UNC")).unwrap_or(&s).to_string()
}

/// Zip the open vault's notes now (runs off the UI thread).
#[tauri::command]
pub(crate) async fn backup_vault(app: AppHandle, state: State<'_, VaultRoot>) -> Result<BackupInfo, String> {
    let vault = current_root(&state)?;
    let dir = backups_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || create_in(&vault, &dir, Local::now().naive_local()))
        .await
        .map_err(|e| e.to_string())?
}

/// The open vault's backups, newest first.
#[tauri::command]
pub(crate) fn list_backups(app: AppHandle, state: State<VaultRoot>) -> Result<Vec<BackupInfo>, String> {
    let vault = current_root(&state)?;
    list_in(&backups_dir(&app)?, &vault_label(&vault))
}

/// Extract one of the open vault's backups into a new folder next to it; returns that folder.
#[tauri::command]
pub(crate) async fn restore_backup(name: String, app: AppHandle, state: State<'_, VaultRoot>) -> Result<String, String> {
    let vault = current_root(&state)?;
    let dir = backups_dir(&app)?;
    let out = tauri::async_runtime::spawn_blocking(move || restore_in(&dir, &vault, &name, Local::now().naive_local()))
        .await
        .map_err(|e| e.to_string())??;
    let shown = display(&out);
    *LAST_RESTORED.lock().map_err(|e| e.to_string())? = Some(out);
    Ok(shown)
}

/// Make the folder the last restore created the vault (no picker: Rust chose that folder itself).
#[tauri::command]
pub(crate) fn open_restored_vault(app: AppHandle, state: State<VaultRoot>) -> Result<Option<String>, String> {
    let dir = LAST_RESTORED.lock().map_err(|e| e.to_string())?.clone();
    match dir {
        Some(d) if d.is_dir() => set_root(&app, &state, Some(d)),
        _ => Err("Nothing was restored in this session".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    /// a temp folder holding `<vault>` and `backups` side by side
    fn tmp(name: &str) -> (PathBuf, PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("inkwell-backup-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("My Notes")).unwrap();
        let base = base.canonicalize().unwrap();
        (base.clone(), base.join("My Notes"), base.join("backups"))
    }

    fn at(day: u32, h: u32, m: u32, s: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 10, day).unwrap().and_hms_opt(h, m, s).unwrap()
    }

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn files_under(root: &Path) -> Vec<String> {
        fn walk(d: &Path, root: &Path, out: &mut Vec<String>) {
            for e in fs::read_dir(d).unwrap() {
                let p = e.unwrap().path();
                if p.is_dir() {
                    walk(&p, root, out);
                } else {
                    out.push(p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"));
                }
            }
        }
        let mut out = Vec::new();
        walk(root, root, &mut out);
        out.sort();
        out
    }

    #[test]
    fn names_parse_only_for_this_vault() {
        assert_eq!(parse_backup("My Notes-20261012-213000.zip", "My Notes"), Some((at(12, 21, 30, 0), 0)));
        assert_eq!(parse_backup("My Notes-20261012-213000-2.zip", "My Notes"), Some((at(12, 21, 30, 0), 2)));
        for other in [
            "My Notes-Work-20261012-213000.zip",
            "Other-20261012-213000.zip",
            "My Notes-20261012-213000.zip.part",
            "My Notes-2026101-213000.zip",
            "My Notes-20261012-213000-x.zip",
        ] {
            assert_eq!(parse_backup(other, "My Notes"), None, "{other}");
        }
    }

    #[test]
    fn a_backup_round_trips_into_a_new_folder() {
        let (base, vault, dir) = tmp("roundtrip");
        put(&vault, "a.md", "# A");
        put(&vault, "sub/deep/b.md", "# B");
        put(&vault, "Attachments/img.png", "PNG");
        put(&vault, ".git/x.md", "hidden");
        put(&vault, "node_modules/y.md", "deps");
        put(&vault, "notes.txt", "not a note");
        let info = create_in(&vault, &dir, at(12, 21, 30, 5)).unwrap();
        assert_eq!(info.name, "My Notes-20261012-213005.zip");
        assert_eq!(info.notes, 2);
        assert!(info.size > 0);
        assert_eq!(list_in(&dir, "My Notes").unwrap(), vec![info.clone()]);

        let out = restore_in(&dir, &vault, &info.name, at(13, 8, 0, 0)).unwrap();
        assert_eq!(out, base.join("My Notes-restored-20261013-080000"));
        assert_eq!(files_under(&out), vec!["Attachments/img.png", "a.md", "sub/deep/b.md"]);
        assert_eq!(fs::read_to_string(out.join("sub/deep/b.md")).unwrap(), "# B");
        // the vault itself is untouched
        assert_eq!(fs::read_to_string(vault.join("a.md")).unwrap(), "# A");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn only_the_newest_fourteen_are_kept() {
        let (base, vault, dir) = tmp("retention");
        put(&vault, "a.md", "# A");
        // another vault's backup in the same folder is never pruned
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Other-20200101-000000.zip"), b"x").unwrap();
        for day in 1..=15 {
            create_in(&vault, &dir, at(day, 9, 0, 0)).unwrap();
        }
        let list = list_in(&dir, "My Notes").unwrap();
        assert_eq!(list.len(), KEEP);
        assert_eq!(list[0].name, "My Notes-20261015-090000.zip", "newest first");
        assert_eq!(list[13].name, "My Notes-20261002-090000.zip");
        assert!(!dir.join("My Notes-20261001-090000.zip").exists());
        assert!(dir.join("Other-20200101-000000.zip").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn two_backups_in_the_same_second_both_survive() {
        let (base, vault, dir) = tmp("samesecond");
        put(&vault, "a.md", "one");
        let first = create_in(&vault, &dir, at(12, 10, 0, 0)).unwrap();
        put(&vault, "a.md", "two");
        let second = create_in(&vault, &dir, at(12, 10, 0, 0)).unwrap();
        assert_ne!(first.name, second.name);
        assert_eq!(list_in(&dir, "My Notes").unwrap()[0].name, second.name, "newest first");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn restore_refuses_a_zip_slip_entry_and_writes_nothing() {
        let (base, vault, dir) = tmp("zipslip");
        fs::create_dir_all(&dir).unwrap();
        let name = "My Notes-20261012-120000.zip";
        let mut zip = zip::ZipWriter::new(fs::File::create(dir.join(name)).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("ok.md", opts).unwrap();
        zip.write_all(b"fine").unwrap();
        zip.start_file("../evil.md", opts).unwrap();
        zip.write_all(b"evil").unwrap();
        zip.finish().unwrap();

        let err = restore_in(&dir, &vault, name, at(12, 13, 0, 0)).unwrap_err();
        assert!(err.contains("unsafe path") && err.contains("../evil.md"), "{err}");
        assert!(!base.join("evil.md").exists());
        assert!(!vault.join("evil.md").exists());
        assert!(!base.join("My Notes-restored-20261012-130000").exists(), "nothing half-restored");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn restore_never_overwrites_and_only_takes_this_vaults_backups() {
        let (base, vault, dir) = tmp("noclobber");
        put(&vault, "a.md", "from backup");
        let info = create_in(&vault, &dir, at(12, 9, 0, 0)).unwrap();
        // a folder with the restore's name already exists
        let taken = base.join("My Notes-restored-20261012-100000");
        put(&taken, "a.md", "keep me");
        let out = restore_in(&dir, &vault, &info.name, at(12, 10, 0, 0)).unwrap();
        assert_ne!(out, taken);
        assert_eq!(fs::read_to_string(taken.join("a.md")).unwrap(), "keep me");
        assert_eq!(fs::read_to_string(out.join("a.md")).unwrap(), "from backup");
        // names that aren't one of this vault's backups are refused
        fs::write(dir.join("Other-20261012-090000.zip"), b"x").unwrap();
        for bad in ["Other-20261012-090000.zip", "../My Notes-20261012-090000.zip", "nope.zip", ""] {
            assert!(restore_in(&dir, &vault, bad, at(12, 11, 0, 0)).is_err(), "{bad}");
        }
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn display_paths_drop_the_verbatim_prefix() {
        assert_eq!(display(Path::new(r"\\?\C:\Users\x")), r"C:\Users\x");
        assert_eq!(display(Path::new(r"C:\Users\x")), r"C:\Users\x");
    }
}
