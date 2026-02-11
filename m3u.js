const fetch = require('node-fetch');
const config = require('./config');
const { channelCache } = require('./cache');
const { log, error, debug, cleanChannelName } = require('./utils');

async function loadChannels() {
  // Check cache first
  const cached = channelCache.get('channels');
  if (cached) {
    debug(`[M3U] Returning ${cached.length} cached channels`);
    return cached;
  }

  log('[M3U] Fetching channels from playlist...');
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT);

    const response = await fetch(config.PLAYLIST_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StremioAddon/2.0)',
        'Accept': '*/*'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split('\n');
    const channels = [];

    let current = null;

    for (const line of lines) {
      if (line.startsWith('#EXTINF')) {
        const tvgNameMatch = line.match(/tvg-name="([^"]+)"/);
        const groupTitleMatch = line.match(/group-title="([^"]+)"/);
        const tvgLogoMatch = line.match(/tvg-logo="([^"]+)"/);
        const tvgIdMatch = line.match(/tvg-id="([^"]+)"/);

        if (!tvgNameMatch) {
          current = null;
          continue;
        }

        const tvgName = tvgNameMatch[1].trim();
        const groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : '';
        const tvgLogo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
        const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';

        // ==========================================
        // STRICT FILTERING RULES
        // ==========================================
        
        let shouldInclude = false;
        let priority = 999; // Lower = higher priority

        // Priority 1: Tamil groups from FREE LIV TV
        if (groupTitle === 'FREE LIV TV || TAMIL | MOVIES') {
          shouldInclude = true;
          priority = 1;
        } 
        else if (groupTitle === 'FREE LIV TV || TAMIL | ENTERTAINMENT') {
          shouldInclude = true;
          priority = 2;
        }
        else if (groupTitle === 'FREE LIV TV || TAMIL | NEWS') {
          shouldInclude = true;
          priority = 3;
        }
        else if (groupTitle === 'FREE LIV TV || TAMIL | MUSIC') {
          shouldInclude = true;
          priority = 4;
        }
        // Priority 5: Cricket channels
        else if (groupTitle === 'FREE LIV TV || CRICKET') {
          shouldInclude = true;
          priority = 5;
        }
        // Priority 6: TM: prefixed channels (Tamil channels)
        else if (tvgName.startsWith('TM:')) {
          shouldInclude = true;
          priority = 6;
        }
        // Priority 7: CRIC || prefixed channels (Cricket)
        else if (tvgName.startsWith('CRIC ||')) {
          shouldInclude = true;
          priority = 7;
        }
        // Priority 8: Specific Tamil patterns
        else if (tvgName.match(/^(Tamil:|TAMIL:)/)) {
          shouldInclude = true;
          priority = 8;
        }
        // Priority 9: 24/7 Tamil channels
        else if (tvgName.startsWith('24/7:') && tvgName.toLowerCase().includes('tamil')) {
          shouldInclude = true;
          priority = 9;
        }
        // Priority 10: Specific Tamil movie/entertainment patterns
        else if (tvgName.match(/^TAMIL[\s-]*(MOVIES?|DRAMA|ACTION|ROMANCE|CRIME)/i)) {
          shouldInclude = true;
          priority = 10;
        }

        // EXCLUDE unwanted channels even if they match above
        const excludePatterns = [
          /hindi/i,
          /telugu/i,
          /malayalam/i,
          /kannada/i,
          /bengali/i,
          /marathi/i,
          /punjabi/i,
          /gujarati/i,
          /english\s*movies/i,
          /hollywood/i,
          /bollywood/i
        ];

        for (const pattern of excludePatterns) {
          if (pattern.test(tvgName) || pattern.test(groupTitle)) {
            shouldInclude = false;
            break;
          }
        }

        if (!shouldInclude) {
          current = null;
          continue;
        }

        // ==========================================
        // CATEGORY DETECTION
        // ==========================================
        
        let category = 'Entertainment';
        
        // Cricket
        if (groupTitle.includes('CRICKET') || 
            tvgName.match(/cricket|CRIC\s*\|\|/i) || 
            tvgName.match(/sports.*cricket/i)) {
          category = 'Cricket';
        }
        // Movies
        else if (groupTitle.includes('MOVIES') || 
                 tvgName.match(/movies?|cinema|24\/7.*tamil/i) ||
                 tvgName.match(/TAMIL[\s-]*(MOVIES?|DRAMA|ACTION|ROMANCE|CRIME)/i)) {
          category = 'Movies';
        }
        // News
        else if (groupTitle.includes('NEWS') || 
                 tvgName.match(/news|seithigal/i)) {
          category = 'News';
        }
        // Music
        else if (groupTitle.includes('MUSIC') || 
                 tvgName.match(/music|isai|ganam|hits|melody/i)) {
          category = 'Music';
        }
        // Kids
        else if (tvgName.match(/kids|cartoon|chutti/i)) {
          category = 'Kids';
        }
        // Devotional
        else if (tvgName.match(/devotional|bhakthi|god|spiritual|hindu|christian/i)) {
          category = 'Devotional';
        }
        // Entertainment (default)
        else if (groupTitle.includes('ENTERTAINMENT') || 
                 tvgName.match(/^TM:\s*(SUN|VIJAY|ZEE|COLORS|STAR|KTV)/i)) {
          category = 'Entertainment';
        }

        // ==========================================
        // QUALITY DETECTION
        // ==========================================
        
        let quality = 'SD';
        if (tvgName.match(/4k|⁴ᵏ|uhd|2160/i)) {
          quality = '4K';
        } else if (tvgName.match(/fhd|ᶠᴴᴰ|1080|full\s*hd/i)) {
          quality = 'FHD';
        } else if (tvgName.match(/hd|ᴴᴰ|720/i)) {
          quality = 'HD';
        }

        current = {
          name: tvgName,
          displayName: cleanChannelName(tvgName),
          category,
          quality,
          logo: tvgLogo || null,
          tvgId: tvgId || null,
          group: groupTitle,
          priority
        };

      } else if (line.startsWith('http') && current) {
        channels.push({
          ...current,
          url: line.trim()
        });

        current = null;

        // Stop if we have enough channels
        if (channels.length >= config.MAX_CHANNELS) {
          log(`[M3U] Reached max channels limit (${config.MAX_CHANNELS})`);
          break;
        }
      }
    }

    // Sort by priority (lower number = higher priority)
    channels.sort((a, b) => a.priority - b.priority);

    log(`[M3U] Loaded ${channels.length} channels`);
    
    // Log category breakdown
    const categories = {};
    const groups = {};
    
    channels.forEach(ch => {
      categories[ch.category] = (categories[ch.category] || 0) + 1;
      
      // Count by group for debugging
      const groupName = ch.group || 'No Group';
      groups[groupName] = (groups[groupName] || 0) + 1;
    });
    
    debug('[M3U] Categories:', categories);
    debug('[M3U] Groups:', groups);

    // Log sample channels for debugging
    if (config.DEBUG) {
      debug('[M3U] Sample channels (first 5):');
      channels.slice(0, 5).forEach(ch => {
        debug(`  - ${ch.name} (${ch.category}, ${ch.group})`);
      });
    }

    // Cache channels
    channelCache.set('channels', channels);

    return channels;

  } catch (err) {
    error('[M3U] Failed to load channels:', err.message);
    
    // Return cached even if expired
    const staleCache = channelCache.cache.get('channels');
    if (staleCache) {
      log('[M3U] Returning stale cache due to error');
      return staleCache.value;
    }
    
    return [];
  }
}

// Get channels by category
async function getChannelsByCategory(category) {
  const channels = await loadChannels();
  
  if (!category || category === 'all') {
    return channels;
  }
  
  return channels.filter(ch => 
    ch.category.toLowerCase() === category.toLowerCase()
  );
}

// Get channel by URL
async function getChannelByUrl(url) {
  const channels = await loadChannels();
  return channels.find(ch => ch.url === url);
}

// Get unique categories
async function getCategories() {
  const channels = await loadChannels();
  const categories = new Map();
  
  channels.forEach(ch => {
    if (!categories.has(ch.category)) {
      categories.set(ch.category, 0);
    }
    categories.set(ch.category, categories.get(ch.category) + 1);
  });
  
  // Sort by count (descending)
  return Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

// Debug function to show what's being parsed
async function debugParsing() {
  const channels = await loadChannels();
  
  console.log('\n' + '='.repeat(60));
  console.log('PARSING DEBUG REPORT');
  console.log('='.repeat(60));
  console.log(`Total Channels: ${channels.length}`);
  console.log('\nBy Category:');
  
  const cats = await getCategories();
  cats.forEach(c => {
    console.log(`  ${c.name}: ${c.count}`);
  });
  
  console.log('\nBy Group:');
  const groups = {};
  channels.forEach(ch => {
    const g = ch.group || 'No Group';
    groups[g] = (groups[g] || 0) + 1;
  });
  
  Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .forEach(([group, count]) => {
      console.log(`  ${group}: ${count}`);
    });
  
  console.log('\nSample Channels:');
  channels.slice(0, 10).forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.name}`);
    console.log(`   Category: ${ch.category}, Quality: ${ch.quality}`);
    console.log(`   Group: ${ch.group}`);
  });
  
  console.log('='.repeat(60) + '\n');
}

module.exports = {
  loadChannels,
  getChannelsByCategory,
  getChannelByUrl,
  getCategories,
  debugParsing
};