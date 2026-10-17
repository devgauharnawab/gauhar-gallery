import { scannerService } from '../services/scannerService.js';
import { MongoSetting } from '../models/settingMongo.js';
import { config } from '../config/env.js';
import { cleanInputPath } from '../utils/pathValidator.js';

export class ScannerController {
  static async startScan(req, res, next) {
    try {
      let { rootDir } = req.body || {};
      if (!rootDir || !String(rootDir).trim()) {
        const row = await MongoSetting.findOne({ key: 'gallery_root' }).lean();
        rootDir = row?.value || config.galleryRoot;
      }
      rootDir = cleanInputPath(rootDir);
      if (req.body && req.body.rootDir) {
        await MongoSetting.findOneAndUpdate(
          { key: 'gallery_root' },
          { key: 'gallery_root', value: rootDir },
          { upsert: true }
        );
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
