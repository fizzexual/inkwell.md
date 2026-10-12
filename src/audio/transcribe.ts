// Fully-local speech-to-text: transcribes an audio file with Whisper (whisper-tiny.en, ~40MB,
// shipped with the app) running in the on-device ML worker (src/ml/). No upload, no API.
import { loadOnce } from "../loadOnce";
import { ml } from "../ml/host";

export interface TranscribeProgress {
  stage: "download" | "decoding" | "transcribing" | "done";
  ratio?: number;
}

// progress goes to whoever is waiting on the current load
let loadProgress: ((p: TranscribeProgress) => void) | undefined;

/** Load (once) the Whisper model in the worker; a failed load is retried next time. */
const loadAsr = loadOnce<null>(() => ml.load("asr", (ratio) => loadProgress?.({ stage: "download", ratio })));

function getAsr(onProgress?: (p: TranscribeProgress) => void): Promise<null> {
  if (onProgress) loadProgress = onProgress;
  return loadAsr();
}

// AudioContext only exists on the main thread, so decoding stays here; the samples are then
// transferred (not copied) to the worker.
/** Decode any browser-supported audio file to 16 kHz mono Float32 samples (what Whisper expects). */
async function decodeAudio(file: File | Blob): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  await getAsr(onProgress);
  onProgress?.({ stage: "decoding" });
  const audio = await decodeAudio(file);
  onProgress?.({ stage: "transcribing" });
  const text = await ml.transcribe(audio);
  onProgress?.({ stage: "done" });
  return text;
}
