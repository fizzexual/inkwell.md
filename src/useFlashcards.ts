import { create } from "zustand";

export type Rating = "again" | "hard" | "good" | "easy";

interface Review {
  ease: number;
  interval: number; // days
  due: string; // ISO date
}

const STORAGE = "inkwell.cards.v1";
function load(): Record<string, Review> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "{}");
  } catch {
    return {};
  }
}

const isoIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
};
export const todayIso = () => new Date().toISOString().slice(0, 10);

interface CardState {
  reviews: Record<string, Review>;
  grade: (id: string, rating: Rating) => void;
  isDue: (id: string) => boolean;
}

export const useFlashcards = create<CardState>((set, get) => ({
  reviews: load(),
  isDue: (id) => {
    const r = get().reviews[id];
    return !r || r.due <= todayIso();
  },
  grade: (id, rating) =>
    set((s) => {
      const r = s.reviews[id] ?? { ease: 2.5, interval: 0, due: "" };
      let ease = r.ease;
      let interval = r.interval;
      if (rating === "again") {
        ease = Math.max(1.3, ease - 0.2);
        interval = 0;
      } else if (rating === "hard") {
        ease = Math.max(1.3, ease - 0.15);
        interval = Math.max(1, interval * 1.2);
      } else if (rating === "good") {
        interval = interval === 0 ? 1 : interval * ease;
      } else {
        ease = Math.min(3, ease + 0.15); // clamp ease so repeated "Easy" can't run away
        interval = (interval || 1) * ease * 1.3;
      }
      interval = Math.min(Math.round(interval), 1825); // whole days, capped at ~5 years
      return { reviews: { ...s.reviews, [id]: { ease, interval, due: isoIn(interval) } } };
    }),
}));

let queued = false;
useFlashcards.subscribe(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(useFlashcards.getState().reviews));
    } catch {
      /* ignore */
    }
  });
});
