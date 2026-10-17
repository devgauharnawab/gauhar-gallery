import { db } from '../models/db.js';
import { PhotoService } from './photoService.js';

export class FavoriteService {
  static getFavorites(params = {}) {
    return PhotoService.getPhotos({
      ...params,
      favoriteOnly: true
    });
  }

  static addFavorite(photoId) {
    const photo = db.prepare('SELECT id FROM photos WHERE id = ? AND is_deleted = 0').get(photoId);
    if (!photo) {
      throw new Error('Photo not found.');
    }

    db.prepare('INSERT OR IGNORE INTO favorites (photo_id) VALUES (?)').run(photoId);
    return true;
  }

  static removeFavorite(photoId) {
    const result = db.prepare('DELETE FROM favorites WHERE photo_id = ?').run(photoId);
    return result.changes > 0;
  }

  static isFavorite(photoId) {
    const fav = db.prepare('SELECT photo_id FROM favorites WHERE photo_id = ?').get(photoId);
    return Boolean(fav);
  }
}
