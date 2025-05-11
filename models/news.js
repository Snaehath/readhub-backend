const mongoose = require("mongoose");

const NewsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  url: { type: String, required: true },
  urlToImage: String,
  publishedAt: { type: Date, required: true },
  category: { type: [String], default: ['general'] },
  source: {
    id: String,
    name: String,
  },
});

module.exports = mongoose.models.News || mongoose.model("News", NewsSchema);
