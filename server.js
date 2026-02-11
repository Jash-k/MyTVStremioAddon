const { getRouter } = require('stremio-addon-sdk');
const express = require('express');
const fetch = require('node-fetch');
const addonInterface = require('./addon');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS - Important for Stremio
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Home page
app.get('/', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const installUrl = `${protocol}://${host}/manifest.json`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FREE LIV TV</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: white;
        }
        .card {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          border: 1px solid rgba(255,255,255,0.2);
        }
        h1 { font-size: 28px; margin-bottom: 10px; }
        .status { color: #4ade80; font-size: 16px; margin-bottom: 20px; }
        .install-box {
          background: rgba(0,0,0,0.3);
          padding: 15px;
          border-radius: 10px;
          margin: 15px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 13px;
        }
        .btn {
          display: inline-block;
          background: #6366f1;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          margin: 10px 5px 10px 0;
          font-weight: 600;
          transition: background 0.3s;
        }
        .btn:hover { background: #4f46e5; }
        .features { margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.2); }
        .features li { margin: 8px 0; padding-left: 5px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📺 FREE LIV TV</h1>
        <div class="status">✅ Server Running</div>
        
        <p style="opacity: 0.8; margin-bottom: 20px;">Tamil Live TV • Cricket • Movies • News</p>
        
        <h3 style="margin-bottom: 10px;">Install URL:</h3>
        <div class="install-box">${installUrl}</div>
        
        <a href="${installUrl}" class="btn">📄 Manifest</a>
        <a href="stremio://${host}/manifest.json" class="btn">📲 Install</a>
        
        <div class="features">
          <h4 style="margin-bottom: 10px;">Channels:</h4>
          <ul style="padding-left: 20px; opacity: 0.9;">
            <li>200+ Tamil Channels</li>
            <li>Cricket (Star Sports, Sky Sports)</li>
            <li>Tamil Movies 24/7</li>
            <li>News & Entertainment</li>
          </ul>
        </div>
        
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 14px; opacity: 0.7;">
          Works on: Samsung TV • Android TV • Desktop • Mobile
        </div>
      </div>
    </body>
    </html>
  `);
});

// Stream proxy endpoint (for problematic streams)
app.get('/proxy/:encodedUrl', async (req, res) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    
    // Decode URL
    let b64 = encodedUrl.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const streamUrl = Buffer.from(b64, "base64").toString("utf8");
    
    console.log(`[PROXY] Fetching: ${streamUrl}`);

    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://freelivtvstrshare.vvishwas042.workers.dev/'
      },
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`Stream returned ${response.status}`);
    }

    // Forward headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.set('Content-Type', contentType);
    }
    
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'no-cache');

    // Pipe stream
    response.body.pipe(res);

  } catch (error) {
    console.error('[PROXY] Error:', error.message);
    res.status(503).send('Stream unavailable');
  }
});

// Stremio addon router - handles /manifest.json, /catalog/*, /stream/*
const addonRouter = getRouter(addonInterface);
app.use('/', addonRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('[ERROR]', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('  📺 FREE LIV TV - Stremio Addon');
  console.log('='.repeat(60));
  console.log(`  ✅ Server: http://localhost:${PORT}`);
  console.log(`  📱 Install: http://localhost:${PORT}/manifest.json`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});