import { SettingsService } from '../services/settingsService.js';

export class SettingsController {
  static async getSettings(req, res, next) {
    try {
      const data = await SettingsService.getSettings();
      res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateSettings(req, res, next) {
    try {
      const updated = await SettingsService.updateSettings(req.body);
      res.status(200).json({
        success: true,
        message: 'Settings updated successfully.',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }
}
