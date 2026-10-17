import fs from 'fs';
import path from 'path';
import { db } from '../models/db.js';
import { config } from '../config/env.js';
import { isPathInsideRoot } from '../utils/pathValidator.js';
import { ThumbnailService } from './thumbnailService.js';

export class PhotoService {
  static getPhotos({
    page = 1,
    limit = 40,
    sort = 'date_desc',
    search = '',
    directory = '',
    format = '',
    albumId = '',
    favoriteOnly = false
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 40));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ['p.is_deleted = 0'];
    const params = [];

    if (search && search.trim()) {
      conditions.push('(p.filename LIKE ? OR p.directory LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (directory && directory.trim()) {
      conditions.push('p.directory = ?');
      params.push(directory.trim());
    }

    if (format && format.trim()) {
      conditions.push('p.format = ?');
      params.push(format.trim().toLowerCase());
    }

    if (albumId && albumId.trim()) {
      conditions.push('p.id IN (SELECT photo_id FROM album_photos WHERE album_id = ?)');
      params.push(albumId.trim());
    }

    if (favoriteOnly) {
      conditions.push('f.photo_id IS NOT NULL');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'p.date_taken DESC, p.date_modified DESC';
    switch (sort) {
      case 'date_asc':
        orderBy = 'p.date_taken ASC, p.date_modified ASC';
        break;
      case 'name_asc':
        orderBy = 'p.filename COLLATE NOCASE ASC';
        break;
      case 'name_desc':
        orderBy = 'p.filename COLLATE NOCASE DESC';
        break;
      case 'size_desc':
        orderBy = 'p.file_size DESC';
        break;
      case 'size_asc':
        orderBy = 'p.file_size ASC';
        break;
      default:
        orderBy = 'p.date_taken DESC, p.date_modified DESC';
    }

    // Count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM photos p
      LEFT JOIN favorites f ON p.id = f.photo_id
      ${whereClause}
    `;
    const total = db.prepare(countSql).get(...params).total;

    // Items query
    const itemsSql = `
      SELECT
        p.id,
        p.filename,
        p.directory,
        p.file_size,
        p.width,
        p.height,
        p.mime_type,
        p.format,
        p.date_taken,
        p.date_modified,
        p.camera_make,
        p.camera_model,
        CASE WHEN f.photo_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
      FROM photos p
      LEFT JOIN favorites f ON p.id = f.photo_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const items = db.prepare(itemsSql).all(...params, limitNum, offset).map(photo => ({
      ...photo,
      is_favorite: Boolean(photo.is_favorite)
    }));

    return {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  static getPhotoById(id) {
    const photo = db.prepare(`
      SELECT
        p.id,
        p.filename,
        p.filepath,
        p.directory,
        p.file_size,
        p.width,
        p.height,
        p.mime_type,
        p.format,
        p.date_taken,
        p.date_modified,
        p.camera_make,
        p.camera_model,
        CASE WHEN f.photo_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
      FROM photos p
      LEFT JOIN favorites f ON p.id = f.photo_id
      WHERE p.id = ? AND p.is_deleted = 0
    `).get(id);

    if (!photo) return null;

    // Find albums this photo belongs to
    const albums = db.prepare(`
      SELECT a.id, a.name
      FROM albums a
      JOIN album_photos ap ON a.id = ap.album_id
      WHERE ap.photo_id = ?
    `).all(id);

    return {
      ...photo,
      is_favorite: Boolean(photo.is_favorite),
      albums
    };
  }

  static async getOriginalPath(id) {
    const photo = db.prepare('SELECT filepath FROM photos WHERE id = ? AND is_deleted = 0').get(id);
    if (!photo) {
      throw new Error('Photo not found.');
    }

    const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'gallery_root'").get();
    const activeRoot = settingRow?.value || config.galleryRoot;

    const isInsideActive = isPathInsideRoot(photo.filepath, activeRoot);
    const isInsideEnv = isPathInsideRoot(photo.filepath, config.galleryRoot);

    if (!isInsideActive && !isInsideEnv) {
      throw new Error('Access denied: File is outside the permitted gallery root.');
    }

    if (!fs.existsSync(photo.filepath)) {
      throw new Error('Original file does not exist on disk.');
    }

    return photo.filepath;
  }

  static async getThumbnailPath(id) {
    const photo = db.prepare('SELECT filepath FROM photos WHERE id = ? AND is_deleted = 0').get(id);
    if (!photo) {
      return null;
    }

    const thumbPath = await ThumbnailService.ensureThumbnail(photo.filepath, id);
    if (thumbPath && fs.existsSync(thumbPath)) {
      return thumbPath;
    }

    return null;
  }

  static getUniqueDirectories() {
    return db.prepare(`
      SELECT DISTINCT directory, COUNT(*) as count
      FROM photos
      WHERE is_deleted = 0
      GROUP BY directory
      ORDER BY directory ASC
    `).all();
  }

  static getUniqueFormats() {
    return db.prepare(`
      SELECT DISTINCT format, COUNT(*) as count
      FROM photos
      WHERE is_deleted = 0 AND format IS NOT NULL
      GROUP BY format
      ORDER BY count DESC
    `).all();
  }
}
