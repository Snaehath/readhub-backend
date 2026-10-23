const express = require("express");
const router = express.Router();
const { agenticChat } = require("../models/aiClient");
const { searchNewsContext } = require("../helper/newsSearch");
const { batchScrape } = require("../helper/scraperAgent");
const AiNews = require("../models/aiNews");
const { verifyToken } = require("../helper/authJwt");
const { expensiveLimiter } = require("../helper/rateLimit");
const { buildReporterPrompt } = require("../helper/aiPrompts");

/**
 * AGENTIC REPORTER V2: Research -> Scrape -> Generate
 */
router.post("/trigger", expensiveLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
  if (!topic || topic.length > 200) {
    return res.status(400).json({ message: "Topic must be between 1 and 200 characters." });
  }

  try {
    console.log(`\n🚀 [AGENTIC REPORTER] Starting investigation for: "${topic}"`);

    // PHASE 1: Find recent news using keyword search.
    const searchResults = await searchNewsContext(topic, 4);
    
    if (searchResults.length === 0) {
      return res.status(404).json({ message: "No news found in DB to research this topic." });
    }

    const urls = searchResults.map(art => art.url).filter(Boolean);
    console.log(`✅ Found ${urls.length} relevant sources in database.`);

    // 🕵️‍♂️ PHASE 2: SCRAPE (The Scraper Agent)
    // The agent visits the URLs and grabs the full text
    console.log("📡 Scraper Agent is visiting the sources...");
    const fullResearchText = await batchScrape(urls);

    // 🕵️‍♂️ PHASE 3: GENERATE (The Synthesis Agent)
    console.log("✍️ Synthesis Agent is writing the investigation...");
    const reportPrompt = buildReporterPrompt(topic, fullResearchText);

    const agentResponse = await agenticChat(reportPrompt, [], { tools: false, jsonMode: true });
    const generatedText = agentResponse.text;
    
    // Strip optional Markdown fences before parsing provider JSON.
    let cleanJson = generatedText;
    const startIdx = generatedText.indexOf("{");
    const endIdx = generatedText.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJson = generatedText.substring(startIdx, endIdx + 1);
    }

    const finalData = JSON.parse(cleanJson);

    // 🕵️‍♂️ PHASE 4: ARCHIVE
    const newInvestigation = new AiNews({
      userId: userData.userId,
      title: finalData.title,
      topic: topic,
      summary: finalData.summary,
      content: finalData.content,
      hashtags: finalData.hashtags,
      researchData: fullResearchText.substring(0, 10000), // Store sample of research
      sources: searchResults.map(s => ({
        title: s.title,
        url: s.url,
        sourceName: s.source?.name
      }))
    });

    await newInvestigation.save();

    console.log("🏆 Investigation Complete and Saved!\n");
    res.status(201).json({ 
      message: "Agentic Investigation Complete", 
      news: newInvestigation 
    });

  } catch (error) {
    console.error("Agentic reporter request failed:", error.response?.status || error.code || error.name || "unknown");
    res.status(500).json({ error: "Failed to perform agentic research investigation." });
  }
});

// Get all investigations
router.get("/all", async (req, res) => {
  try {
    const reports = await AiNews.find().sort({ createdAt: -1 });
    res.json({ news: reports });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch investigations" });
  }
});

// Get single investigation
router.get("/:id", async (req, res) => {
  try {
    const report = await AiNews.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Not found" });
    res.json({ news: report });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch investigation" });
  }
});

module.exports = router;
