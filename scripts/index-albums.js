import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

function normalizeSystemPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const resolved = path.resolve(filePath);
  return resolved.replace(/^([a-zA-Z]):\\/, (match, drive) => `${drive.toLowerCase()}:\\`);
}

const thumbnailDir = path.resolve('./storage/thumbnails');
const indexPath = path.resolve('./storage/photo_index.json');

const existingPhotos = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const existingMap = new Map();
for (const p of existingPhotos) {
  existingMap.set(p.id, p);
  if (p.filepath) {
    existingMap.set(normalizeSystemPath(p.filepath).toLowerCase(), p);
  }
}

const albumFolders = [
  'E:\\bhaiya\\Walima',
  'E:\\bhaiya\\Milad-Mehandi-Manjha',
  'E:\\bhaiya\\Haldi',
  'E:\\bhaiya\\Amir bhaiya',
  'E:\\bhaiya\\PhotoS\\Albums\\Summer Holiday'
];

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm']);

let addedCount = 0;
let thumbCount = 0;

for (const folder of albumFolders) {
  if (!fs.existsSync(folder)) continue;
  const files = fs.readdirSync(folder);
  console.log(`Scanning ${folder} (${files.length} files)...`);

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;

    const fullPath = path.join(folder, f);
    const normPath = normalizeSystemPath(fullPath);
    const normKey = normPath.toLowerCase();

    if (existingMap.has(normKey)) {
      continue;
    }

    const stat = fs.statSync(fullPath);
    const photoId = crypto.createHash('sha256').update(normPath).digest('hex').substring(0, 24);
    const thumbPath = path.join(thumbnailDir, `${photoId}.webp`);

    let width = null;
    let height = null;
    let format = ext.replace('.', '').toLowerCase();

    if (IMAGE_EXTS.has(ext)) {
      try {
        if (!fs.existsSync(thumbPath)) {
          const meta = await sharp(fullPath, { failOn: 'none' })
            .rotate()
            .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 84, effort: 4 })
            .toFile(thumbPath);

          width = meta.width;
          height = meta.height;
          thumbCount++;
        }
      } catch (err) {
        console.warn(`Could not generate thumbnail for ${f}: ${err.message}`);
      }
    }

    const photoObj = {
      id: photoId,
      filename: f,
      filepath: normPath,
      directory: folder,
      file_size: stat.size,
      width: width,
      height: height,
      mime_type: VIDEO_EXTS.has(ext) ? `video/${ext.replace('.', '')}` : `image/${ext.replace('.', '')}`,
      format: format,
      date_taken: stat.mtime.toISOString(),
      date_modified: stat.mtime.toISOString(),
      camera_make: null,
      camera_model: null,
      thumbnail_path: normalizeSystemPath(thumbPath)
    };

    existingPhotos.push(photoObj);
    existingMap.set(normKey, photoObj);
    existingMap.set(photoId, photoObj);
    addedCount++;
  }
}

fs.writeFileSync(indexPath, JSON.stringify(existingPhotos, null, 2), 'utf8');
console.log(`Scan complete! Added ${addedCount} photos, generated ${thumbCount} thumbnails. Total photos now: ${existingPhotos.length}`);
