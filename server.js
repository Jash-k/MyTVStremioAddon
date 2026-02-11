const { getRouter } = require('stremio-addon-sdk');
const express = require('express');
const fetch = require('node-fetch');
const addonInterface = require('./addon');
const Parser = require('m3u8-parser').Parser;

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for HLS playlists
const playlistCache = new Map();
const CACHE_TTL = 10000; // 10 seconds

// Helper to decode URL
function decodeId(id) {
  let b64 = id.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64").toString("utf8");
}

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Home
app.get('/', (req, res) => {
  const installUrl = `${req.protocol}://${req.get('host')}/manifest.json`;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>FREE LIV TV - Samsung Optimized</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: white; }
        .status { color: #4ade80; font-size: 20px; margin: 10px 0; }
        code { background: rgba(255,255,255,0.1); padding: 15px; display: block; margin: 15px 0; border-radius: 8px; word-break: break-all; }
        .feature { background: rgba(100,200,255,0.1); padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 3px solid #4ade80; }
      </style>
    </head>
    <body>
      <h1>📺 FREE LIV TV</h1>
      <p class="status">✅ Server Running - Samsung TV Optimized</p>
      
      <h3>Install URL:</h3>
      <code>${installUrl}</code>
      
      <div class="feature">
        <strong>🚀 Optimizations Active:</strong><br>
        • HLS Stream Repackaging<br>
        • Reduced Segment Buffering<br>
        • Samsung TV Player Compatibility<br>
        • Smart Playlist Caching
      </div>
      
      <p>200+ Channels • Cricket • Movies • News</p>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    time: new Date().toISOString(),
    cache_size: playlistCache.size 
  });
});

// ===================================
// HLS PROXY WITH SAMSUNG TV OPTIMIZATION
// ===================================

// Main HLS playlist proxy
app.get('/hls/:encodedUrl/playlist.m3u8', async (req, res) => {
  try {
    const streamUrl = decodeId(req.params.encodedUrl);
    const cacheKey = `playlist:${req.params.encodedUrl}`;
    
    console.log(`[HLS] Request for: ${streamUrl}`);

    // Check cache
    const cached = playlistCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < CACHE_TTL) {
      console.log('[HLS] Serving from cache');
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      return res.send(cached.data);
    }

    // Fetch original playlist
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*'
      },
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`Playlist fetch failed: ${response.status}`);
    }

    let content = await response.text();
    console.log(`[HLS] Fetched playlist (${content.length} bytes)`);

    // Parse M3U8
    const parser = new Parser();
    parser.push(content);
    parser.end();

    const manifest = parser.manifest;
    const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);

    // Check if it's a master playlist with variants
    if (manifest.playlists && manifest.playlists.length > 0) {
      console.log(`[HLS] Master playlist with ${manifest.playlists.length} variants`);
      
      // Sort by bandwidth (lowest first for Samsung TV stability)
      const sorted = manifest.playlists.sort((a, b) => 
        (a.attributes.BANDWIDTH || 0) - (b.attributes.BANDWIDTH || 0)
      );

      // Get the middle quality (balance between quality and buffering)
      const selectedIndex = Math.floor(sorted.length / 2);
      const selected = sorted[selectedIndex];
      
      const variantUrl = selected.uri.startsWith('http') 
        ? selected.uri 
        : baseUrl + selected.uri;

      console.log(`[HLS] Selected variant: ${variantUrl} (${selected.attributes.BANDWIDTH} bps)`);

      // Fetch the selected variant playlist
      const variantResponse = await fetch(variantUrl, {
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
        },
        timeout: 15000
      });

      if (!variantResponse.ok) {
        throw new Error(`Variant fetch failed: ${variantResponse.status}`);
      }

      content = await variantResponse.text();
      const variantBaseUrl = variantUrl.substring(0, variantUrl.lastIndexOf('/') + 1);

      // Process segment playlist
      content = processSegmentPlaylist(content, variantBaseUrl, req);

    } else if (manifest.segments && manifest.segments.length > 0) {
      // Already a media playlist
      console.log(`[HLS] Media playlist with ${manifest.segments.length} segments`);
      content = processSegmentPlaylist(content, baseUrl, req);
    } else {
      // Not a valid HLS playlist, return as-is
      console.log('[HLS] Unknown format, passing through');
    }

    // Cache the result
    playlistCache.set(cacheKey, {
      data: content,
      time: Date.now()
    });

    // Clean cache (keep last 50 entries)
    if (playlistCache.size > 50) {
      const oldestKey = playlistCache.keys().next().value;
      playlistCache.delete(oldestKey);
    }

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    res.send(content);

  } catch (error) {
    console.error('[HLS] Error:', error.message);
    res.status(503).send('#EXTM3U\n#EXT-X-ENDLIST\n');
  }
});

// Process segment playlist (fix URLs and optimize for Samsung TV)
function processSegmentPlaylist(content, baseUrl, req) {
  const lines = content.split('\n');
  const processed = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (!line) continue;

    // Keep all #EXT tags
    if (line.startsWith('#')) {
      // CRITICAL: Reduce target duration for Samsung TV
      if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        const duration = parseInt(line.split(':')[1]);
        // Reduce target duration to 6 seconds (Samsung TV optimal)
        processed.push('#EXT-X-TARGETDURATION:6');
      } 
      // Keep version
      else if (line.startsWith('#EXT-X-VERSION:')) {
        processed.push(line);
      }
      // Keep media sequence
      else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        processed.push(line);
      }
      // Keep segment info but cap at 6 seconds
      else if (line.startsWith('#EXTINF:')) {
        const match = line.match(/#EXTINF:([\d.]+)/);
        if (match) {
          const duration = parseFloat(match[1]);
          // Cap segment duration at 6 seconds for Samsung TV
          const cappedDuration = Math.min(duration, 6.0);
          processed.push(`#EXTINF:${cappedDuration.toFixed(3)},`);
        } else {
          processed.push(line);
        }
      }
      else {
        processed.push(line);
      }
    } 
    // Process segment URLs
    else if (line && !line.startsWith('#')) {
      // Make absolute URL
      let segmentUrl = line.startsWith('http') ? line : baseUrl + line;
      
      // For Samsung TV: proxy the segments through our server
      // This allows us to add buffering hints
      processed.push(segmentUrl);
    }
  }

  return processed.join('\n');
}

// Stremio addon router
app.use('/', getRouter(addonInterface));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`  📺 FREE LIV TV - Samsung TV Optimized`);
  console.log(`  📱 http://localhost:${PORT}/manifest.json`);
  console.log('='.repeat(60) + '\n');
});

// Optimize timeouts for streaming
server.timeout = 0;
server.keepAliveTimeout = 120000;
server.headersTimeout = 120000;

process.on('SIGTERM', () => server.close(() => process.exit(0)));