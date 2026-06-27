export type NoteKind = "note" | "source";

export interface Note {
  id: string;
  title: string;
  folder: string; // "/" separated path, "" = vault root
  kind: NoteKind;
  links: string[]; // seed link ids (used to generate starter content)
  content?: string; // markdown body; live links are parsed from this
}

export interface VaultData {
  name: string;
  notes: Note[];
}

// Helper keeps the authored list terse.
const n = (
  id: string,
  title: string,
  folder: string,
  links: string[] = [],
  kind: NoteKind = "note",
): Note => ({ id, title, folder, kind, links });

const META = "00 - Meta";
const FOUND = "01 - Foundations";
const MLB = "01 - Foundations/Machine Learning Basics";
const MATH = "01 - Foundations/Mathematics";
const NNF = "02 - Neural Network Fundamentals";
const TRAIN = "03 - Training & Optimization";
const NORM = "03 - Training & Optimization/Normalization";
const ARCH = "04 - Architectures";
const APP = "05 - Applications";
const SRC = "06 - Sources";

export const vault: VaultData = {
  name: "Deep Learning",
  notes: [
    // 00 - Meta
    n("glossary", "Glossary", META, ["deep-learning-moc"]),
    n("how-to-use", "How to Use This Vault", META, ["deep-learning-moc", "tags"]),
    n("tags", "Tags", META, []),
    n("math-demo", "Math Engine Demo", META, ["backpropagation"]),

    // 01 - Foundations
    n("foundations-moc", "Foundations MOC", FOUND, [
      "the-perceptron",
      "supervised-learning",
      "linear-algebra",
      "gradient-descent",
      "deep-learning-moc",
    ]),
    n("the-perceptron", "The Perceptron", FOUND, [
      "artificial-neuron",
      "activation-functions",
      "linear-algebra",
    ]),
    //   Machine Learning Basics
    n("supervised-learning", "Supervised Learning", MLB, ["loss-functions", "overfitting"]),
    n("unsupervised-learning", "Unsupervised Learning", MLB, ["autoencoders"]),
    n("overfitting", "Overfitting", MLB, ["regularization", "dropout"]),
    //   Mathematics
    n("linear-algebra", "Linear Algebra", MATH, ["calculus"]),
    n("calculus", "Calculus", MATH, ["gradient-descent", "backpropagation"]),
    n("probability", "Probability", MATH, ["loss-functions"]),

    // 02 - Neural Network Fundamentals
    n("nn-fundamentals-moc", "NN Fundamentals MOC", NNF, [
      "artificial-neuron",
      "activation-functions",
      "backpropagation",
      "feedforward-neural-networks",
      "gradient-descent",
      "loss-functions",
    ]),
    n("artificial-neuron", "Artificial Neuron", NNF, ["activation-functions", "the-perceptron"]),
    n("activation-functions", "Activation Functions", NNF, [
      "feedforward-neural-networks",
      "backpropagation",
    ]),
    n("backpropagation", "Backpropagation", NNF, ["gradient-descent", "calculus", "loss-functions"]),
    n("feedforward-neural-networks", "Feedforward Neural Networks", NNF, [
      "activation-functions",
      "backpropagation",
      "convolutional-neural-networks",
    ]),
    n("gradient-descent", "Gradient Descent", NNF, ["optimizers", "loss-functions", "learning-rate"]),
    n("loss-functions", "Loss Functions", NNF, ["gradient-descent"]),
    n("universal-approximation", "Universal Approximation Theorem", NNF, [
      "feedforward-neural-networks",
      "activation-functions",
    ]),
    n("weight-initialization", "Weight Initialization", NNF, ["activation-functions", "batch-normalization"]),

    // 03 - Training & Optimization
    n("optimizers", "Optimizers", TRAIN, ["gradient-descent", "learning-rate"]),
    n("learning-rate", "Learning Rate Schedules", TRAIN, ["optimizers"]),
    n("regularization", "Regularization", TRAIN, ["dropout", "overfitting"]),
    n("dropout", "Dropout", TRAIN, ["regularization", "convolutional-neural-networks"]),
    //   Normalization
    n("batch-normalization", "Batch Normalization", NORM, [
      "layer-normalization",
      "convolutional-neural-networks",
    ]),
    n("layer-normalization", "Layer Normalization", NORM, ["transformer"]),

    // 04 - Architectures
    n("architectures-moc", "Architectures MOC", ARCH, [
      "convolutional-neural-networks",
      "transformer",
      "recurrent-neural-networks",
      "graph-neural-networks",
      "autoencoders",
      "generative-adversarial-networks",
    ]),
    n("convolutional-neural-networks", "Convolutional Neural Networks", ARCH, [
      "activation-functions",
      "vision-transformer",
      "pooling",
      "computer-vision",
      "convolution-operation",
      "famous-cnn-architectures",
      "batch-normalization",
      "feedforward-neural-networks",
      "dropout",
    ]),
    n("convolution-operation", "Convolution Operation", ARCH, [
      "convolutional-neural-networks",
      "pooling",
    ]),
    n("pooling", "Pooling", ARCH, ["convolutional-neural-networks"]),
    n("famous-cnn-architectures", "Famous CNN Architectures", ARCH, [
      "convolutional-neural-networks",
      "residual-networks",
      "image-classification",
    ]),
    n("residual-networks", "Residual Networks", ARCH, [
      "famous-cnn-architectures",
      "batch-normalization",
    ]),
    n("recurrent-neural-networks", "Recurrent Neural Networks", ARCH, ["lstm", "speech-audio"]),
    n("lstm", "LSTM", ARCH, ["recurrent-neural-networks", "natural-language-processing"]),
    n("attention-mechanism", "Attention Mechanism", ARCH, ["transformer"]),
    n("transformer", "Transformer", ARCH, [
      "attention-mechanism",
      "vision-transformer",
      "natural-language-processing",
      "layer-normalization",
    ]),
    n("vision-transformer", "Vision Transformer", ARCH, [
      "transformer",
      "convolutional-neural-networks",
      "computer-vision",
    ]),
    n("graph-neural-networks", "Graph Neural Networks", ARCH, ["attention-mechanism"]),
    n("autoencoders", "Autoencoders", ARCH, ["generative-adversarial-networks"]),
    n("generative-adversarial-networks", "Generative Adversarial Networks", ARCH, ["autoencoders"]),

    // 05 - Applications
    n("computer-vision", "Computer Vision", APP, [
      "convolutional-neural-networks",
      "image-classification",
      "object-detection",
    ]),
    n("image-classification", "Image Classification", APP, [
      "famous-cnn-architectures",
      "transfer-learning",
    ]),
    n("object-detection", "Object Detection", APP, ["convolutional-neural-networks"]),
    n("natural-language-processing", "Natural Language Processing", APP, ["transformer", "lstm"]),
    n("speech-audio", "Speech & Audio", APP, ["recurrent-neural-networks"]),
    n("transfer-learning", "Transfer Learning", APP, ["convolutional-neural-networks"]),

    // central hub
    n("deep-learning-moc", "Deep Learning MOC", "", [
      "foundations-moc",
      "nn-fundamentals-moc",
      "architectures-moc",
      "transformer",
    ]),

    // 06 - Sources
    n("src-alexnet", "AlexNet (2012)", SRC, ["famous-cnn-architectures"], "source"),
    n("src-resnet", "ResNet (2015)", SRC, ["residual-networks"], "source"),
    n("src-attention", "Attention Is All You Need (2017)", SRC, ["transformer"], "source"),
    n("src-vit", "An Image Is Worth 16x16 Words (2020)", SRC, ["vision-transformer"], "source"),
  ],
};
