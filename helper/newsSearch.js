const News = require("../models/news");
const NewsIn = require("../models/newsIn");

function lexicalPattern(query) {
  const terms = String(query || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu)
    ?.slice(0, 8) || [];
  if (terms.length === 0) return null;
  return terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

async function searchRegion(Model, query, limit, sourceRegion) {
  const pattern = lexicalPattern(query);
  if (!pattern) return [];
  const regex = { $regex: pattern, $options: "i" };
  const articles = await Model.find({
    $or: [
      { title: regex },
      { description: regex },
      { content: regex },
      { category: regex },
    ],
  })
    .select("title description content url source publishedAt category")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
  return articles.map((article) => ({ ...article, sourceRegion }));
}

async function searchNewsContext(userQuery, requestedLimit = 3) {
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 5)) : 3;
  const query = typeof userQuery === "string" ? userQuery.trim().slice(0, 200) : "";
  if (!query) return [];

  try {
    const [usResults, indiaResults] = await Promise.all([
      searchRegion(News, query, limit, "US"),
      searchRegion(NewsIn, query, limit, "IN"),
    ]);
    return [...usResults, ...indiaResults]
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, limit);
  } catch (error) {
    console.error("News keyword search failed:", error.code || error.name || "unknown");
    return [];
  }
}

module.exports = { searchNewsContext };
