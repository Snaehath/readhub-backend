const mongoose = require("mongoose");

const BooksSchema = new mongoose.Schema({
  title: { type: String, required: true },
  authors: [{
    name: { type: String }
  }],
  summaries: { type: [String], default: [] },
  readUrl: { type: String, required: true },
  coverImage: { type: String },
  category: { type: [String], default: [] },
  gutenbergId: { type: Number, unique: true } // to keep track of original Gutendex ID
});

module.exports = mongoose.models.Books || mongoose.model("Books", BooksSchema);