const express = require("express");
const router = express.Router();
const { agenticChat } = require("../models/aiClient");
const { searchNewsContext } = require("../helper/newsSearch");
const { scrapeUrl } = require("../helper/scraperAgent");
const { verifyToken } = require("../helper/authJwt");
const AgentEventPipeline = require("../helper/eventPipeline");
const User = require("../models/user");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const Books = require("../models/books");
const mongoose = require("mongoose");
const { expensiveLimiter } = require("../helper/rateLimit");
const { buildResearchPrompt, buildBookPrompt, buildArticlePrompt, buildForecastPrompt } = require("../helper/aiPrompts");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Main investigative streaming engine
router.post("/chat-stream", expensiveLimiter, async (req, res) => {
  const { userMessage, sessionId } = req.body || {};
  const authHeader = req.headers.authorization;
  const [scheme, token] = authHeader?.split(" ") || [];
  const userData = scheme === "Bearer" ? verifyToken(token) : null;

  if (!userData) return res.status(401).json({ message: "Unauthorized" });
  if (typeof userMessage !== "string" || !userMessage.trim() || userMessage.length > 4000) {
    return res.status(400).json({ message: "A message between 1 and 4000 characters is required." });
  }
  if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length > 100)) {
    return res.status(400).json({ message: "Session ID must be a string of at most 100 characters." });
  }

  let user;
  try {
    user = await User.findById(userData.userId);
  } catch (_error) {
    return res.status(500).json({ message: "Unable to load the authenticated user." });
  }
  if (!user) return res.status(401).json({ message: "Authenticated user no longer exists." });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const pipeline = new AgentEventPipeline(res);
  pipeline.startHeartbeat(); // Keep Render connection alive
  const startTime = Date.now();

  try {
    const activeSessionId = sessionId || require("crypto").randomUUID();
    
    let session = user.sessions.find(s => s.sessionId === activeSessionId);
    if (!session) {
      session = { sessionId: activeSessionId, title: userMessage.substring(0, 40), messages: [] };
      user.sessions.push(session);
    }
    
    const sessionHistory = session.messages.slice(-10);
    const allSources = new Set();
    let turns = 0;
    const maxTurns = 3;
    let currentHistory = [...sessionHistory];
    let finalReply = "";
    let sourceReferences = [];
    let thoughts = [];
    let isFinished = false;
    let currentPrompt = userMessage;

    while (turns < maxTurns && !isFinished) {
      pipeline.status(turns === 0 ? "Analyzing request strategy..." : `Refining turn ${turns + 1} strategy...`);
      const agentResponse = await agenticChat(currentPrompt, currentHistory);

      if (agentResponse.thoughts && agentResponse.thoughts.length > 0) {
        agentResponse.thoughts.forEach(t => {
          thoughts.push(`🎯 Strategy: ${t}`);
          pipeline.llmStep(t);
        });
      }

      if (agentResponse.type === "tool_call") {
        turns++;
        const { functionName, args } = agentResponse;
        pipeline.toolCall(functionName, args);
        thoughts.push(`🛠️ Action: Invoking ${functionName}...`);

        if (functionName === "recommend_books") {
          const interest = args.interest;
          const terms = interest.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.slice(0, 6) || [];
          const bookMatches = terms.length
            ? await Books.find({
                $or: terms.flatMap((term) => {
                  const regex = { $regex: escapeRegex(term), $options: "i" };
                  return [{ title: regex }, { category: regex }, { "authors.name": regex }];
                }),
              })
                .select("title authors summaries category readUrl")
                .limit(5)
                .lean()
            : [];
          const catalog = bookMatches.map((book) => ({
            title: book.title,
            authors: (book.authors || []).map((author) => author.name).filter(Boolean),
            category: book.category || [],
            summary: (book.summaries || [])[0]?.slice(0, 300) || "",
            url: book.readUrl,
          }));
          pipeline.toolResult(functionName, `Found ${catalog.length} catalog matches`);
          currentHistory.push({ sender: "bot", message: `Book catalog lookup returned ${catalog.length} matches.` });
          currentPrompt = buildBookPrompt(userMessage, interest, catalog);
          thoughts.push(`Book catalog returned ${catalog.length} matches.`);
        } else if (functionName === "research_news_topic") {
          const searchResults = await searchNewsContext(args.query, 3);
          pipeline.status(`Scraping ${searchResults.length} identified sources...`);

          const scrapedResults = await Promise.all(searchResults.map(async (article) => {
            if (article.url) allSources.add(article.url);
            const scraped = article.url ? await scrapeUrl(article.url) : "";
            const fullContent = scraped && !scraped.includes("[Content unavailable")
              ? scraped
              : [article.description, article.content].filter(Boolean).join("\n");
            if (article.url && scraped && !scraped.includes("[Content unavailable")) {
              const Model = article.sourceRegion === "US" ? News : NewsIn;
              await Model.findByIdAndUpdate(article._id, { content: fullContent });
            }
            return {
              ...article,
              fullContent: fullContent.slice(0, 2200),
              sourceName: article.source?.name || "Unknown",
            };
          }));

          pipeline.toolResult(functionName, `Retrieved ${scrapedResults.length} sources`);
          currentHistory.push({ sender: "bot", message: `News research returned ${scrapedResults.length} sources.` });
          const sources = scrapedResults.map((source, index) => ({
            citationNumber: index + 1,
            title: source.title,
            publisher: source.sourceName,
            url: source.url || "Unavailable",
            text: source.fullContent,
          }));
          sourceReferences = sources.map(({ citationNumber, title, publisher, url }) => ({
            citationNumber,
            title,
            publisher,
            url,
          }));
          currentPrompt = buildResearchPrompt(userMessage, args.query, sources);
          thoughts.push(`News research returned ${scrapedResults.length} sources.`);
        } else {
          throw new Error("Unsupported AI tool requested.");
        }
      } else {
        pipeline.status("Cross-referencing data and validating facts...");
        await new Promise(r => setTimeout(r, 1000));
        
        const sources = Array.from(allSources);
        if (sources.length > 0) {
          pipeline.emitEvent('sources', `Validation complete. Cross-referenced ${sources.length} sources.`, { sources: sources });
        }

        pipeline.status("Synthesizing final investigative report...");
        finalReply = agentResponse.text;
        isFinished = true;
      }
    }

    if (!finalReply && currentPrompt !== userMessage) {
      const synthesis = await agenticChat(currentPrompt, currentHistory, { tools: false });
      finalReply = synthesis.text || "I could not synthesize the research results.";
    }
    if (!finalReply) finalReply = "I could not complete the research request.";
    const latency = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalSources = Array.from(allSources);

    const sessionIndex = user.sessions.findIndex(s => s.sessionId === activeSessionId);
    if (sessionIndex !== -1) {
      user.sessions[sessionIndex].messages.push(
        { sender: "user", message: userMessage },
        { sender: "bot", message: finalReply, thoughts, latency, sources: sourceReferences, events: [{ type: 'status', message: 'Sources Checked', sources: finalSources }] }
      );
      user.sessions[sessionIndex].updatedAt = new Date();
      await user.save();
    }

    pipeline.final(finalReply, thoughts, latency, sourceReferences);
    pipeline.stopHeartbeat();
    res.end();

  } catch (error) {
    console.error("Stream processing failed:", error.response?.status || error.code || error.name || "unknown");
    pipeline.emitEvent('error', "Intelligence blackout occurred.");
    pipeline.stopHeartbeat();
    res.end();
  }
});

// Fetch all sessions for user
router.get("/history", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  try {
    const user = await User.findById(userData.userId).select("sessions");
    if (!user) return res.status(401).json({ message: "Authenticated user no longer exists." });
    const sessionList = user.sessions.map(s => ({
      sessionId: s.sessionId,
      title: s.title,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length
    })).sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({ sessions: sessionList });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch session history." });
  }
});

// Fetch specific session details
router.get("/history/:sessionId", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });
  if (req.params.sessionId.length > 100) return res.status(400).json({ error: "Invalid session ID." });

  try {
    const user = await User.findById(userData.userId);
    if (!user) return res.status(401).json({ message: "Authenticated user no longer exists." });
    const session = user.sessions.find(s => s.sessionId === req.params.sessionId);
    res.json({ history: session ? session.messages : [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch session details." });
  }
});

// Delete specific session
router.delete("/history/:sessionId", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });
  if (req.params.sessionId.length > 100) return res.status(400).json({ error: "Invalid session ID." });

  try {
    await User.findByIdAndUpdate(userData.userId, { $pull: { sessions: { sessionId: req.params.sessionId } } });
    res.json({ message: "Session deleted." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete session." });
  }
});

// Clear all history
router.delete("/history", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  try {
    await User.findByIdAndUpdate(userData.userId, { $set: { sessions: [] } });
    res.json({ message: "All investigation sessions cleared." });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear sessions." });
  }
});

// One-off chat for Ask AI Modal
router.post("/chat", expensiveLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const { userMessage } = req.body || {};
  if (typeof userMessage === "string" && (!userMessage.trim() || userMessage.length > 4000)) {
    return res.status(400).json({ error: "Message must be between 1 and 4000 characters." });
  }
  if (!userMessage || (typeof userMessage !== "string" && (!mongoose.Types.ObjectId.isValid(userMessage.id) || !["us", "in"].includes(userMessage.selectedCountry)))) {
    return res.status(400).json({ error: "A valid message or article selection is required." });
  }
  try {
    let prompt = typeof userMessage === 'string' ? userMessage : "";
    if (userMessage?.id) {
      const Model = userMessage.selectedCountry === "in" ? NewsIn : News;
      const article = await Model.findById(userMessage.id);
      if (!article) return res.status(404).json({ error: "Article not found." });
      prompt = buildArticlePrompt(article);
    }
    const response = await agenticChat(prompt, [], { tools: false });
    res.json({ reply: response.text });
  } catch (error) {
    res.status(500).json({ error: "AI reasoning failed." });
  }
});

// Forecast AI Modal
router.post("/futureNews", expensiveLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const { userMessage } = req.body || {};
  if (!userMessage || typeof userMessage !== "object" || !mongoose.Types.ObjectId.isValid(userMessage.id) || !["us", "in"].includes(userMessage.selectedCountry)) {
    return res.status(400).json({ error: "A valid article selection is required." });
  }
  const { id, selectedCountry, targetYear, previousForecast } = userMessage;
  if (targetYear !== undefined && (!Number.isInteger(targetYear) || targetYear < 2020 || targetYear > 2100)) {
    return res.status(400).json({ error: "Target year must be between 2020 and 2100." });
  }
  if (previousForecast !== undefined && (typeof previousForecast !== "string" || previousForecast.length > 4000)) {
    return res.status(400).json({ error: "Previous forecast is too long." });
  }

  try {
    const Model = selectedCountry === "in" ? NewsIn : News;
    const article = await Model.findById(id);
    if (!article) return res.status(404).json({ error: "Article not found." });
    const prompt = buildForecastPrompt(article, targetYear || new Date().getFullYear() + 1, previousForecast);
    const response = await agenticChat(prompt, [], { tools: false });
    res.json({ reply: response.text });
  } catch (error) {
    res.status(500).json({ error: "Forecasting failed." });
  }
});

module.exports = router;
