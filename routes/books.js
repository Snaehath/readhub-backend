const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const Books = require("../models/books")
const router = express.Router();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Route: GET /ai
// router.get("/", async (req, res) => {
//   try {
//     const response = await ai.models.generateContent({
//       model: "gemini-2.0-flash",
//       contents: "Zelensky and Trump meet inside St Peter's Basilica before Pope's funeral this is a news headline explain what happened",
//     });

//     const text = response.text;

//     res.json({ message: text });
//   } catch (error) {
//     console.error("Error generating AI content:", error);
//     res.status(500).json({ error: "Something went wrong with AI generation" });
//   }
// });

router.get("/fetch/books", async (req, res) => {
  try {
    const categories = [
      "biography",
      "history",
      "science",
      "sports",
      "business",
      "horror",
      "fantasy",
      "children"
    ];

    if (categories.length === 0) {
      return res.status(400).json({ error: "At least one category is required" });
    }

    const fetchPromises = categories.map((category) =>
      axios.get(`https://gutendex.com/books?topic=${category}`).then((response) => ({
        category,
        books: response.data.results,
      }))
    );

    const allFetchedData = await Promise.all(fetchPromises);

    let allSavedBooks = [];

    for (const { category, books } of allFetchedData) {
      const savedBooks = await Promise.all(
        books.map(async (book) => {
          const updated = await Books.findOneAndUpdate(
            { gutenbergId: book.id },
            {
              $setOnInsert: {
                title: book.title,
                authors: book.authors.map((a) => ({ name: a.name })),
                summaries: book.summaries || [],
                readUrl: book.formats["text/html"] || book.formats["text/plain; charset=us-ascii"] || "",
                coverImage: book.formats["image/jpeg"] || "",
                gutenbergId: book.id,
              },
              $addToSet: {
                category: category,
              },
            },
            { upsert: true, new: true }
          );
          return updated;
        })
      );

      allSavedBooks = allSavedBooks.concat(savedBooks);
    }

    res.status(200).json({
      message: `Fetched and saved books for categories: ${categories.join(", ")}`,
      count: allSavedBooks.length,
    });
  } catch (err) {
    console.error("Error fetching multiple categories:", err.message);
    res.status(500).json({ error: "Failed to fetch multiple categories" });
  }
});

module.exports = router;
