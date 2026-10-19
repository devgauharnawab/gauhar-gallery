import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { isMongoConnected } from '../config/mongo.js';
import { cleanInputPath } from '../utils/pathValidator.js';
import { photoStore } from './photoStore.js';

class SettingsService {
  constructor() {
    this.storagePath = path.join(config.thumbnailDir, '../settings.json');
    this.settings = {
      gallery_root: config.galleryRoot,
      theme: 'system',
      thumbnails_per_page: '40'
    };
    this.isLoaded = false;
  }

  _load() {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          this.settings = { ...this.settings, ...data };
        }
      }
    } catch (e) {
      console.warn('[SettingsService] Error loading local settings:', e.message);
    }
    this.isLoaded = true;
  }

  _save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[SettingsService] Error saving local settings:', e.message);
    }
  }

  async getSettings() {
    this._load();
    let currentRoot = this.settings.gallery_root || config.galleryRoot;
    if (!fs.existsSync(currentRoot)) {
      if (fs.existsSync(config.galleryRoot)) {
        currentRoot = config.galleryRoot;
        this.settings.gallery_root = currentRoot;
        this._save();
      } else if (fs.existsSync('E:\\')) {
        currentRoot = 'E:\\';
        this.settings.gallery_root = currentRoot;
        this._save();
      }
    }
    const driveConnected = fs.existsSync(currentRoot) || photoStore.count() > 0;
    const mongoActive = isMongoConnected();

    const remoteBridge = this.settings.remote_bridge_url || process.env.HOME_TUNNEL_URL || '';

    return {
      settings: {
        gallery_root: currentRoot,
        remote_bridge_url: remoteBridge,
        theme: this.settings.theme || 'system',
        thumbnails_per_page: parseInt(this.settings.thumbnails_per_page || '40', 10)
      },
      system: {
        host: config.host,
        port: config.port,
        configuredRoot: currentRoot,
        driveConnected,
        remoteBridgeConfigured: !!remoteBridge,
        remoteBridgeUrl: remoteBridge || null,
        database: 'Local Windows Filesystem (Computer is the Database - Zero Photos in Cloud)',
        authDatabase: 'MongoDB Atlas (User Login & Authentication Only)',
        mongoConnected: mongoActive,
        totalPhotosOnComputer: photoStore.count(),
        thumbnailDir: config.thumbnailDir,
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  }

  async updateSettings(updates = {}) {
    this._load();
    const allowedKeys = ['gallery_root', 'theme', 'thumbnails_per_page', 'remote_bridge_url'];

    for (let [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        if (key === 'gallery_root') {
          value = cleanInputPath(value);
        } else if (key === 'remote_bridge_url') {
          value = String(value || '').trim().replace(/\/+$/, '');
        }
        this.settings[key] = String(value);
      }
    }

    this._save();
    return await this.getSettings();
  }
}

export const settingsService = new SettingsService();
export { settingsService as SettingsService };
