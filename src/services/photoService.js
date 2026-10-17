import fs from 'fs';
import path from 'path';
import { photoStore } from './photoStore.js';
import { favoriteService } from './favoriteService.js';
import { albumService } from './albumService.js';
import { config } from '../config/env.js';
import { isPathInsideRoot } from '../utils/pathValidator.js';
import { ThumbnailService } from './thumbnailService.js';

export class PhotoService {
  static async getPhotos({
    page = 1,
    limit = 24,
    sort = 'date_desc',
    search = '',
    directory = '',
    format = '',
    albumId = '',
    favoriteOnly = false
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const skip = (pageNum - 1) * limitNum;

    let items = photoStore.getAllPhotos();

    // 1. Filter by Album (photos in that album folder on E: drive)
    if (albumId && albumId.trim()) {
      const album = await albumService.getAlbumById(albumId.trim());
      if (album && album.photos) {
        const albumPhotoIds = new Set(album.photos.map(p => p.id));
        items = items.filter(p => albumPhotoIds.has(p.id));
      } else {
        items = [];
      }
    }

    // 2. Filter by Favorites
    if (favoriteOnly) {
      items = items.filter(p => favoriteService.isFavorite(p.id));
    }

    // 3. Filter by Search Query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(p =>
        (p.filename && p.filename.toLowerCase().includes(q)) ||
        (p.directory && p.directory.toLowerCase().includes(q))
      );
    }

    // 4. Filter by Directory
    if (directory && directory.trim()) {
      const dirQ = directory.trim().toLowerCase();
      items = items.filter(p => p.directory && p.directory.toLowerCase() === dirQ);
    }

    // 5. Filter by Format
    if (format && format.trim()) {
      const fmtQ = format.trim().toLowerCase();
      items = items.filter(p => p.format && p.format.toLowerCase() === fmtQ);
    }

    // 6. Sort
    switch (sort) {
      case 'date_asc':
        items.sort((a, b) => new Date(a.date_taken || a.date_modified) - new Date(b.date_taken || b.date_modified));
        break;
      case 'name_asc':
        items.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case 'name_desc':
        items.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
      case 'size_desc':
        items.sort((a, b) => b.file_size - a.file_size);
        break;
      case 'size_asc':
        items.sort((a, b) => a.file_size - b.file_size);
        break;
      default: // date_desc
        items.sort((a, b) => new Date(b.date_taken || b.date_modified) - new Date(a.date_taken || a.date_modified));
    }

    const total = items.length;
    const paginated = items.slice(skip, skip + limitNum).map(p => ({
      ...p,
      is_favorite: favoriteService.isFavorite(p.id)
    }));

    return {
      items: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  static async getPhotoById(id) {
    const photo = photoStore.getPhotoById(id);
    if (!photo) return null;

    return {
      ...photo,
      is_favorite: favoriteService.isFavorite(id)
    };
  }

  static async getOriginalPath(id) {
    const photo = photoStore.getPhotoById(id);
    if (!photo) {
      throw new Error('Photo not found.');
    }

    // Ensure the file is not attempting path traversal
    if (photo.filepath.includes('..')) {
      throw new Error('Access denied: Invalid path traversal detected.');
    }

    return photo.filepath;
  }

  static async getThumbnailPath(id) {
    const photo = photoStore.getPhotoById(id);
    if (!photo) return null;

    if (photo.thumbnail_path && fs.existsSync(photo.thumbnail_path)) {
      return photo.thumbnail_path;
    }

    return await ThumbnailService.ensureThumbnail(photo.filepath, id);
  }

  static async getUniqueDirectories() {
    const all = photoStore.getAllPhotos();
    const map = new Map();

    for (const p of all) {
      const count = map.get(p.directory) || 0;
      map.set(p.directory, count + 1);
    }

    return Array.from(map.entries()).map(([directory, count]) => ({
      directory,
      count
    }));
  }

  static async getUniqueFormats() {
    const all = photoStore.getAllPhotos();
    const map = new Map();

    for (const p of all) {
      const f = (p.format || 'unknown').toLowerCase();
      const count = map.get(f) || 0;
      map.set(f, count + 1);
    }

    return Array.from(map.entries()).map(([format, count]) => ({
      format,
      count
    }));
  }
}
