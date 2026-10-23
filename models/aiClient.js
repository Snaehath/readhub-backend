const { GoogleGenerativeAI } = require("@google/generative-ai");
const httpClient = require("../helper/httpClient");
const { geminiTools, openAiTools } = require("../helper/aiTools");
const { SYSTEM_PROMPT } = require("../helper/aiPrompts");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER;
const GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
const NVIDIA_CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || "openai/gpt-oss-20b";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 2500;

function normalizeHistory(history = []) {
  const normalized = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || typeof item.message !== "string") continue;
    const role = item.sender === "user" ? "user" : "assistant";
    const content = item.message.slice(-MAX_HISTORY_CHARS);
    const previous = normalized[normalized.length - 1];
    if (previous?.role === role) {
      previous.content = `${previous.content}\n${content}`.slice(-MAX_HISTORY_CHARS);
    } else {
      normalized.push({ role, content });
    }
  }
  return normalized.slice(-MAX_HISTORY_MESSAGES);
}

function validateToolCall(name, args) {
  if (name === "research_news_topic" && typeof args?.query === "string") {
    return { functionName: name, args: { query: args.query.trim().slice(0, 200) } };
  }
  if (name === "recommend_books" && typeof args?.interest === "string") {
    return { functionName: name, args: { interest: args.interest.trim().slice(0, 120) } };
  }
  throw new Error("Provider returned an unsupported tool call.");
}

function toToolResult(name, args) {
  const call = validateToolCall(name, args);
  return { type: "tool_call", ...call };
}

async function chatWithGemini(modelName, userPrompt, history, allowTools, jsonMode) {
  const modelConfig = {
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  };
  if (allowTools) modelConfig.tools = [geminiTools];
  if (jsonMode) modelConfig.generationConfig = { responseMimeType: "application/json" };

  const model = genAI.getGenerativeModel(modelConfig, { timeout: 30000 });
  const formattedHistory = normalizeHistory(history).map((message) => ({
    role: message.role === "user" ? "user" : "model",
    parts: [{ text: message.content }],
  }));
  const chat = model.startChat({ history: formattedHistory });
  const result = await chat.sendMessage(userPrompt);
  const response = result.response;
  const call = response.functionCalls()?.[0];
  if (call) return toToolResult(call.name, call.args);

  const text = response.text();
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned an empty response.");
  }
  return { type: "text", text };
}

function parseOpenAiToolCall(call) {
  let args;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch (_error) {
    throw new Error("Provider returned malformed tool arguments.");
  }
  return toToolResult(call.function.name, args);
}

async function chatWithOpenAiCompatibleProvider({ provider, endpoint, key, model, userPrompt, history, allowTools, jsonMode }) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...normalizeHistory(history),
    { role: "user", content: userPrompt },
  ];
  const payload = {
    model,
    messages,
    max_tokens: 1200,
    temperature: 0.3,
    stream: false,
  };
  if (allowTools) {
    payload.tools = openAiTools;
    payload.tool_choice = "auto";
    payload.parallel_tool_calls = false;
  }
  if (jsonMode) payload.response_format = { type: "json_object" };

  const response = await httpClient.post(endpoint, payload, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
  const message = response.data?.choices?.[0]?.message;
  if (!message) throw new Error(`${provider} returned an empty response.`);
  if (message.tool_calls?.length) return parseOpenAiToolCall(message.tool_calls[0]);
  if (typeof message.content !== "string" || !message.content.trim()) {
    throw new Error(`${provider} returned an empty response.`);
  }
  return { type: "text", text: message.content };
}

async function chatWithNvidia(userPrompt, history, allowTools, jsonMode) {
  return chatWithOpenAiCompatibleProvider({
    provider: "NVIDIA NIM",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    key: NVIDIA_API_KEY,
    model: NVIDIA_CHAT_MODEL,
    userPrompt,
    history,
    allowTools,
    jsonMode,
  });
}

async function chatWithOpenRouter(userPrompt, history, allowTools, jsonMode) {
  return chatWithOpenAiCompatibleProvider({
    provider: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    key: OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    userPrompt,
    history,
    allowTools,
    jsonMode,
  });
}

function providerCode(error) {
  return error.response?.status || error.code || error.name || "unknown";
}

async function agenticChat(userPrompt, history = [], options = {}) {
  const allowTools = options.tools !== false;
  const jsonMode = options.jsonMode === true;
  const providers = [];

  if (process.env.GEMINI_API_KEY?.trim()) {
    for (const model of GEMINI_MODELS) {
      providers.push({ name: "Gemini", model, run: () => chatWithGemini(model, userPrompt, history, allowTools, jsonMode) });
    }
  }
  if (NVIDIA_API_KEY?.trim()) {
    providers.push({ name: "NVIDIA NIM", model: NVIDIA_CHAT_MODEL, run: () => chatWithNvidia(userPrompt, history, allowTools, jsonMode) });
  }
  if (OPENROUTER_API_KEY?.trim()) {
    providers.push({ name: "OpenRouter", model: OPENROUTER_MODEL, run: () => chatWithOpenRouter(userPrompt, history, allowTools, jsonMode) });
  }

  if (providers.length === 0) {
    throw new Error("No text-generation provider is configured.");
  }

  const failures = [];
  for (const provider of providers) {
    try {
      return await provider.run();
    } catch (error) {
      const code = providerCode(error);
      failures.push(`${provider.name}/${provider.model}:${code}`);
      console.warn(`${provider.name} model ${provider.model} failed (${code}); trying the next configured provider.`);
    }
  }

  const error = new Error(`All configured AI providers failed: ${failures.join(", ")}`);
  error.code = "AI_PROVIDERS_EXHAUSTED";
  throw error;
}

module.exports = { agenticChat };
