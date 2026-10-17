import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoPhoto } from '../models/photoMongo.js';
import { MongoScannerState } from '../models/scannerStateMongo.js';
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
    this._periodicTimer = null;
  }

  async getStatus() {
    if (this.isScanning) {
      return {
        status: 'scanning',
        currentDirectory: this.currentDirectory,
        scannedFiles: this.scannedCount,
        imagesFound: this.imagesFound,
        errorsCount: this.errorsCount,
        startTime: this.startTime,
        endTime: null,
        lastError: null
      };
    }

    try {
      const state = await MongoScannerState.findById('scanner_1').lean();
      return {
        status: state?.status || 'idle',
        currentDirectory: state?.currentDirectory || '',
        scannedFiles: state?.scannedFiles || 0,
        imagesFound: state?.imagesFound || 0,
        errorsCount: state?.errorsCount || 0,
        startTime: state?.startTime ? new Date(state.startTime).toISOString() : null,
        endTime: state?.endTime ? new Date(state.endTime).toISOString() : null,
        lastError: state?.lastError || null
      };
    } catch (err) {
      return {
        status: 'idle',
        currentDirectory: '',
        scannedFiles: 0,
        imagesFound: 0,
        errorsCount: 0,
        startTime: null,
        endTime: null,
        lastError: null
      };
    }
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
    console.log(`[Scanner] Continuous background scanning active (every ${intervalMinutes}m).`);
    this._periodicTimer = setInterval(async () => {
      if (!this.isScanning) {
        console.log('[Scanner] Continuous background scan checking for new photos...');
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

    // Verify root directory exists and is accessible
    if (!fs.existsSync(rootDir)) {
      throw new Error(`Configured gallery root directory does not exist or is not connected: ${rootDir}`);
    }

    this.isScanning = true;
    this.cancelRequested = false;
    this.scannedCount = 0;
    this.imagesFound = 0;
    this.errorsCount = 0;
    this.startTime = new Date().toISOString();
    this.currentDirectory = rootDir;

    // Update scanner state in MongoDB
    try {
      await MongoScannerState.findByIdAndUpdate(
        'scanner_1',
        {
          status: 'scanning',
          currentDirectory: rootDir,
          scannedFiles: 0,
          imagesFound: 0,
          errorsCount: 0,
          startTime: new Date(this.startTime),
          endTime: null,
          lastError: null
        },
        { upsert: true }
      );
    } catch (e) {
      console.warn('[Scanner] Could not record initial scan state to MongoDB:', e.message);
    }

    // Launch scan asynchronously in background
    setImmediate(async () => {
      try {
        await this._runScan(rootDir);

        const status = this.cancelRequested ? 'cancelled' : 'completed';
        const endTime = new Date();

        await MongoScannerState.findByIdAndUpdate('scanner_1', {
          status,
          currentDirectory: '',
          scannedFiles: this.scannedCount,
          imagesFound: this.imagesFound,
          errorsCount: this.errorsCount,
          endTime
        }).catch(() => {});

        console.log(`[Scanner] Scan ${status}. Scanned ${this.scannedCount} files, found ${this.imagesFound} images.`);
      } catch (err) {
        console.error('[Scanner] Scan failed:', err);
        await MongoScannerState.findByIdAndUpdate('scanner_1', {
          status: 'failed',
          currentDirectory: '',
          lastError: err.message,
          endTime: new Date()
        }).catch(() => {});
      } finally {
        this.isScanning = false;
        this.cancelRequested = false;
      }
    });

    return { message: 'Scan started in background.', rootDir };
  }

  async _runScan(rootDir) {
    const dirsToProcess = [rootDir];
    const visitedRealPaths = new Set();
    const discoveredPaths = new Set();

    // In-memory cache of already indexed photos to avoid redundant remote MongoDB network round-trips
    const existingPhotosMap = new Map();
    try {
      const existingDocs = await MongoPhoto.find(
        { is_deleted: false },
        { filepath: 1, file_size: 1, date_modified: 1 }
      ).lean();

      for (const doc of existingDocs) {
        existingPhotosMap.set(doc.filepath, {
          id: doc._id,
          file_size: doc.file_size,
          date_modified: doc.date_modified ? new Date(doc.date_modified).toISOString() : null
        });
      }
      console.log(`[Scanner] Loaded ${existingPhotosMap.size} existing photos into fast index cache.`);
    } catch (e) {
      console.warn('[Scanner] Pre-fetch cache note:', e.message);
    }

    while (dirsToProcess.length > 0) {
      if (this.cancelRequested) {
        console.log('[Scanner] Scan cancellation acknowledged.');
        break;
      }

      const currentDir = dirsToProcess.shift();
      this.currentDirectory = currentDir;

      // Avoid following circular links or traversing outside root
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
        continue; // Discard symlinks leading outside root
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

          // We found a supported image
          try {
            const stats = await fs.promises.stat(fullPath);
            const mtimeIso = stats.mtime.toISOString();
            const normalizedPath = normalizeSystemPath(fullPath);
            const photoId = crypto.createHash('sha256').update(normalizedPath).digest('hex').substring(0, 24);

            // Check if photo is already indexed and unchanged
            const existing = existingPhotosMap.get(normalizedPath);
            if (existing && existing.file_size === stats.size && existing.date_modified === mtimeIso) {
              discoveredPaths.add(normalizedPath);
              this.imagesFound++;
              ThumbnailService.ensureThumbnail(fullPath, existing.id).catch(() => {});
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

            await MongoPhoto.findOneAndUpdate(
              { _id: photoId },
              {
                _id: photoId,
                filename: entry.name,
                filepath: normalizedPath,
                directory: path.dirname(normalizedPath),
                file_size: stats.size,
                width: meta.width || null,
                height: meta.height || null,
                mime_type: meta.mimeType || null,
                format: meta.format || null,
                date_taken: meta.dateTaken ? new Date(meta.dateTaken) : stats.mtime,
                date_modified: stats.mtime,
                camera_make: meta.cameraMake || null,
                camera_model: meta.cameraModel || null,
                thumbnail_path: thumbPath,
                is_deleted: false
              },
              { upsert: true }
            );

            existingPhotosMap.set(normalizedPath, {
              id: photoId,
              file_size: stats.size,
              date_modified: mtimeIso
            });

            // Yield execution briefly every 20 images to prevent event loop starvation
            if (this.imagesFound % 20 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
              await MongoScannerState.findByIdAndUpdate('scanner_1', {
                scannedFiles: this.scannedCount,
                imagesFound: this.imagesFound,
                errorsCount: this.errorsCount,
                currentDirectory: currentDir
              }).catch(() => {});
            }
          } catch (fileErr) {
            this.errorsCount++;
          }
        }
      }
    }

    // Mark deleted files that were not discovered during a complete scan
    if (!this.cancelRequested && discoveredPaths.size > 0) {
      const missingPhotoIds = [];
      for (const [fpath, p] of existingPhotosMap.entries()) {
        if (!discoveredPaths.has(fpath)) {
          if (!fs.existsSync(fpath)) {
            missingPhotoIds.push(p.id);
          }
        }
      }
      if (missingPhotoIds.length > 0) {
        await MongoPhoto.updateMany({ _id: { $in: missingPhotoIds } }, { is_deleted: true });
        console.log(`[Scanner] Marked ${missingPhotoIds.length} deleted/moved photos.`);
      }
    }
  }
}

export const scannerService = new ScannerService();
