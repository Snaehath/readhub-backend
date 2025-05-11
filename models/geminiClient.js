const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

async function chatWithGemini(userPrompt) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-001',
    contents: userPrompt,
  });
  return response.text;
}



module.exports = { chatWithGemini };
