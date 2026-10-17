import fs from 'fs';
import { photoStore } from './photoStore.js';
import { albumService } from './albumService.js';
import { favoriteService } from './favoriteService.js';
import { scannerService } from './scannerService.js';
import { config } from '../config/env.js';

export class DashboardService {
  static async getStats() {
    const photos = photoStore.getAllPhotos();
    const albums = await albumService.getAlbums();
    const totalFavorites = favoriteService.count();

    let storageUsed = 0;
    const formatMap = {};

    for (const p of photos) {
      storageUsed += (p.file_size || 0);
      const fmt = (p.format || 'other').toLowerCase();
      formatMap[fmt] = (formatMap[fmt] || 0) + 1;
    }

    // Sort newest 12 photos for dashboard
    const sorted = [...photos].sort((a, b) => {
      const dateA = new Date(a.date_taken || a.date_modified || 0);
      const dateB = new Date(b.date_taken || b.date_modified || 0);
      return dateB - dateA;
    });

    const recentPhotos = sorted.slice(0, 12).map(p => ({
      ...p,
      is_favorite: favoriteService.isFavorite(p.id)
    }));

    const driveConnected = fs.existsSync(config.galleryRoot);
    const scannerStatus = await scannerService.getStatus();

    return {
      totalPhotos: photos.length,
      totalAlbums: albums.length,
      totalFavorites,
      storageUsedBytes: storageUsed,
      storageUsedFormatted: formatBytes(storageUsed),
      formatsBreakdown: formatMap,
      recentPhotos,
      driveConnected,
      galleryRoot: config.galleryRoot,
      scannerStatus,
      databaseType: 'Local Filesystem (Computer is the Database - Zero Photos in Database)'
    };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
