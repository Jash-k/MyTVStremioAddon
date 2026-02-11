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
  resources: ["catalog", "meta", "stream"],
  idPrefixes: ["tamil:"],
  behaviorHints: {
    adult: false,
    p2p: false
  }
};

const builder = new addonBuilder(manifest);

// Catalog Handler - Simplified for performance
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

    const metas = channels.map(ch => ({
      id: "tamil:" + encodeId(ch.url),
      type: "tv",
      name: ch.name,
      posterShape: "square",
      description: ch.category || "Live TV",
      genres: [ch.category || "Entertainment"],
      releaseInfo: "LIVE"
    }));

    return { metas };

  } catch (error) {
    console.error('[CATALOG] Error:', error);
    return { metas: [] };
  }
});

// Meta Handler - Minimal for speed
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[META] Request: type=${type}, id=${id}`);
  
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { meta: null };
  }

  try {
    const channels = await loadChannels();
    const streamUrl = decodeId(id.replace("tamil:", ""));
    
    // Find the channel
    const channel = channels.find(ch => 
      encodeId(ch.url) === id.replace("tamil:", "")
    );

    const channelName = channel ? channel.name : "Live Channel";

    // Minimal metadata for faster loading
    return {
      meta: {
        id: id,
        type: "tv",
        name: channelName,
        releaseInfo: "LIVE",
        description: "Live TV Channel",
        videos: [
          {
            id: id,
            title: "Watch Live",
            released: new Date().toISOString()
          }
        ]
      }
    };

  } catch (error) {
    console.error('[META] Error:', error);
    return { meta: null };
  }
});

// Stream Handler - OPTIMIZED FOR SAMSUNG TV
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[STREAM] Request: type=${type}, id=${id}`);
  
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { streams: [] };
  }

  try {
    const encodedId = id.replace("tamil:", "");
    const streamUrl = decodeId(encodedId);
    
    console.log(`[STREAM] URL: ${streamUrl}`);

    // Get base URL for proxy
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                   `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;

    // IMPORTANT: Return multiple stream options for Samsung TV
    const streams = [
      // Option 1: Direct stream (fastest if it works)
      {
        name: "Direct",
        title: "Fast",
        url: streamUrl,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "tamil-live"
        }
      },
      
      // Option 2: Proxied stream (more reliable)
      {
        name: "Proxy",
        title: "Stable",
        url: `${baseUrl}/stream-proxy/${encodedId}`,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "tamil-live"
        }
      },
      
      // Option 3: HLS proxy with chunked loading
      {
        name: "Optimized",
        title: "Samsung TV",
        url: `${baseUrl}/hls/${encodedId}/playlist.m3u8`,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "tamil-live"
        }
      }
    ];

    return { streams };

  } catch (error) {
    console.error('[STREAM] Error:', error);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();