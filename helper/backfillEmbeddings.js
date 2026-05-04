const mongoose = require("mongoose");
require("dotenv").config();
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const { generateEmbedding } = require("../models/aiClient");

const mongodbURI = process.env.MONGO_URI;

const backfillEmbeddings = async () => {
  try {
    await mongoose.connect(mongodbURI);
    console.log("🚀 Connected to MongoDB. Starting Intelligence Backfill...");

    const collections = [News, NewsIn];

    for (const Collection of collections) {
      console.log(`\n📂 Processing ${Collection.modelName}...`);
      
      let hasMore = true;
      let totalUpdated = 0;

      while (hasMore) {
        // Find 100 articles that need embeddings
        const articles = await Collection.find({
          $or: [
            { embedding: { $exists: false } }, 
            { embedding: { $size: 0 } }
          ],
        }).limit(20);

        if (articles.length === 0) {
          console.log(`✅ All ${Collection.modelName} articles are vectorized.`);
          hasMore = false;
          continue;
        }

        console.log(`📡 Vectorizing batch of ${articles.length} articles...`);

        for (const article of articles) {
          try {
            const textToEmbed = `${article.title} ${article.description || ""} ${article.content || ""}`;
            const embedding = await generateEmbedding(textToEmbed, "passage");

            if (embedding) {
              await Collection.findByIdAndUpdate(article._id, {
                $set: { embedding: embedding }
              });
              totalUpdated++;
            }
          } catch (error) {
            console.error(`❌ Error on article "${article.title}":`, error.message);
          }
        }
        
        console.log(`📈 Progress: ${totalUpdated} articles updated in ${Collection.modelName}...`);
      }
    }

    console.log("\n✨ FULL INTELLIGENCE SYNC COMPLETE. Your database is now 100% agent-ready.");
  } catch (error) {
    console.error("🔥 Critical Backfill Error:", error);
  }
};

if (require.main === module) {
  backfillEmbeddings();
}

module.exports = { backfillEmbeddings };
