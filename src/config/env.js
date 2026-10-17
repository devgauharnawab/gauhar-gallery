import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  galleryRoot: path.resolve(process.env.GALLERY_ROOT || 'E:\\'),
  jwtSecret: process.env.JWT_SECRET || 'fallback_family_gallery_dev_secret_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  thumbnailDir: path.resolve(__dirname, '../../', process.env.THUMBNAIL_DIR || './storage/thumbnails'),
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:4200',
  mongodbUri: process.env.MONGODB_URI || '',
  defaultAdminUsername: process.env.DEFAULT_ADMIN_USER || 'admin',
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@familygallery.local',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin'
};
