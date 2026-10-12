// Fully-local speech-to-text: transcribes an audio file with Whisper running in the browser
// (transformers.js / Xenova/whisper-tiny.en, ~40MB, browser-cached). No upload, no API.
import { loadOnce } from "../loadOnce";

export interface TranscribeProgress {
  stage: "download" | "decoding" | "transcribing" | "done";
  ratio?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// progress goes to whoever is waiting on the current load
let loadProgress: ((p: TranscribeProgress) => void) | undefined;

/** Load (once) the Whisper model; a failed load (offline…) is retried next time. */
const loadAsr = loadOnce<any>(async () => {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
    dtype: "q8",
    progress_callback: (e: any) => {
      if (e?.status === "progress" && typeof e.progress === "number")
        loadProgress?.({ stage: "download", ratio: e.progress / 100 });
    },
  });
});

function getAsr(onProgress?: (p: TranscribeProgress) => void): Promise<any> {
  if (onProgress) loadProgress = onProgress;
  return loadAsr();
}

/** Decode any browser-supported audio file to 16 kHz mono Float32 samples (what Whisper expects). */
async function decodeAudio(file: File | Blob): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC({ sampleRate: 16000 });
  try {
    const decoded = await ctx.decodeAudioData(buf);
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0).slice();
    // mix down to mono
    const a = decoded.getChannelData(0);
    const b = decoded.getChannelData(1);
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
    return out;
  } finally {
    ctx.close();
  }
}

/** True once the Whisper model has loaded. */
export function isAsrReady(): boolean {
  return loadAsr.ready();
}

/** Transcribe an audio file to text, entirely on-device. */
export async function transcribe(file: File, onProgress?: (p: TranscribeProgress) => void): Promise<string> {
  const pipe = await getAsr(onProgress);
  onProgress?.({ stage: "decoding" });
  const audio = await decodeAudio(file);
  onProgress?.({ stage: "transcribing" });
  const out = await pipe(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
  onProgress?.({ stage: "done" });
  return (Array.isArray(out) ? out.map((o: any) => o.text).join(" ") : out?.text ?? "").trim();
}
