const httpClient = require("./httpClient");
const cheerio = require("cheerio");
const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const ipaddr = require("ipaddr.js");

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function isPublicAddress(address) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      parsed = parsed.toIPv4Address();
    }
    return parsed.range() === "unicast";
  } catch (_error) {
    return false;
  }
}

async function resolvePublicAddresses(hostname) {
  const unwrappedHost = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(unwrappedHost)) {
    if (!isPublicAddress(unwrappedHost)) throw new Error("Non-public address");
    const parsed = ipaddr.parse(unwrappedHost);
    return [{ address: unwrappedHost, family: parsed.kind() === "ipv4" ? 4 : 6 }];
  }

  if (/\.(localhost|local|internal|test|invalid)$/i.test(unwrappedHost)) {
    throw new Error("Local hostnames are not allowed");
  }

  const addresses = await dns.lookup(unwrappedHost, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Host resolves to a non-public address");
  }
  return addresses;
}

function createPinnedLookup(addresses) {
  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    const candidates = options?.family
      ? addresses.filter((entry) => entry.family === options.family)
      : addresses;
    if (candidates.length === 0) return callback(new Error("No validated address for host"));
    if (options?.all) {
      return callback(null, candidates.map((entry) => ({ ...entry })));
    }
    return callback(null, candidates[0].address, candidates[0].family);
  };
}

async function createRequestOptions(url) {
  if (typeof url !== "string" || url.length > 2048) {
    throw new Error("Invalid URL");
  }
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error("Only credential-free HTTP(S) URLs are allowed");
  }
  const standardPort = parsedUrl.protocol === "https:" ? "443" : "80";
  if (parsedUrl.port && parsedUrl.port !== standardPort) {
    throw new Error("Non-standard ports are not allowed");
  }

  const addresses = await resolvePublicAddresses(parsedUrl.hostname);
  const lookup = createPinnedLookup(addresses);
  return {
    url: parsedUrl,
    httpAgent: new http.Agent({ lookup }),
    httpsAgent: new https.Agent({ lookup }),
  };
}

// Scrape full-text content from a URL
async function scrapeUrl(url) {
  let hostname = "unknown";
  try {
    const request = await createRequestOptions(url);
    hostname = request.url.hostname;
    const response = await httpClient.get(request.url.href, {
      httpAgent: request.httpAgent,
      httpsAgent: request.httpsAgent,
      proxy: false,
      maxRedirects: 0,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      responseType: "text",
      timeout: 12000,
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
    console.error(`Cannot scrape host ${hostname} (${code}).`);
    return `[Content unavailable for ${hostname} - Error: ${code}]`;
  }
}

// Scrape multiple URLs in parallel
async function batchScrape(urls) {
  const safeUrls = Array.isArray(urls) ? [...new Set(urls)].slice(0, 5) : [];
  console.log(`Investigating ${safeUrls.length} sources...`);
  const results = await Promise.all(safeUrls.map(url => scrapeUrl(url)));
  return results.map((content, index) =>
    `Source ${index + 1}\nURL: ${safeUrls[index]}\nContent: ${content}`,
  ).join("\n\n---\n\n");
}

module.exports = { scrapeUrl, batchScrape };
