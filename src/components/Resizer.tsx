import { useRef } from "react";
import "./Resizer.css";

interface Props {
  getStart: () => number;
  onChange: (width: number) => void;
  /** +1 if width grows as the pointer moves right (left divider), -1 otherwise. */
  dir: 1 | -1;
}

export default function Resizer({ getStart, onChange, dir }: Props) {
  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = getStart();
    document.body.classList.add("col-resizing");

    const move = (ev: PointerEvent) => {
      if (!dragging.current) return;
      onChange(startW + dir * (ev.clientX - startX));
    };
    const up = () => {
      dragging.current = false;
      document.body.classList.remove("col-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return <div className="resizer" onPointerDown={onPointerDown} role="separator" />;
}
