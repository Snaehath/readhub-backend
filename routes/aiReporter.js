const express = require("express");
const router = express.Router();
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const AiNews = require("../models/aiNews");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const PROMPTS = require("../helper/prompts");

// Get all AI News investigations
router.get("/all", async (req, res) => {
  try {
    const allNews = await AiNews.find({}).sort({ createdAt: -1 });
    res.status(200).json({
      message: "AI investigations retrieved",
      news: allNews,
    });
  } catch (err) {
    console.error("Error fetching AI news:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Trigger new news investigation (Complete generated news in one go)
router.post("/trigger", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { suggestion } = req.body;

  try {
    // Look for any existing active investigation (optional, but here we just create a new one every time a suggest is made)
    // or we can allow one active investigation overall. For simplicity, let's create a new one.
    
    console.log("REPORTER: Initializing new global investigation...");
    
    let finalSuggestion = suggestion;
    if (suggestion === "auto") {
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      const recentUS = await News.find({ publishedAt: { $gte: yesterday } }).sort({ publishedAt: -1 }).limit(20);
      
      const headlines = [...recentUS]
        .map(n => n.title)
        .filter(Boolean)
        .join(" | ");
        
      if (!headlines) {
        // Fallback if no news in last 24h
        finalSuggestion = "Synthesize a comprehensive global news briefing based on the latest available headlines across all categories.";
      } else {
        finalSuggestion = `Generate a compelling and comprehensive news investigation by synthesizing and analyzing all of these top headlines from the past 24 hours: ${headlines}. Identify major themes and provide deep insights.`;
      }
    }

    // 1. PHASE 1: Initialization (Blueprint)
    const initPrompt = PROMPTS.aiNewsInit(finalSuggestion);
    const initRes = await chatWithGemini(initPrompt);
    
    let initJson = initRes;
    const iStart = initRes.indexOf("{");
    const iEnd = initRes.lastIndexOf("}");
    if (iStart !== -1 && iEnd !== -1) initJson = initRes.substring(iStart, iEnd + 1);
    
    const blueprintData = JSON.parse(initJson);
    
    // 2. PHASE 2: Full Content Generation
    console.log(`REPORTER: Generating full content for "${blueprintData.title}"...`);
    const reportPrompt = PROMPTS.aiNewsReport(blueprintData, blueprintData.blueprint) + "\n\nIMPORTANT: Do NOT include the article title, any main heading, or bylines like 'Investigative Report by The Deep Analyst' at the beginning of the content. Start directly with the first paragraph or the first sub-heading. The title and author are already handled separately.";
    const reportRes = await chatWithGemini(reportPrompt);
    
    let reportJson = reportRes;
    const rStart = reportRes.indexOf("{");
    const rEnd = reportRes.lastIndexOf("}");
    if (rStart !== -1 && rEnd !== -1) reportJson = reportRes.substring(rStart, rEnd + 1);
    
    const contentData = JSON.parse(reportJson);
    
    const reporters = ["Vance Sterling", "Sloane Weaver", "Dr. Aris Thorne", "Elena Krix"];
    const randomAuthor = reporters[Math.floor(Math.random() * reporters.length)];

    // 3. Save to database
    const newNews = new AiNews({
      userId: userData.userId,
      title: blueprintData.title,
      topic: blueprintData.topic,
      summary: blueprintData.summary,
      authorName: randomAuthor,
      category: blueprintData.category || "General",
      hashtags: blueprintData.hashtags || [],
      content: contentData.content,
      isCompleted: true,
    });

    await newNews.save();
    res.status(201).json({ message: "AI Investigation Complete!", news: newNews });
  } catch (err) {
    console.error("AI Reporter Generation Error:", err);
    res.status(500).json({ error: "Failed to generate AI investigation" });
  }
});

// Get individual news by ID
router.get("/:id", async (req, res) => {
  try {
    const news = await AiNews.findById(req.params.id);
    if (!news) {
      return res.status(404).json({ message: "Investigation not found" });
    }
    res.status(200).json({
      message: "Investigation retrieved successfully",
      news: news,
    });
  } catch (err) {
    console.error("Error fetching AI news by ID:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update AI news rating and review
router.patch("/:id/review", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) {
    return res.status(401).json({ message: "Unauthorized: Invalid or missing token" });
  }

  const { rating, review, reviewerName } = req.body;

  if (rating !== undefined && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: "Rating must be a number between 1 and 5." });
  }

  try {
    const news = await AiNews.findById(req.params.id);
    if (!news) {
      return res.status(404).json({ error: "Investigation not found." });
    }

    // Add review to array
    news.reviews.push({
      userId: userData.userId,
      reviewerName: reviewerName || userData.username || "Anonymous",
      rating: rating,
      review: review,
      createdAt: new Date(),
    });

    // Update aggregates
    news.reviewCount += 1;
    news.ratingSum += rating;
    await news.save();

    res.status(200).json({ 
      message: "Feedback submitted successfully", 
      news: news,
      review: news.reviews[news.reviews.length - 1]
    });
  } catch (err) {
    console.error("Error updating AI news review:", err);
    res.status(500).json({ error: "Internal server error while updating your review." });
  }
});

// Get individual reviews for AI News
router.get("/:id/reviews", async (req, res) => {
  try {
    const news = await AiNews.findById(req.params.id);
    if (!news) {
       return res.status(404).json({ error: "Investigation not found." });
    }
    res.status(200).json({ 
      message: "Reviews retrieved successfully", 
      reviews: news.reviews 
    });
  } catch (err) {
    console.error("Error fetching AI news reviews:", err);
    res.status(500).json({ error: "Internal server error while fetching reviews." });
  }
});

module.exports = router;
