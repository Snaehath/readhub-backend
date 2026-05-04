const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const { geminiTools, openAiTools } = require("../helper/aiTools");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const getOpenRouterKey = () =>
  process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER;

/**
 * 🛰️ NVIDIA EMBEDDING ENGINE
 */
async function generateEmbedding(text, type = "query") {
  if (!text || typeof text !== "string") {
    console.warn("NVIDIA Embedding Warning: Invalid or missing text input.");
    return null;
  }
  try {
    const response = await axios.post(
      "https://integrate.api.nvidia.com/v1/embeddings",
      {
        model: "nvidia/nv-embed-v1",
        input: [text],
        input_type: type,
        encoding_format: "float",
      },
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );
    return response.data.data[0].embedding;
  } catch (error) {
    console.error(
      "NVIDIA Embedding Error:",
      error.response?.data || error.message,
    );
    return null;
  }
}

/**
 * ⚡ GEMINI NATIVE ENGINE
 */
async function chatWithGemini(userPrompt, history) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: [geminiTools],
    systemInstruction:
      "You are ReadHub AI, a professional and friendly research assistant. Respond directly and warmly to greetings (like 'Hello', 'Good morning') and general questions about yourself (like 'What can you do?'). ONLY use tools for specific research, news, or investigative queries where you need real-time data.",
  });
  const formattedHistory = history.map((h) => ({
    role: h.sender === "user" ? "user" : "model",
    parts: [{ text: h.message }],
  }));

  const chat = model.startChat({ history: formattedHistory });
  const result = await chat.sendMessage(userPrompt);
  const response = result.response;
  const calls = response.functionCalls();

  if (calls && calls.length > 0) {
    return {
      type: "tool_call",
      functionName: calls[0].name,
      args: calls[0].args,
      chatInstance: chat,
    };
  }

  return { type: "text", text: response.text() };
}

/**
 * 🧠 OPENROUTER (GEMMA-4) ENGINE
 */
async function chatWithOpenRouter(userPrompt, history) {
  const key = getOpenRouterKey();
  if (!key) {
    console.error(
      "❌ OpenRouter API Key is MISSING! Checked: OPENROUTER_API_KEY, OPEN_ROUTER",
    );
  }

  const messages = history.map((h) => ({
    role: h.sender === "user" ? "user" : "assistant",
    content: h.message,
  }));
  messages.unshift({
    role: "system",
    content:
      "You are ReadHub AI, a professional and friendly research assistant. Respond directly to greetings and general questions without calling tools. ONLY use tools for research or news-related queries.",
  });
  messages.push({ role: "user", content: userPrompt });

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openrouter/free",
      messages: messages,
      tools: openAiTools,
      tool_choice: "auto",
      include_reasoning: true,
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
  );

  const choice = response.data.choices[0].message;

  // 1. Standard OpenAI Tool Call
  if (choice.tool_calls) {
    const toolCall = choice.tool_calls[0].function;
    return {
      type: "tool_call",
      functionName: toolCall.name,
      args: JSON.parse(toolCall.arguments),
      reasoning: choice.reasoning,
    };
  }

  // 2. Fallback for Minimax/Other tag-based tool calls (Leaking in free tier)
  const content = choice.content || "";
  const minimaxRegex = /(?:<)?minimax:tool_call(?:>)?\s*([\s\S]*?)\s*<\/minimax:tool_call>/i;
  const match = content.match(minimaxRegex);
  
  if (match) {
    return {
      type: "tool_call",
      functionName: "research_news_topic",
      args: { query: match[1].trim() },
      thoughts: [
        content.replace(minimaxRegex, "").substring(0, 500) + "...",
      ],
    };
  }

  return {
    type: "text",
    text: choice.content,
    thoughts: choice.reasoning ? [choice.reasoning] : [],
  };
}

/**
 * 🏛️ UNIFIED AGENTIC CHAT
 */
async function agenticChat(userPrompt, history = [], provider = "gemini") {
  if (provider === "gemini") {
    try {
      return await chatWithGemini(userPrompt, history);
    } catch (e) {
      console.warn("⚠️ Gemini Quota Exhausted. Failing over to OpenRouter...");
      return await chatWithOpenRouter(userPrompt, history);
    }
  }
  return await chatWithOpenRouter(userPrompt, history);
}

module.exports = { agenticChat, generateEmbedding };
