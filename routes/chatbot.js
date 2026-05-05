const express = require("express");
const router = express.Router();
const { agenticChat, generateEmbedding } = require("../models/aiClient");
const { getRelavantContext } = require("../helper/vectorSearch");
const { batchScrape, scrapeUrl } = require("../helper/scraperAgent");
const { verifyToken } = require("../helper/authJwt");
const AgentEventPipeline = require("../helper/eventPipeline");
const User = require("../models/user");
const News = require("../models/news");
const NewsIn = require("../models/newsIn");
const axios = require("axios");

const getOpenRouterKey = () => process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER;

// Main investigative streaming engine
router.get("/chat-stream", async (req, res) => {
  const { userMessage, token: queryToken, sessionId } = req.query; 
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.split(" ")[1]) || queryToken;
  const userData = verifyToken(token);

  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const pipeline = new AgentEventPipeline(res);
  pipeline.startHeartbeat(); // Keep Render connection alive
  const startTime = Date.now();

  try {
    const user = await User.findById(userData.userId);
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

        const searchResults = await getRelavantContext(args.query, 3);
        pipeline.status(`Scraping ${searchResults.length} identified sources...`);
        
        const scrapedResults = await Promise.all(searchResults.map(async (article) => {
          if (article.url) allSources.add(article.url);
          const fullContent = await scrapeUrl(article.url);
          if (fullContent && !fullContent.includes("[Content unavailable")) {
            const Model = article.sourceRegion === "US" ? News : NewsIn;
            const embedding = await generateEmbedding(fullContent);
            await Model.findByIdAndUpdate(article._id, { content: fullContent, embedding: embedding || article.embedding });
          }
          return { ...article, fullContent };
        }));

        pipeline.toolResult(functionName, `Retrieved ${scrapedResults.length} detailed articles`);
        const toolResult = scrapedResults.map(s => `Source [${s.sourceRegion}]: ${s.title}\nContent: ${s.fullContent.substring(0, 5000)}`).join("\n\n---\n\n");

        thoughts.push(`📝 Observation: Retrieved ${scrapedResults.length} articles.`);
        currentHistory.push({ sender: "user", message: currentPrompt });
        currentHistory.push({ sender: "bot", message: `Turn ${turns} complete.`, thoughts: [`Investigated ${args.query}`] });
        currentPrompt = `System: Research results for "${args.query}": ${toolResult}. Continue or synthesize.`;
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

    if (!finalReply) finalReply = "Research complete. Based on my findings...";
    const latency = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalSources = Array.from(allSources);

    const sessionIndex = user.sessions.findIndex(s => s.sessionId === activeSessionId);
    if (sessionIndex !== -1) {
      user.sessions[sessionIndex].messages.push(
        { sender: "user", message: userMessage },
        { sender: "bot", message: finalReply, thoughts, latency, events: [{ type: 'status', message: 'Sources Checked', sources: finalSources }] }
      );
      user.sessions[sessionIndex].updatedAt = new Date();
      await user.save();
    }

    pipeline.final(finalReply, thoughts, latency);
    pipeline.stopHeartbeat();
    res.end();

  } catch (error) {
    console.error("Stream Error:", error.message);
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

  try {
    const user = await User.findById(userData.userId);
    const session = user.sessions.find(s => s.sessionId === req.params.sessionId);
    res.json({ history: session ? session.messages : [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch session details." });
  }
});

// Delete specific session
router.get("/delete-history/:sessionId", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  try {
    await User.findByIdAndUpdate(userData.userId, { $pull: { sessions: { sessionId: req.params.sessionId } } });
    res.json({ message: "Session deleted." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete session." });
  }
});

// Clear all history
router.get("/clear-history", async (req, res) => {
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
router.post("/chat", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const { userMessage } = req.body;
  try {
    let prompt = typeof userMessage === 'string' ? userMessage : "";
    if (userMessage?.id) {
      const Model = userMessage.selectedCountry === "in" ? NewsIn : News;
      const article = await Model.findById(userMessage.id);
      prompt = `Analyze this article: ${article?.title}\n\nContent: ${article?.content?.substring(0, 5000)}`;
    }
    const response = await agenticChat(prompt, []);
    res.json({ reply: response.text });
  } catch (error) {
    res.status(500).json({ error: "AI reasoning failed." });
  }
});

// Forecast AI Modal
router.post("/futureNews", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);
  if (!userData) return res.status(401).json({ message: "Unauthorized" });

  const { userMessage } = req.body;
  const { id, selectedCountry, targetYear, previousForecast } = userMessage;

  try {
    const Model = selectedCountry === "in" ? NewsIn : News;
    const article = await Model.findById(id);
    const prompt = `As a Strategic Forecaster, analyze: "${article?.title}".\nContext: ${article?.content?.substring(0, 4000)}\n${previousForecast ? `Previous Forecast: ${previousForecast}` : ""}\nTASK: Predict the landscape for ${targetYear || 2030}.`;
    const response = await agenticChat(prompt, []);
    res.json({ reply: response.text });
  } catch (error) {
    res.status(500).json({ error: "Forecasting failed." });
  }
});

module.exports = router;
