const express = require("express");
const router = express.Router();
const Story = require("../models/story");
const { chatWithGemini } = require("../models/geminiClient");
const { verifyToken } = require("../helper/authJwt");
const PROMPTS = require("../helper/prompts");

/**
 * GET /myStory
 * Fetches the user's current original story.
 * If no story exists, it initializes one and generates the first chapter.
 * If a story exists, it checks if it's a new day to generate the next chapter (up to 9 chapters).
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

  try {
    let story = await Story.findOne({ userId: userData.userId });

    // 1. Initialize Story if it doesn't exist
    if (!story) {
      console.log("Initializing new story for user:", userData.userId);
      const initPrompt = PROMPTS.storyInit();
      const initResponse = await chatWithGemini(initPrompt);

      // Clean up JSON response from Gemini
      const cleanJson = initResponse.replace(/```json|```/g, "").trim();
      let storyData;
      try {
        storyData = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.error("Failed to parse story init JSON:", cleanJson);
        throw new Error("AI failed to generate valid story structure.");
      }

      story = new Story({
        userId: userData.userId,
        title: storyData.title,
        genre: storyData.genre,
        subject: storyData.subject,
        authorName: storyData.authorName,
        tableOfContents: storyData.tableOfContents,
        chapters: [],
      });
      // We don't save yet, we'll add the first chapter below
    }

    // 2. Check if we need to generate a new chapter (Daily Progression)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastChapter = story.chapters[story.chapters.length - 1];
    const lastPublishedDate = lastChapter
      ? new Date(lastChapter.publishedAt)
      : null;
    if (lastPublishedDate) lastPublishedDate.setHours(0, 0, 0, 0);

    // If no chapters yet, or if the last chapter was published before today
    if (!lastPublishedDate || lastPublishedDate < today) {
      if (story.chapters.length < story.maxChapters) {
        const nextChapterIndex = story.chapters.length;
        console.log(
          `Generating chapter ${nextChapterIndex + 1} for story: ${story.title}`,
        );

        const chapterPrompt = PROMPTS.storyChapter(story, nextChapterIndex);
        const chapterContent = await chatWithGemini(chapterPrompt);

        story.chapters.push({
          chapterNumber: nextChapterIndex + 1,
          title: story.tableOfContents[nextChapterIndex].title,
          content: chapterContent,
          publishedAt: new Date(),
        });

        if (story.chapters.length === story.maxChapters) {
          story.isCompleted = true;
        }

        await story.save();
      }
    }

    res.status(200).json({
      message: "Story retrieved successfully",
      story: {
        id: story._id,
        title: story.title,
        genre: story.genre,
        subject: story.subject,
        authorName: story.authorName,
        index: "Story Index & Introduction", // Meeting "starting contains index" req
        tableOfContents: story.tableOfContents,
        chapters: story.chapters,
        isCompleted: story.isCompleted,
        currentChapterCount: story.chapters.length,
        maxChapters: story.maxChapters,
      },
    });
  } catch (err) {
    console.error("Story Route Error:", err);
    res
      .status(500)
      .json({ error: "Internal server error while generating your story." });
  }
});

module.exports = router;
