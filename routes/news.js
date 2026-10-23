const express = require("express");
const httpClient = require("../helper/httpClient");
const https = require("https");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { requireAdmin } = require("../helper/authMiddleware");

// Force IPv4 for Render
const httpsAgent = new https.Agent({ family: 4 });
const router = express.Router();
const allowedCategories = new Set([
  "technology", "business", "politics", "health", "sports", "science", "entertainment",
]);

const readCategory = (value) => {
  if (value === undefined || value === "all") return { value: null };
  if (typeof value !== "string" || !allowedCategories.has(value)) return { error: true };
  return { value };
};

const getPagination = (query) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 12,
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fetch US news from NewsAPI
router.post("/fetch/us", requireAdmin, async (req, res) => {
  if (!process.env.NEWS_API_KEY) return res.status(503).json({ error: "News provider is not configured." });
  try {
    const response = await httpClient.get("https://newsapi.org/v2/top-headlines", {
      params: { country: "us", pageSize: 40, apiKey: process.env.NEWS_API_KEY },
    });
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
    console.error("NewsAPI request failed:", err.response?.status || err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch India news from GNews
router.post("/fetch/in", requireAdmin, async (req, res) => {
  if (!process.env.GNEWS_API_KEY) return res.status(503).json({ error: "News provider is not configured." });
  try {
    const response = await httpClient.get("https://gnews.io/api/v4/top-headlines", {
      params: { lang: "en", category: "general", max: 10, apikey: process.env.GNEWS_API_KEY },
    });
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
    console.error("GNews request failed:", err.response?.status || err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch US news categories and prune to top 50
router.post("/fetch-categories/us", requireAdmin, async (req, res) => {
  if (!process.env.NEWS_API_KEY) return res.status(503).json({ error: "News provider is not configured." });
  try {
    const categories = ["technology", "science", "health", "sports", "business", "entertainment", "politics"];
    const fetchPromises = categories.map((category) =>
      httpClient.get("https://newsapi.org/v2/top-headlines", {
        params: { category, pageSize: 10, apiKey: process.env.NEWS_API_KEY },
      })
        .then((response) => ({ category, articles: response.data.articles.filter((a) => a.description && a.urlToImage) }))
    );

    const allFetchedData = await Promise.all(fetchPromises);

    for (const { category, articles } of allFetchedData) {
      await Promise.all(articles.map(async (article) =>
        News.findOneAndUpdate({ title: article.title }, {
          $setOnInsert: { title: article.title, description: article.description, content: article.content, url: article.url, urlToImage: article.urlToImage, publishedAt: article.publishedAt, source: article.source },
          $addToSet: { category }
        }, { upsert: true, new: true })
      ));
    }

    // Keep only top 50 latest US articles
    const latest = await News.find().sort({ publishedAt: -1 }).limit(50);
    if (latest.length === 50) await News.deleteMany({ publishedAt: { $lt: latest[49].publishedAt } });

    res.status(200).json({ message: `Fetched categories: ${categories.join(", ")}` });
  } catch (err) {
    console.error("NewsAPI category requests failed:", err.response?.status || err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch multiple categories" });
  }
});

// Fetch India news categories and prune to top 50
router.post("/fetch-categories/in", requireAdmin, async (req, res) => {
  if (!process.env.GNEWS_API_KEY) return res.status(503).json({ error: "News provider is not configured." });
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const categories = ["technology", "science", "health", "sports", "business", "entertainment", "politics"];
    let allFetchedData = [];

    for (const category of categories) {
      try {
        const gnewsCategory = category === "politics" ? "nation" : category;
        const response = await httpClient.get("https://gnews.io/api/v4/top-headlines", {
          httpsAgent,
          params: { country: "in", lang: "en", category: gnewsCategory, max: 10, apikey: process.env.GNEWS_API_KEY },
        });
        allFetchedData.push({ category, articles: response.data.articles.filter((a) => a.description) });
        await delay(1200);
      } catch (catErr) {
        console.error(`GNews category request failed (${category}):`, catErr.response?.status || catErr.code || "unknown");
      }
    }

    for (const { category, articles } of allFetchedData) {
      await Promise.all(articles.map(async (article) => {
        try {
          return await NewsIn.findOneAndUpdate({ title: article.title }, {
            $setOnInsert: { title: article.title, description: article.description, content: article.content, url: article.url, urlToImage: article.image, publishedAt: article.publishedAt, source: article.source },
            $addToSet: { category }
          }, { upsert: true, new: true });
        } catch (e) { return null; }
      }));
    }

    // Keep only top 50 latest India articles
    const latestIn = await NewsIn.find().sort({ publishedAt: -1 }).limit(50);
    if (latestIn.length === 50) await NewsIn.deleteMany({ publishedAt: { $lt: latestIn[49].publishedAt } });

    res.status(200).json({ message: `Fetched categories: ${allFetchedData.map(d => d.category).join(", ")}` });
  } catch (err) {
    console.error("GNews category requests failed:", err.response?.status || err.code || "unknown");
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Paginated US news
router.get("/new/pagination", async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const parsedCategory = readCategory(req.query.category);
  if (parsedCategory.error) return res.status(400).json({ error: "Invalid news category." });
  const category = parsedCategory.value;
  try {
    const query = category ? { category } : {};
    const result = await News.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});

// Paginated India news
router.get("/newIn/pagination", async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const parsedCategory = readCategory(req.query.category);
  if (parsedCategory.error) return res.status(400).json({ error: "Invalid news category." });
  const category = parsedCategory.value;
  try {
    const query = category ? { category } : {};
    const result = await NewsIn.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});

// Search US news
router.get("/search/us", async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const { q, category } = req.query;
  if (q !== undefined && typeof q !== "string") {
    return res.status(400).json({ error: "Search query must be a string." });
  }
  if (q && q.length > 100) {
    return res.status(400).json({ error: "Search query must be 100 characters or fewer." });
  }
  const parsedCategory = readCategory(category);
  if (parsedCategory.error) return res.status(400).json({ error: "Invalid news category." });
  try {
    const searchTerm = q?.trim();
    const escapedSearchTerm = searchTerm ? escapeRegex(searchTerm) : "";
    let query = escapedSearchTerm ? { $or: [{ title: { $regex: escapedSearchTerm, $options: "i" } }, { description: { $regex: escapedSearchTerm, $options: "i" } }] } : {};
    if (parsedCategory.value) query.category = parsedCategory.value;
    const result = await News.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to search news" });
  }
});

// Search India news
router.get("/search/in", async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const { q, category } = req.query;
  if (q !== undefined && typeof q !== "string") {
    return res.status(400).json({ error: "Search query must be a string." });
  }
  if (q && q.length > 100) {
    return res.status(400).json({ error: "Search query must be 100 characters or fewer." });
  }
  const parsedCategory = readCategory(category);
  if (parsedCategory.error) return res.status(400).json({ error: "Invalid news category." });
  try {
    const searchTerm = q?.trim();
    const escapedSearchTerm = searchTerm ? escapeRegex(searchTerm) : "";
    let query = escapedSearchTerm ? { $or: [{ title: { $regex: escapedSearchTerm, $options: "i" } }, { description: { $regex: escapedSearchTerm, $options: "i" } }] } : {};
    if (parsedCategory.value) query.category = parsedCategory.value;
    const result = await NewsIn.paginate(query, { page, limit, sort: { publishedAt: -1 } });
    res.json({ currentPage: result.page, totalPages: result.totalPages, totalArticles: result.totalDocs, articles: result.docs });
  } catch (err) {
    res.status(500).json({ error: "Failed to search news" });
  }
});

// Delete US news for today (adjusted)
router.delete("/delete-today/us", requireAdmin, async (req, res) => {
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
router.delete("/delete-today/in", requireAdmin, async (req, res) => {
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
