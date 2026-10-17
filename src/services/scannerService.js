import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { photoStore } from './photoStore.js';
import { config } from '../config/env.js';
import { isPathInsideRoot, shouldSkipDirectory, normalizeSystemPath } from '../utils/pathValidator.js';
import { ThumbnailService } from './thumbnailService.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif', '.avif'
]);

class ScannerService {
  constructor() {
    this.isScanning = false;
    this.cancelRequested = false;
    this.scannedCount = 0;
    this.imagesFound = 0;
    this.errorsCount = 0;
    this.currentDirectory = '';
    this.startTime = null;
    this.endTime = null;
    this.lastError = null;
    this.lastStatus = 'idle';
    this._periodicTimer = null;
  }

  async getStatus() {
    return {
      status: this.isScanning ? 'scanning' : this.lastStatus,
      currentDirectory: this.isScanning ? this.currentDirectory : '',
      scannedFiles: this.scannedCount,
      imagesFound: this.imagesFound,
      errorsCount: this.errorsCount,
      startTime: this.startTime,
      endTime: this.endTime,
      lastError: this.lastError
    };
  }

  cancelScan() {
    if (this.isScanning) {
      this.cancelRequested = true;
      return true;
    }
    return false;
  }

  startPeriodicScanning(intervalMinutes = 15) {
    if (this._periodicTimer) return;
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    console.log(`[Scanner] Background photo scanner active (every ${intervalMinutes}m).`);
    this._periodicTimer = setInterval(async () => {
      if (!this.isScanning) {
        console.log('[Scanner] Periodic scan checking E: drive for new photos...');
        try {
          await this.startScan();
        } catch (err) {
          console.warn('[Scanner] Periodic scan note:', err.message);
        }
      }
    }, intervalMs);
  }

  stopPeriodicScanning() {
    if (this._periodicTimer) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = null;
    }
  }

  async startScan(customRoot = null) {
    if (this.isScanning) {
      throw new Error('A scan is already in progress.');
    }

    const rootDir = customRoot ? path.resolve(customRoot) : config.galleryRoot;

    if (!fs.existsSync(rootDir)) {
      throw new Error(`Configured gallery root directory does not exist or is not connected: ${rootDir}`);
    }

    this.isScanning = true;
    this.cancelRequested = false;
    this.scannedCount = 0;
    this.imagesFound = 0;
    this.errorsCount = 0;
    this.startTime = new Date().toISOString();
    this.endTime = null;
    this.lastError = null;
    this.lastStatus = 'scanning';
    this.currentDirectory = rootDir;

    // Launch scan asynchronously in background without blocking the event loop
    setImmediate(async () => {
      try {
        await this._runScan(rootDir);

        this.lastStatus = this.cancelRequested ? 'cancelled' : 'completed';
        this.endTime = new Date().toISOString();
        photoStore.saveIndex();

        console.log(`[Scanner] Scan ${this.lastStatus}. Scanned ${this.scannedCount} files, found ${this.imagesFound} images on your computer.`);
      } catch (err) {
        console.error('[Scanner] Scan failed:', err);
        this.lastStatus = 'failed';
        this.lastError = err.message;
        this.endTime = new Date().toISOString();
      } finally {
        this.isScanning = false;
        this.cancelRequested = false;
      }
    });

    return { message: 'Scan started in background on your computer.', rootDir };
  }

  async _runScan(rootDir) {
    const dirsToProcess = [rootDir];
    const visitedRealPaths = new Set();
    const discoveredPaths = new Set();

    photoStore.init(true);

    while (dirsToProcess.length > 0) {
      if (this.cancelRequested) {
        console.log('[Scanner] Scan cancellation acknowledged.');
        break;
      }

      const currentDir = dirsToProcess.shift();
      this.currentDirectory = currentDir;

      let realDir;
      try {
        realDir = fs.realpathSync.native ? fs.realpathSync.native(currentDir) : fs.realpathSync(currentDir);
      } catch (e) {
        this.errorsCount++;
        continue;
      }

      if (visitedRealPaths.has(realDir)) continue;
      visitedRealPaths.add(realDir);

      if (!isPathInsideRoot(realDir, rootDir)) {
        continue;
      }

      let entries;
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        this.errorsCount++;
        continue;
      }

      for (const entry of entries) {
        if (this.cancelRequested) break;

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!shouldSkipDirectory(fullPath, rootDir)) {
            dirsToProcess.push(fullPath);
          }
        } else if (entry.isFile()) {
          this.scannedCount++;

          const ext = path.extname(entry.name).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) {
            continue;
          }

          // Found supported image on disk
          try {
            const stats = await fs.promises.stat(fullPath);
            const mtimeIso = stats.mtime.toISOString();
            const normalizedPath = normalizeSystemPath(fullPath);
            const photoId = crypto.createHash('sha256').update(normalizedPath).digest('hex').substring(0, 24);

            // Check if photo is already in local photo store and unchanged
            const existing = photoStore.getPhotoById(photoId);
            if (existing && existing.file_size === stats.size && existing.date_modified === mtimeIso) {
              discoveredPaths.add(normalizedPath);
              this.imagesFound++;
              ThumbnailService.ensureThumbnail(fullPath, photoId).catch(() => {});
              continue;
            }

            // Extract metadata (width, height, EXIF)
            const meta = await ThumbnailService.extractMetadata(fullPath);
            if (!meta || (!meta.width && !meta.height)) {
              this.errorsCount++;
              continue;
            }

            // Generate thumbnail
            const thumbPath = await ThumbnailService.ensureThumbnail(fullPath, photoId);
            if (!thumbPath) {
              this.errorsCount++;
              continue;
            }

            discoveredPaths.add(normalizedPath);
            this.imagesFound++;

            photoStore.upsertPhoto({
              id: photoId,
              filename: entry.name,
              filepath: normalizedPath,
              directory: path.dirname(normalizedPath),
              file_size: stats.size,
              width: meta.width || null,
              height: meta.height || null,
              mime_type: meta.mimeType || null,
              format: meta.format || ext.replace('.', ''),
              date_taken: meta.dateTaken || mtimeIso,
              date_modified: mtimeIso,
              camera_make: meta.cameraMake || null,
              camera_model: meta.cameraModel || null,
              thumbnail_path: thumbPath
            });

            // Yield execution briefly every 20 images
            if (this.imagesFound % 20 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
            }
          } catch (fileErr) {
            this.errorsCount++;
          }
        }
      }
    }

    // Mark deleted files that were not discovered during a complete scan
    if (!this.cancelRequested && discoveredPaths.size > 0) {
      const allPhotos = photoStore.getAllPhotos();
      for (const p of allPhotos) {
        if (!discoveredPaths.has(p.filepath)) {
          if (!fs.existsSync(p.filepath)) {
            photoStore.deletePhoto(p.id);
          }
        }
      }
    }
  }
}

export const scannerService = new ScannerService();
