export interface GenOptions {
  count?: number;
  seed?: number;
  longNotes?: number;
  longWords?: number;
  queryEvery?: number;
}
export const LONG_FOLDER: string;
export function generateVault(opts?: GenOptions): { rel: string; content: string }[];
export function writeVault(dir: string, opts?: GenOptions): number;
