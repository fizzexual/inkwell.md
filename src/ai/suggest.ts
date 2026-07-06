// Small AI helpers that turn a note's content into structured suggestions (tags, a title).
// They reuse completeText, so they run through whatever provider/key the assistant is configured with.
import { completeText } from "./complete";

const cleanBody = (md: string) =>
  md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/[`>*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

/** Suggest a handful of topical tags, reusing the vault's existing tags where they fit. */
export async function suggestTags(content: string, existing: string[]): Promise<string[]> {
  const instruction =
    `Suggest 3 to 6 short topical tags for this note. Use lowercase single words or kebab-case, no "#". ` +
    `Prefer reusing these existing tags where they genuinely fit: ${existing.slice(0, 40).join(", ") || "(none yet)"}. ` +
    `Reply with ONLY a comma-separated list of tags — no other text.`;
  const out = await completeText(instruction, cleanBody(content));
  return [
    ...new Set(
      out
        .split(/[,\n]/)
        .map((s) => s.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-"))
        .filter((t) => /^[a-z0-9][a-z0-9/-]{0,28}$/.test(t)),
    ),
  ].slice(0, 6);
}

/** Suggest a concise, specific title for the note. */
export async function suggestTitle(content: string): Promise<string> {
  const instruction =
    "Suggest a concise, specific title (3 to 8 words, Title Case, no quotes, no trailing period) for this note based on its content. Reply with ONLY the title.";
  const out = await completeText(instruction, cleanBody(content).slice(0, 2000));
  return out.split("\n")[0].replace(/^["'#\s]+|["'\s]+$/g, "").slice(0, 80);
}
