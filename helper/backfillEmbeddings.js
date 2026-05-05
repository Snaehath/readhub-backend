const mongoose = require("mongoose");
require("dotenv").config();
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { generateEmbedding } = require("../models/aiClient");

const mongodbURI = process.env.MONGO_URI;

// Background vectorizer for new news articles
const processBackgroundEmbeddings = async (newArticles = []) => {
  setImmediate(async () => {
    try {
      const collections = [News, NewsIn];
      for (const Collection of collections) {
        // Only embed the top 25 latest articles lacking vectors
        const articles = await Collection.find({
          $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }]
        })
        .sort({ publishedAt: -1 })
        .limit(25);

        if (articles.length > 0) {
          console.log(`📡 Vectorizing Top 25 for ${Collection.modelName}...`);
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

// Manual surgical backfill for Top 20 latest
const backfillEmbeddings = async () => {
  try {
    if (mongoose.connection.readyState === 0) await mongoose.connect(mongodbURI);
    console.log("🚀 Starting Surgical Intelligence Backfill...");

    const collections = [News, NewsIn];
    for (const Collection of collections) {
      console.log(`\n📂 Processing ${Collection.modelName}...`);
      let totalUpdated = 0;

      const articles = await Collection.find({
        $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }]
      })
      .sort({ publishedAt: -1 })
      .limit(20);

      if (articles.length === 0) {
        console.log(`✅ All ${Collection.modelName} vectorized.`);
        continue;
      }

      console.log(`📡 Vectorizing Elite 20 for ${Collection.modelName}...`);
      for (const article of articles) {
        try {
          const textToEmbed = `${article.title} ${article.description || ""} ${article.content || ""}`;
          const embedding = await generateEmbedding(textToEmbed, "passage");
          if (embedding) {
            await Collection.findByIdAndUpdate(article._id, { $set: { embedding: embedding } });
            totalUpdated++;
          }
        } catch (error) {
          console.error(`❌ Error on "${article.title}":`, error.message);
        }
      }
      console.log(`📈 Summary: ${totalUpdated} updated in ${Collection.modelName}.`);
    }
    console.log("\n✨ SINGLE-PASS SYNC COMPLETE.");
  } catch (error) {
    console.error("🔥 Critical Backfill Error:", error);
  }
};

module.exports = { backfillEmbeddings, processBackgroundEmbeddings };

if (require.main === module) {
  backfillEmbeddings().then(() => process.exit(0));
}
