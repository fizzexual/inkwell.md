// Attachments (PDFs, images) stored inside the vault, e.g. `Attachments/paper.pdf`.
// Same rule as notes: the vault root is owned by Rust and every path is checked to stay inside it.
// Only a short whitelist of document/image types can be written or read — never anything runnable.
use crate::{check_parent_inside, current_root, VaultRoot};
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use tauri::State;

/// File types an attachment may have.
const ALLOWED: &[&str] = &["pdf", "png", "jpg", "jpeg", "gif", "webp"];

/// `rel` as an attachment path inside `root`, or an error if it could leave the vault or isn't an
/// allowed attachment type.
pub(crate) fn resolve_attachment(root: &Path, rel: &str) -> Result<PathBuf, String> {
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
    let ok_type = rel_path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| ALLOWED.iter().any(|a| e.eq_ignore_ascii_case(a)));
    if !ok_type || rel.ends_with('/') || rel.ends_with('\\') {
        return Err(format!("Only PDF and image attachments are allowed: {rel}"));
    }
    Ok(root.join(rel_path))
}

/// `dir/name.ext` → `dir/name-<n>.ext`
fn with_suffix(rel: &str, n: usize) -> String {
    match rel.rfind('.') {
        Some(dot) => format!("{}-{n}{}", &rel[..dot], &rel[dot..]),
        None => format!("{rel}-{n}"),
    }
}

/// Write `bytes` at `rel` without ever replacing a different file: if the name is taken by another
/// file, `name-1.pdf`, `name-2.pdf`… is used instead; the same bytes already there are reused.
/// Returns the vault-relative path actually used.
pub(crate) fn write_attachment_in(root: &Path, rel: &str, bytes: &[u8]) -> Result<String, String> {
    let full = resolve_attachment(root, rel)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    check_parent_inside(root, &full)?;
    for n in 0..1000 {
        let cand_rel = if n == 0 { rel.to_string() } else { with_suffix(rel, n) };
        let cand = resolve_attachment(root, &cand_rel)?;
        // create_new: the name is claimed atomically, so a file that appears meanwhile is never replaced
        match fs::OpenOptions::new().write(true).create_new(true).open(&cand) {
            Ok(mut f) => {
                if let Err(e) = f.write_all(bytes).and_then(|_| f.sync_all()) {
                    drop(f);
                    let _ = fs::remove_file(&cand);
                    return Err(e.to_string());
                }
                return Ok(cand_rel);
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => {
                let same = fs::metadata(&cand).is_ok_and(|m| m.is_file() && m.len() == bytes.len() as u64)
                    && fs::read(&cand).is_ok_and(|old| old == bytes);
                if same {
                    return Ok(cand_rel);
                }
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Err(format!("Too many files named like {rel}"))
}

/// The bytes of the attachment at `rel`.
pub(crate) fn read_attachment_in(root: &Path, rel: &str) -> Result<Vec<u8>, String> {
    let full = resolve_attachment(root, rel)?;
    // the file itself (not only its folder) must really be inside the vault: no link escapes
    let real = full.canonicalize().map_err(|_| format!("Attachment not found: {rel}"))?;
    if !real.starts_with(root) || !real.is_file() {
        return Err(format!("Not an attachment in this vault: {rel}"));
    }
    fs::read(&real).map_err(|e| e.to_string())
}

/// `%XX`-decode a header value (the path travels in a header because the body carries the bytes).
pub(crate) fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Copy a file into the open vault. The bytes are the raw request body; the vault-relative path
/// comes percent-encoded in the `x-rel` header. Returns the path actually used (see
/// `write_attachment_in`: a different file with that name is never replaced).
#[tauri::command]
pub async fn write_attachment(request: tauri::ipc::Request<'_>, state: State<'_, VaultRoot>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes".into());
    };
    let rel = request
        .headers()
        .get("x-rel")
        .and_then(|v| v.to_str().ok())
        .and_then(percent_decode)
        .ok_or("Missing attachment path")?;
    write_attachment_in(&current_root(&state)?, &rel, bytes)
}

/// The bytes of an attachment in the open vault (sent back raw, as an ArrayBuffer).
#[tauri::command]
pub async fn read_attachment(rel: String, state: State<'_, VaultRoot>) -> Result<tauri::ipc::Response, String> {
    Ok(tauri::ipc::Response::new(read_attachment_in(&current_root(&state)?, &rel)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-att-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn attachment_paths_inside_the_vault_are_accepted() {
        let root = tmp_root("ok");
        assert_eq!(
            resolve_attachment(&root, "Attachments/paper.pdf").unwrap(),
            root.join("Attachments").join("paper.pdf")
        );
        for ok in ["a.PDF", "img/x.png", "x.jpg", "x.jpeg", "x.gif", "x.webp", "Attachments/My Paper (2).pdf", "Прикачени/статия.pdf"] {
            assert!(resolve_attachment(&root, ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn paths_leaving_the_vault_are_refused() {
        let root = tmp_root("escape");
        for bad in [
            "../x.pdf",
            "Attachments/../../x.pdf",
            "C:/Windows/x.pdf",
            r"C:\Users\x.pdf",
            "C:x.pdf",
            r"\\server\share\x.pdf",
            "/etc/x.pdf",
            r"\x.pdf",
            "",
            "Attachments/",
        ] {
            assert!(resolve_attachment(&root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    #[test]
    fn only_whitelisted_types_are_allowed() {
        let root = tmp_root("ext");
        for bad in ["a.md", "a.exe", "a.bat", "a.html", "a.svg", "a.js", "a", "a.pdf.lnk", "a.pdf/", "a.pdf.exe"] {
            assert!(resolve_attachment(&root, bad).is_err(), "should refuse {bad:?}");
        }
    }

    #[test]
    fn write_then_read_round_trips() {
        let root = tmp_root("rw");
        let rel = write_attachment_in(&root, "Attachments/paper.pdf", b"%PDF-1.7 one").unwrap();
        assert_eq!(rel, "Attachments/paper.pdf");
        assert_eq!(read_attachment_in(&root, "Attachments/paper.pdf").unwrap(), b"%PDF-1.7 one");
        assert!(read_attachment_in(&root, "Attachments/missing.pdf").is_err());
        assert!(read_attachment_in(&root, "../paper.pdf").is_err());
        assert!(write_attachment_in(&root, "../evil.pdf", b"x").is_err());
        assert!(write_attachment_in(&root, "evil.exe", b"x").is_err());
        assert!(!root.parent().unwrap().join("evil.pdf").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_different_file_with_the_same_name_is_never_overwritten() {
        let root = tmp_root("dedupe");
        assert_eq!(write_attachment_in(&root, "Attachments/paper.pdf", b"first").unwrap(), "Attachments/paper.pdf");
        assert_eq!(write_attachment_in(&root, "Attachments/paper.pdf", b"second").unwrap(), "Attachments/paper-1.pdf");
        assert_eq!(write_attachment_in(&root, "Attachments/paper.pdf", b"third").unwrap(), "Attachments/paper-2.pdf");
        // same name differing only in case is the same file on Windows/macOS: still not overwritten
        let rel = write_attachment_in(&root, "Attachments/PAPER.pdf", b"fourth").unwrap();
        assert_eq!(read_attachment_in(&root, &rel).unwrap(), b"fourth");
        assert_eq!(fs::read(root.join("Attachments/paper.pdf")).unwrap(), b"first");
        assert_eq!(fs::read(root.join("Attachments/paper-1.pdf")).unwrap(), b"second");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn importing_the_same_file_again_reuses_it() {
        let root = tmp_root("same");
        assert_eq!(write_attachment_in(&root, "Attachments/a.pdf", b"same bytes").unwrap(), "Attachments/a.pdf");
        assert_eq!(write_attachment_in(&root, "Attachments/a.pdf", b"same bytes").unwrap(), "Attachments/a.pdf");
        let n = fs::read_dir(root.join("Attachments")).unwrap().count();
        assert_eq!(n, 1);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn header_paths_are_percent_decoded() {
        assert_eq!(percent_decode("Attachments%2FMy%20Paper.pdf").as_deref(), Some("Attachments/My Paper.pdf"));
        assert_eq!(percent_decode("%D1%81%D1%82.pdf").as_deref(), Some("ст.pdf"));
        assert_eq!(percent_decode("plain.pdf").as_deref(), Some("plain.pdf"));
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
        assert_eq!(percent_decode("%ff%fe"), None); // not UTF-8
    }
}
