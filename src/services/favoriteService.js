import { MongoFavorite } from '../models/favoriteMongo.js';
import { MongoPhoto } from '../models/photoMongo.js';
import { PhotoService } from './photoService.js';

export class FavoriteService {
  static async getFavorites(params = {}) {
    return await PhotoService.getPhotos({
      ...params,
      favoriteOnly: true
    });
  }

  static async addFavorite(photoId) {
    const photoExists = await MongoPhoto.exists({ _id: photoId, is_deleted: false });
    if (!photoExists) {
      throw new Error('Photo not found.');
    }

    await MongoFavorite.updateOne(
      { photoId },
      { $setOnInsert: { photoId, createdAt: new Date() } },
      { upsert: true }
    );
    return true;
  }

  static async removeFavorite(photoId) {
    const res = await MongoFavorite.deleteOne({ photoId });
    return res.deletedCount > 0;
  }

  static async isFavorite(photoId) {
    const exists = await MongoFavorite.exists({ photoId });
    return Boolean(exists);
  }
}
