import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '../models/db.js';
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
  }

  getStatus() {
    const state = db.prepare('SELECT * FROM scanner_state WHERE id = 1').get();
    return {
      status: this.isScanning ? 'scanning' : (state?.status || 'idle'),
      currentDirectory: this.isScanning ? this.currentDirectory : state?.current_directory || '',
      scannedFiles: this.isScanning ? this.scannedCount : state?.scanned_files || 0,
      imagesFound: this.isScanning ? this.imagesFound : state?.images_found || 0,
      errorsCount: this.isScanning ? this.errorsCount : state?.errors_count || 0,
      startTime: this.isScanning ? this.startTime : state?.start_time || null,
      endTime: state?.end_time || null,
      lastError: state?.last_error || null
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

    // Update scanner_state in DB
    db.prepare(`
      UPDATE scanner_state
      SET status = 'scanning', current_directory = ?, scanned_files = 0,
          images_found = 0, errors_count = 0, start_time = ?, end_time = NULL, last_error = NULL
      WHERE id = 1
    `).run(rootDir, this.startTime);

    // Launch scan asynchronously in background
    setImmediate(async () => {
      try {
        await this._runScan(rootDir);

        const status = this.cancelRequested ? 'cancelled' : 'completed';
        const endTime = new Date().toISOString();

        db.prepare(`
          UPDATE scanner_state
          SET status = ?, current_directory = '', scanned_files = ?,
              images_found = ?, errors_count = ?, end_time = ?
          WHERE id = 1
        `).run(status, this.scannedCount, this.imagesFound, this.errorsCount, endTime);

        console.log(`[Scanner] Scan ${status}. Scanned ${this.scannedCount} files, found ${this.imagesFound} images.`);
      } catch (err) {
        console.error('[Scanner] Scan failed:', err);
        db.prepare(`
          UPDATE scanner_state
          SET status = 'failed', current_directory = '', last_error = ?, end_time = ?
          WHERE id = 1
        `).run(err.message, new Date().toISOString());
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

    // Prepare DB statements for fast upsert
    const selectPhoto = db.prepare('SELECT id, file_size, date_modified FROM photos WHERE filepath = ?');
    const insertPhoto = db.prepare(`
      INSERT INTO photos (
        id, filename, filepath, directory, file_size, width, height,
        mime_type, format, date_taken, date_modified, camera_make, camera_model,
        thumbnail_path, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(filepath) DO UPDATE SET
        filename = excluded.filename,
        directory = excluded.directory,
        file_size = excluded.file_size,
        width = COALESCE(excluded.width, photos.width),
        height = COALESCE(excluded.height, photos.height),
        mime_type = excluded.mime_type,
        format = excluded.format,
        date_taken = COALESCE(excluded.date_taken, photos.date_taken),
        date_modified = excluded.date_modified,
        camera_make = COALESCE(excluded.camera_make, photos.camera_make),
        camera_model = COALESCE(excluded.camera_model, photos.camera_model),
        is_deleted = 0,
        updated_at = CURRENT_TIMESTAMP
    `);

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
        // Inaccessible directory (e.g. system folder permissions)
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
        // Permission denied or unreadable directory
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
            const existing = selectPhoto.get(normalizedPath);
            if (existing && existing.file_size === stats.size && existing.date_modified === mtimeIso) {
              discoveredPaths.add(normalizedPath);
              this.imagesFound++;
              ThumbnailService.ensureThumbnail(fullPath, existing.id).catch(() => {});
              continue;
            }

            // Extract metadata (width, height, EXIF)
            const meta = await ThumbnailService.extractMetadata(fullPath);
            if (!meta || (!meta.width && !meta.height)) {
              // File is corrupted or not a valid image
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

            insertPhoto.run(
              photoId,
              entry.name,
              normalizedPath,
              path.dirname(normalizedPath),
              stats.size,
              meta.width,
              meta.height,
              meta.mimeType,
              meta.format,
              meta.dateTaken || mtimeIso,
              mtimeIso,
              meta.cameraMake,
              meta.cameraModel,
              thumbPath
            );

            // Yield execution briefly every 20 images to prevent event loop starvation
            if (this.imagesFound % 20 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
              // Update state in database periodically
              db.prepare(`
                UPDATE scanner_state
                SET scanned_files = ?, images_found = ?, errors_count = ?, current_directory = ?
                WHERE id = 1
              `).run(this.scannedCount, this.imagesFound, this.errorsCount, currentDir);
            }
          } catch (fileErr) {
            this.errorsCount++;
          }
        }
      }
    }

    // Mark deleted files that were not discovered during a complete scan
    if (!this.cancelRequested && discoveredPaths.size > 0) {
      const allPhotos = db.prepare('SELECT id, filepath FROM photos WHERE is_deleted = 0').all();
      const markDeleted = db.prepare('UPDATE photos SET is_deleted = 1 WHERE id = ?');
      for (const p of allPhotos) {
        if (!discoveredPaths.has(p.filepath)) {
          // Verify with fs.existsSync
          if (!fs.existsSync(p.filepath)) {
            markDeleted.run(p.id);
          }
        }
      }
    }
  }
}

export const scannerService = new ScannerService();
