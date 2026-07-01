import { useState } from "react";
import { useVault } from "../store/useVault";
import { Feather, PenLine, Share2, Calculator, Sparkles, type LucideIcon } from "lucide-react";
import "./Onboarding.css";

interface Step {
  Icon: LucideIcon;
  title: string;
  body: string;
  points: string[];
}

const STEPS: Step[] = [
  {
    Icon: Feather,
    title: "Welcome to Inkwell",
    body: "A calm, local-first workspace for everything you think and read — notes, papers, math, and a map of how it all connects. It runs on your machine and works offline.",
    points: ["Your notes stay on your device", "No account required", "Plain Markdown, no lock-in"],
  },
  {
    Icon: PenLine,
    title: "Write and connect",
    body: "Notes are plain Markdown. Type [[ to link another note — every link weaves your ideas into a navigable web, with backlinks tracked automatically.",
    points: ["[[wikilinks]] connect notes", "Slash / commands and a formatting toolbar", "Tags, properties, embeds and callouts"],
  },
  {
    Icon: Share2,
    title: "See how it connects",
    body: "Your links become a living knowledge graph. Explore it as a map, or open the full-screen Constellation to rediscover forgotten corners of your vault.",
    points: ["Interactive knowledge graph", "Immersive Constellation view", "Canvas & infinite whiteboard"],
  },
  {
    Icon: Calculator,
    title: "So much more than notes",
    body: "A real computational math engine, a PDF reader with highlights and citations, flashcards with spaced repetition, a Kanban board, daily notes and a web clipper.",
    points: ["Live math engine & plots", "PDFs, citations & BibTeX", "Flashcards, Kanban, journal"],
  },
  {
    Icon: Sparkles,
    title: "Ask your whole vault",
    body: "The built-in assistant answers questions about your notes — navigating the knowledge graph to read only what matters. Bring your own key (free options included) and press Ctrl/Cmd+J.",
    points: ["12 AI providers, your key", "Grounded, cited answers", "Free options like Groq & Gemini"],
  },
];

export default function Onboarding() {
  const open = useVault((s) => s.onboardingOpen);
  const setOnboarding = useVault((s) => s.setOnboarding);
  const openArticle = useVault((s) => s.openArticle);
  const [i, setI] = useState(0);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    setOnboarding(false);
    openArticle("welcome");
  };

  return (
    <div className="ob-backdrop">
      <div className="ob">
        <button className="ob-skip" onClick={() => setOnboarding(false)}>
          Skip
        </button>
        <div className="ob-art" key={i}>
          <step.Icon size={40} strokeWidth={1.6} />
        </div>
        <h1 className="ob-title">{step.title}</h1>
        <p className="ob-body">{step.body}</p>
        <ul className="ob-points">
          {step.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <div className="ob-dots">
          {STEPS.map((_, k) => (
            <button
              key={k}
              className={"ob-dot" + (k === i ? " on" : "")}
              aria-label={`Step ${k + 1}`}
              onClick={() => setI(k)}
            />
          ))}
        </div>

        <div className="ob-actions">
          <button className="ob-btn ghost" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
            Back
          </button>
          {last ? (
            <button className="ob-btn primary" onClick={finish}>
              Explore the vault
            </button>
          ) : (
            <button className="ob-btn primary" onClick={() => setI((v) => v + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
