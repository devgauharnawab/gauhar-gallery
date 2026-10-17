import { DashboardService } from '../services/dashboardService.js';

export class DashboardController {
  static async getStats(req, res, next) {
    try {
      const stats = DashboardService.getStats();
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  }
}
