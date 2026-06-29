import type { Note } from "./data/vault";

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** One readable Markdown file: every note under a `# folder / title` divider. */
export function exportVaultMarkdown(notes: Note[]) {
  const body = notes
    .filter((n) => !n.kind || n.kind === "note" || n.kind === "source")
    .map((n) => {
      const path = n.folder ? `${n.folder} / ${n.title}` : n.title;
      return `\n\n<!-- ${path} -->\n\n${n.content ?? `# ${n.title}\n`}`;
    })
    .join("\n\n---\n");
  download("inkwell-vault.md", `# Inkwell vault export\n${body}`, "text/markdown");
}

/** Lossless JSON backup (re-importable later). */
export function exportVaultJson(notes: Note[]) {
  download("inkwell-vault.json", JSON.stringify({ version: 1, notes }, null, 2), "application/json");
}
