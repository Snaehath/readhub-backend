const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function chatWithGemini(userPrompt) {
  try {
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    throw new Error("AI Assistant is currently unavailable.");
  }
}

module.exports = { chatWithGemini };
