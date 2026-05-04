const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const $ = cheerio.load(response.data);

    // Remove noise (scripts, ads, nav, footer)
    $("script, style, nav, footer, header, ads, iframe, .ads, .sidebar").remove();

    // Heuristic: Targeted common news containers
    const content = $("article, .article-body, .article-content, .post-content, #article-body, main")
      .first()
      .text()
      .trim() || $("body").text().trim();

    // Clean up excessive whitespace
    return content.replace(/\s+/g, " ").substring(0, 15000); // Limit to 15k chars for token safety

  } catch (error) {
    console.error(`Scraper Error [${url}]:`, error.message);
    return `[Content unavailable for ${url} - Error: ${error.message}]`;
  }
}

/**
 * BATCH SCRAPER
 */
async function batchScrape(urls) {
  console.log(`📡 Agentic Scraper: Investigating ${urls.length} URLs...`);
  const results = await Promise.all(urls.map(url => scrapeUrl(url)));
  return results.join("\n\n---\n\n");
}

module.exports = { scrapeUrl, batchScrape };
