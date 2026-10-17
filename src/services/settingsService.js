import fs from 'fs';
import { db } from '../models/db.js';
import { config } from '../config/env.js';
import { isMongoConnected } from '../config/mongo.js';
import { cleanInputPath } from '../utils/pathValidator.js';

export class SettingsService {
  static getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    const currentRoot = settings.gallery_root || config.galleryRoot;
    const driveConnected = fs.existsSync(currentRoot);
    const mongoActive = isMongoConnected();

    return {
      settings: {
        gallery_root: currentRoot,
        theme: settings.theme || 'system',
        thumbnails_per_page: parseInt(settings.thumbnails_per_page || '40', 10)
      },
      system: {
        host: config.host,
        port: config.port,
        configuredRoot: currentRoot,
        driveConnected,
        authDatabase: mongoActive
          ? 'MongoDB Atlas (Connected & Active)'
          : (config.mongodbUri ? 'MongoDB Atlas (Connecting / Disconnected)' : 'MongoDB Atlas (Add MONGODB_URI to .env)'),
        mongoConnected: mongoActive,
        databasePath: config.databasePath,
        thumbnailDir: config.thumbnailDir,
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  }

  static updateSettings(updates = {}) {
    const allowedKeys = ['gallery_root', 'theme', 'thumbnails_per_page'];
    const updateStmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (let [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        if (key === 'gallery_root') {
          value = cleanInputPath(value);
        }
        updateStmt.run(key, String(value));
      }
    }

    return this.getSettings();
  }
}
