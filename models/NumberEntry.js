const mongoose = require("mongoose");

const NumberEntrySchema = new mongoose.Schema({
  issue: { type: String, unique: true },
  num: Number,
  predicted: Number,
  timestamp: { type: Date, default: Date.now },
});

const NumberEntry =
  mongoose.models.NumberEntry ||
  mongoose.model("NumberEntry", NumberEntrySchema);

module.exports = NumberEntry;
