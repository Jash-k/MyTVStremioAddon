import express from "express";
import cors from "cors";
import { loadChannels } from "./m3u.js";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

let CHANNELS = [];

/* =========================
   LOAD PLAYLIST ON START
========================= */
async function init() {
  CHANNELS = await loadChannels();
  console.log("Loaded channels:", CHANNELS.length);
}
init();

/* =========================
   MANIFEST
========================= */
app.get("/manifest.json", (req, res) => {
  res.json({
    id: "org.mytv.tamil",
    version: "1.0.0",
    name: "MyTV Tamil",
    description: "FREE LIV TV Tamil Channels",
    resources: ["catalog", "streams"],
    types: ["tv"],
    catalogs: [
      {
        type: "tv",
        id: "tamil",
        name: "Tamil TV"
      }
    ]
  });
});

/* =========================
   CATALOG
========================= */
app.get("/catalog/tv/tamil.json", (req, res) => {
  const metas = CHANNELS.map(ch => ({
    id: "tamil:" + Buffer.from(ch.url).toString("base64"),
    type: "tv",
    name: ch.name,
    poster: ch.poster
  }));

  res.json({ metas });
});

/* =========================
   STREAMS (MOST IMPORTANT)
========================= */
app.get("/streams/:type/:id.json", (req, res) => {
  try {
    const { id } = req.params;

    if (!id.startsWith("tamil:")) {
      return res.json({ streams: [] });
    }

    const base64 = id.replace("tamil:", "");
    const streamUrl = Buffer.from(base64, "base64").toString("utf8");

    if (!streamUrl.startsWith("http")) {
      return res.json({ streams: [] });
    }

    res.json({
      streams: [
        {
          name: "FREE LIV TV",
          title: "Live",
          url: streamUrl,
          behaviorHints: {
            notWebReady: true,
            isLive: true,
            bingeGroup: "live",
            hls: streamUrl.includes(".m3u8"),
            proxyHeaders: {
              "User-Agent": "Mozilla/5.0",
              "Referer": "https://google.com"
            }
          }
        }
      ]
    });
  } catch (e) {
    res.json({ streams: [] });
  }
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("MyTVStremioAddon is running");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
