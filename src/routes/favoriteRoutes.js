import { Router } from 'express';
import { FavoriteController } from '../controllers/favoriteController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', FavoriteController.getFavorites);
router.post('/:photoId', FavoriteController.addFavorite);
router.delete('/:photoId', FavoriteController.removeFavorite);

export default router;
