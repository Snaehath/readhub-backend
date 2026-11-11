# ReadHub Backend

The Express API for ReadHub. It stores US and India news coverage, serves the book catalog, handles account and chat APIs, and generates source-linked AI reports.

---

## Main capabilities

- News ingestion and keyword search across saved US and India articles.
- AI assistant and article analysis with provider failover.
- AI reports built from saved reporting, with inline citations and links to their sources.
- Cookie-based authentication, chat history, books, health checks, and account lifecycle endpoints.

### On-demand AI reports

Admins can generate one-off reports from saved US and India news coverage in the app. The report is an AI-written synthesis, not a replacement for publisher reporting, and includes links to source articles.

News refresh and report generation are manual for now. Admins refresh headlines and request reports on demand; no scheduler is configured in this repository. The backend retains a cron-secret-protected daily report endpoint for future automation, but nothing calls it while scheduling is disabled.

---

## 🚀 Core Pillar Features

- **Intelligent Hub**: Provides news summaries, in-depth investigations, and cross-referenced reports.

---

## 📂 Project Structure

```text
backend/
├── helper/              # Business logic & Utility functions
│   ├── aiTools.js       # Structured tools for agentic reasoning
│   ├── eventPipeline.js # SSE emission & event management
│   ├── scraperAgent.js  # News article scraping
│   ├── newsSearch.js    # Keyword-based news retrieval
│   └── ...              # Auth & Utils
├── models/              # Mongoose Data Schemas
│   ├── aiClient.js      # Unified Multi-Provider Agent (Gemini + OpenRouter)
│   ├── user.js          # Users and multi-session investigative memory
│   └── ...              # News, books, and AI report models
├── routes/              # Express API Endpoints
│   ├── chatbot.js       # SSE-driven streaming hub and session management
│   └── ...              # News, books, user, and report endpoints
```

---

## 🛠️ Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/)
- **AI Engine**: [Google Gemini](https://ai.google.dev/) & [OpenRouter (Gemma)](https://openrouter.ai/)
- **AI failover**: Gemini 3.1 Flash-Lite → Gemini 2.5 Flash-Lite → NVIDIA NIM → OpenRouter
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
   npm ci
   ```

3. **Environment Variables**:
   Copy `.env.example` to `.env`. `MONGO_URI`, a `JWT_SECRET` of at least 32 bytes, and at least one of `GEMINI_API_KEY`, `NVIDIA_API_KEY`, or `OPENROUTER_API_KEY` are required. Set `FRONTEND_ORIGINS` to the exact deployed frontend origin(s), separated by commas. Set provider model overrides only when needed. Keep `.env` private; it is excluded by `.gitignore`.

Text generation tries Gemini `gemini-3.1-flash-lite`, then `gemini-2.5-flash-lite`, then NVIDIA NIM (`openai/gpt-oss-20b` by default), and finally OpenRouter (`openrouter/free` by default). The 2.5 Flash-Lite API may be restricted for projects that have not previously used the 2.5 family; the fallback chain will continue if Google rejects it. News research uses keyword retrieval against saved articles.

Authentication uses a short-lived HttpOnly cookie. The frontend should call the backend through its `/api` proxy so the cookie remains first-party. In production, configure the frontend's server-side `BACKEND_API_URL` and this backend's `FRONTEND_ORIGINS`.

4. **Run the application**:
   - `npm run dev` for local development with hot reload.
   - `npm start` to run the production server with Node.js.

## Privacy and account lifecycle

- Chat messages, source references, likes, and bookmarks are stored in the user's MongoDB record until the user clears chat history or deletes their account.
- `DELETE /api/user/account` requires the current password. It permanently deletes the user record, including chat history and saved preferences, and clears the authentication cookie.
- There is no automatic chat-history expiration configured. MongoDB/provider backups can retain deleted records according to the retention policy configured for that database; set and document that policy in the hosting account.
- News records are pruned to the latest 50 records in the ingestion flow. Scraped article text may be cached in those records.

## Operations and deployment checklist

- Configure `MONGO_URI`, a unique `JWT_SECRET` (32+ bytes), AI provider keys, and the exact `FRONTEND_ORIGINS`; never put provider secrets in frontend variables.
- Configure database backups and periodically verify a restore. The app does not schedule or verify backups itself.
- `/health/live` checks the process and `/health/ready` checks MongoDB connectivity. Add external uptime monitoring against readiness.
- Provider calls have request timeouts and automatic provider failover. JSON logs include provider, model, failure code, and server lifecycle events without logging prompts or API keys.
- API throttles currently use an in-process store. Configure a shared rate-limit store before scaling to multiple backend instances.
- News ingestion accepts an admin request or a trusted scheduler sending `X-Cron-Secret`. News refresh and report generation are manual in the current deployment. `NEWS_INGESTION_CRON_SECRET` is only needed if you later configure an external scheduler; the GitHub Actions workflow has been removed for now.
- Before release, verify frontend/backend origins, production secrets, DB connectivity and restore plan, AI failover, manual news refresh and report generation, account deletion, and health checks. Configure and verify a scheduler only if you re-enable automatic ingestion or daily editions. Review CI results and Dependabot alerts.

The server exposes `/health/live` for process liveness and `/health/ready` for MongoDB readiness. API requests are rate-limited in-process; use a shared limiter store before running multiple backend instances.

---
