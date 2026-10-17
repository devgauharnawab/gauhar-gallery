import fs from 'fs';
import { db } from '../models/db.js';
import { config } from '../config/env.js';

export class DashboardService {
  static getStats() {
    const totalPhotos = db.prepare('SELECT COUNT(*) as count FROM photos WHERE is_deleted = 0').get().count;
    const totalAlbums = db.prepare('SELECT COUNT(*) as count FROM albums').get().count;
    const totalFavorites = db.prepare(`
      SELECT COUNT(*) as count
      FROM favorites f
      JOIN photos p ON f.photo_id = p.id
      WHERE p.is_deleted = 0
    `).get().count;

    const recentPhotos = db.prepare(`
      SELECT
        p.id,
        p.filename,
        p.directory,
        p.file_size,
        p.width,
        p.height,
        p.date_taken,
        p.date_modified,
        p.format,
        CASE WHEN f.photo_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
      FROM photos p
      LEFT JOIN favorites f ON p.id = f.photo_id
      WHERE p.is_deleted = 0
      ORDER BY p.created_at DESC, p.date_modified DESC
      LIMIT 8
    `).all().map(p => ({
      ...p,
      is_favorite: Boolean(p.is_favorite)
    }));

    const scannerState = db.prepare('SELECT * FROM scanner_state WHERE id = 1').get() || {};
    const driveConnected = fs.existsSync(config.galleryRoot);

    return {
      totalPhotos,
      totalAlbums,
      totalFavorites,
      driveConnected,
      galleryRoot: config.galleryRoot,
      recentPhotos,
      scanner: {
        status: scannerState.status || 'idle',
        scannedFiles: scannerState.scanned_files || 0,
        imagesFound: scannerState.images_found || 0,
        errorsCount: scannerState.errors_count || 0,
        startTime: scannerState.start_time,
        endTime: scannerState.end_time,
        lastError: scannerState.last_error
      }
    };
  }
}
