const mongoose = require("mongoose");
require("dotenv").config();
const News = require("./models/news");
const NewsIn = require("./models/newsIn");
const { scrapeUrl } = require("./helper/scraperAgent");

const mongodbURI = process.env.MONGO_URI;

const scrapeNewsContent = async () => {
  try {
    await mongoose.connect(mongodbURI);
    console.log("🚀 Connected to MongoDB. Starting Content Scraping Mission...");

    const collections = [News, NewsIn];

    for (const Collection of collections) {
      console.log(`\n📂 Processing ${Collection.modelName}...`);
      
      let hasMore = true;
      let totalScraped = 0;

      while (hasMore) {
        // Find 10 articles that need full content
        // We look for missing content OR the "Content unavailable" error string from previous failed attempts
        const articles = await Collection.find({
          $or: [
            { content: { $exists: false } }, 
            { content: "" },
            { content: /\[Content unavailable/ } 
          ],
        })
        .sort({ publishedAt: -1 }) // 🎯 TARGET: Latest intelligence first
        .limit(25);

        if (articles.length === 0) {
          console.log(`✅ All ${Collection.modelName} articles have content.`);
          hasMore = false;
          continue;
        }

        console.log(`📡 Scraping Elite 25 latest for ${Collection.modelName}...`);

        for (const article of articles) {
          try {
            const fullContent = await scrapeUrl(article.url);

            if (fullContent && !fullContent.includes("[Content unavailable")) {
              await Collection.findByIdAndUpdate(article._id, {
                $set: { content: fullContent }
              });
              totalScraped++;
            }
            
            await new Promise(r => setTimeout(r, 1000));
            
          } catch (error) {
            console.error(`❌ Error scraping "${article.title}":`, error.message);
          }
        }
        
        console.log(`📈 Progress: ${totalScraped} articles scraped in ${Collection.modelName}...`);
        
        // 🎯 GUARDRAIL: Only scrape the Top 25 per run to match embedding limits
        if (totalScraped >= 25) {
            hasMore = false;
        }
      }
    }

    console.log("\n✨ SCRAPING MISSION COMPLETE. Intelligence vault is now populated.");
    process.exit(0);
  } catch (error) {
    console.error("🔥 Critical Scraping Error:", error);
    process.exit(1);
  }
};

scrapeNewsContent();
