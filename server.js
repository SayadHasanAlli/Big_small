require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");

const fetchAndUpdate = require("./utils/fetchAndUpdate");
const modelService = require("./services/modelService");

const predictionRoute = require("./routes/prediction");
const statsRoute = require("./routes/stats");
const historyRoute = require("./routes/history");

const app = express();
const PORT = process.env.PORT || 4500;

app.use(cors());
app.use(bodyParser.json());

app.use("/prediction", predictionRoute);
app.use("/stats", statsRoute);
app.use("/history", historyRoute);

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("✅ MongoDB connected");
    await modelService.loadModel();
    setInterval(fetchAndUpdate, 4000);
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
