const mongoose = require("mongoose");

const globalSchema = new mongoose.Schema({
  key: String,
  counters: {
    correctCount: Number,
    incorrectCount: Number,
  },
  lastResults: [Number],
});

module.exports = mongoose.model("Global", globalSchema);
