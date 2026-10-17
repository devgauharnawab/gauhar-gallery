import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';

// Ensure database directory exists
const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure thumbnails directory exists
if (!fs.existsSync(config.thumbnailDir)) {
  fs.mkdirSync(config.thumbnailDir, { recursive: true });
}

export const db = new Database(config.databasePath);

// Enable WAL mode for high concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT UNIQUE NOT NULL,
      directory TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      mime_type TEXT,
      format TEXT,
      date_taken DATETIME,
      date_modified DATETIME NOT NULL,
      camera_make TEXT,
      camera_model TEXT,
      thumbnail_path TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_photos_directory ON photos(directory);
    CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(date_taken);
    CREATE INDEX IF NOT EXISTS idx_photos_date_modified ON photos(date_modified);
    CREATE INDEX IF NOT EXISTS idx_photos_is_deleted ON photos(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_photos_active_date ON photos(is_deleted, date_taken DESC, date_modified DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_active_name ON photos(is_deleted, filename COLLATE NOCASE ASC);

    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_photo_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS album_photos (
      album_id TEXT NOT NULL,
      photo_id TEXT NOT NULL,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (album_id, photo_id),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_album_photos_photo ON album_photos(photo_id);

    CREATE TABLE IF NOT EXISTS favorites (
      photo_id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scanner_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      status TEXT NOT NULL DEFAULT 'idle',
      current_directory TEXT,
      scanned_files INTEGER DEFAULT 0,
      images_found INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      start_time DATETIME,
      end_time DATETIME,
      last_error TEXT
    );
  `);

  // Initialize scanner_state row if missing
  const stateCheck = db.prepare('SELECT id FROM scanner_state WHERE id = 1').get();
  if (!stateCheck) {
    db.prepare(`
      INSERT INTO scanner_state (id, status, scanned_files, images_found, errors_count)
      VALUES (1, 'idle', 0, 0, 0)
    `).run();
  }

  // Initialize default dummy admin user if missing or update to easy dummy credentials
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(config.defaultAdminPassword, salt);

  if (!existingAdmin) {
    const adminId = 'admin-' + Date.now();
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'admin')
    `).run(adminId, config.defaultAdminUsername, config.defaultAdminEmail, hash);
    console.log(`[Database] Initialized default admin user: ${config.defaultAdminUsername}`);
  } else {
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
  }

  // Set default settings if not exists or sync from .env
  const setSettingIfNotExists = (key, value) => {
    const existing = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
    } else if (key === 'gallery_root' && config.galleryRoot && existing.value !== config.galleryRoot) {
      db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(config.galleryRoot, 'gallery_root');
    }
  };

  setSettingIfNotExists('gallery_root', config.galleryRoot);
  setSettingIfNotExists('theme', 'system');
  setSettingIfNotExists('thumbnails_per_page', '40');
}
