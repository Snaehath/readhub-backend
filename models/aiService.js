const { chatWithGemini } = require("./geminiClient");

// Unified AI Service using Gemini AI
async function askAI(prompt) {
  console.log("Using Gemini AI...");
  return await chatWithGemini(prompt);
}

module.exports = { askAI };
