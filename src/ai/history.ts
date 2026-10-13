/**
 * Only the finished exchanges of a chat: a user turn stays only if an assistant reply follows it.
 * After Stop (or an error) the unanswered question would otherwise sit in the history, and a small
 * model answers THAT instead of the user's new question.
 */
export function answeredOnly<T extends { role: string }>(turns: T[]): T[] {
  return turns.filter((t, i) => t.role !== "user" || turns[i + 1]?.role === "assistant");
}
