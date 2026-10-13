// The real text generator behind the offline chat worker, written against the transformers.js API
// so the worker (web build) and the Node smoke test (node build) run the same code.
import type { ChatHandlers, OnProgress } from "./protocol";
import { loadWithFallback, type Device } from "./runtime";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The parts of transformers.js the generator uses (the module itself in practice). */
export interface Transformers {
  AutoTokenizer: { from_pretrained(id: string, o?: any): Promise<any> };
  AutoModelForCausalLM: { from_pretrained(id: string, o?: any): Promise<any> };
  TextStreamer: new (tokenizer: any, o: any) => any;
  InterruptableStoppingCriteria: new () => { interrupt(): void; reset(): void };
}

export interface ModelSpec {
  id: string;
  dtype: string;
}

export function createGenerator(
  t: Transformers,
  spec: ModelSpec,
  /** device to try first ("webgpu" falls back to "wasm"); Node uses "cpu" */
  firstDevice: () => Promise<Device | "cpu">,
): ChatHandlers {
  let loaded: Promise<{ tokenizer: any; model: any; device: string }> | null = null;
  let progressTo: OnProgress | undefined;

  const progress = (e: any) => {
    if (e?.status === "progress" && typeof e.progress === "number") progressTo?.(e.progress / 100, e.file);
  };

  const load = () =>
    (loaded ??= (async () => {
      const tokenizer = await t.AutoTokenizer.from_pretrained(spec.id, { progress_callback: progress });
      const first = await firstDevice();
      const make = (device: string) =>
        t.AutoModelForCausalLM.from_pretrained(spec.id, { dtype: spec.dtype, device, progress_callback: progress });
      const { device, value: model } =
        first === "cpu" ? { device: "cpu", value: await make("cpu") } : await loadWithFallback(first, make);
      return { tokenizer, model, device };
    })().catch((err) => {
      loaded = null; // a failed load is retried on the next request
      throw err;
    }));

  return {
    async load(onProgress) {
      progressTo = onProgress;
      const { device } = await load();
      return { device };
    },

    async generate(messages, maxNewTokens, onToken, shouldStop) {
      const { tokenizer, model } = await load();
      const inputs = tokenizer.apply_chat_template(messages, {
        add_generation_prompt: true,
        return_dict: true,
        enable_thinking: false, // Qwen3: answer directly, no <think> block
      });
      const stopping = new t.InterruptableStoppingCriteria();
      let text = "";
      let tokens = 0;
      const streamer = new t.TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (s: string) => {
          text += s;
          onToken(s);
        },
        token_callback_function: () => {
          tokens++;
          if (shouldStop()) stopping.interrupt();
        },
      });
      await model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        do_sample: false,
        repetition_penalty: 1.1,
        streamer,
        stopping_criteria: stopping,
      });
      return { text, tokens };
    },
  };
}
