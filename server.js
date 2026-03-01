require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const cors = require("cors");

const newsRoutes = require("./routes/news");
const booksRoutes = require("./routes/books");
const chatBotRoute = require("./routes/chatbot");
const userRoutes = require("./routes/user");
const storyRoutes = require("./routes/story");

const app = express();
app.use(cors());
app.use(express.json());
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

const mongodbURI = process.env.MONGO_URI;

mongoose
  .connect(mongodbURI)
  .then(async () => {
    console.log("✅ MongoDB connected");

    // Check Local SLM (Ollama)
    if (process.env.AI_MODE === "local") {
      try {
        await axios.get("http://localhost:11434/api/tags");
        console.log("Local AI (Ollama) is ONLINE");
      } catch (e) {
        console.warn("Local AI (Ollama) is OFFLINE. Make sure it's running!");
      }
    }

    // Check Local Image Gen (Forge)
    try {
      await axios.get("http://127.0.0.1:7860/sdapi/v1/options", {
        timeout: 2000,
      });
      console.log("Image Gen AI (Forge) is ONLINE");
    } catch (e) {
      console.warn("Image Gen AI (Forge) is OFFLINE. (Check Stability Matrix)");
    }
  })
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/news", newsRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/user", userRoutes);
app.use("/api/ai", chatBotRoute);
app.use("/api/story", storyRoutes);

app.post("/api/ping", (req, res) => {
  console.log("Received ping from frontend");
  res.status(200).json({ message: "Success" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
