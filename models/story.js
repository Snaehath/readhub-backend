const mongoose = require("mongoose");

const StorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    genre: { type: String, required: true },
    subject: { type: String, required: true },
    authorName: { type: String, required: true },
    tableOfContents: [
      {
        chapterNumber: { type: Number, required: true },
        title: { type: String, required: true },
      },
    ],
    chapters: [
      {
        chapterNumber: { type: Number, required: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        publishedAt: { type: Date, default: Date.now },
      },
    ],
    maxChapters: { type: Number, default: 9 },
    isCompleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Story || mongoose.model("Story", StorySchema);
