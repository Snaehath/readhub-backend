const mongoose = require("mongoose");

const aiNewsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  topic: { type: String },
  summary: { type: String },
  authorName: { type: String, default: "ReadHub Intelligence" },
  category: { type: String, default: "Investigation" },
  hashtags: [{ type: String }],
  content: { type: String, required: true }, // The generated report
  researchData: { type: String }, // Raw scraped context
  sources: [{
    title: String,
    url: String,
    sourceName: String
  }],
  isCompleted: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AiNews", aiNewsSchema);
