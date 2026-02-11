const { addonBuilder } = require('stremio-addon-sdk');
const { loadChannels } = require('./m3u');

// Helper functions
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

// Manifest
const manifest = {
  id: "org.freelivtv.tamil",
  version: "1.0.0",
  name: "FREE LIV TV",
  description: "Tamil Live TV - 200+ Channels",
  types: ["tv"],
  catalogs: [
    {
      type: "tv",
      id: "tamil-all",
      name: "All Channels"
    },
    {
      type: "tv",
      id: "tamil-cricket",
      name: "Cricket"
    },
    {
      type: "tv",
      id: "tamil-movies",
      name: "Movies"
    },
    {
      type: "tv",
      id: "tamil-news",
      name: "News"
    }
  ],
  resources: ["catalog", "stream"],
  idPrefixes: ["tamil:"],
  behaviorHints: {
    adult: false,
    p2p: false
  }
};

const builder = new addonBuilder(manifest);

// Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[CATALOG] Request: type=${type}, id=${id}`);
  
  if (type !== "tv") {
    return { metas: [] };
  }

  try {
    const allChannels = await loadChannels();
    let channels = allChannels;

    // Filter by catalog
    if (id === "tamil-cricket") {
      channels = allChannels.filter(ch => ch.category === "Cricket");
    } else if (id === "tamil-movies") {
      channels = allChannels.filter(ch => ch.category === "Movies");
    } else if (id === "tamil-news") {
      channels = allChannels.filter(ch => ch.category === "News");
    }
    // "tamil-all" shows everything

    const metas = channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name
    }));

    console.log(`[CATALOG] Returning ${metas.length} items for ${id}`);
    
    return { metas };

  } catch (error) {
    console.error('[CATALOG] Error:', error);
    return { metas: [] };
  }
});

// Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[STREAM] Request: type=${type}, id=${id}`);
  
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { streams: [] };
  }

  try {
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    console.log(`[STREAM] URL: ${streamUrl}`);

    // Simple direct stream - works best on Samsung TV
    const streams = [
      {
        url: streamUrl,
        title: "Play"
      }
    ];

    return { streams };

  } catch (error) {
    console.error('[STREAM] Error:', error);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();