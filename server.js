require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');

const newsRoutes = require("./routes/news");
const booksRoutes = require("./routes/books")
const chatBotRoute = require("./routes/chatbot")

const app = express();
app.use(cors());
app.use(express.json());


mongoose
  .connect("mongodb+srv://root:abc123ABC123@cluster0.qo5wjbl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/news", newsRoutes);
app.use("/api/books", booksRoutes);
app.use('/api/ai',chatBotRoute)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
