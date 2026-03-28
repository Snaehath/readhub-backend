const mongoose = require("mongoose");

const aiNewsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  topic: { type: String, required: true },
  summary: { type: String, required: true },
  content: { type: String, default: "" },
  category: { type: String, default: "General" },
  hashtags: { type: [String], default: [] },
  authorName: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AiNews", aiNewsSchema);
