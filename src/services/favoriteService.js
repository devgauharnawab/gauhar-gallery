import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { photoStore } from './photoStore.js';

class FavoriteService {
  constructor() {
    this.storagePath = path.join(config.thumbnailDir, '../favorites.json');
    this.favoritesSet = new Set();
    this.isLoaded = false;
  }

  _load() {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.favoritesSet = new Set(list);
        }
      }
    } catch (e) {
      console.warn('[FavoriteService] Error loading local favorites:', e.message);
    }
    this.isLoaded = true;
  }

  _save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(Array.from(this.favoritesSet)), 'utf-8');
    } catch (e) {
      console.warn('[FavoriteService] Error saving local favorites:', e.message);
    }
  }

  isFavorite(photoId) {
    this._load();
    return this.favoritesSet.has(photoId);
  }

  getFavoriteIds() {
    this._load();
    return new Set(this.favoritesSet);
  }

  async addFavorite(photoId) {
    this._load();
    if (!photoStore.hasPhoto(photoId)) {
      throw new Error('Photo not found.');
    }
    this.favoritesSet.add(photoId);
    this._save();
    return true;
  }

  async removeFavorite(photoId) {
    this._load();
    this.favoritesSet.delete(photoId);
    this._save();
    return true;
  }

  async getFavorites({ page = 1, limit = 24, sort = 'date_desc', search = '' } = {}) {
    this._load();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const skip = (pageNum - 1) * limitNum;

    let items = [];
    for (const id of this.favoritesSet) {
      const p = photoStore.getPhotoById(id);
      if (p) items.push(p);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(p => p.filename.toLowerCase().includes(q) || p.directory.toLowerCase().includes(q));
    }

    // Sort
    switch (sort) {
      case 'date_asc':
        items.sort((a, b) => new Date(a.date_taken || a.date_modified) - new Date(b.date_taken || b.date_modified));
        break;
      case 'name_asc':
        items.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case 'name_desc':
        items.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
      case 'size_desc':
        items.sort((a, b) => b.file_size - a.file_size);
        break;
      case 'size_asc':
        items.sort((a, b) => a.file_size - b.file_size);
        break;
      default: // date_desc
        items.sort((a, b) => new Date(b.date_taken || b.date_modified) - new Date(a.date_taken || a.date_modified));
    }

    const total = items.length;
    const paginated = items.slice(skip, skip + limitNum).map(p => ({
      ...p,
      is_favorite: true
    }));

    return {
      items: paginated,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1
      }
    };
  }

  count() {
    this._load();
    return this.favoritesSet.size;
  }
}

export const favoriteService = new FavoriteService();
export { favoriteService as FavoriteService };
