import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true }
}, {
  timestamps: true
});

export const MongoSetting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
