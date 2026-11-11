const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

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
  }
});

NewsSchema.plugin(mongoosePaginate);
NewsSchema.index({ publishedAt: -1 });
NewsSchema.index({ category: 1, publishedAt: -1 });

module.exports = mongoose.models.NewsIn || mongoose.model("NewsIn", NewsSchema);
