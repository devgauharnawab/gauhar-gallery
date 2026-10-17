import fs from 'fs';
import { MongoPhoto } from '../models/photoMongo.js';
import { MongoAlbum } from '../models/albumMongo.js';
import { MongoFavorite } from '../models/favoriteMongo.js';
import { MongoScannerState } from '../models/scannerStateMongo.js';
import { config } from '../config/env.js';

export class DashboardService {
  static async getStats() {
    const [totalPhotos, totalAlbums, totalFavorites, scannerState, recentList] = await Promise.all([
      MongoPhoto.countDocuments({ is_deleted: false }),
      MongoAlbum.countDocuments(),
      MongoFavorite.countDocuments(),
      MongoScannerState.findById('scanner_1').lean(),
      MongoPhoto.find({ is_deleted: false })
        .sort({ createdAt: -1, date_modified: -1 })
        .limit(8)
        .lean()
    ]);

    const recentIds = recentList.map(p => p._id);
    const favSet = new Set(
      (await MongoFavorite.find({ photoId: { $in: recentIds } }, 'photoId').lean()).map(f => f.photoId)
    );

    const recentPhotos = recentList.map(p => ({
      id: p._id,
      filename: p.filename,
      directory: p.directory,
      file_size: p.file_size,
      width: p.width,
      height: p.height,
      date_taken: p.date_taken,
      date_modified: p.date_modified,
      format: p.format,
      is_favorite: favSet.has(p._id)
    }));

    const driveConnected = fs.existsSync(config.galleryRoot);

    return {
      totalPhotos,
      totalAlbums,
      totalFavorites,
      driveConnected,
      galleryRoot: config.galleryRoot,
      recentPhotos,
      scanner: {
        status: scannerState?.status || 'idle',
        scannedFiles: scannerState?.scannedFiles || 0,
        imagesFound: scannerState?.imagesFound || 0,
        errorsCount: scannerState?.errorsCount || 0,
        startTime: scannerState?.startTime || null,
        endTime: scannerState?.endTime || null,
        lastError: scannerState?.lastError || null
      }
    };
  }
}
