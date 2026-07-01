import { useEffect, useRef, useState } from "react";
import { useVault } from "../store/useVault";
import { ArrowRight, Check } from "lucide-react";
import "./Onboarding.css";

type Placement = "bottom" | "right" | "left" | "top" | "center";

interface Step {
  selector?: string; // element to spotlight; omit for a centered card
  placement?: Placement;
  eyebrow?: string;
  title?: string;
  body: string;
}

const STEPS: Step[] = [
  {
    placement: "center",
    title: "Welcome to Inkwell",
    body: "A quick tour of the essentials — it takes about 30 seconds. Tap the arrow to begin.",
  },
  {
    selector: ".view-tabs",
    placement: "right",
    title: "Switch views here",
    body: "Notes, the knowledge graph, tables, tasks, the board, math, journal and more — one click each.",
  },
  {
    selector: '.vault-actions [aria-label="New note"]',
    placement: "bottom",
    title: "Create a note",
    body: "Add a note with + (or Ctrl/Cmd+N). Write in Markdown and type [[ to link another note.",
  },
  {
    placement: "center",
    eyebrow: "Tip",
    body: "Press Ctrl/Cmd+P to jump to any note instantly, and Ctrl/Cmd+Shift+K to capture a quick thought from anywhere.",
  },
  {
    selector: '[aria-label="Toggle assistant"]',
    placement: "bottom",
    title: "Ask your whole vault",
    body: "The assistant reads your notes and answers with citations — bring your own key (free options too). Ctrl/Cmd+J.",
  },
  {
    placement: "center",
    title: "You're all set",
    body: "Everything lives on your machine. Explore the handbook to learn any feature simply by using it.",
  },
];

const PAD = 6;
const TIP_W = 300;

export default function Onboarding() {
  const open = useVault((s) => s.onboardingOpen);
  const setOnboarding = useVault((s) => s.setOnboarding);
  const openArticle = useVault((s) => s.openArticle);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // JS-driven step transition (bypasses any CSS transition-disabling for a guaranteed glide)
  useEffect(() => {
    if (!open) return;
    const ease = "cubic-bezier(0.22, 0.61, 0.36, 1)";
    const c = contentRef.current;
    const t = tipRef.current;
    // clear any in-flight animations first so nothing stacks
    c?.getAnimations().forEach((a) => a.cancel());
    t?.getAnimations().forEach((a) => a.cancel());
    // animate TRANSFORM only — opacity stays 1 in CSS so the tooltip can never end up hidden
    c?.animate([{ transform: "translateX(16px)" }, { transform: "translateX(0)" }], { duration: 380, easing: ease });
    t?.animate([{ transform: "scale(0.985)" }, { transform: "scale(1)" }], { duration: 300, easing: ease });
  }, [i, open]);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // measure the current target (and re-measure on resize/scroll)
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const sel = STEPS[i].selector;
      const el = sel ? (document.querySelector(sel) as HTMLElement | null) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, open]);

  if (!open) return null;

  const finish = () => {
    setOnboarding(false);
    openArticle("welcome");
  };
  const next = () => (last ? finish() : setI((v) => v + 1));

  // ----- geometry -----
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placement: Placement = rect ? step.placement ?? "bottom" : "center";
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let tip: { left: number; top: number };
  let pointer: React.CSSProperties | null = null;

  if (!rect || placement === "center") {
    tip = { left: vw / 2 - TIP_W / 2, top: vh / 2 - 96 };
  } else if (placement === "right") {
    tip = {
      left: clamp(rect.right + PAD + 14, 12, vw - TIP_W - 12),
      top: clamp(rect.top + rect.height / 2 - 70, 12, vh - 200),
    };
    pointer = { left: -6, top: clamp(rect.top + rect.height / 2 - tip.top, 16, 130) };
  } else if (placement === "left") {
    tip = { left: clamp(rect.left - PAD - 14 - TIP_W, 12, vw - TIP_W - 12), top: clamp(rect.top, 12, vh - 200) };
    pointer = { right: -6, top: clamp(rect.top + rect.height / 2 - tip.top, 16, 130) };
  } else if (placement === "top") {
    tip = { left: clamp(rect.left + rect.width / 2 - TIP_W / 2, 12, vw - TIP_W - 12), top: rect.top - PAD - 170 };
    pointer = { bottom: -6, left: clamp(rect.left + rect.width / 2 - tip.left, 16, TIP_W - 16) };
  } else {
    tip = { left: clamp(rect.left + rect.width / 2 - TIP_W / 2, 12, vw - TIP_W - 12), top: rect.bottom + PAD + 14 };
    pointer = { top: -6, left: clamp(rect.left + rect.width / 2 - tip.left, 16, TIP_W - 16) };
  }

  return (
    <div className="tour">
      {/* click-catcher so the app underneath isn't interactable during the required tour */}
      <div className="tour-catch" />
      {rect ? (
        <div
          className="tour-spot"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        >
          <span className="tour-pulse" />
        </div>
      ) : (
        <div className="tour-dim" />
      )}

      <div ref={tipRef} className="tour-tip" style={{ left: tip.left, top: tip.top, width: TIP_W }}>
        {pointer && <span className={"tour-arrow " + placement} style={pointer} />}
        <div className="tour-content" ref={contentRef}>
          {step.eyebrow && <div className="tour-eyebrow">{step.eyebrow}</div>}
          {step.title && <div className="tour-h">{step.title}</div>}
          <p className="tour-body">{step.body}</p>
        </div>
        <div className="tour-foot">
          <div className="tour-dots">
            {STEPS.map((_, k) => (
              <button
                key={k}
                className={"tour-dot" + (k === i ? " on" : k < i ? " done" : "")}
                aria-label={`Step ${k + 1}`}
                onClick={() => setI(k)}
              />
            ))}
          </div>
          <button className="tour-next" onClick={next} aria-label={last ? "Finish" : "Next"}>
            {last ? <Check size={16} strokeWidth={2.6} /> : <ArrowRight size={16} strokeWidth={2.4} />}
          </button>
        </div>
      </div>
    </div>
  );
}
