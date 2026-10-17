import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { photoStore } from './photoStore.js';
import { normalizeSystemPath } from '../utils/pathValidator.js';

class AlbumService {
  constructor() {
    this.metaPath = path.join(config.thumbnailDir, '../albums_meta.json');
    this.albumsMeta = new Map(); // albumId -> { name, description, coverPhotoId, createdAt }
    this.isLoaded = false;
  }

  _getAlbumsBaseDir() {
    const baseDir = path.join(config.galleryRoot, 'Albums');
    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch (e) {
        console.warn('[AlbumService] Note creating Albums directory on E: drive:', e.message);
      }
    }
    return baseDir;
  }

  _loadMeta() {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.metaPath)) {
        const raw = fs.readFileSync(this.metaPath, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const a of list) {
            this.albumsMeta.set(a.id, a);
          }
        }
      }
    } catch (e) {
      console.warn('[AlbumService] Error reading albums metadata:', e.message);
    }
    this.isLoaded = true;
  }

  _saveMeta() {
    try {
      fs.writeFileSync(this.metaPath, JSON.stringify(Array.from(this.albumsMeta.values()), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[AlbumService] Error saving albums metadata:', e.message);
    }
  }

  async getAlbums() {
    this._loadMeta();
    const baseDir = this._getAlbumsBaseDir();
    const albums = [];

    if (!fs.existsSync(baseDir)) {
      return [];
    }

    try {
      const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const albumName = entry.name;
        const albumDir = path.join(baseDir, albumName);
        const albumId = crypto.createHash('md5').update(normalizeSystemPath(albumDir)).digest('hex').substring(0, 16);
        const meta = this.albumsMeta.get(albumId) || {};

        // Discover photos inside this folder on E: drive
        let fileEntries = [];
        try {
          fileEntries = await fs.promises.readdir(albumDir);
        } catch (e) {}

        const imageFiles = fileEntries.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);
        });

        // Find cover photo
        let coverPhotoId = meta.coverPhotoId;
        if (!coverPhotoId && imageFiles.length > 0) {
          const firstPath = normalizeSystemPath(path.join(albumDir, imageFiles[0]));
          coverPhotoId = crypto.createHash('sha256').update(firstPath).digest('hex').substring(0, 24);
        }

        albums.push({
          id: albumId,
          name: meta.name || albumName,
          description: meta.description || `Folder on E:\\ drive (${albumDir})`,
          folderPath: albumDir,
          photoCount: imageFiles.length,
          coverPhotoId: coverPhotoId || null,
          createdAt: meta.createdAt || new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('[AlbumService] Error reading album folders on E: drive:', err);
    }

    return albums;
  }

  async getAlbumById(id) {
    const albums = await this.getAlbums();
    const album = albums.find(a => a.id === id);
    if (!album) return null;

    // Read photos inside this album folder on E: drive
    const photos = [];
    try {
      const files = await fs.promises.readdir(album.folderPath);
      for (const f of files) {
        const fullPath = normalizeSystemPath(path.join(album.folderPath, f));
        const photoId = crypto.createHash('sha256').update(fullPath).digest('hex').substring(0, 24);
        const existing = photoStore.getPhotoById(photoId);
        if (existing) {
          photos.push(existing);
        } else {
          // If in directory but not indexed yet
          try {
            const stat = await fs.promises.stat(fullPath);
            photos.push({
              id: photoId,
              filename: f,
              filepath: fullPath,
              directory: album.folderPath,
              file_size: stat.size,
              date_modified: stat.mtime
            });
          } catch (e) {}
        }
      }
    } catch (e) {}

    return {
      ...album,
      photos
    };
  }

  async createAlbum(name, description = '', coverPhotoId = null) {
    if (!name || !name.trim()) {
      throw new Error('Album name is required.');
    }

    this._loadMeta();
    const baseDir = this._getAlbumsBaseDir();
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
    const albumDir = path.join(baseDir, safeName);

    // Create physical folder on the Windows E: drive
    await fs.promises.mkdir(albumDir, { recursive: true });
    console.log(`[AlbumService] Created physical folder on E: drive: ${albumDir}`);

    const albumId = crypto.createHash('md5').update(normalizeSystemPath(albumDir)).digest('hex').substring(0, 16);
    const meta = {
      id: albumId,
      name: name.trim(),
      description: description ? description.trim() : '',
      coverPhotoId: coverPhotoId || null,
      folderPath: albumDir,
      createdAt: new Date().toISOString()
    };

    this.albumsMeta.set(albumId, meta);
    this._saveMeta();

    return {
      id: albumId,
      name: meta.name,
      description: meta.description,
      folderPath: albumDir,
      photoCount: 0,
      coverPhotoId: meta.coverPhotoId,
      createdAt: meta.createdAt
    };
  }

  async updateAlbum(id, updates = {}) {
    this._loadMeta();
    const album = await this.getAlbumById(id);
    if (!album) {
      throw new Error('Album not found.');
    }

    const currentMeta = this.albumsMeta.get(id) || {};
    if (updates.name && updates.name.trim() && updates.name !== album.name) {
      const baseDir = this._getAlbumsBaseDir();
      const safeNewName = updates.name.replace(/[<>:"/\\|?*]/g, '_').trim();
      const newAlbumDir = path.join(baseDir, safeNewName);

      if (fs.existsSync(album.folderPath) && album.folderPath !== newAlbumDir) {
        await fs.promises.rename(album.folderPath, newAlbumDir);
      }
      currentMeta.folderPath = newAlbumDir;
      currentMeta.name = updates.name.trim();
    }

    if (updates.description !== undefined) {
      currentMeta.description = updates.description.trim();
    }
    if (updates.coverPhotoId !== undefined) {
      currentMeta.coverPhotoId = updates.coverPhotoId;
    }

    this.albumsMeta.set(id, currentMeta);
    this._saveMeta();

    return await this.getAlbumById(id);
  }

  async deleteAlbum(id) {
    this._loadMeta();
    const album = await this.getAlbumById(id);
    if (!album) {
      return false;
    }

    // Delete folder from Windows E: drive
    if (fs.existsSync(album.folderPath)) {
      await fs.promises.rm(album.folderPath, { recursive: true, force: true });
      console.log(`[AlbumService] Removed folder from E: drive: ${album.folderPath}`);
    }

    this.albumsMeta.delete(id);
    this._saveMeta();
    return true;
  }

  async addPhotoToAlbum(albumId, photoId) {
    const album = await this.getAlbumById(albumId);
    if (!album) {
      throw new Error('Album not found.');
    }

    const photo = photoStore.getPhotoById(photoId);
    if (!photo || !fs.existsSync(photo.filepath)) {
      throw new Error('Photo not found on disk.');
    }

    const destPath = path.join(album.folderPath, photo.filename);

    // If file already in album folder, skip
    if (normalizeSystemPath(photo.filepath) === normalizeSystemPath(destPath)) {
      return true;
    }

    // Copy photo directly into the album folder on the E: drive
    await fs.promises.copyFile(photo.filepath, destPath);
    console.log(`[AlbumService] Saved photo to album folder on E: drive: ${destPath}`);

    // Register copied file in photoStore
    const newId = crypto.createHash('sha256').update(normalizeSystemPath(destPath)).digest('hex').substring(0, 24);
    photoStore.upsertPhoto({
      ...photo,
      id: newId,
      filepath: normalizeSystemPath(destPath),
      directory: album.folderPath,
      thumbnail_path: photo.thumbnail_path
    });

    return true;
  }

  async removePhotoFromAlbum(albumId, photoId) {
    const album = await this.getAlbumById(albumId);
    if (!album) {
      throw new Error('Album not found.');
    }

    // Find the photo inside this album folder on E: drive
    const target = album.photos.find(p => p.id === photoId);
    if (target && fs.existsSync(target.filepath)) {
      // Only remove if it is actually inside the album folder
      if (normalizeSystemPath(target.filepath).startsWith(normalizeSystemPath(album.folderPath))) {
        await fs.promises.unlink(target.filepath);
        photoStore.deletePhoto(photoId);
        console.log(`[AlbumService] Removed file from album folder on E: drive: ${target.filepath}`);
        return true;
      }
    }
    return true;
  }
}

export const albumService = new AlbumService();
export { albumService as AlbumService };
