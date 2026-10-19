import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import photoRoutes from './routes/photoRoutes.js';
import albumRoutes from './routes/albumRoutes.js';
import favoriteRoutes from './routes/favoriteRoutes.js';
import scannerRoutes from './routes/scannerRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(cors({
    origin: (origin, callback) => {
      // Allow localhost, configured origin, and local Wi-Fi network devices (mobile phones/tablets)
      if (
        !origin ||
        origin === config.frontendOrigin ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for local private family gallery
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition']
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Global rate limiter on /api
  app.use('/api', apiLimiter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      galleryRoot: config.galleryRoot
    });
  });

  // Mount API endpoints
  app.use('/api/auth', authRoutes);
  app.use('/api/photos', photoRoutes);
  app.use('/api/albums', albumRoutes);
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/scanner', scannerRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  // Serve static frontend build if present (Unified Railway / production hosting)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const frontendDistPath = path.resolve(__dirname, '../../frontend/dist/frontend/browser');
  const localPublicPath = path.resolve(__dirname, '../public');

  const staticDir = fs.existsSync(frontendDistPath)
    ? frontendDistPath
    : fs.existsSync(localPublicPath)
      ? localPublicPath
      : null;

  if (staticDir) {
    app.use(express.static(staticDir, {
      etag: true,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
