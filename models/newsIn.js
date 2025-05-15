const mongoose = require("mongoose");

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  content: String,
  url: { type: String, required: true },
  urlToImage: String,
  publishedAt: { type: Date, required: true },
  category: { type: [String], default: ['general'] },
  source: {
    name: String,
  },
});

module.exports = mongoose.models.NewsIn || mongoose.model("NewsIn", NewsSchema);
