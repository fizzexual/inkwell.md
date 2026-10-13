// Wires one offline chat turn to the app: the vault's notes, on-device semantic search and the
// offline chat worker. (The logic itself is in ./chat.ts, tested without any of these.)
import chatModel from "../../ml/chat-model.json";
import { semanticSearch } from "../../search/semantic";
import { useVault } from "../../store/useVault";
import { runOfflineChat, type OfflineAnswer } from "./chat";
import { offlineChat } from "./host";

export function sendOffline(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  onToken: (t: string) => void,
  signal: AbortSignal,
): Promise<OfflineAnswer> {
  const notes = useVault.getState().notes;
  return runOfflineChat(
    question,
    history,
    {
      notes,
      search: (q, _ns, k) => semanticSearch(q, notes, k),
      generate: (messages, tok, sig) => offlineChat.generate(messages, chatModel.maxNewTokens, tok, sig),
    },
    onToken,
    signal,
  );
}
