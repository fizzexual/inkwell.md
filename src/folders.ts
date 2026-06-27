export const FOLDER_PALETTE = [
  "#6d4bd0",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#0ea5e9",
  "#84cc16",
  "#a855f7",
  "#64748b",
];

export function topFolder(folder: string): string {
  return folder ? folder.split("/")[0] : "Vault root";
}

/** Deterministic top-folder → colour map (sorted so it's stable). */
export function buildFolderColors(folders: string[]): Map<string, string> {
  const tops = [...new Set(folders.map(topFolder))].sort();
  const map = new Map<string, string>();
  tops.forEach((t, i) => map.set(t, FOLDER_PALETTE[i % FOLDER_PALETTE.length]));
  return map;
}
