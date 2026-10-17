import mongoose from 'mongoose';
import fs from 'fs';
import { config } from './config/env.js';
import { initDatabase, db } from './models/db.js';
import { connectMongo, isMongoConnected } from './config/mongo.js';
import { scannerService } from './services/scannerService.js';
import { createApp } from './app.js';

// Initialize SQLite database (for photos, albums, favorites, settings)
console.log('[Startup] Initializing local database...');
initDatabase();

// Connect to MongoDB Atlas (for user login & authentication)
connectMongo().catch(err => {
  console.warn('[Startup] MongoDB Atlas connection warning:', err.message);
});

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`====================================================`);
  console.log(`  Family Gallery Backend Server Running`);
  console.log(`  URL: http://${config.host}:${config.port}`);
  console.log(`  Configured Gallery Root: ${config.galleryRoot}`);
  console.log(`  Authentication Database: MongoDB Atlas ${config.mongodbUri ? '(Connected)' : '(Local)'}`);
  console.log(`  Continuous Background Scanning: Active (every 15 min)`);
  console.log(`  Default Logins: admin / admin OR gauhar / gauhar123`);
  console.log(`====================================================`);

  // Start continuous background scanning for photos
  setTimeout(() => {
    if (fs.existsSync(config.galleryRoot)) {
      console.log('[Startup] Initiating background photo index check...');
      scannerService.startScan().catch(e => {
        // Safe skip if busy
      });
    }
    // Check every 15 minutes automatically
    scannerService.startPeriodicScanning(15);
  }, 4000);
});

// Graceful shutdown handling
async function handleShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing server, MongoDB, and local database...`);
  server.close(async () => {
    try {
      if (isMongoConnected()) {
        await mongoose.disconnect();
        console.log('[Shutdown] MongoDB connection closed safely.');
      }
      db.close();
      console.log('[Shutdown] Local database connection closed safely.');
    } catch (e) {
      console.error('[Shutdown] Error during shutdown cleanup:', e);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
