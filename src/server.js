import mongoose from 'mongoose';
import fs from 'fs';
import { config } from './config/env.js';
import { connectMongo, isMongoConnected } from './config/mongo.js';
import { photoStore } from './services/photoStore.js';
import { scannerService } from './services/scannerService.js';
import { createApp } from './app.js';

// Initialize local computer photo repository
console.log('[Startup] Initializing local computer photo store...');
photoStore.init();

// Connect to MongoDB Atlas (Strictly for User Login & Accounts)
console.log('[Startup] Connecting to MongoDB Atlas for user login...');
await connectMongo();

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`====================================================`);
  console.log(`  Family Gallery Backend Server Running`);
  console.log(`  URL: http://${config.host}:${config.port}`);
  console.log(`  Photo Database: Local Windows Filesystem (${config.galleryRoot})`);
  console.log(`  Login Authentication: MongoDB Atlas (Users Only)`);
  console.log(`  Default Logins: gauhar / gauhar123 OR admin / admin`);
  console.log(`====================================================`);

  // Start background scan ONLY if index is empty (first time run)
  setTimeout(() => {
    if (fs.existsSync(config.galleryRoot) && photoStore.count() === 0) {
      console.log('[Startup] First-time setup: Initiating photo index scan on computer...');
      scannerService.startScan().catch(() => {});
    } else {
      console.log(`[Startup] ${photoStore.count()} photos already indexed and instantly accessible.`);
    }
  }, 2000);
});

// Graceful shutdown handling
async function handleShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing server and MongoDB connection...`);
  photoStore.saveIndex();
  server.close(async () => {
    try {
      if (isMongoConnected()) {
        await mongoose.disconnect();
        console.log('[Shutdown] MongoDB connection closed safely.');
      }
    } catch (e) {
      console.error('[Shutdown] Error during shutdown cleanup:', e);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
