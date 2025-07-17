const express = require("express");
const NumberEntry = require("../models/NumberEntry");

const router = express.Router();

// GET recent number entries (latest 50)
router.get("/", async (req, res) => {
  try {
    const entries = await NumberEntry.find()
      .sort({ timestamp: -1 }) // newest first
      .limit(50)
      .lean();

    res.json(entries.reverse()); // oldest first for UI
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
