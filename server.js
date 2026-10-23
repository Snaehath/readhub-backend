require("dotenv").config();

const requiredEnv = ["MONGO_URI", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]?.trim());
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}
if (Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
  throw new Error("JWT_SECRET must be at least 32 bytes long.");
}
const hasAiProvider = [
  process.env.GEMINI_API_KEY,
  process.env.NVIDIA_API_KEY,
  process.env.OPENROUTER_API_KEY,
  process.env.OPEN_ROUTER,
].some((key) => key?.trim());
if (!hasAiProvider) {
  throw new Error("Configure at least one AI provider key: GEMINI_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY.");
}

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { apiLimiter } = require("./helper/rateLimit");

const newsRoutes = require("./routes/news");
const booksRoutes = require("./routes/books");
const chatBotRoute = require("./routes/chatbot");
const userRoutes = require("./routes/user");
const aiReporterRoutes = require("./routes/aiReporter");

const app = express();
app.disable("x-powered-by");
// Render's public web service sits behind one trusted load-balancer hop.
// This lets express-rate-limit use the forwarded client IP without trusting
// arbitrary proxy chains supplied by the caller.
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const configuredOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  "https://readhub-frontend.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...configuredOrigins,
]);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  req.cookies = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      req.cookies[name] = decodeURIComponent(value);
    } catch (_error) {
      // Ignore malformed cookie values; auth will fail closed.
    }
  }
  next();
});
app.use("/api", (req, _res, next) => {
  if (!req.headers.authorization && req.cookies?.readhub_token) {
    req.headers.authorization = `Bearer ${req.cookies.readhub_token}`;
  }
  next();
});
app.use("/api", (req, res, next) => {
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const origin = req.get("origin");
  if (isMutation && ((origin && !allowedOrigins.has(origin)) || (req.cookies?.readhub_token && !origin))) {
    return res.status(403).json({ error: "Request origin is not allowed." });
  }
  return next();
});
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/health/ready", (_req, res) => {
  const isReady = mongoose.connection.readyState === 1;
  res.status(isReady ? 200 : 503).json({ status: isReady ? "ready" : "not_ready" });
});

app.use("/api", apiLimiter);

app.use("/api/news", newsRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/user", userRoutes);
app.use("/api/ai", chatBotRoute);
app.use("/api/ai-hub/news", aiReporterRoutes);

app.post("/api/ping", (_req, res) => {
  res.status(200).json({ message: "Success" });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }
  console.error("Unhandled request error:", err.name || "Error");
  return res.status(500).json({ error: "Internal server error." });
});

async function startServer() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");

  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  let isShuttingDown = false;
  const shutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`${signal} received; shutting down gracefully`);
    server.close(async (error) => {
      if (error) process.exitCode = 1;
      try {
        await mongoose.disconnect();
      } catch (_disconnectError) {
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((err) => {
  console.error("Backend startup failed:", err.name || "Error");
  process.exitCode = 1;
});
