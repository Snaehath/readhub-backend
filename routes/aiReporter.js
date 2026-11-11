const express = require("express");
const router = express.Router();
const crypto = require("node:crypto");
const { agenticChat } = require("../models/aiClient");
const { searchNewsContext } = require("../helper/newsSearch");
const { batchScrape } = require("../helper/scraperAgent");
const AiNews = require("../models/aiNews");
const { verifyToken } = require("../helper/authJwt");
const { expensiveLimiter } = require("../helper/rateLimit");
const { buildReporterPrompt } = require("../helper/aiPrompts");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const User = require("../models/user");
const { scrapeUrl } = require("../helper/scraperAgent");
const logger = require("../helper/logger");

function isHttpSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

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

    const sourceStories = Array.from(
      new Map(searchResults.filter((article) => isHttpSourceUrl(article.url)).map((article) => [article.url, article])).values(),
    ).slice(0, 5);
    if (sourceStories.length === 0) {
      return res.status(404).json({ message: "No source articles with readable links were found." });
    }
    const urls = sourceStories.map((article) => article.url);
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
      sources: sourceStories.map((s, index) => ({
        citationNumber: index + 1,
        title: s.title,
        url: s.url,
        sourceName: s.source?.name,
        category: s.category?.[0] || "News",
        publishedAt: s.publishedAt,
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

// Generate at most one public daily edition per UTC day. The scheduled GitHub
// workflow authenticates with the same high-entropy secret as news ingestion.
router.post("/daily", async (req, res) => {
  const expectedSecret = Buffer.from(process.env.NEWS_INGESTION_CRON_SECRET || "");
  const suppliedSecret = Buffer.from(req.get("x-cron-secret") || "");
  if (expectedSecret.length < 32 || suppliedSecret.length !== expectedSecret.length || !crypto.timingSafeEqual(expectedSecret, suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized scheduled report request." });
  }

  const editionDate = new Date().toISOString().slice(0, 10);
  let reservation;
  try {
    const existing = await AiNews.findOne({ reportType: "daily", editionDate });
    if (existing?.isCompleted) {
      return res.status(200).json({ message: "Today's AI report is already published.", news: existing, alreadyPublished: true });
    }
    if (existing && Date.now() - new Date(existing.createdAt).getTime() < 30 * 60 * 1000) {
      return res.status(202).json({ message: "Today's AI report is already being written." });
    }
    if (existing) await AiNews.deleteOne({ _id: existing._id, isCompleted: false });

    const author = await User.findOne({ role: "admin" }).select("_id").lean();
    if (!author) return res.status(503).json({ error: "An admin account is required to publish the daily report." });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usStories, indiaStories] = await Promise.all([
      News.find({ publishedAt: { $gte: since } }).sort({ publishedAt: -1 }).limit(12).select("title description content url source publishedAt category").lean(),
      NewsIn.find({ publishedAt: { $gte: since } }).sort({ publishedAt: -1 }).limit(12).select("title description content url source publishedAt category").lean(),
    ]);
    const seenUrls = new Set();
    const stories = [...usStories, ...indiaStories]
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .filter((story) => story.title && isHttpSourceUrl(story.url) && !seenUrls.has(story.url) && seenUrls.add(story.url))
      .slice(0, 5);

    if (stories.length < 3) {
      return res.status(422).json({ error: "Not enough recent source coverage to create a reliable daily report." });
    }

    reservation = await AiNews.create({
      userId: author._id,
      reportType: "daily",
      editionDate,
      topic: "Daily global news briefing",
      title: `Daily AI briefing — ${editionDate}`,
      summary: "Preparing today's source-grounded edition.",
      content: "This edition is being prepared.",
      isCompleted: false,
      sources: stories.map((story, index) => ({
        citationNumber: index + 1,
        title: story.title,
        url: story.url,
        sourceName: story.source?.name || "Unknown publisher",
        category: story.category?.[0] || "News",
        publishedAt: story.publishedAt,
      })),
    });

    const articleText = await Promise.all(stories.map(async (story) => {
      const scraped = await scrapeUrl(story.url);
      const usableScrape = scraped && !scraped.startsWith("[Content unavailable") ? scraped : "";
      return usableScrape || story.content || story.description || "Article text was unavailable.";
    }));
    const research = stories.map((story, index) => JSON.stringify({
      sourceNumber: index + 1,
      headline: story.title,
      publisher: story.source?.name || "Unknown publisher",
      publishedAt: story.publishedAt,
      url: story.url,
      articleText: articleText[index].slice(0, 1800),
    })).join("\n");
    const response = await agenticChat(buildReporterPrompt("recent news coverage across the US and India", research), [], { tools: false, jsonMode: true });
    const raw = response.text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const generated = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    if (typeof generated.title !== "string" || !generated.title.trim() || typeof generated.summary !== "string" || typeof generated.content !== "string" || !generated.content.trim()) {
      throw new Error("The report provider returned incomplete article content.");
    }

    reservation.title = generated.title.trim().slice(0, 180);
    reservation.summary = generated.summary.trim().slice(0, 1200);
    reservation.content = generated.content.trim().slice(0, 30000);
    reservation.hashtags = Array.isArray(generated.hashtags) ? generated.hashtags.filter((tag) => typeof tag === "string").slice(0, 8) : [];
    reservation.authorName = "ReadHub AI Daily Desk";
    reservation.category = "Daily Edition";
    reservation.researchData = research.slice(0, 12000);
    reservation.isCompleted = true;
    await reservation.save();
    logger.info("daily_ai_report_published", { editionDate, sources: stories.length });
    return res.status(201).json({ message: "Daily AI report published.", news: reservation });
  } catch (error) {
    if (reservation?._id) await AiNews.deleteOne({ _id: reservation._id, isCompleted: false }).catch(() => undefined);
    if (error.code === 11000) {
      const existing = await AiNews.findOne({ reportType: "daily", editionDate });
      if (existing?.isCompleted) return res.status(200).json({ message: "Today's AI report is already published.", news: existing, alreadyPublished: true });
      return res.status(202).json({ message: "Today's AI report is already being written." });
    }
    logger.error("daily_ai_report_failed", { editionDate, code: error.code || error.name || "unknown" });
    return res.status(500).json({ error: "Failed to publish today's AI report." });
  }
});

// Get all investigations
router.get("/all", async (req, res) => {
  try {
    const reports = await AiNews.find({ isCompleted: { $ne: false } }).sort({ createdAt: -1 });
    res.json({ news: reports });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch investigations" });
  }
});

// Get single investigation
router.get("/:id", async (req, res) => {
  try {
    const report = await AiNews.findOne({ _id: req.params.id, isCompleted: { $ne: false } });
    if (!report) return res.status(404).json({ message: "Not found" });
    res.json({ news: report });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch investigation" });
  }
});

module.exports = router;
