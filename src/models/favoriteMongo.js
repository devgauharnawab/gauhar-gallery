import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  photoId: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

export const MongoFavorite = mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);
