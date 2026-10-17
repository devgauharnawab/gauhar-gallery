import { config } from './src/config/env.js';
import { initDatabase, db } from './src/models/db.js';
import { createApp } from './src/app.js';

async function testPhase2() {
  console.log('--- Starting Phase 2 Backend Verification ---');
  initDatabase();

  const app = createApp();
  const server = app.listen(5001, '127.0.0.1');

  try {
    const baseUrl = 'http://127.0.0.1:5001';

    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.log('1. Health check result:', healthData.status === 'healthy' ? 'PASS' : 'FAIL');

    // 2. Failed login
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    console.log('2. Bad credentials rejected (401):', badLoginRes.status === 401 ? 'PASS' : 'FAIL');

    // 3. Successful login
    const goodLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: config.defaultAdminPassword })
    });
    const goodLoginData = await goodLoginRes.json();
    console.log('3. Good credentials accepted (200):', goodLoginRes.status === 200 && goodLoginData.data.token ? 'PASS' : 'FAIL');

    const token = goodLoginData.data?.token;

    // 4. Protected /me without token
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    console.log('4. Protected route blocked without token (401):', unauthRes.status === 401 ? 'PASS' : 'FAIL');

    // 5. Protected /me with valid token
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meData = await meRes.json();
    console.log('5. Protected route allowed with token (200):', meRes.status === 200 && meData.data.username === 'admin' ? 'PASS' : 'FAIL');

    console.log('--- Phase 2 Backend Verification Complete ---');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
    db.close();
  }
}

testPhase2();
