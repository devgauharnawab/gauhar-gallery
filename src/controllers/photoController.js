import fs from 'fs';
import path from 'path';
import { PhotoService } from '../services/photoService.js';
import { config } from '../config/env.js';

export class PhotoController {
  static async getPhotos(req, res, next) {
    try {
      const { page, limit, sort, search, directory, format, albumId, favoriteOnly } = req.query;
      const result = PhotoService.getPhotos({
        page,
        limit,
        sort,
        search,
        directory,
        format,
        albumId,
        favoriteOnly: favoriteOnly === 'true' || favoriteOnly === '1'
      });

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPhotoById(req, res, next) {
    try {
      const { id } = req.params;
      const photo = PhotoService.getPhotoById(id);

      if (!photo) {
        return res.status(404).json({
          success: false,
          error: 'Photo not found.'
        });
      }

      res.status(200).json({
        success: true,
        data: photo
      });
    } catch (err) {
      next(err);
    }
  }

  static async getOriginal(req, res, next) {
    try {
      const { id } = req.params;
      const filePath = await PhotoService.getOriginalPath(id);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Original file not found on disk.'
        });
      }

      return res.sendFile(path.resolve(filePath), {
        maxAge: '7d',
        lastModified: true
      });
    } catch (err) {
      if (err.message.includes('Access denied')) {
        return res.status(403).json({ success: false, error: err.message });
      }
      if (err.message.includes('Photo not found')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      next(err);
    }
  }

  static async getThumbnail(req, res, next) {
    try {
      const { id } = req.params;
      const fastThumbPath = path.join(config.thumbnailDir, `${id}.webp`);

      // Ultra-fast path: bypass DB if pre-generated thumbnail exists
      if (fs.existsSync(fastThumbPath)) {
        return res.sendFile(path.resolve(fastThumbPath), {
          maxAge: '30d',
          immutable: true,
          lastModified: true,
          headers: {
            'Content-Type': 'image/webp'
          }
        });
      }

      // Fallback: generate on-demand if thumbnail not yet generated
      const thumbPath = await PhotoService.getThumbnailPath(id);
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        return res.status(404).json({
          success: false,
          error: 'Thumbnail could not be generated or found.'
        });
      }

      return res.sendFile(path.resolve(thumbPath), {
        maxAge: '30d',
        immutable: true,
        lastModified: true,
        headers: {
          'Content-Type': 'image/webp'
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMetadata(req, res, next) {
    try {
      const { id } = req.params;
      const photo = PhotoService.getPhotoById(id);

      if (!photo) {
        return res.status(404).json({
          success: false,
          error: 'Photo not found.'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: photo.id,
          filename: photo.filename,
          directory: photo.directory,
          fileSize: photo.file_size,
          width: photo.width,
          height: photo.height,
          mimeType: photo.mime_type,
          format: photo.format,
          dateTaken: photo.date_taken,
          dateModified: photo.date_modified,
          cameraMake: photo.camera_make,
          cameraModel: photo.camera_model,
          isFavorite: photo.is_favorite,
          albums: photo.albums
        }
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDirectories(req, res, next) {
    try {
      const directories = PhotoService.getUniqueDirectories();
      res.status(200).json({
        success: true,
        data: directories
      });
    } catch (err) {
      next(err);
    }
  }

  static async getFormats(req, res, next) {
    try {
      const formats = PhotoService.getUniqueFormats();
      res.status(200).json({
        success: true,
        data: formats
      });
    } catch (err) {
      next(err);
    }
  }
}
