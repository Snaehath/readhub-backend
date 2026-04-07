const mongoose = require("mongoose");

const StorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    title: { type: String, required: true },
    genre: { type: String, required: true },
    subject: { type: String, required: true },
    authorName: { type: String, required: true },
    storyType: { type: String, default: "novel" }, // New key to distinguish story types
    coverImage: { type: String, default: "" },
    synopsis: { type: String },
    characters: [
      {
        _id: false,
        name: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
    worldBuilding: { type: String },
    tableOfContents: [
      {
        _id: false,
        chapterNumber: { type: Number, required: true },
        title: { type: String, required: true },
      },
    ],
    chapters: [
      {
        _id: false,
        chapterNumber: { type: Number, required: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        publishedAt: { type: Date, default: Date.now },
      },
    ],
    maxChapters: { type: Number, default: 9 },
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
  },
  {
    timestamps: true,
    id: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

StorySchema.virtual("averageRating").get(function () {
  const count = this.reviewCount || 0;
  const sum = this.ratingSum || 0;
  if (count === 0) return 0;
  return Number((sum / count).toFixed(1));
});

module.exports = mongoose.models.Story || mongoose.model("Story", StorySchema);
