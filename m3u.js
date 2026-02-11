const fetch = require('node-fetch');

const PLAYLIST_URL =
  "https://raw.githubusercontent.com/Jash-k/MyTVStremioAddon/refs/heads/main/starshare.m3u";

const MAX_CHANNELS = 200;

// Cache
let channelsCache = null;
let cacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

async function loadChannels() {
  const now = Date.now();
  
  // Return cached if valid
  if (channelsCache && (now - cacheTime) < CACHE_DURATION) {
    console.log(`[CACHE] Returning ${channelsCache.length} cached channels`);
    return channelsCache;
  }

  console.log('[M3U] Fetching channels...');
  
  try {
    const res = await fetch(PLAYLIST_URL, { timeout: 15000 });
    const text = await res.text();

    const lines = text.split("\n");
    const channels = [];

    let current = null;

    for (const line of lines) {
      if (line.startsWith("#EXTINF")) {
        const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
        const groupTitleMatch = line.match(/group-title="([^"]+)"/);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);

        if (!tvgNameMatch) {
          current = null;
          continue;
        }

        const tvgName = tvgNameMatch[1].trim();
        const groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : "";
        const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1].trim() : "";

        const isTMChannel = tvgName.startsWith("TM:");
        const isFreelivTamilGroup = groupTitle.startsWith("FREE LIV TV || TAMIL");
        const isCricketGroup = groupTitle.includes("FREE LIV TV || CRICKET");

        if (!isTMChannel && !isFreelivTamilGroup && !isCricketGroup) {
          current = null;
          continue;
        }

        let category = "Entertainment";
        
        if (groupTitle.includes("CRICKET") || /cricket/i.test(tvgName) || tvgName.startsWith("CRIC ||")) {
          category = "Cricket";
        } else if (groupTitle.includes("MOVIES") || /movie/i.test(tvgName)) {
          category = "Movies";
        } else if (groupTitle.includes("NEWS") || /news/i.test(tvgName)) {
          category = "News";
        } else if (groupTitle.includes("MUSIC") || /music/i.test(tvgName)) {
          category = "Music";
        }

        current = {
          name: tvgName,
          category,
          logo: tvgLogo,
          group: groupTitle
        };
      } else if (line.startsWith("http") && current) {
        channels.push({
          name: current.name,
          url: line.trim(),
          category: current.category,
          logo: current.logo,
          group: current.group
        });

        current = null;

        if (channels.length >= MAX_CHANNELS) break;
      }
    }

    console.log(`[M3U] Loaded ${channels.length} channels`);
    
    // Update cache
    channelsCache = channels;
    cacheTime = now;
    
    return channels;

  } catch (error) {
    console.error('[M3U] Error loading channels:', error.message);
    
    // Return cached even if expired in case of error
    if (channelsCache) {
      console.log('[M3U] Returning stale cache due to error');
      return channelsCache;
    }
    
    return [];
  }
}

module.exports = { loadChannels };