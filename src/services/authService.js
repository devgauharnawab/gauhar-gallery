import { MongoUser } from '../models/userMongo.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/security.js';

export class AuthService {
  static async login(identifier, password) {
    if (!identifier || !password) {
      throw new Error('Username or email and password are required.');
    }

    const cleanIdentifier = identifier.trim().toLowerCase();

    // Query user in MongoDB Atlas
    const user = await MongoUser.findOne({
      $or: [{ username: cleanIdentifier }, { email: cleanIdentifier }]
    });

    if (!user) {
      throw new Error('Invalid username/email or password.');
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid username/email or password.');
    }

    const token = generateToken({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      authProvider: 'mongodb-atlas'
    });

    return {
      token,
      authProvider: 'mongodb-atlas',
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      }
    };
  }

  static async getUserById(userId) {
    if (!userId) {
      throw new Error('User ID is required.');
    }

    const user = await MongoUser.findById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      authProvider: 'mongodb-atlas'
    };
  }

  static async createUser({ username, email, password, role = 'user' }) {
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required.');
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const existing = await MongoUser.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });

    if (existing) {
      throw new Error('Username or email is already taken in MongoDB Atlas.');
    }

    const newUser = new MongoUser({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      role
    });

    await newUser.save();

    return {
      id: newUser._id.toString(),
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      authProvider: 'mongodb-atlas'
    };
  }
}
