import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env.js';

export class ThumbnailService {
  /**
   * Returns the file path for a thumbnail given the photo ID
   */
  static getThumbnailPath(photoId) {
    return path.join(config.thumbnailDir, `${photoId}.webp`);
  }

  /**
   * Generates a 1440x1440 High-Definition WebP preview/thumbnail for crisp full-screen viewing
   */
  static async ensureThumbnail(sourcePath, photoId) {
    const thumbPath = this.getThumbnailPath(photoId);

    if (fs.existsSync(thumbPath)) {
      return thumbPath;
    }

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return null;
    }

    try {
      await sharp(sourcePath, { failOn: 'none' })
        .rotate() // auto-orient based on EXIF
        .resize(1440, 1440, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 84, effort: 4 })
        .toFile(thumbPath);

      return thumbPath;
    } catch (err) {
      console.warn(`[ThumbnailService] Could not generate thumbnail for ${sourcePath}: ${err.message}`);
      return null;
    }
  }

  /**
   * Safely extracts dimensions, format, and EXIF metadata
   */
  static async extractMetadata(sourcePath) {
    try {
      const metadata = await sharp(sourcePath, { failOn: 'none' }).metadata();

      let dateTaken = null;
      let cameraMake = null;
      let cameraModel = null;

      // Try reading EXIF date if available
      if (metadata.exif) {
        try {
          const ExifParser = (await import('exif-parser')).default;
          const parser = ExifParser.create(metadata.exif);
          const result = parser.parse();
          if (result && result.tags) {
            if (result.tags.DateTimeOriginal) {
              dateTaken = new Date(result.tags.DateTimeOriginal * 1000).toISOString();
            } else if (result.tags.CreateDate) {
              dateTaken = new Date(result.tags.CreateDate * 1000).toISOString();
            }
            cameraMake = result.tags.Make || null;
            cameraModel = result.tags.Model || null;
          }
        } catch (exifErr) {
          // EXIF parsing failure is non-fatal
        }
      }

      return {
        width: metadata.width || null,
        height: metadata.height || null,
        format: metadata.format || path.extname(sourcePath).replace('.', '').toLowerCase(),
        mimeType: metadata.format ? `image/${metadata.format}` : 'image/jpeg',
        dateTaken,
        cameraMake,
        cameraModel
      };
    } catch (err) {
      // Fallback for BMP/corrupted/unusual files
      return {
        width: null,
        height: null,
        format: path.extname(sourcePath).replace('.', '').toLowerCase(),
        mimeType: 'application/octet-stream',
        dateTaken: null,
        cameraMake: null,
        cameraModel: null
      };
    }
  }
}
