import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public routes
router.post('/login', loginLimiter, AuthController.login);
router.post('/logout', AuthController.logout);

// Protected routes
router.get('/me', authenticateToken, AuthController.getMe);
router.post('/users', authenticateToken, requireAdmin, AuthController.registerUser);

export default router;
