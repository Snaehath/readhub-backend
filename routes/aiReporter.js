const express = require("express");
const router = express.Router();
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const AiNews = require("../models/aiNews");
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
    
    // 1. PHASE 1: Initialization (Blueprint)
    const initPrompt = PROMPTS.aiNewsInit(suggestion);
    const initRes = await chatWithGemini(initPrompt);
    
    let initJson = initRes;
    const iStart = initRes.indexOf("{");
    const iEnd = initRes.lastIndexOf("}");
    if (iStart !== -1 && iEnd !== -1) initJson = initRes.substring(iStart, iEnd + 1);
    
    const blueprintData = JSON.parse(initJson);
    
    // 2. PHASE 2: Full Content Generation
    console.log(`REPORTER: Generating full content for "${blueprintData.title}"...`);
    const reportPrompt = PROMPTS.aiNewsReport(blueprintData, blueprintData.blueprint);
    const reportRes = await chatWithGemini(reportPrompt);
    
    let reportJson = reportRes;
    const rStart = reportRes.indexOf("{");
    const rEnd = reportRes.lastIndexOf("}");
    if (rStart !== -1 && rEnd !== -1) reportJson = reportRes.substring(rStart, rEnd + 1);
    
    const contentData = JSON.parse(reportJson);
    
    // 3. Save to database
    const newNews = new AiNews({
      userId: userData.userId,
      title: blueprintData.title,
      topic: blueprintData.topic,
      summary: blueprintData.summary,
      authorName: blueprintData.authorName,
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

module.exports = router;
