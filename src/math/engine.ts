import { parse, format } from "mathjs";

export interface MathLine {
  source: string;
  name?: string; // assigned variable / function name
  result?: string; // formatted value
  tex?: string; // LaTeX of the line
  error?: string;
  isComment?: boolean;
  isBlank?: boolean;
}

export interface MathSymbol {
  name: string;
  value: string; // formatted
  raw: unknown;
  tex: string; // LaTeX of the defining expression
  isFunction: boolean;
}

export interface MathResult {
  lines: MathLine[];
  symbols: Map<string, MathSymbol>;
  scope: Record<string, unknown>;
}

export function formatValue(v: unknown, precision = 6): string {
  try {
    if (typeof v === "function") return "ƒ";
    return format(v, { precision });
  } catch {
    return String(v);
  }
}

function safeTex(node: { toTex: () => string }): string {
  try {
    return node.toTex();
  } catch {
    return "";
  }
}

/** Evaluate a math sheet line-by-line in a shared scope (mathjs powers it all:
 * numbers, units, matrices, symbolic algebra via derivative()/simplify()/etc.). */
export function evaluateSheet(
  source: string,
  baseScope: Record<string, unknown> = {},
  precision = 6,
): MathResult {
  const scope: Record<string, unknown> = { ...baseScope };
  const lines: MathLine[] = [];
  const texByName = new Map<string, string>();

  for (const raw of source.split("\n")) {
    const t = raw.trim();
    if (!t) {
      lines.push({ source: raw, isBlank: true });
      continue;
    }
    if (t.startsWith("#")) {
      lines.push({ source: raw, isComment: true });
      continue;
    }
    try {
      const node = parse(t);
      const value = node.evaluate(scope);
      let name: string | undefined;
      const n = node as unknown as { type: string; object?: { name?: string }; name?: string };
      if (n.type === "AssignmentNode") name = n.object?.name;
      else if (n.type === "FunctionAssignmentNode") name = n.name;
      const tex = safeTex(node);
      if (name) texByName.set(name, tex);
      lines.push({ source: raw, name, result: formatValue(value, precision), tex });
    } catch (e) {
      lines.push({ source: raw, error: (e as Error).message });
    }
  }

  const symbols = new Map<string, MathSymbol>();
  for (const [k, v] of Object.entries(scope)) {
    symbols.set(k, {
      name: k,
      raw: v,
      value: formatValue(v, precision),
      tex: texByName.get(k) ?? k,
      isFunction: typeof v === "function",
    });
  }

  return { lines, symbols, scope };
}

/** Evaluate a single expression to a number with a scope (for plotting). */
export function evalNumber(expr: string, scope: Record<string, unknown>): number | null {
  try {
    const v = parse(expr).evaluate(scope);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** LaTeX for an arbitrary expression, best-effort. */
export function exprToTex(expr: string): string {
  try {
    return parse(expr).toTex();
  } catch {
    return expr;
  }
}
