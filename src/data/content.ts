import type { VaultData } from "./vault";

/** Hand-written markdown for the notes that carry the demo. */
const authored: Record<string, string> = {
  "convolutional-neural-networks": `# Convolutional Neural Networks

A **convolutional neural network** (CNN) is a class of [[Feedforward Neural Networks]]
that uses the [[Convolution Operation]] to exploit the spatial structure of grid-like
data such as images. Instead of connecting every input to every neuron, a CNN slides
small learnable filters across the input, sharing weights across positions.

## Why convolutions

- **Local connectivity** — each neuron sees only a small receptive field.
- **Weight sharing** — the same filter is reused everywhere, slashing parameter count.
- **Translation equivariance** — a feature is detected wherever it appears.

## Typical building blocks

1. Convolutional layers with [[Activation Functions]] (usually ReLU)
2. [[Pooling]] layers for spatial down-sampling
3. [[Batch Normalization]] to stabilise training
4. Fully-connected layers for the final prediction

## Where it shows up

CNNs are the backbone of classical [[Computer Vision]]. See [[Famous CNN Architectures]]
for the lineage from LeNet to ResNet, and [[Vision Transformer]] for the attention-based
alternative that is now competitive on the same tasks.

> Tip: add a layer of [[Dropout]] before the classifier to curb over-fitting.`,

  transformer: `# Transformer

The **Transformer** is a sequence model built entirely on the
[[Attention Mechanism]] — no recurrence, no convolution. Introduced in
*Attention Is All You Need*, it has become the default architecture for
[[Natural Language Processing]] and, via the [[Vision Transformer]], for images too.

## Core ideas

- **Self-attention** lets every token attend to every other token directly.
- **Multi-head attention** runs several attention maps in parallel.
- **[[Layer Normalization]]** and residual connections keep deep stacks trainable.

## Related

- [[Attention Mechanism]]
- [[Vision Transformer]]
- [[Natural Language Processing]]`,

  "activation-functions": `# Activation Functions

An **activation function** introduces non-linearity into a network, letting it
approximate functions far richer than a linear map. Without one, stacking
[[Feedforward Neural Networks]] layers would collapse into a single linear layer.

## Common choices

| Function | Range | Notes |
| --- | --- | --- |
| ReLU | \\[0, ∞) | Cheap, sparse, the default |
| Sigmoid | (0, 1) | Saturates; rarely used in hidden layers |
| Tanh | (-1, 1) | Zero-centred sigmoid |
| GELU | ≈ smooth ReLU | Common in [[Transformer]] models |

The choice interacts with [[Weight Initialization]] and [[Backpropagation]]:
saturating activations can stall gradients in deep stacks.`,

  backpropagation: `# Backpropagation

**Backpropagation** is the algorithm that computes the gradient of the
[[Loss Functions|loss]] with respect to every weight by applying the chain rule
of [[Calculus]] backwards through the network. Those gradients then feed
[[Gradient Descent]].

## The two passes

1. **Forward pass** — compute activations layer by layer.
2. **Backward pass** — propagate the error signal from output to input.

It is the computational engine behind almost all deep-learning training.`,

  "deep-learning-moc": `# Deep Learning — Map of Content

This is the home note for the vault. Start here.

## Sections

- [[Foundations MOC]] — the maths and ML basics
- [[NN Fundamentals MOC]] — neurons, activations, training
- [[Architectures MOC]] — CNNs, Transformers, RNNs and friends

## Highlights

- [[Convolutional Neural Networks]]
- [[Transformer]]`,
};

const lead = (title: string, area: string) =>
  `> _Stub note._ **${title}** lives in the **${area}** area of this vault.\n\n` +
  `Open it with the **Edit** button to start writing. Everything below is a starting scaffold.`;

/** Derive a couple of #tags for a note from its folder area + kind. */
function tagsFor(note: { folder: string; kind: string; title: string }): string {
  const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : "vault";
  const areaTag = area.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
  const tags = [`#${areaTag || "vault"}`];
  if (note.kind === "source") tags.push("#source");
  if (/\bMOC\b/.test(note.title)) tags.push("#moc");
  return tags.join(" ");
}

const sourceMeta: Record<string, { authors: string; year: string }> = {
  "src-alexnet": { authors: "Krizhevsky, Sutskever & Hinton", year: "2012" },
  "src-resnet": { authors: "He, Zhang, Ren & Sun", year: "2015" },
  "src-attention": { authors: "Vaswani et al.", year: "2017" },
  "src-vit": { authors: "Dosovitskiy et al.", year: "2020" },
};

/** A leading YAML frontmatter block of structured properties. */
function frontmatterFor(
  note: { id: string; folder: string; kind: string; title: string },
  written: boolean,
): string {
  const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : "Vault";
  const type = note.kind === "source" ? "source" : /\bMOC\b/.test(note.title) ? "moc" : "note";
  const lines = [`type: ${type}`, `area: ${area}`, `status: ${written ? "written" : "stub"}`];
  const sm = sourceMeta[note.id];
  if (sm) lines.push(`authors: ${sm.authors}`, `year: ${sm.year}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

/** Build a markdown string for every note (authored, or a templated stub). */
export function buildContents(vault: VaultData): Record<string, string> {
  const titleOf = new Map(vault.notes.map((n) => [n.id, n.title]));
  const out: Record<string, string> = {};

  for (const note of vault.notes) {
    if (authored[note.id]) {
      out[note.id] = `${frontmatterFor(note, true)}${authored[note.id]}\n\n---\n\n${tagsFor(note)}`;
      continue;
    }
    const area = note.folder ? note.folder.split("/")[0].replace(/^\d+\s*-\s*/, "") : vault.name;
    const related = note.links
      .map((id) => titleOf.get(id))
      .filter(Boolean)
      .map((t) => `- [[${t}]]`)
      .join("\n");

    out[note.id] = [
      frontmatterFor(note, false) + `# ${note.title}`,
      "",
      lead(note.title, area),
      "",
      "## Key points",
      `- ${note.title} is part of the **${area}** track.`,
      "- Replace this with your own notes.",
      "",
      "## Related notes",
      related || "_No links yet._",
      "",
      "---",
      "",
      tagsFor(note),
      "",
    ].join("\n");
  }
  return out;
}
