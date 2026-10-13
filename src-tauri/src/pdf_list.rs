// The PDFs in the vault's `Attachments/` folder, for the PDF search index. Only names, sizes and
// modification times — the index re-reads (through `read_attachment`) just the PDFs that changed.
// Same rule as everywhere else: links/junctions are never followed, so nothing outside the vault.
use crate::{current_root, VaultRoot};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::State;

/// The folder `openPdfFile` copies PDFs into.
const DIR: &str = "Attachments";
/// Enough for any real library; stops a runaway walk.
const MAX_FILES: usize = 5000;

#[derive(Serialize, Debug, PartialEq)]
pub(crate) struct PdfFile {
    /// vault-relative, `/`-separated, e.g. `Attachments/paper.pdf`
    rel: String,
    size: u64,
    /// last modification, ms since the Unix epoch (0 when the OS can't say)
    modified: u64,
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<PdfFile>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        if out.len() >= MAX_FILES {
            break;
        }
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        // file_type() does not follow links: skipping symlinks/junctions avoids loops and escapes
        let ft = entry.file_type()?;
        if ft.is_symlink() {
            continue;
        }
        let p = entry.path();
        if ft.is_dir() {
            walk(&p, root, out)?;
        } else if ft.is_file() && p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
            let meta = entry.metadata()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            let rel = p.strip_prefix(root).unwrap_or(&p).to_string_lossy().replace('\\', "/");
            out.push(PdfFile { rel, size: meta.len(), modified });
        }
    }
    Ok(())
}

/// Every PDF under `<root>/Attachments` (none when the folder doesn't exist), sorted by path.
pub(crate) fn list_pdfs_in(root: &Path) -> Result<Vec<PdfFile>, String> {
    let dir = root.join(DIR);
    match fs::symlink_metadata(&dir) {
        Ok(m) if m.is_dir() => {}
        _ => return Ok(Vec::new()), // missing, a file, or a link — nothing to index
    }
    let mut out = Vec::new();
    walk(&dir, root, &mut out).map_err(|e| e.to_string())?;
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(out)
}

/// The PDFs in the open vault's `Attachments/` folder.
#[tauri::command]
pub async fn list_pdf_attachments(state: State<'_, VaultRoot>) -> Result<Vec<PdfFile>, String> {
    list_pdfs_in(&current_root(&state)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp_root(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("inkwell-pdfls-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn no_attachments_folder_lists_nothing() {
        let root = tmp_root("none");
        assert_eq!(list_pdfs_in(&root).unwrap(), vec![]);
    }

    #[test]
    fn lists_pdfs_under_attachments_only() {
        let root = tmp_root("some");
        fs::create_dir_all(root.join("Attachments/Sub")).unwrap();
        fs::write(root.join("Attachments/paper.pdf"), b"%PDF-1.4 one").unwrap();
        fs::write(root.join("Attachments/Sub/Book.PDF"), b"%PDF-1.4 two!").unwrap();
        fs::write(root.join("Attachments/pic.png"), b"png").unwrap();
        fs::write(root.join("Attachments/.hidden.pdf"), b"x").unwrap();
        fs::write(root.join("outside.pdf"), b"%PDF").unwrap();

        let got = list_pdfs_in(&root).unwrap();
        let rels: Vec<_> = got.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(rels, ["Attachments/Sub/Book.PDF", "Attachments/paper.pdf"]);
        assert_eq!(got[1].size, 12);
        assert!(got[1].modified > 0);
    }

    #[test]
    fn a_changed_pdf_gets_a_new_size_or_time() {
        let root = tmp_root("change");
        fs::create_dir_all(root.join("Attachments")).unwrap();
        fs::write(root.join("Attachments/a.pdf"), b"%PDF v1").unwrap();
        let before = list_pdfs_in(&root).unwrap();
        fs::write(root.join("Attachments/a.pdf"), b"%PDF version 2").unwrap();
        let after = list_pdfs_in(&root).unwrap();
        assert_ne!(before, after);
    }
}
