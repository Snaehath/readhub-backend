const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { generateEmbedding } = require("../models/aiClient");


const getRelavantContext = async (userQuery, limit = 3) => {
  try {
    const queryVector = await generateEmbedding(userQuery, "query");

    if (!queryVector) return [];

    const VectorSearchConfig = {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: queryVector,
        numCandidates: 100,
        limit: limit,
      },
    };

    // 1. Search US News
    const usResults = await News.aggregate([
      VectorSearchConfig,
      { $addFields: { searchScore: { $meta: "vectorSearchScore" }, sourceRegion: "US" } }
    ]);

    // 2. Search India News
    const inResults = await NewsIn.aggregate([
      VectorSearchConfig,
      { $addFields: { searchScore: { $meta: "vectorSearchScore" }, sourceRegion: "IN" } }
    ]);

    // 3. Combine and Rank
    const combinedResults = [...usResults, ...inResults]
      .sort((a, b) => b.searchScore - a.searchScore)
      .slice(0, limit);

    return combinedResults;
  } catch (error) {
    console.error("Vector Search Hub Error:", error.message);
    return [];
  }
};

module.exports = { getRelavantContext };