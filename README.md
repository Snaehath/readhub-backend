# ReadHub Backend

ReadHub is an AI-powered news aggregation and storytelling platform. The backend is built using Node.js, Express, and MongoDB, with deep integration into Gemini AI for generating original literary masterpieces and providing an intelligent news chatbot.

---

## 🚀 Features

- **AI Story Generation**: A multi-agent system ('The Architect' for world-building and 'The Scribe' for prose) that generates 9-chapter original novels.
- **Intelligent Chatbot**: Provides news summaries, in-depth explanations of current events, and book recommendations using RAG-like patterns with MongoDB.
- **Normalized Review System**: Separate collection for story reviews to ensure high performance and scalability.
- **Dynamic News Aggregator**: Fetches and digests news from both US and India markets.

---

## 📂 Project Structure

```text
backend/
├── helper/              # Business logic & Utility functions
│   ├── authJwt.js       # JWT Verification helpers
│   ├── prompts.js       # AI Persona & prompt engineering templates
│   └── utils.js         # Shared formatting helpers
├── models/              # Mongoose Data Schemas
│   ├── story.js         # Story metadata & aggregate stats
│   ├── review.js        # Independent Review collection
│   ├── geminiClient.js  # Dedicated Gemini AI wrapper
│   └── ...              # News, Books, and User models
├── routes/              # Express API Endpoints
│   ├── story.js         # Story progression & review management
│   ├── chatbot.js       # AI Assistant logic
│   └── ...              # Authentication & News endpoints
├── public/              # Static assets (covers, etc.)
└── server.js            # Main application entry point
```

---

## 🛠️ Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (Mongoose ODM)
- **AI Engine**: [Google Gemini AI](https://ai.google.dev/)
- **Authentication**: JSON Web Tokens (JWT)
- **Prose Analysis**: [Compromise (NLP)](https://github.com/spencermountain/compromise)

---

## ⚙️ Setup & Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Snaehath/readhub-backend.git
    cd readhub-backend
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Create a `.env` file in the root with the following keys:
    ```env
    PORT=5000
    MONGO_URI=your_mongodb_connection_string
    JWT_SECRET=your_jwt_secret
    GEMINI_API_KEY=your_gemini_key
    ```
4.  **Run the application**:
    - Development mode: `npm run dev`
    - Production mode: `npm start`

---
