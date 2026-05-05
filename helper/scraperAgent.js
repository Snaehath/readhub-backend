const axios = require("axios");
const cheerio = require("cheerio");

// Scrape full-text content from a URL
async function scrapeUrl(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, footer, header, ads, iframe, .ads, .sidebar").remove();

    const content = $("article, .article-body, .article-content, .post-content, #article-body, main")
      .first()
      .text()
      .trim() || $("body").text().trim();

    return content.replace(/\s+/g, " ").substring(0, 15000);

  } catch (error) {
    const code = error.response?.status || error.code || "Unknown";
    console.error(`❌ Cannot scrape [${url}] - [${code}] - ${error.message.substring(0, 50)}`);
    return `[Content unavailable for ${url} - Error: ${code}]`;
  }
}

// Scrape multiple URLs in parallel
async function batchScrape(urls) {
  console.log(`📡 Investigating ${urls.length} sources...`);
  const results = await Promise.all(urls.map(url => scrapeUrl(url)));
  return results.join("\n\n---\n\n");
}

module.exports = { scrapeUrl, batchScrape };
