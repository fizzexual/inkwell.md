export interface DiffLine {
  /** " " kept, "-" removed, "+" added, "…" folded run (text = how many lines) */
  op: " " | "-" | "+" | "…";
  text: string;
}

/** Line diff of `a` → `b` (LCS on the changed middle; huge middles fall back to remove-all/add-all). */
export function lineDiff(a: string, b: string): DiffLine[] {
  const A = a === "" ? [] : a.split("\n");
  const B = b === "" ? [] : b.split("\n");
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);

  const out: DiffLine[] = A.slice(0, pre).map((text) => ({ op: " ", text }));
  const n = a2.length;
  const m = b2.length;
  if (n * m > 4_000_000) {
    out.push(...a2.map((text) => ({ op: "-" as const, text })), ...b2.map((text) => ({ op: "+" as const, text })));
  } else {
    // lcs[i][j] = LCS length of a2[i..] and b2[j..]
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * w + j] = a2[i] === b2[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) {
        out.push({ op: " ", text: a2[i] });
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push({ op: "-", text: a2[i++] });
      else out.push({ op: "+", text: b2[j++] });
    }
    while (i < n) out.push({ op: "-", text: a2[i++] });
    while (j < m) out.push({ op: "+", text: b2[j++] });
  }
  out.push(...A.slice(A.length - suf).map((text) => ({ op: " " as const, text })));
  return out;
}

/** Keep every change plus `ctx` unchanged lines around it; longer unchanged runs become one "…" line. */
export function foldContext(lines: DiffLine[], ctx = 2): DiffLine[] {
  const keep = lines.map((l) => l.op !== " ");
  const near = keep.map((_, i) => {
    for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, i + ctx); k++) if (keep[k]) return true;
    return false;
  });
  const out: DiffLine[] = [];
  let run = 0;
  lines.forEach((l, i) => {
    if (near[i]) {
      if (run) out.push({ op: "…", text: String(run) });
      run = 0;
      out.push(l);
    } else run++;
  });
  if (run) out.push({ op: "…", text: String(run) });
  return out;
}
