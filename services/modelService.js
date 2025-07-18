const tf = require("@tensorflow/tfjs");
const ModelStorage = require("../models/ModelStorage");
const Global = require("../models/Global");

class ModelService {
  constructor() {
    this.model = null;
    this.markovMap = {};
    this.trainingData = [];
    this.trainCounter = 0;

    this.lastResults = []; // last 32 predictions
    this.currentStreak = 0;
    this.lastPrediction = null;
    this.correctCount = 0;
    this.incorrectCount = 0;
  }

  async init() {
    await this.loadModel();
    await this.loadGlobalStats();
  }

  // ------------------ Model Logic ------------------

  createModel() {
    const model = tf.sequential();
    model.add(
      tf.layers.dense({ units: 32, activation: "relu", inputShape: [8] })
    );
    model.add(tf.layers.dense({ units: 16, activation: "relu" }));
    model.add(tf.layers.dense({ units: 1, activation: "linear" }));
    model.compile({ optimizer: "adam", loss: "meanSquaredError" });
    return model;
  }

  async loadModel() {
    const doc = await ModelStorage.findOne().sort({ updatedAt: -1 });
    if (doc) {
      const handler = tf.io.fromMemory(doc.modelTopology, {
        specs: doc.weightSpecs,
        data: new Uint8Array(doc.weightData.buffer),
      });
      this.model = await tf.loadLayersModel(handler);
      this.model.compile({ optimizer: "adam", loss: "meanSquaredError" });
      console.log("✅ Model loaded from MongoDB");
    } else {
      this.model = this.createModel();
      console.log("⚠️ No saved model found. Created new model.");
    }
  }

  async saveModel() {
    if (!this.model) return;
    await this.model.save(
      tf.io.withSaveHandler(async (modelArtifacts) => {
        const { modelTopology, weightSpecs, weightData } = modelArtifacts;
        const dataBuffer = Buffer.from(weightData);
        await ModelStorage.findOneAndUpdate(
          {},
          {
            modelTopology,
            weightSpecs,
            weightData: dataBuffer,
            updatedAt: new Date(),
          },
          { upsert: true }
        );
        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: "JSON",
          },
        };
      })
    );
    console.log("✅ Model saved to MongoDB");
  }

  // ------------------ Feature Engineering ------------------

  extractFeatures(n1, n2, n3) {
    return [
      n1 / 9,
      n2 / 9,
      n3 / 9,
      Math.abs(n2 - n1) / 9,
      Math.abs(n3 - n2) / 9,
      n1 % 2 === 0 ? 1 : 0,
      n2 % 2 === 0 ? 1 : 0,
      n3 % 2 === 0 ? 1 : 0,
    ];
  }

  addTrainingData(n1, n2, n3, actual) {
    const features = this.extractFeatures(n1, n2, n3);
    this.trainingData.push({ xs: features, ys: actual / 9 });
    this.addMarkov(n1, n2, n3, actual);
  }

  async trainBatch() {
    if (this.trainingData.length < 5) return;

    const xs = tf.tensor2d(this.trainingData.map((d) => d.xs));
    const ys = tf.tensor2d(this.trainingData.map((d) => [d.ys]));

    await this.model.fit(xs, ys, {
      epochs: 30, // Try 30 or 50 for stronger learning
      batchSize: 16, // (Optional) controls how many examples are processed at once
      verbose: 0,
    });

    xs.dispose();
    ys.dispose();
    this.trainingData = [];

    await this.saveModel();
  }

  // ------------------ Markov Logic ------------------

  addMarkov(n1, n2, n3, actual) {
    const key = `${n1}-${n2}-${n3}`;
    if (!this.markovMap[key]) this.markovMap[key] = {};
    this.markovMap[key][actual] = (this.markovMap[key][actual] || 0) + 1;
  }

  predictMarkov(n1, n2, n3) {
    const key = `${n1}-${n2}-${n3}`;
    const values = this.markovMap[key];
    if (!values) return null;

    const sorted = Object.entries(values).sort((a, b) => b[1] - a[1]);
    return Number(sorted[0][0]);
  }

  // ------------------ Accuracy & Stats ------------------

  updateStats(predicted, actual) {
    const isCorrect = predicted === actual;
    this.lastResults.push(isCorrect ? 1 : 0);
    if (this.lastResults.length > 32) this.lastResults.shift();

    if (isCorrect) {
      this.correctCount++;
      this.currentStreak++;
    } else {
      this.incorrectCount++;
      this.currentStreak = 0;
    }

    this.saveGlobalStats();
  }

  getRollingAccuracy() {
    if (this.lastResults.length === 0) return 0;
    const sum = this.lastResults.reduce((a, b) => a + b, 0);
    return (sum / this.lastResults.length) * 100;
  }

  getConfidence() {
    const accuracy = this.getRollingAccuracy();
    if (accuracy >= 60) return "high";
    if (accuracy >= 50) return "medium";
    return "low";
  }

  // ------------------ MongoDB Global Save ------------------

  async loadGlobalStats() {
    const doc = await Global.findOne({ key: "global" });
    if (doc && doc.counters) {
      this.correctCount = doc.counters.correctCount || 0;
      this.incorrectCount = doc.counters.incorrectCount || 0;
      this.lastResults = doc.lastResults || [];
    }
  }

  async saveGlobalStats() {
    await Global.findOneAndUpdate(
      { key: "global" },
      {
        counters: {
          correctCount: this.correctCount,
          incorrectCount: this.incorrectCount,
        },
        lastResults: this.lastResults,
      },
      { upsert: true }
    );
  }

  // ------------------ Final Prediction ------------------

  async predict(n1, n2, n3, actual = null) {
    const features = this.extractFeatures(n1, n2, n3);
    const input = tf.tensor2d([features]);
    const output = this.model.predict(input);
    const prediction = (await output.data())[0] * 9;
    input.dispose();
    output.dispose();

    const markovGuess = this.predictMarkov(n1, n2, n3);
    let finalPrediction = prediction;

    // Hybrid logic: if markov available, blend both
    if (markovGuess !== null) {
      finalPrediction = (prediction + markovGuess) / 2;
    }

    const rounded = Math.max(0, Math.min(9, Math.round(finalPrediction)));

    if (actual !== null) {
      this.addTrainingData(n1, n2, n3, actual);
      this.trainCounter++;
      if (this.trainCounter >= 5) {
        this.trainCounter = 0;
        await this.trainBatch();
      }

      this.updateStats(rounded, actual);
    }

    this.lastPrediction = rounded;

    return {
      predicted: rounded,
      Fprediction: finalPrediction,
      confidence: this.getConfidence(),
      streak: this.currentStreak,
      accuracy: this.getRollingAccuracy().toFixed(2),
    };
  }
}

module.exports = new ModelService();
