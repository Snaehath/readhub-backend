const express = require("express");
const router = express.Router();
const Story = require("../models/story");
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const PROMPTS = require("../helper/prompts");

/**
 * GET /allStories
 * Returns a list of all COMPLETED stories generated on the platform.
 */
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

// Track users currently in the process of initializing a story to prevent concurrent creation
const initializationLocks = new Set();

/**
 * GET /myStory
 * Fetches the user's current original story.
 * - If no story exists OR the current story is completed, it initializes a new one.
 * - If a story exists and matches the "new day" condition, it generates the next chapter.
 */
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
    // 1. Check if another request is already initializing for this user
    if (initializationLocks.has(userId)) {
      console.log(
        `Initialization already in progress for user: ${userId}. Waiting...`,
      );
      // Wait for a few seconds and try to find the story again (simple polling)
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s
        const existingStory = await Story.findOne({
          userId,
          isCompleted: false,
        });
        if (existingStory) {
          return res.status(200).json({
            message: "Story retrieved successfully",
            story: formatStoryResponse(existingStory),
          });
        }
        if (!initializationLocks.has(userId)) break; // Lock released
      }
    }

    // 2. Look for an active (non-completed) story for this user
    let story = await Story.findOne({
      userId,
      isCompleted: false,
    });

    // 3. Initialize Story if no active story exists
    if (!story) {
      // Acquire lock
      initializationLocks.add(userId);

      try {
        console.log(
          "No active story found. Initializing new story for user:",
          userId,
        );
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
          throw new Error("AI failed to generate valid story structure.");
        }

        story = new Story({
          userId,
          title: storyData.title,
          genre: storyData.genre,
          subject: storyData.subject,
          authorName: storyData.authorName,
          tableOfContents: storyData.tableOfContents,
          chapters: [],
        });

        // Generate first chapter immediately
        const chapterPrompt = PROMPTS.storyChapter(story, 0);
        const chapterContent = await chatWithGemini(chapterPrompt);

        story.chapters.push({
          chapterNumber: 1,
          title: story.tableOfContents[0].title,
          content: chapterContent,
          publishedAt: new Date(),
        });

        await story.save();
      } finally {
        // Release lock
        initializationLocks.delete(userId);
      }
    } else {
      // 4. Logic to generate next chapter if it's a new day
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const lastChapter = story.chapters[story.chapters.length - 1];
      const lastPublishedDate = lastChapter
        ? new Date(lastChapter.publishedAt)
        : null;
      if (lastPublishedDate) lastPublishedDate.setHours(0, 0, 0, 0);

      if (!lastPublishedDate || lastPublishedDate < today) {
        if (story.chapters.length < story.maxChapters) {
          const nextIndex = story.chapters.length;
          console.log(
            `Generating chapter ${nextIndex + 1} for story: ${story.title}`,
          );
          const chapterPrompt = PROMPTS.storyChapter(story, nextIndex);
          const chapterContent = await chatWithGemini(chapterPrompt);

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
        }
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
  };
}

/**
 * GET /:id
 * Returns the FULL details of a specific story by its ID (for the archive).
 * Positioned at the bottom to avoid shadowing specific routes like /myStory or /allStories.
 */
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
