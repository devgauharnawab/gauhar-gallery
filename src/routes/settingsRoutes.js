import { Router } from 'express';
import { SettingsController } from '../controllers/settingsController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', SettingsController.getSettings);
router.put('/', requireAdmin, SettingsController.updateSettings);

export default router;
