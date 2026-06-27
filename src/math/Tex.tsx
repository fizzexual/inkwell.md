import { useMemo } from "react";
import katex from "katex";

export default function Tex({ tex, display }: { tex: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: !!display, throwOnError: false, output: "html" });
    } catch {
      return tex;
    }
  }, [tex, display]);
  return <span className="tex" dangerouslySetInnerHTML={{ __html: html }} />;
}
