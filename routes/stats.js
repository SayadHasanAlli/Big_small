const express = require("express");
const Stats = require("../models/Stats");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const stats = await Stats.findOne();
    if (!stats) {
      // Return default empty stats if none in DB yet
      return res.json({
        correctCount: 0,
        incorrectCount: 0,
        correctStreak: 0,
        incorrectStreak: 0,
        maxCorrectStreak: 0,
        maxIncorrectStreak: 0,
        accHistory: [],
      });
    }
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
