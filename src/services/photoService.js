import fs from 'fs';
import path from 'path';
import { MongoPhoto } from '../models/photoMongo.js';
import { MongoFavorite } from '../models/favoriteMongo.js';
import { MongoAlbum } from '../models/albumMongo.js';
import { MongoSetting } from '../models/settingMongo.js';
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
  }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const skip = (pageNum - 1) * limitNum;

    const query = { is_deleted: false };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [{ filename: regex }, { directory: regex }];
    }

    if (directory && directory.trim()) {
      query.directory = directory.trim();
    }

    if (format && format.trim()) {
      query.format = format.trim().toLowerCase();
    }

    if (albumId && albumId.trim()) {
      const album = await MongoAlbum.findById(albumId.trim()).lean();
      if (album && album.photos) {
        query._id = { $in: album.photos };
      } else {
        query._id = { $in: [] };
      }
    }

    if (favoriteOnly) {
      const favorites = await MongoFavorite.find({}, 'photoId').lean();
      const favIds = favorites.map(f => f.photoId);
      query._id = { $in: favIds };
    }

    let sortObj = { date_taken: -1, date_modified: -1 };
    switch (sort) {
      case 'date_asc':
        sortObj = { date_taken: 1, date_modified: 1 };
        break;
      case 'name_asc':
        sortObj = { filename: 1 };
        break;
      case 'name_desc':
        sortObj = { filename: -1 };
        break;
      case 'size_desc':
        sortObj = { file_size: -1 };
        break;
      case 'size_asc':
        sortObj = { file_size: 1 };
        break;
      default:
        sortObj = { date_taken: -1, date_modified: -1 };
    }

    const [total, rawPhotos] = await Promise.all([
      MongoPhoto.countDocuments(query),
      MongoPhoto.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    // Check favorites for this page's photos
    const photoIds = rawPhotos.map(p => p._id);
    const favSet = new Set(
      (await MongoFavorite.find({ photoId: { $in: photoIds } }, 'photoId').lean()).map(f => f.photoId)
    );

    const photos = rawPhotos.map(p => ({
      id: p._id,
      filename: p.filename,
      filepath: p.filepath,
      directory: p.directory,
      file_size: p.file_size,
      width: p.width,
      height: p.height,
      mime_type: p.mime_type,
      format: p.format,
      date_taken: p.date_taken,
      date_modified: p.date_modified,
      camera_make: p.camera_make,
      camera_model: p.camera_model,
      thumbnail_path: p.thumbnail_path,
      is_favorite: favSet.has(p._id)
    }));

    return {
      photos,
      items: photos,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  static async getPhotoById(id) {
    const photo = await MongoPhoto.findOne({ _id: id, is_deleted: false }).lean();
    if (!photo) return null;

    const isFav = await MongoFavorite.exists({ photoId: id });
    const albums = await MongoAlbum.find({ photos: id }, '_id name').lean();

    return {
      id: photo._id,
      filename: photo.filename,
      filepath: photo.filepath,
      directory: photo.directory,
      file_size: photo.file_size,
      width: photo.width,
      height: photo.height,
      mime_type: photo.mime_type,
      format: photo.format,
      date_taken: photo.date_taken,
      date_modified: photo.date_modified,
      camera_make: photo.camera_make,
      camera_model: photo.camera_model,
      is_favorite: Boolean(isFav),
      albums: albums.map(a => ({ id: a._id, name: a.name }))
    };
  }

  static async getOriginalPath(id) {
    const photo = await MongoPhoto.findOne({ _id: id, is_deleted: false }).lean();
    if (!photo) {
      throw new Error('Photo not found.');
    }

    const setting = await MongoSetting.findOne({ key: 'gallery_root' }).lean();
    const activeRoot = setting?.value || config.galleryRoot;

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
    const photo = await MongoPhoto.findOne({ _id: id, is_deleted: false }).lean();
    if (!photo) return null;

    const thumbPath = await ThumbnailService.ensureThumbnail(photo.filepath, id);
    if (thumbPath && fs.existsSync(thumbPath)) {
      return thumbPath;
    }
    return null;
  }

  static async getUniqueDirectories() {
    const res = await MongoPhoto.aggregate([
      { $match: { is_deleted: false } },
      { $group: { _id: '$directory', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { directory: '$_id', count: 1, _id: 0 } }
    ]);
    return res;
  }

  static async getUniqueFormats() {
    const res = await MongoPhoto.aggregate([
      { $match: { is_deleted: false, format: { $ne: null } } },
      { $group: { _id: '$format', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { format: '$_id', count: 1, _id: 0 } }
    ]);
    return res;
  }
}
