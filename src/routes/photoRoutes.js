import { Router } from 'express';
import { PhotoController } from '../controllers/photoController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Require authentication for all photo endpoints
router.use(authenticateToken);

// Directories and formats lists (must precede /:id)
router.get('/directories', PhotoController.getDirectories);
router.get('/formats', PhotoController.getFormats);

// Photo collection
router.get('/', PhotoController.getPhotos);

// Single photo endpoints
router.get('/:id', PhotoController.getPhotoById);
router.get('/:id/original', PhotoController.getOriginal);
router.get('/:id/download', PhotoController.downloadOriginal);
router.get('/:id/thumbnail', PhotoController.getThumbnail);
router.get('/:id/metadata', PhotoController.getMetadata);

export default router;
