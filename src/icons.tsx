import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base(props: P) {
  const { size = 16, strokeWidth = 1.6, ...p } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...p,
  };
}

export const ChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const ChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export const Folder = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2H19.5A1.5 1.5 0 0 1 21 9.7v8.3A1.5 1.5 0 0 1 19.5 19.5h-15A1.5 1.5 0 0 1 3 18z" />
  </svg>
);

export const Doc = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z" />
    <path d="M14 3v4.5H18.5" />
  </svg>
);

export const BarChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </svg>
);

export const NoteEdit = (p: P) => (
  <svg {...base(p)}>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

export const Graph = (p: P) => (
  <svg {...base(p)}>
    <circle cx="5.5" cy="6" r="2.2" />
    <circle cx="18" cy="6.5" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M7.4 7.1 10.4 16M16.4 8 13 16.4M7.6 6.3h8.2" />
  </svg>
);

export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);

export const Tag = (p: P) => (
  <svg {...base(p)}>
    <path d="M12.6 3.6 21 12a1.8 1.8 0 0 1 0 2.5l-5 5a1.8 1.8 0 0 1-2.5 0L5 11V5a1.4 1.4 0 0 1 1.4-1.4h6z" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const Import = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v11" />
    <path d="m8 10 4 4 4-4" />
    <path d="M5 19h14" />
  </svg>
);

export const FolderPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2H19.5A1.5 1.5 0 0 1 21 9.7v8.3A1.5 1.5 0 0 1 19.5 19.5h-15A1.5 1.5 0 0 1 3 18z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </svg>
);

export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Pencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L8 19l-4 1 1-4z" />
  </svg>
);

export const Link = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 13a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" />
    <path d="M14 11a4 4 0 0 0-5.7-.3l-3 3A4 4 0 0 0 11 19.4l1.7-1.7" />
  </svg>
);

export const FunctionIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M16 5h-2.2a2 2 0 0 0-2 1.8L10 18a2 2 0 0 1-2 1.8H6M7.5 11h6" />
    <path d="M15 13.5l4 5M19 13.5l-4 5" />
  </svg>
);

export const Board = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="7" height="6" rx="1.2" />
    <rect x="13.5" y="4.5" width="7" height="10" rx="1.2" />
    <rect x="3.5" y="13.5" width="7" height="6" rx="1.2" />
    <rect x="13.5" y="17.5" width="7" height="0.01" rx="1.2" />
  </svg>
);

export const CheckSquare = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 11.5 11.5 14 16 8.5" />
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
  </svg>
);

export const Table = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15" />
  </svg>
);

export const Sources = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H11l1.5 1.5H19A1.5 1.5 0 0 1 20.5 8v9.5A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5z" />
    <path d="M8 12h8M8 15h5" />
  </svg>
);

export const Fit = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
    <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
    <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </svg>
);

export const Bold = (p: P) => (
  <svg {...base({ ...p, strokeWidth: 2.1 })}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);

export const Italic = (p: P) => (
  <svg {...base({ ...p, strokeWidth: 2 })}>
    <path d="M19 5h-6M11 19H5M15 5 9 19" />
  </svg>
);

export const Heading = (p: P) => (
  <svg {...base({ ...p, strokeWidth: 2 })}>
    <path d="M6 5v14M18 5v14M6 12h12" />
  </svg>
);

export const ListIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </svg>
);

export const Quote = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 7H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2M19 7h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2" />
  </svg>
);

export const Code = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
  </svg>
);

export const Sun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const Moon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4a7 7 0 1 0 9.5 9.5z" />
  </svg>
);

export const Brush = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 14.5 18 6a2 2 0 0 1 3 3l-8.5 8.5" />
    <path d="M9.5 14.5a3 3 0 0 0-3 3c0 1-1 1.8-2.5 1.8 1-1.3 0-2 0-3.3a3 3 0 0 1 5.5-1.5z" />
  </svg>
);

export const Cards = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="4" width="13" height="16" rx="2" transform="rotate(6 12 12)" />
    <rect x="4" y="5" width="13" height="16" rx="2" />
  </svg>
);

export const Columns = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="5" height="15" rx="1.2" />
    <rect x="9.5" y="4.5" width="5" height="11" rx="1.2" />
    <rect x="15.5" y="4.5" width="5" height="8" rx="1.2" />
  </svg>
);

export const Calendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const Templates = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="3.5" width="16" height="17" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

export const Pin = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 16v4" />
  </svg>
);

export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M10 11v6M14 11v6" />
  </svg>
);

export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const SplitView = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <path d="M12 4.5v15" />
  </svg>
);

export const PanelLeft = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </svg>
);

export const PanelRight = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M14.5 4.5v15" />
  </svg>
);

export const Keyboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 13.5h9" />
  </svg>
);

export const Focus = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </svg>
);

export const Palette = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    <path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2 0-1.3-1-1.5-1-2.5 0-.8.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />
  </svg>
);

export const OpenExternal = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-9A1.5 1.5 0 0 1 6 18.5v-9A1.5 1.5 0 0 1 7.5 8H12" />
  </svg>
);

export const Sparkles = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6L12 3.5z" />
    <path d="M18.5 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z" />
  </svg>
);

export const Send = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 12h13M11 5.5 17.5 12 11 18.5" />
  </svg>
);

export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const Stop = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" />
  </svg>
);
