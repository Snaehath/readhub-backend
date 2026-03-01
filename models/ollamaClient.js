const axios = require("axios");

// Chat with local Qwen via Ollama (localhost:11434)
async function chatWithLocal(userPrompt) {
  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "qwen-story",
      prompt: userPrompt,
      stream: false,
      options: {
        num_ctx: 4096, // Increased for better story continuity
      },
    });

    return response.data.response;
  } catch (error) {
    console.error("Ollama Local AI Error:", error.message);
    throw new Error(
      "Local AI Assistant is currently unavailable. Make sure Ollama is running.",
    );
  }
}

module.exports = { chatWithLocal };
