const tf = require("@tensorflow/tfjs");
const ModelStorage = require("../models/ModelStorage");

class ModelService {
  constructor() {
    this.model = null;
    this.trainCounter = 0;
    this.trainingData = [];
  }

  async loadModel() {
    // Load model JSON + weights from MongoDB
    const doc = await ModelStorage.findOne().sort({ updatedAt: -1 });
    if (doc) {
      const handler = tf.io.fromMemory(doc.modelTopology, {
        specs: doc.weightSpecs,
        data: new Uint8Array(doc.weightData.buffer),
      });
      this.model = await tf.loadLayersModel(handler);
      this.model.compile({
        optimizer: tf.train.adam(),
        loss: "meanSquaredError",
      });
      console.log("✅ Model loaded from MongoDB");
    } else {
      // Create new model if none found
      this.model = this.createModel();
      console.log("⚠️ No saved model found, created new model");
    }
  }

  createModel() {
    // Your model architecture here, e.g.:
    const model = tf.sequential();
    model.add(
      tf.layers.dense({ units: 32, activation: "relu", inputShape: [3] })
    );
    model.add(tf.layers.dense({ units: 16, activation: "relu" }));
    model.add(tf.layers.dense({ units: 1, activation: "linear" }));
    model.compile({ optimizer: "adam", loss: "meanSquaredError" });
    return model;
  }

  async saveModel() {
    if (!this.model) return;
    // Save model to memory and then to MongoDB
    const saveResult = await this.model.save(
      tf.io.withSaveHandler(async (modelArtifacts) => {
        // modelArtifacts = { modelTopology, weightSpecs, weightData }
        const { modelTopology, weightSpecs, weightData } = modelArtifacts;
        const dataBuffer = Buffer.from(weightData);

        // Upsert model in MongoDB
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

  addTrainingData(n1, n2, n3, actual) {
    // Add feature vector and label to training data
    this.trainingData.push({ xs: [n1, n2, n3], ys: actual });
  }

  async trainBatch() {
    if (this.trainingData.length < 5) return; // batch size threshold

    const xs = tf.tensor2d(this.trainingData.map((d) => d.xs));
    const ys = tf.tensor2d(this.trainingData.map((d) => [d.ys]));

    await this.model.fit(xs, ys, {
      epochs: 10,
      verbose: 0,
    });

    xs.dispose();
    ys.dispose();

    this.trainingData = [];
    await this.saveModel();
  }

  async predict(n1, n2, n3) {
    if (!this.model) throw new Error("Model not loaded");

    const input = tf.tensor2d([[n1, n2, n3]]);
    const output = this.model.predict(input);
    const prediction = (await output.data())[0];

    input.dispose();
    output.dispose();

    return Math.round(prediction);
  }
}

module.exports = new ModelService();
