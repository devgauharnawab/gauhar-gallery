import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { config } from './src/config/env.js';
import { initDatabase, db } from './src/models/db.js';
import { createApp } from './src/app.js';
import { isPathInsideRoot, shouldSkipDirectory } from './src/utils/pathValidator.js';
import { scannerService } from './src/services/scannerService.js';
import { AuthService } from './src/services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runComprehensiveTests() {
  console.log('====================================================');
  console.log('  RUNNING FAMILY GALLERY COMPREHENSIVE TEST SUITE   ');
  console.log('====================================================\n');

  initDatabase();

  const testPort = 5003;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  const app = createApp();
  const server = app.listen(testPort, '127.0.0.1');

  const testFolder = path.join(__dirname, 'test-suite-photos');
  if (!fs.existsSync(testFolder)) {
    fs.mkdirSync(testFolder, { recursive: true });
  }

  // Create subfolders: "Vacations" and "Birthdays"
  const vacDir = path.join(testFolder, 'Vacations');
  const bdayDir = path.join(testFolder, 'Birthdays');
  fs.mkdirSync(vacDir, { recursive: true });
  fs.mkdirSync(bdayDir, { recursive: true });

  // Create sample image files
  const img1 = path.join(vacDir, 'beach-sunset.jpg');
  const img2 = path.join(bdayDir, 'cake-candles.png');
  const img3 = path.join(testFolder, 'corrupt-file.jpg');

  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 230, g: 126, b: 34 } }
  }).jpeg().toFile(img1);

  await sharp({
    create: { width: 1024, height: 768, channels: 4, background: { r: 155, g: 89, b: 182, alpha: 1 } }
  }).png().toFile(img2);

  // Write a corrupted/non-image file with .jpg extension to test resilience
  fs.writeFileSync(img3, 'THIS_IS_NOT_A_VALID_IMAGE_DATA_CORRUPTED');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, message) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST SUITE 1: AUTHENTICATION & SECURITY
    // ----------------------------------------------------
    console.log('--- Test Suite 1: Authentication & JWT Protection ---');

    // 1.1 Reject invalid credentials
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    assert(badLogin.status === 401, 'Invalid login credentials rejected with 401');

    // 1.2 Successful login
    const goodLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.defaultAdminPassword })
    });
    const goodLoginData = await goodLogin.json();
    const token = goodLoginData.data?.token;
    assert(goodLogin.status === 200 && !!token, 'Valid login returns HTTP 200 and JWT token');

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 1.3 Unauthenticated access to /api/photos blocked
    const unauthPhotos = await fetch(`${baseUrl}/api/photos`);
    assert(unauthPhotos.status === 401, 'Unauthenticated GET /api/photos blocked with 401');

    // 1.4 Path Traversal & System Folder Security
    console.log('\n--- Test Suite 2: Path Traversal & System Directory Security ---');
    assert(!isPathInsideRoot('C:\\Windows\\System32\\cmd.exe', config.galleryRoot), 'Block access to C:\\Windows outside gallery root');
    assert(!isPathInsideRoot('D:\\SecretData.txt', config.galleryRoot), 'Block access to different drive letters');
    assert(shouldSkipDirectory('E:\\$Recycle.Bin', config.galleryRoot), 'Scanner skips Windows $Recycle.Bin');
    assert(shouldSkipDirectory('E:\\System Volume Information', config.galleryRoot), 'Scanner skips System Volume Information');
    assert(shouldSkipDirectory('E:\\node_modules', config.galleryRoot), 'Scanner skips node_modules');
    assert(shouldSkipDirectory('E:\\.git', config.galleryRoot), 'Scanner skips .git repository folders');

    // ----------------------------------------------------
    // TEST SUITE 3: DRIVE SCANNING & CORRUPTION RESILIENCE
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Drive Scanning, Metadata, & Thumbnails ---');

    // 3.1 Trigger scan on test folder
    const scanStartRes = await fetch(`${baseUrl}/api/scanner/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ rootDir: testFolder })
    });
    const scanStartData = await scanStartRes.json();
    assert(scanStartRes.status === 200 && scanStartData.success, 'Drive scan starts in background');

    // Wait 2 seconds for scan and thumbnail generation
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(`${baseUrl}/api/scanner/status`, { headers: authHeaders });
    const statusData = await statusRes.json();
    assert(statusData.data.status === 'completed', `Scanner completed status: ${statusData.data.status}`);
    assert(statusData.data.imagesFound >= 2, `Scanner found and indexed valid images: ${statusData.data.imagesFound}`);

    // 3.2 Corrupted file resilience: scanner should have logged error without crashing
    assert(statusData.data.errorsCount >= 1, `Corrupted file safely skipped and accounted for: ${statusData.data.errorsCount}`);

    // 3.3 Query photos endpoint with sort & search
    const photosRes = await fetch(`${baseUrl}/api/photos?sort=date_desc`, { headers: authHeaders });
    const photosData = await photosRes.json();
    assert(photosData.data.length >= 2, `GET /api/photos returns indexed photos (count: ${photosData.data.length})`);

    const sunsetPhoto = photosData.data.find(p => p.filename === 'beach-sunset.jpg');
    assert(sunsetPhoto && sunsetPhoto.width === 1200 && sunsetPhoto.height === 800, 'Photo metadata extracted (1200x800 dimensions)');

    // 3.4 Thumbnail delivery
    const thumbRes = await fetch(`${baseUrl}/api/photos/${sunsetPhoto.id}/thumbnail`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(thumbRes.status === 200 && thumbRes.headers.get('content-type') === 'image/webp', 'Thumbnails delivered in WebP format with HTTP 200');

    // 3.5 Original image streaming
    const origRes = await fetch(`${baseUrl}/api/photos/${sunsetPhoto.id}/original`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(origRes.status === 200, 'Original photo streamed safely with HTTP 200');

    // ----------------------------------------------------
    // TEST SUITE 4: ALBUMS & FAVORITES
    // ----------------------------------------------------
    console.log('\n--- Test Suite 4: Virtual Albums & Favorites ---');

    // 4.1 Toggle favorite
    const addFavRes = await fetch(`${baseUrl}/api/favorites/${sunsetPhoto.id}`, {
      method: 'POST',
      headers: authHeaders
    });
    assert(addFavRes.status === 200, 'POST /api/favorites/:photoId sets favorite');

    const favList = await fetch(`${baseUrl}/api/favorites`, { headers: authHeaders });
    const favListData = await favList.json();
    assert(favListData.data.some(p => p.id === sunsetPhoto.id), 'Favorite photo appears in GET /api/favorites');

    // 4.2 Virtual album creation
    const albumRes = await fetch(`${baseUrl}/api/albums`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Summer Holiday', description: 'Sunny memories' })
    });
    const albumData = await albumRes.json();
    const albumId = albumData.data?.id;
    assert(albumRes.status === 201 && !!albumId, 'Create virtual album returns 201');

    // 4.3 Add photo to album
    const addPhotoRes = await fetch(`${baseUrl}/api/albums/${albumId}/photos`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ photoId: sunsetPhoto.id })
    });
    assert(addPhotoRes.status === 200, 'Add photo to virtual album returns 200');

    // 4.4 Get album detail
    const albumDetailRes = await fetch(`${baseUrl}/api/albums/${albumId}`, { headers: authHeaders });
    const albumDetailData = await albumDetailRes.json();
    assert(albumDetailData.data.photos.length === 1, 'Virtual album contains associated photo');

    // 4.5 Remove photo from album without modifying original
    const removePhotoRes = await fetch(`${baseUrl}/api/albums/${albumId}/photos/${sunsetPhoto.id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(removePhotoRes.status === 200, 'Remove photo from virtual album succeeds');
    assert(fs.existsSync(img1), 'Original photo file remains intact on disk');

    // ----------------------------------------------------
    // TEST SUITE 5: DASHBOARD & SETTINGS
    // ----------------------------------------------------
    console.log('\n--- Test Suite 5: Dashboard Metrics & Settings ---');

    const dashRes = await fetch(`${baseUrl}/api/dashboard/stats`, { headers: authHeaders });
    const dashData = await dashRes.json();
    assert(dashData.data.totalPhotos >= 2, 'Dashboard stats report indexed photos count');
    assert(dashData.data.totalAlbums >= 1, 'Dashboard stats report virtual albums count');

    const settingsRes = await fetch(`${baseUrl}/api/settings`, { headers: authHeaders });
    const settingsData = await settingsRes.json();
    assert(settingsData.data.system.nodeVersion === process.version, 'Settings returns system diagnostics and Node runtime info');

    console.log('\n====================================================');
    console.log(`  TEST RESULTS: ${passedCount} / ${totalCount} PASSED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    db.close();
    // Clean up temporary test files
    try {
      fs.rmSync(testFolder, { recursive: true, force: true });
    } catch (e) {}
  }
}

runComprehensiveTests();
