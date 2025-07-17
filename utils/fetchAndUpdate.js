const axios = require("axios");
const NumberEntry = require("../models/NumberEntry");
const Stats = require("../models/Stats");
const modelService = require("../services/modelService");

let seenIssues = new Set();

module.exports = async function fetchAndUpdate() {
  try {
    const res = await axios.get(
      "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json",
      {
        params: { ts: Date.now() },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        },
      }
    );

    const latest = res.data.data.list[0];
    const num = Number(latest.number);
    const issue = latest.issueNumber;

    if (seenIssues.has(issue)) return;
    seenIssues.add(issue);

    const history = await NumberEntry.find().sort({ timestamp: 1 }).lean();

    if (history.length < 3) {
      console.log("Not enough history yet, inserting initial entry...");
      await NumberEntry.create({ issue, num, predicted: num });
      return;
    }

    const n1 = history.at(-3).num;
    const n2 = history.at(-2).num;
    const n3 = history.at(-1).num;

    const predicted = await modelService.predict(n1, n2, n3);

    modelService.addTrainingData(n1, n2, n3, num);
    modelService.trainCounter++;

    if (modelService.trainCounter >= 5) {
      modelService.trainCounter = 0;
      await modelService.trainBatch();
    }

    const predictedBig = predicted >= 5;
    const actualBig = num >= 5;
    const isCorrect = predictedBig === actualBig;

    try {
      await NumberEntry.create({ issue, num, predicted });
    } catch (e) {
      if (e.code === 11000) {
        console.warn("Duplicate entry, skipping...");
      } else {
        throw e;
      }
    }

    let stats = await Stats.findOne();
    if (!stats) stats = new Stats();

    if (isCorrect) {
      stats.correctCount++;
      stats.correctStreak++;
      stats.incorrectStreak = 0;
      if (stats.correctStreak > stats.maxCorrectStreak)
        stats.maxCorrectStreak = stats.correctStreak;
    } else {
      stats.incorrectCount++;
      stats.incorrectStreak++;
      stats.correctStreak = 0;
      if (stats.incorrectStreak > stats.maxIncorrectStreak)
        stats.maxIncorrectStreak = stats.incorrectStreak;
    }

    stats.accHistory.push(isCorrect ? 1 : 0);
    if (stats.accHistory.length > 32) stats.accHistory.shift();

    await stats.save();

    console.log(
      `📊 Predicted: ${predicted} | Actual: ${num} | ${isCorrect ? "✅" : "❌"}`
    );
  } catch (err) {
    console.error("❌ fetchAndUpdate error:", err);
  }
};
