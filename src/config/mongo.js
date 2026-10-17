import dns from 'dns';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './env.js';
import { MongoUser } from '../models/userMongo.js';

let isConnected = false;

export async function connectMongo() {
  if (!config.mongodbUri) {
    console.error('[MongoDB Atlas] Error: MONGODB_URI is not set in backend/.env.');
    return false;
  }

  // Configure public DNS resolvers to prevent Windows Node querySrv ENOTFOUND
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (e) {
    // Ignore if not supported in environment
  }

  try {
    console.log('[MongoDB Atlas] Connecting to MongoDB Atlas...');
    await mongoose.connect(config.mongodbUri, {
      dbName: 'family_gallery',
      serverSelectionTimeoutMS: 10000
    });

    isConnected = true;
    console.log('[MongoDB Atlas] Successfully connected to MongoDB Atlas.');

    // Seed default admin in MongoDB Atlas if no users exist
    await seedDefaultAdminMongo();

    return true;
  } catch (err) {
    isConnected = false;
    console.error(`[MongoDB Atlas] Connection failed: ${err.message}`);
    return false;
  }
}

export function isMongoConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function seedDefaultAdminMongo() {
  try {
    const salt = await bcrypt.genSalt(10);

    // 1. Seed or update 'admin' user
    const adminUser = await MongoUser.findOne({ username: 'admin' });
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('admin', salt);
      await MongoUser.create({
        username: 'admin',
        email: 'admin@familygallery.local',
        passwordHash,
        role: 'admin'
      });
      console.log('[MongoDB Atlas] Created admin user in MongoDB Atlas (username: admin, password: admin).');
    }

    // 2. Seed or update 'gauhar' user
    const gauharUser = await MongoUser.findOne({ username: 'gauhar' });
    if (!gauharUser) {
      const gauharHash = await bcrypt.hash('gauhar123', salt);
      await MongoUser.create({
        username: 'gauhar',
        email: 'gauhar@familygallery.local',
        passwordHash: gauharHash,
        role: 'admin'
      });
      console.log('[MongoDB Atlas] Created user gauhar in MongoDB Atlas (username: gauhar, password: gauhar123).');
    }
  } catch (err) {
    console.error('[MongoDB Atlas] Error seeding admin user:', err.message);
  }
}
