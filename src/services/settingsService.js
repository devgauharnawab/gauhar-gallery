import fs from 'fs';
import { MongoSetting } from '../models/settingMongo.js';
import { config } from '../config/env.js';
import { isMongoConnected } from '../config/mongo.js';
import { cleanInputPath } from '../utils/pathValidator.js';

export class SettingsService {
  static async getSettings() {
    const rows = await MongoSetting.find().lean();
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
        thumbnails_per_page: parseInt(settings.thumbnails_per_page || '24', 10)
      },
      system: {
        host: config.host,
        port: config.port,
        configuredRoot: currentRoot,
        driveConnected,
        database: 'MongoDB Atlas (Pure Cloud Database - No SQLite)',
        mongoConnected: mongoActive,
        thumbnailDir: config.thumbnailDir,
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  }

  static async updateSettings(updates = {}) {
    const allowedKeys = ['gallery_root', 'theme', 'thumbnails_per_page'];

    for (let [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        if (key === 'gallery_root') {
          value = cleanInputPath(value);
        }
        await MongoSetting.findOneAndUpdate(
          { key },
          { key, value: String(value) },
          { upsert: true }
        );
      }
    }

    return await this.getSettings();
  }
}
