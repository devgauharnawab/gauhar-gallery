import { Router } from 'express';
import { ScannerController } from '../controllers/scannerController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { scanLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticateToken);

router.get('/status', ScannerController.getStatus);
router.post('/start', scanLimiter, ScannerController.startScan);
router.post('/cancel', ScannerController.cancelScan);

export default router;
