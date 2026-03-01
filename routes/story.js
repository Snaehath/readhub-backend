const express = require("express");
const router = express.Router();
const Story = require("../models/story");
const { askAI } = require("../models/aiService");
const { generateStoryCover } = require("../models/forgeClient");
const { verifyToken } = require("../helper/authJwt");
const PROMPTS = require("../helper/prompts");

// Get all completed stories
router.get("/allStories", async (req, res) => {
  try {
    // Show all stories (completed and ongoing)
    const stories = await Story.find({}).sort({ createdAt: -1 });
    res.status(200).json({
      message: "All stories retrieved successfully",
      stories: stories.map((story) => formatStorySummary(story)),
    });
  } catch (err) {
    console.error("Error fetching all stories:", err);
    res
      .status(500)
      .json({ error: "Internal server error while fetching stories." });
  }
});

// Track pending initializations to prevent concurrent creation
const pendingInitializations = new Map();

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
          story: formatStorySummary(conceptualizedStory),
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
        const initResponse = await askAI(initPrompt);

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
          coverImage: "", // Temp
        });

        await newStory.save();

        // PHASE 1.5: The Artist Agent (Generate Cover)
        try {
          const imagePrompt = PROMPTS.storyCoverPrompt(newStory);
          const visualIdea = await askAI(imagePrompt);
          const coverPath = await generateStoryCover(visualIdea, newStory._id);
          if (coverPath) {
            newStory.coverImage = coverPath;
            await newStory.save();
          }
        } catch (imgErr) {
          console.error("Warning: Cover generation failed.", imgErr);
        }

        return newStory;
      })();

      pendingInitializations.set(GLOBAL_LOCK_KEY, initProcess);

      try {
        story = await initProcess;
        return res.status(201).json({
          message: "New global story initialized!",
          story: formatStorySummary(story),
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

    // Global daily progression (Admin bypass allowed)
    const isAdminForce =
      req.query.force === "true" && userData.role === "admin";

    if (!lastPublishedDate || lastPublishedDate < today || isAdminForce) {
      if (story.chapters.length < story.maxChapters) {
        if (isAdminForce) {
          console.log(
            `AGENT 2: Admin ${userData.email} forced progress on story: ${story.title}`,
          );
        } else {
          console.log(
            `AGENT 2 (Writer): Advancing global story: ${story.title}`,
          );
        }

        const nextIndex = story.chapters.length;
        const chapterPrompt = PROMPTS.storyChapter(story, nextIndex);
        console.log(
          `--- [AI WRITING START] --- Chapter ${nextIndex + 1}: ${story.tableOfContents[nextIndex].title}`,
        );
        const chapterContent = await askAI(chapterPrompt);
        console.log(
          `--- [AI WRITING FINISH] --- Chapter ${nextIndex + 1} complete.`,
        );

        if (chapterContent && chapterContent.trim() !== "") {
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
      message: "Current active story retrieved",
      story: formatStorySummary(story),
    });
  } catch (err) {
    console.error("Story Route Error:", err);
    res
      .status(500)
      .json({ error: "Internal server error while retrieving your story." });
  }
});

// Helper to format a slim version of the story (No chapter content)
function formatStorySummary(story) {
  return {
    id: story._id,
    title: story.title,
    genre: story.genre,
    subject: story.subject,
    authorName: story.authorName,
    coverImage: story.coverImage
      ? `http://localhost:5000${story.coverImage}`
      : "https://via.placeholder.com/512x768?text=Generating+Art...",
    index: story._id.toString(),
    isCompleted: story.isCompleted,
    currentChapterCount: story.chapters.length,
    maxChapters: story.maxChapters,
    averageRating: story.averageRating,
    reviewCount: story.reviews.length,
  };
}

// Helper to format the story response with FULL content
function formatStoryResponse(story) {
  return {
    ...formatStorySummary(story),
    tableOfContents: story.tableOfContents,
    chapters: story.chapters,
    reviews: story.reviews,
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

    // Add the new review to the array
    story.reviews.push({
      userId: userData.userId,
      rating: rating,
      review: review,
      createdAt: new Date(),
    });

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

// Manually regenerate cover image for a story (Admin or Owner)
router.post("/:id/regenerate-cover", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: "Story not found" });

    console.log(`[MANUAL] Regenerating cover for story: ${story.title}`);

    // PHASE 1: Generate Art Prompt
    const imagePrompt = PROMPTS.storyCoverPrompt(story);
    const visualIdea = await askAI(imagePrompt);

    // PHASE 2: Generate and Save Image
    const coverPath = await generateStoryCover(visualIdea, story._id);

    if (coverPath) {
      story.coverImage = coverPath;
      await story.save();
      return res.status(200).json({
        message: "Cover regenerated successfully",
        coverImage: `http://localhost:5000${coverPath}`,
      });
    }

    res.status(500).json({ error: "Failed to generate cover image" });
  } catch (err) {
    console.error("Manual Cover Gen Error:", err);
    res.status(500).json({ error: "Internal server error" });
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
