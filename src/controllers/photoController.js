import fs from 'fs';
import path from 'path';
import { PhotoService } from '../services/photoService.js';
import { photoStore } from '../services/photoStore.js';
import { config } from '../config/env.js';
import { settingsService } from '../services/settingsService.js';

export class PhotoController {
  static async getPhotos(req, res, next) {
    try {
      const { page, limit, sort, search, directory, format, albumId, favoriteOnly } = req.query;
      const result = await PhotoService.getPhotos({
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
      const photo = await PhotoService.getPhotoById(id);

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
      const isDownload = req.query.download === 'true' || req.query.download === '1';
      const photo = photoStore.getPhotoById(id);
      const filePath = await PhotoService.getOriginalPath(id);

      const downloadFileName = photo?.filename || (filePath ? path.basename(filePath) : `${id}.jpg`);

      if (!fs.existsSync(filePath)) {
        // 1. Check if a Remote Bridge / Home PC Tunnel is active (e.g. Railway bridging to Home PC)
        const remoteBridge = (settingsService.settings && settingsService.settings.remote_bridge_url) || process.env.HOME_TUNNEL_URL || process.env.REMOTE_BRIDGE_URL;
        if (remoteBridge && !req.query.internal) {
          try {
            const cleanBridge = remoteBridge.replace(/\/+$/, '');
            const bridgeUrl = `${cleanBridge}/photos/${id}/${isDownload ? 'download' : 'original'}?internal=true`;
            const bridgeRes = await fetch(bridgeUrl, {
              headers: {
                'Authorization': req.headers['authorization'] || ''
              },
              signal: AbortSignal.timeout(12000)
            });

            if (bridgeRes.ok && bridgeRes.body) {
              if (isDownload) {
                res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
              }
              res.setHeader('Content-Type', bridgeRes.headers.get('content-type') || 'image/jpeg');
              const cl = bridgeRes.headers.get('content-length');
              if (cl) res.setHeader('Content-Length', cl);
              res.setHeader('X-Photo-Quality', 'original-bridged');
              const { Readable } = await import('stream');
              return Readable.fromWeb(bridgeRes.body).pipe(res);
            }
          } catch (bridgeErr) {
            console.warn('[PhotoController] Remote bridge download failed, trying preview fallback:', bridgeErr.message);
          }
        }

        // 2. Fallback: If original RAW file is not on this server (e.g. cloud host without E: drive and Home PC is offline),
        // serve the high-res WebP preview thumbnail so user can still view and download the photo!
        const fastThumbPath = path.join(config.thumbnailDir, `${id}.webp`);
        if (fs.existsSync(fastThumbPath)) {
          res.setHeader('X-Photo-Quality', 'preview-fallback');
          if (isDownload) {
            return res.download(path.resolve(fastThumbPath), downloadFileName);
          }
          return res.sendFile(path.resolve(fastThumbPath), {
            maxAge: '7d',
            lastModified: true,
            headers: {
              'Content-Type': 'image/webp',
              'X-Photo-Quality': 'preview-fallback'
            }
          });
        }

        return res.status(404).json({
          success: false,
          error: 'Original file not found on disk.'
        });
      }

      res.setHeader('X-Photo-Quality', 'original');
      if (isDownload) {
        return res.download(path.resolve(filePath), downloadFileName);
      }

      return res.sendFile(path.resolve(filePath), {
        maxAge: '7d',
        lastModified: true,
        headers: {
          'X-Photo-Quality': 'original'
        }
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

  static async downloadOriginal(req, res, next) {
    req.query.download = 'true';
    return PhotoController.getOriginal(req, res, next);
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
      const photo = await PhotoService.getPhotoById(id);

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
      const directories = await PhotoService.getUniqueDirectories();
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
      const formats = await PhotoService.getUniqueFormats();
      res.status(200).json({
        success: true,
        data: formats
      });
    } catch (err) {
      next(err);
    }
  }
}
