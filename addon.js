const { addonBuilder } = require('stremio-addon-sdk');
const { loadChannels } = require('./m3u');

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

const manifest = {
  id: "org.freelivtv.tamil",
  version: "1.0.3",
  name: "FREE LIV TV",
  description: "Tamil Live TV - Samsung Optimized",
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
  idPrefixes: ["tamil:"]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id }) => {
  if (type !== "tv") return { metas: [] };

  try {
    const allChannels = await loadChannels();
    let channels = allChannels;

    if (id === "tamil-cricket") {
      channels = allChannels.filter(ch => ch.category === "Cricket");
    } else if (id === "tamil-movies") {
      channels = allChannels.filter(ch => ch.category === "Movies");
    } else if (id === "tamil-news") {
      channels = allChannels.filter(ch => ch.category === "News");
    }

    return {
      metas: channels.map(ch => ({
        id: "tamil:" + encodeId(ch.url),
        type: "tv",
        name: ch.name,
        posterShape: "square",
        releaseInfo: "LIVE"
      }))
    };
  } catch (error) {
    console.error('[CATALOG]', error);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "tv" || !id.startsWith("tamil:")) return { meta: null };

  try {
    const channels = await loadChannels();
    const channel = channels.find(ch => 
      encodeId(ch.url) === id.replace("tamil:", "")
    );

    return {
      meta: {
        id: id,
        type: "tv",
        name: channel ? channel.name : "Live Channel",
        releaseInfo: "LIVE",
        videos: [{
          id: id,
          title: "Watch Live",
          released: new Date().toISOString()
        }]
      }
    };
  } catch (error) {
    return { meta: null };
  }
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== "tv" || !id.startsWith("tamil:")) {
    return { streams: [] };
  }

  try {
    const encodedId = id.replace("tamil:", "");
    const streamUrl = decodeId(encodedId);
    
    // Get base URL for HLS proxy
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 
                   `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;
    
    console.log(`[STREAM] Original: ${streamUrl}`);
    console.log(`[STREAM] Proxied: ${baseUrl}/hls/${encodedId}/playlist.m3u8`);

    // Return HLS proxied stream (optimized for Samsung TV)
    return {
      streams: [{
        url: `${baseUrl}/hls/${encodedId}/playlist.m3u8`,
        behaviorHints: {
          notWebReady: true
        }
      }]
    };

  } catch (error) {
    console.error('[STREAM]', error);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();