const openAiTools = [
  {
    type: "function",
    function: {
      name: "research_news_topic",
      description: "Search ReadHub's indexed news and retrieve source material for current or evidence-based questions.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A concise search query of at most 200 characters." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_books",
      description: "Find matching books in ReadHub's book catalog for a requested genre or interest.",
      parameters: {
        type: "object",
        properties: {
          interest: { type: "string", description: "A short genre, topic, or reading preference." },
        },
        required: ["interest"],
        additionalProperties: false,
      },
    },
  },
];

const geminiTools = {
  functionDeclarations: [
    {
      name: "research_news_topic",
      description: "Search ReadHub's indexed news and retrieve source material for current or evidence-based questions.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "A concise search query, up to 200 characters." },
        },
        required: ["query"],
      },
    },
    {
      name: "recommend_books",
      description: "Find matching books in ReadHub's book catalog for a requested genre or interest.",
      parameters: {
        type: "OBJECT",
        properties: {
          interest: { type: "STRING", description: "A short genre, topic, or reading preference." },
        },
        required: ["interest"],
      },
    },
  ],
};

module.exports = { openAiTools, geminiTools };
