const mongoose = require("mongoose");

const StatsSchema = new mongoose.Schema({
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  correctStreak: { type: Number, default: 0 },
  incorrectStreak: { type: Number, default: 0 },
  maxCorrectStreak: { type: Number, default: 0 },
  maxIncorrectStreak: { type: Number, default: 0 },
  accHistory: [Number],
});

module.exports = mongoose.models.Stats || mongoose.model("Stats", StatsSchema);
