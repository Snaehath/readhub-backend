// Helper to format a slim version of the story (No chapter content)
function formatStorySummary(story) {
  return {
    id: story._id,
    title: story.title,
    genre: story.genre,
    subject: story.subject,
    synopsis: story.synopsis,
    worldBuilding: story.worldBuilding,
    characters: story.characters,
    authorName: story.authorName,
    coverImage: story.coverImage
      ? `http://localhost:5000${story.coverImage}`
      : "https://via.placeholder.com/512x768?text=Generating+Art...",
    index: story._id.toString(),
    storyType: story.storyType || "novel",
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
    worldBuilding: story.worldBuilding,
    characters: story.characters,
    tableOfContents: story.tableOfContents,
    chapters: story.chapters,
    reviews: story.reviews,
  };
}

module.exports = {
  formatStorySummary,
  formatStoryResponse,
};
