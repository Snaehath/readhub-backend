const express = require("express");
const router = express.Router();
const { agenticChat } = require("../models/aiClient");
const { getRelavantContext } = require("../helper/vectorSearch");
const { batchScrape } = require("../helper/scraperAgent");
const AiNews = require("../models/aiNews");
const { verifyToken } = require("../helper/authJwt");

/**
 * AGENTIC REPORTER V2: Research -> Scrape -> Generate
 */
router.post("/trigger", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const { topic } = req.body;
  if (!topic) return res.status(400).json({ message: "Topic is required" });

  try {
    console.log(`\n🚀 [AGENTIC REPORTER] Starting investigation for: "${topic}"`);

    // 🕵️‍♂️ PHASE 1: RESEARCH (Vector Search)
    // We find the top 4 most relevant news items in our database
    const searchResults = await getRelavantContext(topic, 4);
    
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
    const reportPrompt = `
      You are the **ReadHub Chief Investigative Analyst**. 
      Your task is to write a deep, factual, and data-driven investigation into "${topic}".
      
      RESEARCH DATA (Extracted from Full-Text Sources):
      ${fullResearchText}
      
      INSTRUCTIONS:
      1. Use a high-end, sophisticated investigative tone.
      2. Divide the report into ### Analysis, ### Strategic Impact, and ### The Future.
      3. Cite sources specifically (e.g., "According to BBC's report on...").
      4. Use the facts found in the research data. Do not hallucinate.
      
      Respond STRICTLY in JSON format:
      {
        "title": "A Compelling Investigative Headline",
        "summary": "2-sentence executive briefing",
        "content": "Full markdown-formatted report...",
        "hashtags": ["#Topic", "#Analysis"]
      }
    `;

    const agentResponse = await agenticChat(reportPrompt, []);
    const geminiText = agentResponse.text;
    
    // Clean up Gemini's potential markdown wrapping
    let cleanJson = geminiText;
    const startIdx = geminiText.indexOf("{");
    const endIdx = geminiText.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      cleanJson = geminiText.substring(startIdx, endIdx + 1);
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
    console.error("Agentic Reporter Error:", error);
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
