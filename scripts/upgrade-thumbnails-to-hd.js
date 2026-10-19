import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { photoStore } from '../src/services/photoStore.js';
import { config } from '../src/config/env.js';

async function upgradeThumbnails() {
  console.log('=== UPGRADING THUMBNAILS TO 1440px HIGH-DEFINITION (2K) ===');
  const photos = photoStore.getAllPhotos();
  console.log(`Found ${photos.length} photos in library.`);

  if (!fs.existsSync(config.thumbnailDir)) {
    fs.mkdirSync(config.thumbnailDir, { recursive: true });
  }

  const startTime = Date.now();
  let completed = 0;
  let skipped = 0;
  let errors = 0;
  const CONCURRENCY = 8;
  let currentIndex = 0;

  async function worker(workerId) {
    while (currentIndex < photos.length) {
      const photo = photos[currentIndex++];
      const srcPath = photo.filepath;
      const targetPath = path.join(config.thumbnailDir, `${photo.id}.webp`);

      if (!srcPath || !fs.existsSync(srcPath)) {
        skipped++;
        continue;
      }

      try {
        await sharp(srcPath, { failOn: 'none' })
          .rotate()
          .resize(1440, 1440, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 84, effort: 4 })
          .toFile(targetPath + '.tmp');

        fs.renameSync(targetPath + '.tmp', targetPath);
        completed++;

        if (completed % 100 === 0 || completed === photos.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (completed / ((Date.now() - startTime) / 1000)).toFixed(1);
          console.log(`[HD Preview] ${completed}/${photos.length} photos processed (${rate} photos/sec, ${elapsed}s elapsed)`);
        }
      } catch (err) {
        errors++;
        console.error(`Error processing ${photo.filename}: ${err.message}`);
        if (fs.existsSync(targetPath + '.tmp')) {
          try { fs.unlinkSync(targetPath + '.tmp'); } catch (_) {}
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  console.log(`COMPLETED: ${completed} upgraded to 1440px HD, ${skipped} skipped, ${errors} errors in ${totalTime}s.`);
  console.log('====================================================');
}

upgradeThumbnails().catch(err => {
  console.error('Fatal upgrade error:', err);
  process.exit(1);
});
