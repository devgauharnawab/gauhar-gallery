import { scannerService } from '../services/scannerService.js';
import { db } from '../models/db.js';
import { config } from '../config/env.js';
import { cleanInputPath } from '../utils/pathValidator.js';

export class ScannerController {
  static async startScan(req, res, next) {
    try {
      let { rootDir } = req.body || {};
      if (!rootDir || !String(rootDir).trim()) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('gallery_root');
        rootDir = row?.value || config.galleryRoot;
      }
      rootDir = cleanInputPath(rootDir);
      if (req.body && req.body.rootDir) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('gallery_root', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(rootDir);
      }
      const result = await scannerService.startScan(rootDir);
      res.status(200).json({
        success: true,
        message: result.message,
        rootDir: result.rootDir
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }

  static async cancelScan(req, res) {
    const cancelled = scannerService.cancelScan();
    if (cancelled) {
      res.status(200).json({
        success: true,
        message: 'Scan cancellation requested.'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No active scan is currently running.'
      });
    }
  }

  static async getStatus(req, res) {
    const status = scannerService.getStatus();
    res.status(200).json({
      success: true,
      data: status
    });
  }
}
