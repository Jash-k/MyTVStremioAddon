import express from "express";
import fetch from "node-fetch";
import { loadChannels } from "./m3u.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for channels
let channelsCache = null;
let cacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

// ===========================
// CORS Middleware
// ===========================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  
  next();
});

// ===========================
// Helper Functions
// ===========================
function encodeId(url) {
  return Buffer.from(url)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeId(id) {
  let b64 = id.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64").toString("utf8");
}

// Get cached channels
async function getCachedChannels() {
  const now = Date.now();
  if (!channelsCache || (now - cacheTime) > CACHE_DURATION) {
    channelsCache = await loadChannels();
    cacheTime = now;
  }
  return channelsCache;
}

// ===========================
// MANIFEST
// ===========================
app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.freelivtv.tamil",
    version: "1.0.0",
    name: "FREE LIV TV",
    description: "Tamil Live TV - 180+ Channels",
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "tamil",
        name: "Tamil Live TV"
      }
    ],
    resources: ["catalog", "stream"],
    idPrefixes: ["tamil:"],
    behaviorHints: {
      adult: false,
      p2p: false
    }
  });
});

// ===========================
// CATALOG
// ===========================
app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (type !== "tv" || id !== "tamil") {
    return res.json({ metas: [] });
  }

  try {
    const channels = await getCachedChannels();

    const metas = channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      posterShape: "square"
    }));

    res.json({ metas });

  } catch (error) {
    console.error("❌ Catalog error:", error);
    res.json({ metas: [] });
  }
});

// ===========================
// STREAM - FIXED FOR SAMSUNG TV
// ===========================
app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (type !== "tv" || !id.startsWith("tamil:")) {
    return res.json({ streams: [] });
  }

  try {
    const encodedId = id.replace("tamil:", "");
    const streamUrl = decodeId(encodedId);
    
    console.log(`📺 Stream requested: ${streamUrl.substring(0, 50)}...`);
    
    // Get base URL for proxy
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                   `${req.protocol}://${req.get('host')}`;
    
    // IMPORTANT: Samsung TV needs the stream URL in a specific format
    const streams = [
      {
        // Use proxy URL that returns actual m3u8 content
        url: `${baseUrl}/live/${encodedId}.m3u8`,
        title: "Watch Now",
        behaviorHints: {
          notWebReady: true
        }
      }
    ];

    console.log(`✅ Returning stream: ${streams[0].url}`);
    res.json({ streams });

  } catch (error) {
    console.error("❌ Stream error:", error);
    res.json({ streams: [] });
  }
});

// ===========================
// LIVE STREAM PROXY - CRITICAL FOR SAMSUNG TV
// ===========================
app.get("/live/:id.m3u8", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id.replace('.m3u8', ''));
    
    console.log(`🔄 Proxying: ${streamUrl.substring(0, 50)}...`);

    // Fetch the actual stream
    const response = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36",
        "Accept": "*/*",
        "Referer": "https://freelivtvstrshare.vvishwas042.workers.dev/",
        "Origin": "https://freelivtvstrshare.vvishwas042.workers.dev"
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Stream returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    const content = await response.text();

    // If it's an m3u8 playlist, we need to fix relative URLs
    if (content.includes("#EXTM3U") || content.includes("#EXT")) {
      const baseStreamUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
      
      // Fix relative URLs in the playlist
      const fixedContent = content.split('\n').map(line => {
        if (line.startsWith('http')) {
          return line; // Already absolute
        } else if (line && !line.startsWith('#') && line.trim()) {
          // Relative URL, make it absolute
          return new URL(line, baseStreamUrl).href;
        }
        return line;
      }).join('\n');

      res.set({
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      });

      res.send(fixedContent);
    } else {
      // Not m3u8, send as is
      res.set({
        "Content-Type": contentType || "application/octet-stream",
        "Access-Control-Allow-Origin": "*"
      });
      
      res.send(content);
    }

  } catch (error) {
    console.error("❌ Live proxy error:", error.message);
    
    // Return a valid but empty m3u8
    res.set({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*"
    });
    
    res.send("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST");
  }
});

// ===========================
// TEST ENDPOINT
// ===========================
app.get("/test/:id", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    const response = await fetch(streamUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Samsung TV"
      },
      timeout: 3000
    });

    res.json({
      url: streamUrl,
      status: response.status,
      contentType: response.headers.get("content-type"),
      ok: response.ok
    });

  } catch (error) {
    res.json({
      error: error.message
    });
  }
});

// ===========================
// HEALTH CHECK
// ===========================
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>FREE LIV TV</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
        }
        .status { color: green; font-size: 24px; }
        code {
          background: #f0f0f0;
          padding: 10px;
          display: block;
          margin: 10px 0;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <h1>FREE LIV TV Addon</h1>
      <p class="status">✅ Running</p>
      <h3>Install URL:</h3>
      <code>${req.protocol}://${req.get('host')}/manifest.json</code>
      <p>180+ Tamil Channels</p>
    </body>
    </html>
  `);
});

// ===========================
// START SERVER
// ===========================
const server = app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log("📺 FREE LIV TV - Samsung TV Fixed");
  console.log("=".repeat(50));
  console.log(`✅ Running on port ${PORT}`);
  console.log(`📱 http://localhost:${PORT}/manifest.json`);
  console.log("=".repeat(50) + "\n");
});

// Error handlers
process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});