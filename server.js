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
  res.header("Access-Control-Allow-Credentials", "true");
  
  // Handle OPTIONS preflight
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
        name: "Tamil Live TV",
        extra: [
          { name: "skip", isRequired: false }
        ]
      }
    ],
    resources: ["catalog", "stream"],
    idPrefixes: ["tamil:"],
    behaviorHints: {
      adult: false,
      p2p: false,
      configurable: false,
      configurationRequired: false
    }
  });
});

// ===========================
// CATALOG (Optimized with pagination)
// ===========================
app.get("/catalog/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  const skip = parseInt(req.query.skip) || 0;
  const limit = 100; // Limit per page for TV

  if (type !== "tv" || id !== "tamil") {
    return res.json({ metas: [] });
  }

  try {
    const channels = await getCachedChannels();
    
    // Paginate for TV performance
    const paginatedChannels = channels.slice(skip, skip + limit);

    const metas = paginatedChannels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      posterShape: "square",
      description: `${ch.category || "Live TV"}`,
      genres: [ch.category || "Entertainment"]
    }));

    res.json({ 
      metas,
      // Tell Stremio there are more items
      hasMore: skip + limit < channels.length
    });

  } catch (error) {
    console.error("❌ Catalog error:", error);
    res.json({ metas: [] });
  }
});

// ===========================
// STREAM (Simplified for TV)
// ===========================
app.get("/stream/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;

  if (type !== "tv" || !id.startsWith("tamil:")) {
    return res.json({ streams: [] });
  }

  try {
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    // Simple direct stream for TV - no fancy processing
    const streams = [
      {
        name: "Stream 1",
        title: "Direct",
        url: streamUrl,
        behaviorHints: {
          notWebReady: true,  // Important for TV
          bingeGroup: "tamil-live-tv",
          isLive: true
        }
      }
    ];

    // Add proxy stream as backup
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                   `${req.protocol}://${req.get('host')}`;
    
    streams.push({
      name: "Stream 2",
      title: "Proxy",
      url: `${baseUrl}/proxy/${id.replace("tamil:", "")}`,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: "tamil-live-tv",
        isLive: true
      }
    });

    // Quick response for TV
    res.json({ streams });

  } catch (error) {
    console.error("❌ Stream error:", error);
    res.json({ streams: [] });
  }
});

// ===========================
// STREAM PROXY (Optimized)
// ===========================
app.get("/proxy/:id", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    // Set timeout for response
    res.setTimeout(15000, () => {
      console.log("⏱️ Request timeout");
      res.status(504).send("Timeout");
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(streamUrl, {
      headers: {
        "User-Agent": "ExoPlayerLib/2.11.8 (Linux; Android 11) TV",
        "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Referer": "https://freelivtvstrshare.vvishwas042.workers.dev/"
      },
      signal: controller.signal,
      compress: true
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Stream returned ${response.status}`);
    }

    // Set headers for TV compatibility
    res.set({
      "Content-Type": response.headers.get("content-type") || "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    });

    // Pipe the stream
    response.body.pipe(res);

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error("❌ Proxy timeout");
      res.status(504).send("Stream timeout");
    } else {
      console.error("❌ Proxy error:", error.message);
      res.status(503).send("Stream unavailable");
    }
  }
});

// ===========================
// Direct M3U8 Handler (New)
// ===========================
app.get("/direct/:id.m3u8", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    const response = await fetch(streamUrl, {
      headers: {
        "User-Agent": "Samsung Smart TV",
        "Accept": "*/*"
      }
    });

    const content = await response.text();
    
    res.set({
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    });

    res.send(content);

  } catch (error) {
    console.error("Direct error:", error);
    res.status(503).send("#EXTM3U\n#EXT-X-ERROR:Stream unavailable\n");
  }
});

// ===========================
// TEST ENDPOINT
// ===========================
app.get("/test/:id", async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.id);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(streamUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Samsung TV"
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    res.json({
      url: streamUrl,
      status: response.status,
      contentType: response.headers.get("content-type"),
      ok: response.ok
    });

  } catch (error) {
    res.json({
      error: error.message,
      timeout: error.name === 'AbortError'
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
      <title>FREE LIV TV Addon</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; }
        .status { color: #27ae60; font-size: 24px; }
        .url-box {
          background: #ecf0f1;
          padding: 10px;
          border-radius: 5px;
          word-break: break-all;
          margin: 10px 0;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          background: #3498db;
          color: white;
          border-radius: 3px;
          font-size: 12px;
          margin: 2px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📺 FREE LIV TV</h1>
        <p class="status">✅ Running</p>
        
        <h3>Install URL:</h3>
        <div class="url-box">
          ${req.protocol}://${req.get('host')}/manifest.json
        </div>
        
        <h3>Optimized for:</h3>
        <span class="badge">Samsung TV</span>
        <span class="badge">Android TV</span>
        <span class="badge">Desktop</span>
        
        <h3>Features:</h3>
        <ul>
          <li>180+ Tamil Channels</li>
          <li>Live Streaming</li>
          <li>Low Latency</li>
          <li>TV Optimized</li>
        </ul>
      </div>
    </body>
    </html>
  `);
});

// ===========================
// ERROR HANDLER
// ===========================
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ===========================
// START SERVER
// ===========================
const server = app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log("📺 FREE LIV TV - Samsung TV Optimized");
  console.log("=".repeat(50));
  console.log(`✅ Running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`📱 http://localhost:${PORT}/manifest.json`);
  console.log("=".repeat(50) + "\n");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});