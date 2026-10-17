import { FavoriteService } from '../services/favoriteService.js';

export class FavoriteController {
  static async getFavorites(req, res, next) {
    try {
      const { page, limit, sort, search } = req.query;
      const result = await FavoriteService.getFavorites({ page, limit, sort, search });
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  static async addFavorite(req, res, next) {
    try {
      const { photoId } = req.params;
      await FavoriteService.addFavorite(photoId);
      res.status(200).json({
        success: true,
        message: 'Photo added to favorites.'
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  static async removeFavorite(req, res, next) {
    try {
      const { photoId } = req.params;
      await FavoriteService.removeFavorite(photoId);
      res.status(200).json({
        success: true,
        message: 'Photo removed from favorites.'
      });
    } catch (err) {
      next(err);
    }
  }
}
