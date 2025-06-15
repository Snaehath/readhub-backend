require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');

const newsRoutes = require("./routes/news");
const booksRoutes = require("./routes/books")
const chatBotRoute = require("./routes/chatbot")
const userRoutes = require("./routes/user")

const app = express();
app.use(cors());
app.use(express.json());

const mongodbURI = process.env.MONGO_URI

mongoose
  .connect(mongodbURI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/news", newsRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/user", userRoutes);
app.use('/api/ai',chatBotRoute)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
