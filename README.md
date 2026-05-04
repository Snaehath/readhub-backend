# ReadHub Backend: The Unified Intelligence Hub

ReadHub is an AI-powered news aggregation, storytelling, and investigative platform. The backend is an event-driven, agentic engine built using Node.js, Express, and MongoDB, featuring deep integration with Gemini, OpenRouter, and NVIDIA Embedding models.

---

## 🛰️ Elite Investigative Features

### 🕵️‍♂️ Streaming Investigative Engine (SSE)

We've migrated the core AI assistant to an **Event-Driven Streaming Architecture**.

- **Real-Time Hooks**: Emits `status`, `tool_call`, `tool_result`, and `llm_step` events via Server-Sent Events (SSE).
- **Investigative Console Support**: Powers the live-thinking terminal in the frontend, providing 100% transparency into the agent's multi-turn reasoning.

### 🧠 Self-Healing RAG

A dynamic data-enrichment loop that ensures your vector database gets smarter with every query.

- **Deep Scraping**: When the agent identifies a news source, it automatically scrapes the full-text content.
- **Automated Re-Embedding**: Once full content is retrieved, the system triggers a **NVIDIA NV-Embed-v1** call to re-calculate the vector embedding, optimizing the database for high-fidelity future retrieval.
- **Source Auditing**: Captures and validates all digital footprints (URLs) encountered during the research phase.

### 🏛️ Multi-Session Intelligence

Chat history has evolved into a robust, session-indexed memory system.

- **Session Isolation**: Research threads are siloed by unique `sessionId`s, preventing cross-contamination of contexts.
- **Cloud Persistence**: All sessions and their investigative trails are synced to MongoDB for cross-device access.

---

## 🚀 Core Pillar Features

- **AI Story Generation**: A multi-agent system ('The Architect' for world-building and 'The Scribe' for prose) that generates 9-chapter original novels.
- **Intelligent Hub**: Provides news summaries, in-depth investigations, and cross-referenced reports.
- **Normalized Review System**: Independent collection for story reviews for high-performance scalability.

---

## 📂 Project Structure

```text
backend/
├── helper/              # Business logic & Utility functions
│   ├── aiTools.js       # Structured tools for agentic reasoning
│   ├── eventPipeline.js # SSE emission & event management
│   ├── scraperAgent.js  # Deep-scraping & RAG healing logic
│   ├── vectorSearch.js  # MongoDB Vector Search integrations
│   └── ...              # Auth & Utils
├── models/              # Mongoose Data Schemas
│   ├── aiClient.js      # Unified Multi-Provider Agent (Gemini + OpenRouter)
│   ├── user.js          # Multi-Session Investigative memory
│   └── ...              # News, Books, and Story models
├── routes/              # Express API Endpoints
│   ├── chatbot.js       # SSE-driven Streaming Hub & Session Management
│   └── ...              # Story & News endpoints
```

---

## 🛠️ Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (Vector Search & Atlas)
- **AI Engine**: [Google Gemini](https://ai.google.dev/) & [OpenRouter (Gemma)](https://openrouter.ai/)
- **Embeddings**: [NVIDIA NV-Embed-v1](https://build.nvidia.com/)
- **Scraping**: [Cheerio](https://cheerio.js.org/) & [Axios](https://axios-http.com/)

---

## ⚙️ Setup & Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Snaehath/readhub-backend.git
   cd readhub-backend
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file with:

   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   GEMINI_API_KEY=your_gemini_key
   NVIDIA_API_KEY=your_nvidia_key
   OPENROUTER_API_KEY=your_openrouter_key
   ```

4. **Run the application**:
   - `npm run dev` (Hot-reload)
   - `npm start` (Production)

---
