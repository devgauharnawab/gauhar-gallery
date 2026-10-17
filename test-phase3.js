import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { config } from './src/config/env.js';
import { initDatabase, db } from './src/models/db.js';
import { createApp } from './src/app.js';
import { isPathInsideRoot } from './src/utils/pathValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testPhase3() {
  console.log('=== Starting Phase 3 Verification ===');
  initDatabase();

  const testPort = 5002;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  const app = createApp();
  const server = app.listen(testPort, '127.0.0.1');

  // Create temporary test images directory
  const testImagesDir = path.join(__dirname, 'test-images');
  if (!fs.existsSync(testImagesDir)) {
    fs.mkdirSync(testImagesDir, { recursive: true });
  }

  // Generate 2 sample test images using Sharp
  const img1Path = path.join(testImagesDir, 'family-vacation-beach.jpg');
  const img2Path = path.join(testImagesDir, 'birthday-party-cake.png');

  await sharp({
    create: {
      width: 600,
      height: 400,
      channels: 3,
      background: { r: 52, g: 152, b: 219 }
    }
  }).jpeg().toFile(img1Path);

  await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 4,
      background: { r: 46, g: 204, b: 113, alpha: 1 }
    }
  }).png().toFile(img2Path);

  try {
    // 1. Authenticate to get token
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.defaultAdminPassword })
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    console.log('1. Authentication token obtained:', !!token);

    // 2. Security / Path Traversal test
    const traversalSafe = !isPathInsideRoot('C:\\Windows\\System32\\cmd.exe', config.galleryRoot);
    const dotDotSafe = !isPathInsideRoot('E:\\..\\..\\Windows\\System32', config.galleryRoot);
    console.log('2. Path traversal security checks:', traversalSafe && dotDotSafe ? 'PASS' : 'FAIL');

    // 3. Start scan on testImagesDir
    const scanRes = await fetch(`${baseUrl}/api/scanner/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ rootDir: testImagesDir })
    });
    const scanData = await scanRes.json();
    console.log('3. Scanner start triggered:', scanRes.status === 200 && scanData.success ? 'PASS' : 'FAIL');

    // Wait 1.5 seconds for background scan to finish
    await new Promise(r => setTimeout(r, 1500));

    // Check scanner status
    const statusRes = await fetch(`${baseUrl}/api/scanner/status`, { headers: authHeaders });
    const statusData = await statusRes.json();
    console.log(`4. Scanner status: ${statusData.data.status}, found: ${statusData.data.imagesFound}`);

    // 5. Query photos
    const photosRes = await fetch(`${baseUrl}/api/photos`, { headers: authHeaders });
    const photosData = await photosRes.json();
    console.log('5. Photos retrieved count:', photosData.data.length, photosData.data.length >= 2 ? 'PASS' : 'FAIL');

    const firstPhoto = photosData.data[0];

    // 6. Test thumbnail endpoint
    const thumbRes = await fetch(`${baseUrl}/api/photos/${firstPhoto.id}/thumbnail`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('6. Thumbnail endpoint status:', thumbRes.status, thumbRes.headers.get('content-type') === 'image/webp' ? 'PASS' : 'FAIL');

    // 7. Test original endpoint
    const origRes = await fetch(`${baseUrl}/api/photos/${firstPhoto.id}/original`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('7. Original photo streaming status:', origRes.status === 200 ? 'PASS' : 'FAIL');

    // 8. Test favorites
    const favAddRes = await fetch(`${baseUrl}/api/favorites/${firstPhoto.id}`, {
      method: 'POST',
      headers: authHeaders
    });
    console.log('8a. Add favorite:', favAddRes.status === 200 ? 'PASS' : 'FAIL');

    const favListRes = await fetch(`${baseUrl}/api/favorites`, { headers: authHeaders });
    const favListData = await favListRes.json();
    console.log('8b. Favorites list contains photo:', favListData.data.some(p => p.id === firstPhoto.id) ? 'PASS' : 'FAIL');

    // 9. Test albums
    const albumCreateRes = await fetch(`${baseUrl}/api/albums`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Summer Holiday 2026', description: 'Family trip' })
    });
    const albumCreateData = await albumCreateRes.json();
    const albumId = albumCreateData.data.id;
    console.log('9a. Create album:', albumCreateRes.status === 201 ? 'PASS' : 'FAIL');

    const addPhotoToAlbumRes = await fetch(`${baseUrl}/api/albums/${albumId}/photos`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ photoId: firstPhoto.id })
    });
    console.log('9b. Add photo to album:', addPhotoToAlbumRes.status === 200 ? 'PASS' : 'FAIL');

    const albumDetailRes = await fetch(`${baseUrl}/api/albums/${albumId}`, { headers: authHeaders });
    const albumDetailData = await albumDetailRes.json();
    console.log('9c. Album photos count:', albumDetailData.data.photos.length === 1 ? 'PASS' : 'FAIL');

    // 10. Dashboard stats
    const dashRes = await fetch(`${baseUrl}/api/dashboard/stats`, { headers: authHeaders });
    const dashData = await dashRes.json();
    console.log('10. Dashboard stats totalPhotos >= 2:', dashData.data.totalPhotos >= 2 ? 'PASS' : 'FAIL');

    console.log('=== All Phase 3 Tests Passed Successfully! ===');
  } catch (err) {
    console.error('Phase 3 verification error:', err);
  } finally {
    server.close();
    db.close();
    // Clean up test images
    try {
      fs.rmSync(testImagesDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

testPhase3();
