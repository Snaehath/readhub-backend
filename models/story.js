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
    reviews: [
      {
        _id: false,
        reviewerName: { type: String }, // Flexible name instead of userId
        rating: { type: Number, min: 1, max: 5 },
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
  if (!this.reviews || this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, curr) => acc + curr.rating, 0);
  return Number((sum / this.reviews.length).toFixed(1));
});

module.exports = mongoose.models.Story || mongoose.model("Story", StorySchema);
