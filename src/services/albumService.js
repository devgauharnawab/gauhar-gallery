import crypto from 'crypto';
import { MongoAlbum } from '../models/albumMongo.js';
import { MongoPhoto } from '../models/photoMongo.js';
import { MongoFavorite } from '../models/favoriteMongo.js';

export class AlbumService {
  static async getAlbums() {
    const albums = await MongoAlbum.find().sort({ name: 1 }).lean();
    return albums.map(a => ({
      id: a._id,
      name: a.name,
      description: a.description || '',
      cover_photo_id: a.coverPhotoId || (a.photos && a.photos.length > 0 ? a.photos[0] : null),
      photo_count: a.photos ? a.photos.length : 0,
      created_at: a.createdAt,
      updated_at: a.updatedAt
    }));
  }

  static async getAlbumById(id) {
    const album = await MongoAlbum.findById(id).lean();
    if (!album) return null;

    const photoIds = album.photos || [];
    const rawPhotos = await MongoPhoto.find({ _id: { $in: photoIds }, is_deleted: false }).lean();

    const favSet = new Set(
      (await MongoFavorite.find({ photoId: { $in: photoIds } }, 'photoId').lean()).map(f => f.photoId)
    );

    const photoMap = new Map();
    for (const p of rawPhotos) {
      photoMap.set(p._id, {
        id: p._id,
        filename: p.filename,
        directory: p.directory,
        file_size: p.file_size,
        width: p.width,
        height: p.height,
        mime_type: p.mime_type,
        format: p.format,
        date_taken: p.date_taken,
        date_modified: p.date_modified,
        is_favorite: favSet.has(p._id)
      });
    }

    // Preserve order of album photos
    const photos = [];
    for (const pid of photoIds) {
      if (photoMap.has(pid)) {
        photos.push(photoMap.get(pid));
      }
    }

    return {
      id: album._id,
      name: album.name,
      description: album.description || '',
      cover_photo_id: album.coverPhotoId || (photos.length > 0 ? photos[0].id : null),
      photo_count: photos.length,
      created_at: album.createdAt,
      updated_at: album.updatedAt,
      photos
    };
  }

  static async createAlbum(name, description = '', coverPhotoId = null) {
    if (!name || !name.trim()) {
      throw new Error('Album name is required.');
    }

    const id = 'album-' + crypto.randomUUID();
    await MongoAlbum.create({
      _id: id,
      name: name.trim(),
      description: description ? description.trim() : '',
      coverPhotoId: coverPhotoId || null,
      photos: []
    });

    return await this.getAlbumById(id);
  }

  static async updateAlbum(id, { name, description, coverPhotoId }) {
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (coverPhotoId !== undefined) updates.coverPhotoId = coverPhotoId;

    const album = await MongoAlbum.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!album) {
      throw new Error('Album not found.');
    }

    return await this.getAlbumById(id);
  }

  static async deleteAlbum(id) {
    const res = await MongoAlbum.deleteOne({ _id: id });
    return res.deletedCount > 0;
  }

  static async addPhotoToAlbum(albumId, photoId) {
    const album = await MongoAlbum.findById(albumId);
    if (!album) {
      throw new Error('Album not found.');
    }

    const photoExists = await MongoPhoto.exists({ _id: photoId, is_deleted: false });
    if (!photoExists) {
      throw new Error('Photo not found.');
    }

    if (!album.photos.includes(photoId)) {
      album.photos.push(photoId);
      if (!album.coverPhotoId) {
        album.coverPhotoId = photoId;
      }
      await album.save();
    }

    return true;
  }

  static async removePhotoFromAlbum(albumId, photoId) {
    const album = await MongoAlbum.findById(albumId);
    if (!album) return false;

    album.photos = album.photos.filter(p => p !== photoId);
    if (album.coverPhotoId === photoId) {
      album.coverPhotoId = album.photos.length > 0 ? album.photos[0] : null;
    }
    await album.save();
    return true;
  }
}
