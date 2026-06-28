import { useMemo, useState } from "react";
import { useVault } from "../store/useVault";
import { useFlashcards, type Rating } from "../useFlashcards";
import { parseCards } from "../flashcards";
import "./CardsView.css";

const RATINGS: { rating: Rating; label: string; cls: string }[] = [
  { rating: "again", label: "Again", cls: "r-again" },
  { rating: "hard", label: "Hard", cls: "r-hard" },
  { rating: "good", label: "Good", cls: "r-good" },
  { rating: "easy", label: "Easy", cls: "r-easy" },
];

export default function CardsView() {
  const notes = useVault((s) => s.notes);
  const notesById = useVault((s) => s.notesById);
  const openArticle = useVault((s) => s.openArticle);
  const grade = useFlashcards((s) => s.grade);
  const isDue = useFlashcards((s) => s.isDue);
  const reviews = useFlashcards((s) => s.reviews);

  const allCards = useMemo(
    () => notes.flatMap((n) => parseCards(n.id, n.content ?? "")),
    [notes],
  );
  const byId = useMemo(() => new Map(allCards.map((c) => [c.id, c])), [allCards]);
  const dueIds = useMemo(
    () => allCards.filter((c) => isDue(c.id)).map((c) => c.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, reviews],
  );

  const [session, setSession] = useState<string[] | null>(null);
  const [flipped, setFlipped] = useState(false);

  const start = (ids: string[]) => {
    setSession(ids);
    setFlipped(false);
  };

  const onGrade = (r: Rating) => {
    if (!session) return;
    const id = session[0];
    grade(id, r);
    const rest = session.slice(1);
    setSession(r === "again" ? [...rest, id] : rest);
    setFlipped(false);
  };

  const total = allCards.length;
  const card = session && session.length ? byId.get(session[0]) : null;

  return (
    <main className="cards-view">
      <header className="cards-header">
        <div className="cards-title">
          <h1>Flashcards</h1>
          <span className="cards-subtitle">
            {dueIds.length} due · {total} total
          </span>
        </div>
        {session && session.length > 0 && (
          <span className="cards-left">{session.length} left</span>
        )}
      </header>

      <div className="cards-body">
        {session === null ? (
          <div className="cards-start">
            {total === 0 ? (
              <>
                <div className="cards-big">No cards yet</div>
                <p>
                  Write <code>Question :: Answer</code> in any note and it becomes a card.
                </p>
              </>
            ) : dueIds.length === 0 ? (
              <>
                <div className="cards-big">All caught up 🎉</div>
                <button className="seg-btn" onClick={() => start(allCards.map((c) => c.id))}>
                  Review all {total}
                </button>
              </>
            ) : (
              <>
                <div className="cards-big">{dueIds.length} cards due</div>
                <button className="cards-cta" onClick={() => start(dueIds)}>
                  Start review
                </button>
              </>
            )}
          </div>
        ) : !card ? (
          <div className="cards-start">
            <div className="cards-big">Done for now ✅</div>
            <button className="seg-btn" onClick={() => setSession(null)}>
              Back
            </button>
          </div>
        ) : (
          <div className="card-stage">
            <div className="flashcard" onClick={() => setFlipped((f) => !f)}>
              <div className="card-face card-q">{card.q}</div>
              {flipped && <div className="card-face card-a">{card.a}</div>}
              {!flipped && <div className="card-tap">tap to flip</div>}
            </div>

            {flipped ? (
              <div className="card-ratings">
                {RATINGS.map((r) => (
                  <button key={r.rating} className={"card-rate " + r.cls} onClick={() => onGrade(r.rating)}>
                    {r.label}
                  </button>
                ))}
              </div>
            ) : (
              <button className="cards-cta" onClick={() => setFlipped(true)}>
                Show answer
              </button>
            )}

            <button className="card-source" onClick={() => openArticle(card.noteId)}>
              from “{notesById.get(card.noteId)?.title ?? card.noteId}”
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
