const express = require("express");
const router = express.Router();
const Story = require("../models/story");
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const PROMPTS = require("../helper/prompts");

// Get all completed stories
router.get("/allStories", async (req, res) => {
  try {
    // Only show stories that are complete
    const stories = await Story.find({ isCompleted: true }).sort({
      updatedAt: -1,
    });
    res.status(200).json({
      message: "All completed stories retrieved successfully",
      stories: stories.map((story) => ({
        id: story._id,
        title: story.title,
        genre: story.genre,
        subject: story.subject,
        authorName: story.authorName,
        isCompleted: story.isCompleted,
        currentChapterCount: story.chapters.length,
        rating: story.rating,
        index: story._id.toString(),
      })),
    });
  } catch (err) {
    console.error("Error fetching all stories:", err);
    res
      .status(500)
      .json({ error: "Internal server error while fetching stories." });
  }
});

// Track pending initializations to prevent concurrent creation and "join" existing requests
const pendingInitializations = new Map();

// Get or initialize user's current story
router.get("/myStory", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or missing token" });
  }

  const userId = userData.userId;

  try {
    // 1. Check if a story is already being initialized for this user
    if (pendingInitializations.has(userId)) {
      console.log(
        `AGENT 1 (Initiator) is conceptualizing for user: ${userId}. Waiting...`,
      );
      const conceptualizedStory = await pendingInitializations.get(userId);
      if (conceptualizedStory) {
        return res.status(200).json({
          message:
            "Story conceptualized successfully. Your journey is beginning...",
          story: formatStoryResponse(conceptualizedStory),
          isInitializing: true,
        });
      }
    }

    // 2. Look for an active (non-completed) story for this user
    let story = await Story.findOne({
      userId,
      isCompleted: false,
    });

    // 3. PHASE 1: The Initiator Agent
    // Responsible ONLY for conceptualizing the story title, genre, subject, and table of contents.
    if (!story) {
      const initProcess = (async () => {
        console.log("AGENT 1: Conceptualizing a new epic for user:", userId);

        const initPrompt = PROMPTS.storyInit();
        const initResponse = await chatWithGemini(initPrompt);

        let cleanJson = initResponse;
        const jsonStart = initResponse.indexOf("{");
        const jsonEnd = initResponse.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanJson = initResponse.substring(jsonStart, jsonEnd + 1);
        }

        let storyData;
        try {
          storyData = JSON.parse(cleanJson);
        } catch (parseErr) {
          throw new Error("AI failed to generate a valid story concept.");
        }

        const newStory = new Story({
          userId,
          title: storyData.title,
          genre: storyData.genre,
          subject: storyData.subject,
          authorName: storyData.authorName,
          tableOfContents: storyData.tableOfContents,
          chapters: [], // Start with an empty shell
        });

        await newStory.save();
        console.log(
          "AGENT 1: Story conceptualized successfully:",
          newStory.title,
        );
        return newStory;
      })();

      pendingInitializations.set(userId, initProcess);

      try {
        story = await initProcess;
        // REDUCING STRAIN: We return the shell immediately after Phase 1.
        // Agent 2 (The Writer) will take over on the very next request.
        return res.status(201).json({
          message:
            "Story conceptualized! Taking a moment to prepare the first chapter...",
          story: formatStoryResponse(story),
          isInitializing: true,
        });
      } finally {
        pendingInitializations.delete(userId);
      }
    }

    // 4. PHASE 2: The Writing Agent
    // Responsible for writing the actual chapters, one day at a time.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastChapter = story.chapters[story.chapters.length - 1];
    const lastPublishedDate = lastChapter
      ? new Date(lastChapter.publishedAt)
      : null;
    if (lastPublishedDate) lastPublishedDate.setHours(0, 0, 0, 0);

    // If no chapters yet (brand new shell) OR if it's a new day
    if (!lastPublishedDate || lastPublishedDate < today) {
      if (story.chapters.length < story.maxChapters) {
        const nextIndex = story.chapters.length;
        console.log(
          `AGENT 2 (Writer): Writing Chapter ${nextIndex + 1} for: ${story.title}`,
        );

        const chapterPrompt = PROMPTS.storyChapter(story, nextIndex);
        const chapterContent = await chatWithGemini(chapterPrompt);

        if (!chapterContent || chapterContent.trim() === "") {
          throw new Error("Writer Agent failed to produce content.");
        }

        story.chapters.push({
          chapterNumber: nextIndex + 1,
          title: story.tableOfContents[nextIndex].title,
          content: chapterContent,
          publishedAt: new Date(),
        });

        if (story.chapters.length === story.maxChapters) {
          story.isCompleted = true;
        }
        await story.save();
        console.log(`AGENT 2: Chapter ${nextIndex + 1} published.`);
      }
    }

    res.status(200).json({
      message: "Story retrieved successfully",
      story: formatStoryResponse(story),
    });
  } catch (err) {
    console.error("Story Route Error:", err);
    res
      .status(500)
      .json({ error: "Internal server error while retrieving your story." });
  }
});

// Helper to format the story response consistently
function formatStoryResponse(story) {
  return {
    id: story._id,
    title: story.title,
    genre: story.genre,
    subject: story.subject,
    authorName: story.authorName,
    index: story._id.toString(),
    tableOfContents: story.tableOfContents,
    chapters: story.chapters,
    isCompleted: story.isCompleted,
    currentChapterCount: story.chapters.length,
    maxChapters: story.maxChapters,
    rating: story.rating,
    review: story.review,
  };
}

// Update story rating and review
router.patch("/:id/review", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  if (!userData) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or missing token" });
  }

  const { rating, review } = req.body;

  if (
    rating !== undefined &&
    (typeof rating !== "number" || rating < 1 || rating > 5)
  ) {
    return res
      .status(400)
      .json({ error: "Rating must be a number between 1 and 5." });
  }

  try {
    const story = await Story.findById(req.params.id);

    if (!story) {
      return res.status(404).json({ error: "Story not found." });
    }

    // Ensure the user owns the story
    if (story.userId.toString() !== userData.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized: You can only review your own stories." });
    }

    if (rating !== undefined) story.rating = rating;
    if (review !== undefined) story.review = review;

    await story.save();

    res.status(200).json({
      message: "Feedback submitted successfully",
      story: formatStoryResponse(story),
    });
  } catch (err) {
    console.error("Error updating story review:", err);
    res
      .status(500)
      .json({ error: "Internal server error while updating your review." });
  }
});

// Get story details by ID
router.get("/:id", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }
    res.status(200).json({
      message: "Story retrieved successfully",
      story: formatStoryResponse(story),
    });
  } catch (err) {
    console.error("Error fetching story by ID:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
