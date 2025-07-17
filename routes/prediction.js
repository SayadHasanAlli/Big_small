const express = require("express");
const NumberEntry = require("../models/NumberEntry");
const modelService = require("../services/modelService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const latest = await NumberEntry.findOne().sort({ timestamp: -1 }).lean();
    if (!latest) return res.json({ prediction: null });

    const history = await NumberEntry.find().sort({ timestamp: 1 }).lean();

    if (history.length < 3) return res.json({ prediction: null });

    const n1 = history.at(-3).num;
    const n2 = history.at(-2).num;
    const n3 = history.at(-1).num;

    const predicted = await modelService.predict(n1, n2, n3);

    res.json({ prediction: predicted });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
