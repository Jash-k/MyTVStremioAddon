require('dotenv').config();

module.exports = {
  // Server
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // App Info
  APP_NAME: 'FREE LIV TV',
  APP_VERSION: '2.0.0',
  APP_ID: 'org.freelivtv.tamil',
  
  // URLs
  PLAYLIST_URL: process.env.PLAYLIST_URL || 'https://raw.githubusercontent.com/Jash-k/MyTVAddon/refs/heads/main/starshare.m3u',
  BASE_URL: process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || null,
  
  // Cache Settings
  CHANNEL_CACHE_TTL: parseInt(process.env.CHANNEL_CACHE_TTL) || 30 * 60 * 1000,  // 30 minutes
  STREAM_CACHE_TTL: parseInt(process.env.STREAM_CACHE_TTL) || 10 * 60 * 1000,    // 10 minutes
  MAX_CACHE_ENTRIES: parseInt(process.env.MAX_CACHE_ENTRIES) || 200,
  
  // Limits
  MAX_CHANNELS: parseInt(process.env.MAX_CHANNELS) || 300,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 15000,
  
  // Keep Alive (for Render free tier)
  KEEP_ALIVE_ENABLED: process.env.KEEP_ALIVE_ENABLED !== 'false',
  KEEP_ALIVE_INTERVAL: parseInt(process.env.KEEP_ALIVE_INTERVAL) || 5 * 60 * 1000, // 5 minutes
  KEEP_ALIVE_URL: process.env.KEEP_ALIVE_URL || null,
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 1000,              // 1000 requests per window
  
  // Features
  ENABLE_LOGOS: process.env.ENABLE_LOGOS !== 'false',
  ENABLE_COMPRESSION: process.env.ENABLE_COMPRESSION !== 'false',
  DEBUG: process.env.DEBUG === 'true'
};