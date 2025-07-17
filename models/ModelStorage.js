const mongoose = require("mongoose");

const ModelStorageSchema = new mongoose.Schema({
  modelTopology: Object,
  weightSpecs: Array,
  weightData: Buffer,
  dateSaved: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ModelStorage", ModelStorageSchema);
