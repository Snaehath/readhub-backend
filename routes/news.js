const express = require("express");
const axios = require("axios");
const https = require("https");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { processBackgroundEmbeddings } = require("../helper/backfillEmbeddings");

// Force IPv4 for Render
const httpsAgent = new https.Agent({ family: 4 });
const router = express.Router();

// Fetch US news from NewsAPI
router.get("/fetch/us", async (req, res) => {
  try {
    const response = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&pageSize=40&apiKey=${process.env.NEWS_API_KEY}`);
    const articles = response.data.articles.filter((a) => a.description);
    await Promise.all(articles.map(async (article) => {
      const existing = await News.findOne({ title: article.title });
      if (!existing) await News.create({
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
        urlToImage: article.urlToImage,
        publishedAt: article.publishedAt,
        source: article.source,
      });
    }));
    res.status(200).json({ message: "Fetched and saved news." });
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch India news from GNews
router.get("/fetch/in", async (req, res) => {
  try {
    const response = await axios.get(`https://gnews.io/api/v4/top-headlines?lang=en&category=general&max=10&apikey=${process.env.GNEWS_API_KEY}`);
    const articles = response.data.articles.filter((a) => a.description);
    await Promise.all(articles.map(async (article) => {
      const existing = await NewsIn.findOne({ title: article.title });
      if (!existing) await NewsIn.create({
        title: article.title,
        description: article.description,
        content: article.content,
        url: article.url,
        urlToImage: article.image,
        publishedAt: article.publishedAt,
        source: article.source,
      });
    }));
    res.status(200).json({ message: "Fetched and saved news." });
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch US news categories and prune to top 50
router.get("/fetch-categories/us", async (req, res) => {
  try {
    const categories = ["technology", "science", "health", "sports", "business", "entertainment", "politics"];
    const fetchPromises = categories.map((category) =>
      axios.get(`https://newsapi.org/v2/top-headlines?category=${category}&pageSize=10&apiKey=${process.env.NEWS_API_KEY}`)
        .then((response) => ({ category, articles: response.data.articles.filter((a) => a.description && a.urlToImage) }))
    );

    const allFetchedData = await Promise.all(fetchPromises);
    let allSavedArticles = [];

    for (const { category, articles } of allFetchedData) {
      const saved = await Promise.all(articles.map(async (article) => 
        News.findOneAndUpdate({ title: article.title }, {
          $setOnInsert: { title: article.title, description: article.description, content: article.content, url: article.url, urlToImage: article.urlToImage, publishedAt: article.publishedAt, source: article.source },
          $addToSet: { category }
        }, { upsert: true, new: true })
      ));
      allSavedArticles = allSavedArticles.concat(saved);
    }
    processBackgroundEmbeddings(allSavedArticles);

    // Keep only top 50 latest US articles
    const latest = await News.find().sort({ publishedAt: -1 }).limit(50);
    if (latest.length === 50) await News.deleteMany({ publishedAt: { $lt: latest[49].publishedAt } });

    res.status(200).json({ message: `Fetched categories: ${categories.join(", ")}` });
  } catch (err) {
    console.error("Error fetching multiple categories:", err.message);
    res.status(500).json({ error: "Failed to fetch multiple categories" });
  }
});

// Fetch India news categories and prune to top 50
router.get("/fetch-categories/in", async (req, res) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const categories = ["technology", "science", "health", "sports", "business", "entertainment", "politics"];
    let allFetchedData = [];

    for (const category of categories) {
      try {
        const gnewsCategory = category === "politics" ? "nation" : category;
        const response = await axios.get(`https://gnews.io/api/v4/top-headlines?country=in&lang=en&category=${gnewsCategory}&max=10&apikey=${process.env.GNEWS_API_KEY}`, { httpsAgent, timeout: 15000 });
        allFetchedData.push({ category, articles: response.data.articles.filter((a) => a.description) });
        await delay(1200);
      } catch (catErr) {
        console.error(`Error fetching India category ${category}:`, catErr.message);
      }
    }

    let allSavedArticles = [];
    for (const { category, articles } of allFetchedData) {
      const saved = await Promise.all(articles.map(async (article) => {
        try {
          return await NewsIn.findOneAndUpdate({ title: article.title }, {
            $setOnInsert: { title: article.title, description: article.description, content: article.content, url: article.url, urlToImage: article.image, publishedAt: article.publishedAt, source: article.source },
            $addToSet: { category }
          }, { upsert: true, new: true });
        } catch (e) { return null; }
      }));
      allSavedArticles = allSavedArticles.concat(saved.filter(Boolean));
    }
    processBackgroundEmbeddings(allSavedArticles);

    // Keep only top 50 latest India articles
    const latestIn = await NewsIn.find().sort({ publishedAt: -1 }).limit(50);
    if (latestIn.length === 50) await NewsIn.deleteMany({ publishedAt: { $lt: latestIn[49].publishedAt } });

    res.status(200).json({ message: `Fetched categories: ${allFetchedData.map(d => d.category).join(", ")}` });
  } catch (err) {
    console.error("Critical error in fetch-categories/in:", err.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Paginated US news
router.get("/new/pagination", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const category = req.query.category;
  try {
    const query = category && category !== "all" ? { category } : {};
    const result = await News.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});

// Paginated India news
router.get("/newIn/pagination", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const category = req.query.category;
  try {
    const query = category && category !== "all" ? { category } : {};
    const result = await NewsIn.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});

// Search US news
router.get("/search/us", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const { q, category } = req.query;
  try {
    let query = q ? { $or: [{ title: { $regex: q, $options: "i" } }, { description: { $regex: q, $options: "i" } }] } : {};
    if (category && category !== "all") query.category = category;
    const result = await News.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to search news" });
  }
});

// Search India news
router.get("/search/in", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const { q, category } = req.query;
  try {
    let query = q ? { $or: [{ title: { $regex: q, $options: "i" } }, { description: { $regex: q, $options: "i" } }] } : {};
    if (category && category !== "all") query.category = category;
    const result = await NewsIn.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to search news" });
  }
});

// Delete US news for today (adjusted)
router.delete("/delete-today/us", async (req, res) => {
  try {
    const now = new Date();
    const istAdjustedDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfDay = new Date(istAdjustedDate.getFullYear(), istAdjustedDate.getMonth(), istAdjustedDate.getDate());
    const endOfDay = new Date(istAdjustedDate.getFullYear(), istAdjustedDate.getMonth(), istAdjustedDate.getDate(), 23, 59, 59, 999);
    const result = await News.deleteMany({ publishedAt: { $gte: startOfDay.toISOString(), $lte: endOfDay.toISOString() } });
    res.status(200).json({ message: "Deleted USA news for adjusted today", deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete articles" });
  }
});

// Delete India news for today (IST)
router.delete("/delete-today/in", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const result = await NewsIn.deleteMany({ publishedAt: { $gte: startOfDay.toISOString(), $lte: endOfDay.toISOString() } });
    res.status(200).json({ message: "Deleted India news for today (IST)", deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete India news" });
  }
});

module.exports = router;
