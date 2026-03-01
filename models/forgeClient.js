const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Generate story cover using local Forge API (SD WebUI on port 7860)
async function generateStoryCover(prompt, storyId) {
  try {
    const URL = "http://127.0.0.1:7860/sdapi/v1/txt2img";

    const payload = {
      prompt: prompt,
      negative_prompt:
        "text, watermark, low quality, blurry, distorted, letters, words",
      steps: 25,
      cfg_scale: 7,
      width: 512,
      height: 768,
      sampler_name: "DPM++ 2M Karras",
    };

    console.log(`[FORGE] Generating cover for story: ${storyId}...`);
    const response = await axios.post(URL, payload, { timeout: 300000 });

    if (response.data && response.data.images && response.data.images[0]) {
      const base64Image = response.data.images[0];
      const buffer = Buffer.from(base64Image, "base64");

      // Save to public/covers directory
      const fileName = `cover_${storyId}.jpg`;
      const publicDir = path.join(__dirname, "..", "public", "covers");

      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      const filePath = path.join(publicDir, fileName);
      fs.writeFileSync(filePath, buffer);

      console.log(`[FORGE] Cover saved to: ${filePath}`);
      return `/covers/${fileName}`; // Relative URL for the frontend
    }

    console.error(
      "[FORGE] API Error: No image returned in response data",
      response.data,
    );
    throw new Error("Forge API did not return an image.");
  } catch (error) {
    console.error(
      "[FORGE] Detailed Error:",
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}

module.exports = { generateStoryCover };
