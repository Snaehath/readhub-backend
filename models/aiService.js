const { chatWithGemini } = require("./geminiClient");
const { chatWithLocal } = require("./ollamaClient");

// Unified AI Service switches between Gemini and Local Ollama based on AI_MODE
async function askAI(prompt) {
  const mode = process.env.AI_MODE || "gemini";

  if (mode === "local") {
    console.log("Using Local AI (Ollama/Qwen)...");
    const result = await chatWithLocal(prompt);
    return result;
  }

  console.log("Using Gemini AI...");
  return await chatWithGemini(prompt);
}

module.exports = { askAI };
