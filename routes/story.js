const express = require("express");
const router = express.Router();
const Story = require("../models/story");
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const PROMPTS = require("../helper/prompts");

// Get all completed stories
router.get("/allStories", async (req, res) => {
  try {
    // Show all stories (completed and ongoing)
    const stories = await Story.find({}).sort({ createdAt: -1 });
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
// Get current active story or initialize a new global one
router.get("/myStory", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  // Note: We still require a token for context, but the story discovery is global
  if (!userData) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or missing token" });
  }

  const GLOBAL_LOCK_KEY = "GLOBAL_STORY_INIT";

  try {
    // 1. Check if the Initiator Agent is already building a story
    if (pendingInitializations.has(GLOBAL_LOCK_KEY)) {
      console.log(
        "AGENT 1 (Initiator) is conceptualizing a global story. Joining...",
      );
      const conceptualizedStory =
        await pendingInitializations.get(GLOBAL_LOCK_KEY);
      if (conceptualizedStory) {
        return res.status(200).json({
          message: "A new epic is being born... Joining existing session.",
          story: formatStoryResponse(conceptualizedStory),
          isInitializing: true,
        });
      }
    }

    // 2. Look for the current global active (non-completed) story
    let story = await Story.findOne({ isCompleted: false }).sort({
      createdAt: -1,
    });

    // 3. PHASE 1: The Initiator Agent
    if (!story) {
      const initProcess = (async () => {
        console.log("AGENT 1: Initializing a new global epic...");

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
          throw new Error(
            "AI failed to generate a valid global story concept.",
          );
        }

        const newStory = new Story({
          userId: userData.userId, // Storing the discoverer's ID for history
          title: storyData.title,
          genre: storyData.genre,
          subject: storyData.subject,
          authorName: storyData.authorName,
          tableOfContents: storyData.tableOfContents,
          chapters: [],
        });

        await newStory.save();
        return newStory;
      })();

      pendingInitializations.set(GLOBAL_LOCK_KEY, initProcess);

      try {
        story = await initProcess;
        return res.status(201).json({
          message: "New global story initialized!",
          story: formatStoryResponse(story),
          isInitializing: true,
        });
      } finally {
        pendingInitializations.delete(GLOBAL_LOCK_KEY);
      }
    }

    // 4. PHASE 2: The Writing Agent
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastChapter = story.chapters[story.chapters.length - 1];
    const lastPublishedDate = lastChapter
      ? new Date(lastChapter.publishedAt)
      : null;
    if (lastPublishedDate) lastPublishedDate.setHours(0, 0, 0, 0);

    // Global daily progression
    if (!lastPublishedDate || lastPublishedDate < today) {
      if (story.chapters.length < story.maxChapters) {
        console.log(`AGENT 2 (Writer): Advancing global story: ${story.title}`);

        const chapterPrompt = PROMPTS.storyChapter(
          story,
          story.chapters.length,
        );
        const chapterContent = await chatWithGemini(chapterPrompt);

        if (chapterContent && chapterContent.trim() !== "") {
          story.chapters.push({
            chapterNumber: story.chapters.length + 1,
            title: story.tableOfContents[story.chapters.length].title,
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
      message: "Current active story retrieved",
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

    // Allow any authenticated user to review the global story

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
