const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET; // Make sure this is set in .env or Render

router.post("/addUser", async (req, res) => {
  try {
    const { email, username, password, avatar } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User already exists with this email." });
    }

    // Create new user
    const newUser = new User({
      email,
      username,
      passwordhash: await bcrypt.hash(password, 10),
      avatar,
      likes_us: [],
      likes_in: [],
      bookmarks_us: [],
      bookmarks_in: [],
    });
    await newUser.save();
    res.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser._id,
        email: newUser.email,
        username: newUser.username,
        avatar: newUser.avatar,
      },
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.passwordhash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password." });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Respond with token and user info
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/update", async (req, res) => {
  try {
    const { userId, username, avatar } = req.body;

    // Validate userId
    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    // Find user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Update user properties
    if (username !== undefined) user.username = username;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();
    res.status(200).json({
      message: "User updated successfully",
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
