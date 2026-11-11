const mongoose = require("mongoose");

const aiNewsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  reportType: { type: String, enum: ["manual", "daily"], default: "manual" },
  editionDate: { type: String },
  topic: { type: String },
  summary: { type: String },
  authorName: { type: String, default: "ReadHub Intelligence" },
  category: { type: String, default: "Investigation" },
  hashtags: [{ type: String }],
  content: { type: String, required: true }, // The generated report
  researchData: { type: String }, // Raw scraped context
  sources: [{
    citationNumber: Number,
    title: String,
    url: String,
    sourceName: String,
    category: String,
    publishedAt: Date,
  }],
  isCompleted: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

aiNewsSchema.index(
  { editionDate: 1 },
  { unique: true, partialFilterExpression: { reportType: "daily", editionDate: { $type: "string" } } },
);

module.exports = mongoose.model("AiNews", aiNewsSchema);
