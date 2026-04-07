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
  reviewCount: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  reviews: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewerName: { type: String },
      rating: { type: Number, required: true, min: 1, max: 5 },
      review: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

aiNewsSchema.virtual("averageRating").get(function () {
  const count = this.reviewCount || 0;
  const sum = this.ratingSum || 0;
  if (count === 0) return 0;
  return Number((sum / count).toFixed(1));
});

module.exports = mongoose.model("AiNews", aiNewsSchema);
