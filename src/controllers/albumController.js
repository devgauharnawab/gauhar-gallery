import { AlbumService } from '../services/albumService.js';

export class AlbumController {
  static async getAlbums(req, res, next) {
    try {
      const albums = await AlbumService.getAlbums();
      res.status(200).json({
        success: true,
        data: albums
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAlbumById(req, res, next) {
    try {
      const { id } = req.params;
      const album = await AlbumService.getAlbumById(id);

      if (!album) {
        return res.status(404).json({
          success: false,
          error: 'Album not found.'
        });
      }

      res.status(200).json({
        success: true,
        data: album
      });
    } catch (err) {
      next(err);
    }
  }

  static async createAlbum(req, res, next) {
    try {
      const { name, description, coverPhotoId } = req.body;
      const album = await AlbumService.createAlbum(name, description, coverPhotoId);
      res.status(201).json({
        success: true,
        message: 'Album created successfully.',
        data: album
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  static async updateAlbum(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description, coverPhotoId } = req.body;
      const updated = await AlbumService.updateAlbum(id, { name, description, coverPhotoId });
      res.status(200).json({
        success: true,
        message: 'Album updated successfully.',
        data: updated
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  static async deleteAlbum(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await AlbumService.deleteAlbum(id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Album not found.'
        });
      }
      res.status(200).json({
        success: true,
        message: 'Album deleted successfully.'
      });
    } catch (err) {
      next(err);
    }
  }

  static async addPhotoToAlbum(req, res, next) {
    try {
      const { id } = req.params;
      const { photoId } = req.body;

      if (!photoId) {
        return res.status(400).json({
          success: false,
          error: 'photoId is required in request body.'
        });
      }

      await AlbumService.addPhotoToAlbum(id, photoId);
      res.status(200).json({
        success: true,
        message: 'Photo added to album.'
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  static async removePhotoFromAlbum(req, res, next) {
    try {
      const { id, photoId } = req.params;
      await AlbumService.removePhotoFromAlbum(id, photoId);
      res.status(200).json({
        success: true,
        message: 'Photo removed from album.'
      });
    } catch (err) {
      next(err);
    }
  }
}
