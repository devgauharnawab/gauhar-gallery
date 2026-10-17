import mongoose from 'mongoose';
import fs from 'fs';
import { config } from './config/env.js';
import { connectMongo, isMongoConnected } from './config/mongo.js';
import { scannerService } from './services/scannerService.js';
import { createApp } from './app.js';

// Connect to MongoDB Atlas
console.log('[Startup] Connecting to MongoDB Atlas...');
await connectMongo();

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`====================================================`);
  console.log(`  Family Gallery Backend Server Running`);
  console.log(`  URL: http://${config.host}:${config.port}`);
  console.log(`  Configured Gallery Root: ${config.galleryRoot}`);
  console.log(`  Database: MongoDB Atlas (Connected)`);
  console.log(`  Continuous Background Scanning: Active (every 15 min)`);
  console.log(`  Default Logins: admin / admin OR gauhar / gauhar123`);
  console.log(`====================================================`);

  // Start continuous background scanning for photos
  setTimeout(() => {
    if (fs.existsSync(config.galleryRoot)) {
      console.log('[Startup] Initiating background photo index check...');
      scannerService.startScan().catch(e => {
        // Safe skip if busy or drive temporarily inaccessible
      });
    }
    // Check every 15 minutes automatically
    scannerService.startPeriodicScanning(15);
  }, 4000);
});

// Graceful shutdown handling
async function handleShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Closing server and MongoDB connection...`);
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
