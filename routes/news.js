const express = require("express");
const axios = require("axios");
const https = require("https");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");

// Force IPv4 to prevent ETIMEDOUT on Render
const httpsAgent = new https.Agent({ family: 4 });

const router = express.Router();

// Fetch and save news from NewsAPI
router.get("/fetch/us", async (req, res) => {
  try {
    const response = await axios.get(
      `https://newsapi.org/v2/top-headlines?country=us&pageSize=40&apiKey=${process.env.NEWS_API_KEY}`,
    );

    const articles = response.data.articles.filter((a) => a.description);

    const savedArticles = await Promise.all(
      articles.map(async (article) => {
        const existing = await News.findOne({ title: article.title });
        if (!existing) {
          const saved = await News.create({
            title: article.title,
            description: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt,
            source: article.source,
          });
          return saved;
        }
        return null;
      }),
    );

    res.status(200).json({ message: "Fetched and saved news." });
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch and save news from GNewsAPI
router.get("/fetch/in", async (req, res) => {
  try {
    const response = await axios.get(
      `https://gnews.io/api/v4/top-headlines?lang=en&category=general&max=10&apikey=${process.env.GNEWS_API_KEY}`,
    );

    const articles = response.data.articles.filter((a) => a.description);

    const savedArticles = await Promise.all(
      articles.map(async (article) => {
        const existing = await NewsIn.findOne({ title: article.title });
        if (!existing) {
          const saved = await NewsIn.create({
            title: article.title,
            description: article.description,
            content: article.content,
            url: article.url,
            urlToImage: article.image,
            publishedAt: article.publishedAt,
            source: article.source,
          });
          return saved;
        }
        return null;
      }),
    );

    res.status(200).json({ message: "Fetched and saved news." });
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Fetch multiple categories and save in DB
router.get("/fetch-categories/us", async (req, res) => {
  try {
    const categories = [
      "technology",
      "science",
      "health",
      "sports",
      "business",
      "entertainment",
      "politics",
    ];

    if (categories.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one category is required" });
    }

    // Fetch all categories in parallel
    const fetchPromises = categories.map((category) =>
      axios
        .get(
          `https://newsapi.org/v2/top-headlines?category=${category}&pageSize=10&apiKey=${process.env.NEWS_API_KEY}`,
        )
        .then((response) => ({
          category,
          articles: response.data.articles.filter(
            (a) => a.description && a.urlToImage,
          ),
        })),
    );

    const allFetchedData = await Promise.all(fetchPromises);

    let allSavedArticles = [];

    for (const { category, articles } of allFetchedData) {
      const savedArticles = await Promise.all(
        articles.map(async (article) => {
          const updated = await News.findOneAndUpdate(
            { title: article.title },
            {
              $setOnInsert: {
                title: article.title,
                description: article.description,
                url: article.url,
                urlToImage: article.urlToImage,
                publishedAt: article.publishedAt,
                source: article.source,
              },
              $addToSet: {
                category: category,
              },
            },
            { upsert: true, new: true },
          );
          return updated;
        }),
      );

      allSavedArticles = allSavedArticles.concat(savedArticles);
    }

    res.status(200).json({
      message: `Fetched and saved articles for categories: ${categories.join(
        ", ",
      )}`,
    });
  } catch (err) {
    console.error("Error fetching multiple categories:", err.message);
    res.status(500).json({ error: "Failed to fetch multiple categories" });
  }
});
// Fetch multiple categories and save in DB
router.get("/fetch-categories/in", async (req, res) => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const categories = [
      "technology",
      "science",
      "health",
      "sports",
      "business",
      "entertainment",
      "politics",
    ];

    if (!process.env.GNEWS_API_KEY) {
      console.error("GNEWS_API_KEY is missing in environment variables.");
      return res.status(500).json({ error: "GNews API configuration missing" });
    }

    let allFetchedData = [];

    for (const category of categories) {
      try {
        // GNews doesn't support 'politics', map it to 'nation'
        const gnewsCategory = category === "politics" ? "nation" : category;

        const response = await axios.get(
          `https://gnews.io/api/v4/top-headlines?country=in&lang=en&category=${gnewsCategory}&max=10&apikey=${process.env.GNEWS_API_KEY}`,
          {
            httpsAgent,
            timeout: 15000, // 15s timeout
          },
        );

        const articles = response.data.articles.filter((a) => a.description);
        allFetchedData.push({ category, articles });

        await delay(1200);
      } catch (catErr) {
        console.error(
          `Error fetching category ${category} for India:`,
          catErr.message,
        );
      }
    }

    if (allFetchedData.length === 0) {
      throw new Error(
        "Failed to fetch any articles from GNews after all retries",
      );
    }

    let allSavedArticles = [];

    for (const { category, articles } of allFetchedData) {
      const savedArticles = await Promise.all(
        articles.map(async (article) => {
          try {
            const updated = await NewsIn.findOneAndUpdate(
              { title: article.title },
              {
                $setOnInsert: {
                  title: article.title,
                  description: article.description,
                  content: article.content,
                  url: article.url,
                  urlToImage: article.image,
                  publishedAt: article.publishedAt,
                  source: article.source,
                },
                $addToSet: {
                  category: category,
                },
              },
              { upsert: true, new: true },
            );
            return updated;
          } catch (dbErr) {
            console.error("Database error saving article:", dbErr.message);
            return null;
          }
        }),
      );

      allSavedArticles = allSavedArticles.concat(savedArticles.filter(Boolean));
    }

    res.status(200).json({
      message: `Fetched and saved articles for categories: ${allFetchedData.map((d) => d.category).join(", ")}`,
    });
  } catch (err) {
    console.error("Critical error in fetch-categories/in:", err.message);
    res
      .status(500)
      .json({
        error: "Failed to fetch multiple categories",
        detail: err.message,
      });
  }
});
// Get latest news from DB
router.get("/new/pagination", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const category = req.query.category;

  try {
    const options = {
      page,
      limit,
      sort: { publishedAt: -1 },
    };

    const query = category && category !== "all" ? { category: category } : {}; // no category filter if "all"

    const result = await News.paginate(query, options);

    res.json({
      currentPage: result.page,
      totalPages: result.totalPages,
      totalArticles: result.totalDocs,
      articles: result.docs,
    });
  } catch (err) {
    console.error("Error fetching paginated US news:", err.message);
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});
router.get("/newIn/pagination", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const category = req.query.category;

  try {
    const options = {
      page,
      limit,
      sort: { publishedAt: -1 },
    };

    const query = category && category !== "all" ? { category: category } : {}; // no category filter if "all"

    const result = await NewsIn.paginate(query, options);

    res.json({
      currentPage: result.page,
      totalPages: result.totalPages,
      totalArticles: result.totalDocs,
      articles: result.docs,
    });
  } catch (err) {
    console.error("Error fetching paginated IN news:", err.message);
    res.status(500).json({ error: "Failed to fetch paginated news" });
  }
});

// DELETE /api/news/delete-today/us
router.delete("/delete-today/us", async (req, res) => {
  try {
    // Get current UTC date and subtract 1 day to adjust for IST timezone
    const now = new Date();
    const istAdjustedDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get start of the adjusted day (00:00:00) and end (23:59:59)
    const startOfDay = new Date(
      istAdjustedDate.getFullYear(),
      istAdjustedDate.getMonth(),
      istAdjustedDate.getDate(),
    );
    const endOfDay = new Date(
      istAdjustedDate.getFullYear(),
      istAdjustedDate.getMonth(),
      istAdjustedDate.getDate(),
      23,
      59,
      59,
      999,
    );

    // Delete articles within that day range
    const result = await News.deleteMany({
      publishedAt: {
        $gte: startOfDay.toISOString(),
        $lte: endOfDay.toISOString(),
      },
    });

    res.status(200).json({
      message: "Deleted USA news articles for adjusted 'today'",
      deletedCount: result.deletedCount,
      from: startOfDay.toISOString(),
      to: endOfDay.toISOString(),
    });
  } catch (error) {
    console.error("Error deleting articles:", error.message);
    res.status(500).json({ error: "Failed to delete articles" });
  }
});
router.delete("/delete-today/in", async (req, res) => {
  try {
    const now = new Date();

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const result = await NewsIn.deleteMany({
      publishedAt: {
        $gte: startOfDay.toISOString(),
        $lte: endOfDay.toISOString(),
      },
    });

    res.status(200).json({
      message: "Deleted India news articles for today (IST)",
      deletedCount: result.deletedCount,
      from: startOfDay.toISOString(),
      to: endOfDay.toISOString(),
    });
  } catch (error) {
    console.error("Error deleting India news:", error.message);
    res.status(500).json({ error: "Failed to delete India news" });
  }
});

module.exports = router;
