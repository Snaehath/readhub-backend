const mongoose = require("mongoose");
require("dotenv").config();
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { generateEmbedding } = require("../models/aiClient");

const mongodbURI = process.env.MONGO_URI;

/**
 * 🛰️ BACKGROUND VECTOR ROUTINE
 * Used by news.js to process new articles in the background
 */
const processBackgroundEmbeddings = async (newArticles = []) => {
  // Fire and forget background process
  setImmediate(async () => {
    try {
      const collections = [News, NewsIn];
      for (const Collection of collections) {
        // 🎯 LIMIT: Only embed the top 25 latest articles that lack embeddings
        const articles = await Collection.find({
          $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }]
        })
        .sort({ publishedAt: -1 })
        .limit(25);

        if (articles.length > 0) {
          console.log(`📡 Background Vectorizing Top 25 latest for ${Collection.modelName}...`);
          for (const article of articles) {
            try {
              const textToEmbed = `${article.title} ${article.description || ""} ${article.content || ""}`;
              const embedding = await generateEmbedding(textToEmbed, "passage");
              if (embedding) {
                await Collection.findByIdAndUpdate(article._id, { $set: { embedding: embedding } });
              }
            } catch (err) {
              console.error(`❌ BG Vector Error [${article.title}]:`, err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("🔥 Background Embedding Sweep Error:", error);
    }
  });
};

/**
 * 🏛️ MANUAL BACKFILL ROUTINE
 * Surgical single-pass for the Top 20
 */
const backfillEmbeddings = async () => {
  try {
    // Only connect if not already connected (for standalone run)
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongodbURI);
    }
    console.log("🚀 Starting Surgical Intelligence Backfill...");

    const collections = [News, NewsIn];

    for (const Collection of collections) {
      console.log(`\n📂 Processing ${Collection.modelName}...`);
      let totalUpdated = 0;

      const articles = await Collection.find({
        $or: [
          { embedding: { $exists: false } }, 
          { embedding: { $size: 0 } }
        ],
      })
      .sort({ publishedAt: -1 })
      .limit(20);

      if (articles.length === 0) {
        console.log(`✅ All ${Collection.modelName} articles are vectorized.`);
        continue;
      }

      console.log(`📡 Vectorizing Elite 20 latest for ${Collection.modelName}...`);

      for (const article of articles) {
        try {
          const textToEmbed = `${article.title} ${article.description || ""} ${article.content || ""}`;
          const embedding = await generateEmbedding(textToEmbed, "passage");

          if (embedding) {
            await Collection.findByIdAndUpdate(article._id, { $set: { embedding: embedding } });
            totalUpdated++;
          }
        } catch (error) {
          console.error(`❌ Error on article "${article.title}":`, error.message);
        }
      }
      console.log(`📈 Summary: ${totalUpdated} articles updated in ${Collection.modelName}.`);
    }
    console.log("\n✨ SINGLE-PASS SYNC COMPLETE.");
  } catch (error) {
    console.error("🔥 Critical Backfill Error:", error);
  }
};

// Export BEFORE running main check
module.exports = { backfillEmbeddings, processBackgroundEmbeddings };

// Allow standalone execution
if (require.main === module) {
  backfillEmbeddings().then(() => process.exit(0));
}
