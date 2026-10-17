import crypto from 'crypto';
import { db } from '../models/db.js';

export class AlbumService {
  static getAlbums() {
    return db.prepare(`
      SELECT
        a.id,
        a.name,
        a.description,
        a.cover_photo_id,
        a.created_at,
        a.updated_at,
        COUNT(ap.photo_id) as photo_count
      FROM albums a
      LEFT JOIN album_photos ap ON a.id = ap.album_id
      GROUP BY a.id
      ORDER BY a.name COLLATE NOCASE ASC
    `).all();
  }

  static getAlbumById(id) {
    const album = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.description,
        a.cover_photo_id,
        a.created_at,
        a.updated_at,
        COUNT(ap.photo_id) as photo_count
      FROM albums a
      LEFT JOIN album_photos ap ON a.id = ap.album_id
      WHERE a.id = ?
      GROUP BY a.id
    `).get(id);

    if (!album) return null;

    // Get photos in this album
    const photos = db.prepare(`
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
        CASE WHEN f.photo_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
      FROM album_photos ap
      JOIN photos p ON ap.photo_id = p.id
      LEFT JOIN favorites f ON p.id = f.photo_id
      WHERE ap.album_id = ? AND p.is_deleted = 0
      ORDER BY ap.added_at DESC
    `).all(id).map(p => ({
      ...p,
      is_favorite: Boolean(p.is_favorite)
    }));

    return {
      ...album,
      photos
    };
  }

  static createAlbum(name, description = '', coverPhotoId = null) {
    if (!name || !name.trim()) {
      throw new Error('Album name is required.');
    }

    const id = 'album-' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO albums (id, name, description, cover_photo_id)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim(), description ? description.trim() : '', coverPhotoId || null);

    return this.getAlbumById(id);
  }

  static updateAlbum(id, { name, description, coverPhotoId }) {
    const existing = db.prepare('SELECT id FROM albums WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Album not found.');
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description.trim());
    }
    if (coverPhotoId !== undefined) {
      updates.push('cover_photo_id = ?');
      params.push(coverPhotoId);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.prepare(`UPDATE albums SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    return this.getAlbumById(id);
  }

  static deleteAlbum(id) {
    const result = db.prepare('DELETE FROM albums WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static addPhotoToAlbum(albumId, photoId) {
    const album = db.prepare('SELECT id, cover_photo_id FROM albums WHERE id = ?').get(albumId);
    if (!album) {
      throw new Error('Album not found.');
    }

    const photo = db.prepare('SELECT id FROM photos WHERE id = ? AND is_deleted = 0').get(photoId);
    if (!photo) {
      throw new Error('Photo not found.');
    }

    db.prepare(`
      INSERT OR IGNORE INTO album_photos (album_id, photo_id)
      VALUES (?, ?)
    `).run(albumId, photoId);

    // If album doesn't have a cover photo yet, set this photo as cover
    if (!album.cover_photo_id) {
      db.prepare('UPDATE albums SET cover_photo_id = ? WHERE id = ?').run(photoId, albumId);
    }

    return true;
  }

  static removePhotoFromAlbum(albumId, photoId) {
    const result = db.prepare('DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?').run(albumId, photoId);

    // If removed photo was the cover photo, pick another photo or set to null
    const album = db.prepare('SELECT cover_photo_id FROM albums WHERE id = ?').get(albumId);
    if (album && album.cover_photo_id === photoId) {
      const remainingPhoto = db.prepare('SELECT photo_id FROM album_photos WHERE album_id = ? LIMIT 1').get(albumId);
      const newCover = remainingPhoto ? remainingPhoto.photo_id : null;
      db.prepare('UPDATE albums SET cover_photo_id = ? WHERE id = ?').run(newCover, albumId);
    }

    return result.changes > 0;
  }
}
