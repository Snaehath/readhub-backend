const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    username: { type: String },
    passwordhash: { type: String, required: true },
    avatar: { type: String },
    // Likes
    likes_us: [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
    likes_in: [{ type: mongoose.Schema.Types.ObjectId, ref: "NewsIn" }],

    // Bookmarks
    bookmarks_us: [{ type: mongoose.Schema.Types.ObjectId, ref: "News" }],
    bookmarks_in: [{ type: mongoose.Schema.Types.ObjectId, ref: "NewsIn" }],
    role: { type: String, enum: ["user", "admin"], default: "user" },
    
    // 🧠 Multi-Session Investigative Memory
    sessions: [{
      sessionId: { type: String, required: true },
      title: { type: String, default: "New Investigation" },
      messages: [{
        sender: { type: String, enum: ["user", "bot"] },
        message: { type: String },
        thoughts: [{ type: String }],
        latency: { type: String },
        events: [{ type: Object }], // Store structured events
        createdAt: { type: Date, default: Date.now }
      }],
      updatedAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true },
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
