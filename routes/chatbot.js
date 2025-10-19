const express = require("express");
const router = express.Router();
const { chatWithGemini } = require("../models/geminiClient");
const NewsUs = require("../models/news");
const NewsIndia = require("../models/newsIn");
const { Types } = require("mongoose");
const nlp = require("compromise");
const { verifyToken } = require("../helper/authJwt");

const categories = [
  "technology",
  "science",
  "health",
  "sports",
  "business",
  "entertainment",
  "politics",
];

function extractKeywords(title) {
  const doc = nlp(title);
  const phrases = doc.nouns().out("array");
  return phrases.filter((p) => p.split(" ").length >= 2);
}

// --- Detect intent from message ---
function detectIntent(message) {
  const lower = message.toLowerCase();
  return {
    isIndia: lower.includes("india"),
    isBook: /recommend|book/.test(lower),
    isSummary: /summarize|magazine/.test(lower),
    matchedCategory: categories.find((cat) => lower.includes(cat)),
    isNews: lower.includes("news"),
  };
}

// --- Book Recommendation ---
async function handleBookRecommendation(userMessage) {
  const searchTerm = encodeURIComponent(
    userMessage.replace(/recommend( me)? (a )?book( on)?/i, "").trim()
  );

  const response = await fetch(
    `https://openlibrary.org/search.json?q=${searchTerm}&lang=en&limit=2`
  );
  const data = await response.json();

  const books = data.docs.slice(0, 3).map((book) => ({
    title: book.title,
    author: book.author_name?.join(", ") || "Unknown Author",
    link: book.key ? `https://openlibrary.org${book.key}` : null,
    cover: book.cover_edition_key
      ? `https://covers.openlibrary.org/b/olid/${book.cover_edition_key}-M.jpg`
      : `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`,
  }));

  let reply = `Here are some books I found:\n\n`;
  books.forEach((book) => {
    reply += `### 📘 [${book.title}](${book.link})\n`;
    reply += `**Author:** ${book.author}\n`;
    if (book.cover) reply += `![Cover Image](${book.cover})\n`;
    reply += `\n`;
  });

  return reply;
}

// --- Magazine Summary ---
async function handleMagazineSummary(collection) {
  const categorizedNews = {};

  for (let category of categories) {
    const articles = await collection
      .find({ category })
      .sort({ publishedAt: -1 })
      .limit(5);
    if (articles.length > 0) categorizedNews[category] = articles;
  }

  let newsDigest = "";
  for (let cat in categorizedNews) {
    newsDigest += `## ${cat.toUpperCase()}\n`;
    categorizedNews[cat].forEach((item) => {
      newsDigest += `- **${item.title}**: ${item.description}\n`;
    });
    newsDigest += `\n`;
  }

  const prompt = `
You are ReadHub Assistant, a smart and friendly virtual news editor.

Turn the following categorized list of news into a polished digital magazine:
${newsDigest}

Use a professional, friendly tone. Include clear headlines and brief summaries.
  `;

  return await chatWithGemini(prompt);
}

// --- General News or Category-based News ---
async function handleGeneralNews({ category, collection, userMessage }) {
  let newsData = [];

  if (category) {
    newsData = await collection
      .find({ category })
      .sort({ publishedAt: -1 })
      .limit(5);
  } else {
    newsData = await collection.find().sort({ publishedAt: -1 }).limit(5);
  }

  const context = newsData
    .map((n) => `- ${n.title}: ${n.description}`)
    .join("\n");

  const prompt = `
You are ReadHub Assistant, an intelligent virtual news companion.

User asked: "${userMessage}"

Here are the latest news articles:
${context}

Please craft a friendly, helpful response. Suggest follow-up categories if relevant.
  `;

  let reply = await chatWithGemini(prompt);

  if (!category && userMessage.toLowerCase().includes("news")) {
    reply += `\n\nWould you like to hear more news in *sports*, *technology*, or *science*?`;
  }

  return reply;
}

// --- Ask AI - Explaining the Particular News ---
const handleAskAi = async ({ id, country }) => {
  let article;
  const objectId = Types.ObjectId.createFromHexString(id);

  if (country === "us") {
    article = await NewsUs.findOne({ _id: objectId });
  } else if (country === "in") {
    article = await NewsIndia.findOne({ _id: objectId });
  }

  if (!article) {
    return "Sorry, I couldn't find the news article you're referring to.";
  }

  const keywords = extractKeywords(article.title);

  const searchRegex = keywords.map((k) => new RegExp(k, "i"));
  const query = {
    _id: { $ne: objectId },
    title: { $in: searchRegex },
  };

  const relatedArticles =
    country === "us"
      ? await NewsUs.find(query).limit(3)
      : await NewsIndia.find(query).limit(3);

  const relatedContext = relatedArticles
    .map(
      (a, i) =>
        `Related Article ${i + 1}:\nTitle: ${a.title}\nDescription: ${
          a.description || "No description"
        }`
    )
    .join("\n\n");

  const prompt = `
You are ReadHub Assistant, a smart and friendly virtual news editor.

A user is asking about the following news article:

**Title:** ${article.title}  
**Description:** ${article.description || "No description available."}  
**Published At:** ${new Date(article.publishedAt).toLocaleDateString()}  
**Source:** ${article.source?.name || "Unknown"}
**Related Articles:** ${relatedArticles.map((a) => {
    a.title;
  })}

${
  relatedContext
    ? `\nHere are some related news articles that may help provide background:\n\n${relatedContext}`
    : ""
}

Please explain this news in detail.
- Summarize the key points clearly.  
- Add helpful background context if relevant.  
- Use a professional, engaging tone suitable for a general audience.
- Reduce the use of new lines.
  `;
  return await chatWithGemini(prompt);
};

router.post("/futureNews", async (req, res) => {
  try {
    let article;
    const { id, selectedCountry } = req.body;
    const objectId = Types.ObjectId.createFromHexString(id);

    if (selectedCountry === "us") {
      article = await NewsUs.findOne({ _id: objectId });
    } else if (selectedCountry === "in") {
      article = await NewsIndia.findOne({ _id: objectId });
    }

    if (!article) {
      return res.status(404).json({
        message: "Sorry, I couldn't find the news article you're referring to.",
      });
    }

    const prompt = `
You are a news journalist writing a follow-up article approximately 6 to 12 months after this original story was published. Use realistic developments, such as investigations, policy changes, market reactions, public opinion shifts, or any ongoing consequences. Your goal is to create a plausible news update that would be published one year later.

Original Article:
Title: "${article.title}"
Content: ${article.content}
url:${article.url}
urlToImage:${article.urlToImage}
Published At: ${article.publishedAt}

Now write a new article titled: "${article.title}"
Make sure it feels like a professional news story — clear, concise, and realistic.
`;

    const futureArticle = await chatWithGemini(prompt);

    return res.status(200).json({ futureArticle });
  } catch (error) {
    console.error("Error generating future news:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// --- Route Entry Point ---
router.post("/chat", async (req, res) => {
  const { userMessage } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  const user = verifyToken(token);

  if (!user) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or missing token" });
  }

  try {
    let reply;

    // Case: Asking AI about a specific news article
    if (
      typeof userMessage === "object" &&
      userMessage.id &&
      userMessage.selectedCountry
    ) {
      reply = await handleAskAi({
        id: userMessage.id,
        country: userMessage.selectedCountry,
      });

      return res.json({ reply });
    }
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ error: "Invalid message" });
    }

    const { isIndia, isBook, isSummary, matchedCategory, isNews } =
      detectIntent(userMessage);

    const collection = isIndia ? NewsIndia : NewsUs;

    if (isBook) {
      reply = await handleBookRecommendation(userMessage);
    } else if (isSummary) {
      reply = await handleMagazineSummary(collection);
    } else if (isNews || matchedCategory) {
      reply = await handleGeneralNews({
        category: matchedCategory,
        collection,
        userMessage,
      });
    } else {
      // Fallback if no specific intent
      const prompt = `
You're ReadHub Assistant.

User Message: "${userMessage}"

Respond helpfully. If appropriate, suggest user can ask for news, summaries, or book suggestions.
      `;
      reply = await chatWithGemini(prompt);
    }

    res.json({ reply });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
});

module.exports = router;
