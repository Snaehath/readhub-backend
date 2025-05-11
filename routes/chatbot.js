const express = require("express");
const router = express.Router();
const { chatWithGemini } = require("../models/geminiClient");
const NewsUs = require("../models/news");
const NewsIndia = require("../models/newsIn");
const fetch = require("node-fetch");

const categories = [
  "technology",
  "science",
  "health",
  "sports",
  "business",
  "entertainment",
  "politics",
];

router.post("/chat", async (req, res) => {
  const { userMessage } = req.body;

  try {
    const message = userMessage.toLowerCase();
    let collection = message.includes("india") ? NewsIndia : NewsUs;

    // Detect book-related message
    const isBookRequest =
      message.includes("book") || message.includes("recommend");

    if (isBookRequest) {
      const searchTerm = encodeURIComponent(
        userMessage.replace(/recommend( me)? (a )?book( on)?/i, "").trim()
      );

      const response = await fetch(
        `https://openlibrary.org/search.json?q=${searchTerm}&lang=en&limit=2`
      );
      const data = await response.json();

      const books = data.docs.slice(0, 2).map((book) => ({
        title: book.title,
        author: book.author_name
          ? book.author_name.join(", ")
          : "Unknown Author",
        link: book.key ? `https://openlibrary.org${book.key}` : null,
        cover: book.cover_edition_key
          ? `https://covers.openlibrary.org/b/olid/${book.cover_edition_key}-M.jpg`
          : `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`,
      }));

      let bookReply = `Here are some books I found:\n\n`;
      books.forEach((book) => {
        bookReply += `### 📘 [${book.title}](${book.link})\n`;
        bookReply += `**Author:** ${book.author}\n`;
        if (book.cover) {
          bookReply += `![Cover Image](${book.cover})\n`;
        }
        bookReply += `\n`;
      });

      return res.json({ reply: bookReply });
    }

    //  Magazine summary
    const isSummaryRequest =
      message.includes("summarize") || message.includes("magazine");

    if (isSummaryRequest) {
      const categorizedNews = {};

      for (let category of categories) {
        const articles = await collection
          .find({ category })
          .sort({ publishedAt: -1 })
          .limit(2);
        if (articles.length > 0) {
          categorizedNews[category] = articles;
        }
      }

      let magazineContext =
        "Here is the categorized news to create a digital magazine:\n\n";

      for (let category in categorizedNews) {
        magazineContext += `## ${category.toUpperCase()}\n`;
        categorizedNews[category].forEach((article) => {
          magazineContext += `- **${article.title}**: ${article.description}\n`;
        });
        magazineContext += "\n";
      }

      const prompt = `
You are ReadHub Assistant, a smart and friendly virtual news editor.

The user asked to summarize the latest news in a digital magazine style.

Below is a categorized list of recent news articles:
${magazineContext}

Please turn this into a polished, friendly, and engaging magazine-style summary.
Each section should read like a news digest, using headlines and brief summaries.
Avoid repetition and keep a professional but conversational tone.
`;

      const geminiReply = await chatWithGemini(prompt);
      return res.json({ reply: geminiReply });
    }

    //  General news
    const category = categories.find((cat) => message.includes(cat));
    let newsData = [];

    if (category) {
      newsData = await collection
        .find({ category })
        .sort({ publishedAt: -1 })
        .limit(5);
    } else if (message.includes("news")) {
      newsData = await collection.find().sort({ publishedAt: -1 }).limit(5);
    }

    const context = newsData
      .map((news) => `- ${news.title}: ${news.description}`)
      .join("\n");

    const prompt = `
    You are ReadHub Assistant, a smart virtual assistant inside the ReadHub app.

    User Message: "${userMessage}"

    Here are the latest news articles you can reference if needed:
    ${context}

    Please respond in a helpful, friendly, and concise way.
    `;

    let geminiReply = await chatWithGemini(prompt);

    if (message.includes("news")) {
      geminiReply += `\n\nWould you like to hear more news in categories like *sports*, *technology*, or *science*?`;
    }

    res.json({ reply: geminiReply });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Something went wrong with the chatbot." });
  }
});

module.exports = router;
