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
        .sort({ publishedAt: -1 }) // Start with newest
        .limit(10);

        if (articles.length === 0) {
          console.log(`✅ All ${Collection.modelName} articles have content.`);
          hasMore = false;
          continue;
        }

        console.log(`📡 Scraping batch of ${articles.length} articles...`);

        for (const article of articles) {
          try {
            console.log(`🔍 Scraping: ${article.title.substring(0, 50)}...`);
            const fullContent = await scrapeUrl(article.url);

            if (fullContent && !fullContent.includes("[Content unavailable")) {
              await Collection.findByIdAndUpdate(article._id, {
                $set: { content: fullContent }
              });
              totalScraped++;
              console.log(`✅ Saved content for "${article.title.substring(0, 30)}"`);
            } else {
              console.log(`⚠️ Skip: Content unavailable for URL.`);
            }
            
            // Subtle delay to avoid getting blocked
            await new Promise(r => setTimeout(r, 1000));
            
          } catch (error) {
            console.error(`❌ Error scraping "${article.title}":`, error.message);
          }
        }
        
        console.log(`📈 Progress: ${totalScraped} articles scraped in ${Collection.modelName}...`);
        
        // Stop after a reasonable amount to avoid Render timeouts or IP bans
        if (totalScraped >= 100) {
            console.log("🛑 Limit reached for this run (100 articles). Stopping to be safe.");
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
