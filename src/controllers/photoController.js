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

        if (photo) {
          const displayName = photo.filename || 'Photo';
          const ext = path.extname(displayName).toLowerCase();
          const isVideo = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.3gp'].includes(ext);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
            <rect width="800" height="600" fill="#0f172a"/>
            <circle cx="400" cy="270" r="54" fill="${isVideo ? '#3b82f6' : '#334155'}"/>
            ${isVideo ? '<polygon points="386,244 426,270 386,296" fill="#ffffff"/>' : '<path d="M375 290 L390 265 L405 285 L415 272 L430 290 Z" fill="#94a3b8"/><circle cx="418" cy="258" r="5" fill="#cbd5e1"/>'}
            <text x="400" y="370" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif" font-size="18" font-weight="600" fill="#f8fafc" text-anchor="middle">${displayName}</text>
            <text x="400" y="405" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif" font-size="13" fill="#64748b" text-anchor="middle">${isVideo ? 'Video stream available on Home PC' : 'High resolution file stored on Home PC (E: drive)'}</text>
          </svg>`;
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.send(svg);
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
        // If this is a video file (.mp4, .mov, etc.), serve a smart video thumbnail SVG so browser never 404s
        const photo = photoStore.getPhotoById(id);
        const ext = path.extname(photo?.filename || '').toLowerCase();
        if (['.mp4', '.mov', '.mkv', '.avi', '.webm', '.3gp'].includes(ext)) {
          const displayName = photo?.filename ? (photo.filename.length > 28 ? photo.filename.slice(0, 25) + '...' : photo.filename) : 'Video';
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
            <rect width="600" height="400" fill="#0f172a"/>
            <circle cx="300" cy="180" r="46" fill="#3b82f6"/>
            <polygon points="288,158 322,180 288,202" fill="#ffffff"/>
            <text x="300" y="270" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="16" font-weight="600" fill="#f8fafc" text-anchor="middle">${displayName}</text>
            <rect x="250" y="300" width="100" height="24" rx="12" fill="#1e293b"/>
            <text x="300" y="316" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="500" fill="#94a3b8" text-anchor="middle">VIDEO</text>
          </svg>`;
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
          return res.send(svg);
        }

        // Photo card fallback for cloud environments
        if (photo) {
          const displayName = photo?.filename ? (photo.filename.length > 30 ? photo.filename.slice(0, 27) + '...' : photo.filename) : 'Photo';
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
            <rect width="600" height="400" fill="#1e293b"/>
            <circle cx="300" cy="175" r="40" fill="#334155"/>
            <path d="M280 190 L292 170 L304 185 L312 175 L324 190 Z" fill="#94a3b8"/>
            <circle cx="314" cy="165" r="4" fill="#cbd5e1"/>
            <text x="300" y="255" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="500" fill="#e2e8f0" text-anchor="middle">${displayName}</text>
            <text x="300" y="280" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Preview stored on Home PC</text>
          </svg>`;
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(svg);
        }

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
