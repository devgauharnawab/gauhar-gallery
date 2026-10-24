import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { isPathInsideRoot, shouldSkipDirectory, normalizeSystemPath } from '../utils/pathValidator.js';
import { ThumbnailService } from './thumbnailService.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.avif'
]);

class PhotoStore {
  constructor() {
    this.photos = new Map(); // photoId -> Photo object
    this.pathMap = new Map(); // normalizedPath.toLowerCase() -> Photo object
    this.filenameMap = new Map(); // filename.toLowerCase() -> Photo object
    this.indexPath = path.join(config.thumbnailDir, '../photo_index.json');
    this.isLoaded = false;
  }

  // Load local in-memory index from computer cache file
  init(force = false) {
    if (this.isLoaded && !force) return;
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          if (force) {
            this.photos.clear();
            this.pathMap.clear();
            this.filenameMap.clear();
          }
          for (const item of data) {
            this.photos.set(item.id, item);
            if (item.filepath) {
              this.pathMap.set(normalizeSystemPath(item.filepath).toLowerCase(), item);
            }
            if (item.filename) {
              this.filenameMap.set(item.filename.toLowerCase(), item);
            }
          }
          console.log(`[PhotoStore] Loaded ${this.photos.size} photos from local computer index.`);
        }
      }
    } catch (err) {
      console.warn('[PhotoStore] Note reading local photo cache:', err.message);
    }
    this.isLoaded = true;
  }

  reload() {
    this.init(true);
  }

  // Persist index to local disk on the computer
  saveIndex() {
    try {
      const arr = Array.from(this.photos.values());
      fs.writeFileSync(this.indexPath, JSON.stringify(arr), 'utf-8');
    } catch (err) {
      console.warn('[PhotoStore] Error saving local computer index:', err.message);
    }
  }

  getPhotoById(id) {
    this.init();
    return this.photos.get(id) || null;
  }

  getPhotoByPath(filepath) {
    this.init();
    if (!filepath) return null;
    const norm = normalizeSystemPath(filepath).toLowerCase();
    return this.pathMap.get(norm) || null;
  }

  getPhotoByFilename(filename) {
    this.init();
    if (!filename) return null;
    return this.filenameMap.get(filename.toLowerCase()) || null;
  }

  findPhoto(filepath, filename) {
    this.init();
    return this.getPhotoByPath(filepath) || this.getPhotoByFilename(filename) || null;
  }

  getAllPhotos() {
    this.init();
    return Array.from(this.photos.values());
  }

  hasPhoto(id) {
    this.init();
    return this.photos.has(id);
  }

  upsertPhoto(photo) {
    this.init();
    this.photos.set(photo.id, photo);
    if (photo.filepath) {
      this.pathMap.set(normalizeSystemPath(photo.filepath).toLowerCase(), photo);
    }
    if (photo.filename) {
      this.filenameMap.set(photo.filename.toLowerCase(), photo);
    }
  }

  deletePhoto(id) {
    this.init();
    const photo = this.photos.get(id);
    if (photo) {
      if (photo.filepath) {
        this.pathMap.delete(normalizeSystemPath(photo.filepath).toLowerCase());
      }
      if (photo.filename) {
        this.filenameMap.delete(photo.filename.toLowerCase());
      }
    }
    this.photos.delete(id);
  }

  count() {
    this.init();
    return this.photos.size;
  }

  clear() {
    this.photos.clear();
  }
}

export const photoStore = new PhotoStore();
