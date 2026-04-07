const express = require("express");
const router = express.Router();
const axios = require("axios");
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const Story = require("../models/story");
const PROMPTS = require("../helper/prompts");
const { formatStorySummary, formatStoryResponse } = require("../helper/utils");

// Get all stories
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

// Trigger global story progression or initialization
router.post("/myStory", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const userData = verifyToken(token);

  // Note: We still require a token for context, but the story discovery is global
  if (!userData) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or missing token" });
  }

  const { storyId } = req.body;

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

    // 2. Look for the requested story OR the current global active (non-completed) story
    let story;
    if (storyId) {
      story = await Story.findById(storyId);
    } else {
      story = await Story.findOne({ isCompleted: false }).sort({
        createdAt: -1,
      });
    }

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
          userId: userData.userId,
          title: storyData.title,
          genre: storyData.genre,
          subject: storyData.subject,
          synopsis: storyData.synopsis,
          authorName: storyData.authorName,
          worldBuilding: storyData.worldBuilding,
          characters: storyData.characters,
          tableOfContents: storyData.tableOfContents,
          chapters: [],
          coverImage: "/covers/cover_" + newStory._id + ".jpg",
        });

        await newStory.save();

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
        const expectedTitle =
          story.tableOfContents && story.tableOfContents[nextIndex]
            ? story.tableOfContents[nextIndex].title
            : `Chapter ${nextIndex + 1}`;

        // Build context from previous chapters (last 2 for continuity)
        const recentChapters = story.chapters.slice(-2);
        const context = recentChapters
          .map((c, idx) => {
            const isLast = idx === recentChapters.length - 1;
            // Focus on the ending of the previous chapter so the agent knows where to pick up
            const limit = isLast ? 3000 : 1000;
            const snippet =
              c.content.length > limit
                ? `...${c.content.slice(-limit)}`
                : c.content;
            return `[PREVIOUS CHAPTER ${c.chapterNumber}: ${c.title} (Ending)]\n${snippet}`;
          })
          .join("\n\n---\n\n");

        console.log(
          `--- [THE SCRIBE START] --- Chapter ${nextIndex + 1}: ${expectedTitle}`,
        );
        const chapterPrompt = PROMPTS.storyChapter(story, nextIndex, context);
        const chapterResponse = await chatWithGemini(chapterPrompt);
        console.log(
          `--- [THE SCRIBE FINISH] --- Chapter ${nextIndex + 1} complete.`,
        );

        if (chapterResponse && chapterResponse.trim() !== "") {
          let title = expectedTitle;
          let content = chapterResponse;

          // Attempt to parse JSON response
          try {
            let cleanJson = chapterResponse;
            const jsonStart = chapterResponse.indexOf("{");
            const jsonEnd = chapterResponse.lastIndexOf("}");
            if (jsonStart !== -1 && jsonEnd !== -1) {
              cleanJson = chapterResponse.substring(jsonStart, jsonEnd + 1);
            }
            const parsed = JSON.parse(cleanJson);
            if (parsed.content) {
              content = parsed.content;
              if (parsed.title) title = parsed.title;
            }
          } catch (e) {
            console.log(
              "[WRITER] JSON parse failed, falling back to legacy text cleaning...",
            );
            // Legacy cleaning for transition period
            content = chapterResponse
              .replace(/^TITLE:.*$/m, "")
              .replace(/^CONTENT:/m, "")
              .trim();
          }

          story.chapters.push({
            chapterNumber: nextIndex + 1,
            title: title,
            content: content,
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

  const { rating, review, reviewerName } = req.body; // Use reviewerName from body

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

    // Add the new review to the embedded array
    story.reviews.push({
      userId: userData.userId,
      reviewerName: reviewerName || userData.username || "Anonymous",
      rating: rating,
      review: review,
      createdAt: new Date(),
    });

    // Update the story's aggregate rating and review count
    story.reviewCount += 1;
    story.ratingSum += rating;
    await story.save();

    res.status(200).json({
      message: "Feedback submitted successfully",
      story: formatStoryResponse(story),
      review: story.reviews[story.reviews.length - 1],
    });
  } catch (err) {
    console.error("Error updating story review:", err);
    res
      .status(500)
      .json({ error: "Internal server error while updating your review." });
  }
});

// Get individual reviews for a story
router.get("/:id/reviews", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ error: "Story not found." });
    }

    res.status(200).json({
      message: "Reviews retrieved successfully",
      reviews: story.reviews || [],
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: "Internal server error while fetching reviews." });
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
