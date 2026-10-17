import fs from 'fs';
import { scannerService } from '../services/scannerService.js';
import { settingsService } from '../services/settingsService.js';
import { config } from '../config/env.js';
import { cleanInputPath } from '../utils/pathValidator.js';

export class ScannerController {
  static async startScan(req, res, next) {
    try {
      let { rootDir } = req.body || {};
      if (!rootDir || !String(rootDir).trim()) {
        const data = await settingsService.getSettings();
        rootDir = data.settings.gallery_root;
      }
      rootDir = cleanInputPath(rootDir);

      // Verify path exists, otherwise fallback to configured galleryRoot
      if (!fs.existsSync(rootDir)) {
        if (fs.existsSync(config.galleryRoot)) {
          rootDir = config.galleryRoot;
        } else if (fs.existsSync('E:\\')) {
          rootDir = 'E:\\';
        }
      }

      if (req.body && req.body.saveAsDefault && req.body.rootDir && fs.existsSync(rootDir)) {
        await settingsService.updateSettings({ gallery_root: rootDir });
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
    const status = await scannerService.getStatus();
    res.status(200).json({
      success: true,
      data: status
    });
  }
}
