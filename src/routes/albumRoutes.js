import { Router } from 'express';
import { AlbumController } from '../controllers/albumController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', AlbumController.getAlbums);
router.post('/', AlbumController.createAlbum);

router.get('/:id', AlbumController.getAlbumById);
router.put('/:id', AlbumController.updateAlbum);
router.delete('/:id', AlbumController.deleteAlbum);

router.post('/:id/photos', AlbumController.addPhotoToAlbum);
router.delete('/:id/photos/:photoId', AlbumController.removePhotoFromAlbum);

export default router;
