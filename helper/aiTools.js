
// 1. OPENAI / OPENROUTER FORMAT
const openAiTools = [
  {
    type: "function",
    function: {
      name: "research_news_topic",
      description: "Search local news and scrape full text for investigative research.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The topic to search." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "recommend_books",
      description: "Get book recommendations from OpenLibrary based on interest.",
      parameters: {
        type: "object",
        properties: {
          interest: { type: "string", description: "The genre or topic of interest." }
        },
        required: ["interest"]
      }
    }
  }
];

// 2. GEMINI NATIVE FORMAT
const geminiTools = {
  functionDeclarations: [
    {
      name: "research_news_topic",
      description: "Search local news and scrape full text for investigative research.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "string", description: "The topic to search." }
        },
        required: ["query"]
      }
    },
    {
      name: "recommend_books",
      description: "Get book recommendations from OpenLibrary based on interest.",
      parameters: {
        type: "OBJECT",
        properties: {
          interest: { type: "string", description: "The genre or topic of interest." }
        },
        required: ["interest"]
      }
    }
  ],
  googleSearchRetrieval: {
    dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.3 }
  }
};

module.exports = { openAiTools, geminiTools };
