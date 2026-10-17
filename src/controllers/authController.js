import { AuthService } from '../services/authService.js';

export class AuthController {
  static async login(req, res, next) {
    try {
      const { username, email, password } = req.body;
      const identifier = username || email;

      if (!identifier || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username or email and password are required.'
        });
      }

      const result = await AuthService.login(identifier, password);

      res.status(200).json({
        success: true,
        message: 'Authentication successful.',
        data: result
      });
    } catch (err) {
      res.status(401).json({
        success: false,
        error: err.message
      });
    }
  }

  static async logout(req, res) {
    // Stateless JWT authentication - client removes token from storage
    res.status(200).json({
      success: true,
      message: 'Successfully logged out.'
    });
  }

  static async getMe(req, res, next) {
    try {
      const user = await AuthService.getUserById(req.user.id);
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (err) {
      next(err);
    }
  }

  static async registerUser(req, res, next) {
    try {
      const { username, email, password, role } = req.body;
      const newUser = await AuthService.createUser({ username, email, password, role });
      res.status(201).json({
        success: true,
        message: 'User created successfully.',
        data: newUser
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err.message
      });
    }
  }
}
