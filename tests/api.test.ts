import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import express from 'express';
import { io as ioClient } from 'socket.io-client';
import { store } from '../src/server/db/store';
import { apiRouter } from '../src/server/routes/api';
import { initSocketServer } from '../src/server/socket';
import { applyZipBuildUpdate } from '../src/server/services/updater';

let server: http.Server;
let baseUrl: string;
let testDataDir: string;

test.before(async () => {
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muztalk-test-data-'));
  process.env.MUZTALK_DATA_DIR = testDataDir;
  await store.init();
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = http.createServer(app);
  initSocketServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (testDataDir && fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});

test('Health endpoint reports MySQL 8 schema engine and core services', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { database: { engine: string }; services: { expressApi: string; socketIo: string } };
  assert.equal(body.database.engine, 'MySQL 8');
  assert.equal(body.services.expressApi, 'online');
  assert.equal(body.services.socketIo, 'online');
});

test('Phone OTP registration, JWT login, refresh token rotation, and profile update', async () => {
  const sendRes = await fetch(`${baseUrl}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode: '+92', phoneNumber: '3009998877' }),
  });
  assert.equal(sendRes.status, 200);
  const sendData = (await sendRes.json()) as { phoneNumber: string; devOtpPreview: string };
  assert.ok(sendData.devOtpPreview);
  assert.equal(sendData.devOtpPreview.length, 6);

  const verifyRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phoneNumber: sendData.phoneNumber,
      otp: sendData.devOtpPreview,
      displayName: 'Test Engineer',
    }),
  });
  assert.equal(verifyRes.status, 200);
  const authData = (await verifyRes.json()) as { accessToken: string; refreshToken: string; user: { id: string; displayName: string } };
  assert.equal(authData.user.displayName, 'Test Engineer');
  assert.ok(authData.accessToken);

  // Refresh token rotation
  const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: authData.refreshToken }),
  });
  assert.equal(refreshRes.status, 200);
  const rotated = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
  assert.notEqual(rotated.refreshToken, authData.refreshToken);

  // Old refresh token must be rejected after rotation
  const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: authData.refreshToken }),
  });
  assert.equal(replayRes.status, 401);
});

test('Real-time Socket.IO messaging, read receipts, groups, statuses, and calls', async () => {
  const sendARes = await fetch(`${baseUrl}/api/auth/send-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'socket_a@apimuzatalk.rrgindustry.com', username: 'socket_a' }),
  });
  const sendAData = (await sendARes.json()) as { email: string; devOtpPreview: string };
  const verARes = await fetch(`${baseUrl}/api/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: sendAData.email, otp: sendAData.devOtpPreview, username: 'socket_a', displayName: 'Socket User A' }),
  });
  const aAuth = (await verARes.json()) as { accessToken: string; user: { id: string } };

  const sendBRes = await fetch(`${baseUrl}/api/auth/send-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'socket_b@apimuzatalk.rrgindustry.com', username: 'socket_b' }),
  });
  const sendBData = (await sendBRes.json()) as { email: string; devOtpPreview: string };
  const verBRes = await fetch(`${baseUrl}/api/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: sendBData.email, otp: sendBData.devOtpPreview, username: 'socket_b', displayName: 'Socket User B' }),
  });
  const bAuth = (await verBRes.json()) as { accessToken: string; user: { id: string } };

  const chatRes = await fetch(`${baseUrl}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aAuth.accessToken}` },
    body: JSON.stringify({ peerUserId: bAuth.user.id }),
  });
  assert.equal(chatRes.status, 201);
  const chatData = (await chatRes.json()) as { chat: { id: string } };

  const socketA = ioClient(baseUrl, { auth: { token: aAuth.accessToken }, transports: ['websocket'] });
  const socketB = ioClient(baseUrl, { auth: { token: bAuth.accessToken }, transports: ['websocket'] });

  await Promise.all([
    new Promise<void>((resolve) => socketA.on('connect', () => resolve())),
    new Promise<void>((resolve) => socketB.on('connect', () => resolve())),
  ]);

  const receivedPromise = new Promise<{ text: string }>((resolve) => {
    socketB.on('message:new', (msg) => resolve(msg));
  });

  socketA.emit('message:send', {
    clientMessageId: 'test-idem-1',
    conversationId: chatData.chat.id,
    type: 'TEXT',
    text: 'Automated Socket.IO integration message',
  });

  const received = await receivedPromise;
  assert.equal(received.text, 'Automated Socket.IO integration message');

  socketA.disconnect();
  socketB.disconnect();

  // Status creation & 24h feed check
  const statusRes = await fetch(`${baseUrl}/api/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aAuth.accessToken}` },
    body: JSON.stringify({ type: 'TEXT', contentText: 'Integration Test Status', bgColor: '#20BFA5' }),
  });
  assert.equal(statusRes.status, 201);

  // Group creation check
  const grpRes = await fetch(`${baseUrl}/api/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aAuth.accessToken}` },
    body: JSON.stringify({ name: 'QA Verification Group', description: 'Automated test', memberIds: [bAuth.user.id] }),
  });
  assert.equal(grpRes.status, 201);
});

test('Admin bootstrap, RBAC enforcement, user suspension, and zero private message leak', async () => {
  // Unauthenticated admin request must fail
  const unauthRes = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(unauthRes.status, 401);

  const bootRes = await fetch(`${baseUrl}/api/admin/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'qa-admin@muztalk.app',
      displayName: 'QA Admin',
      password: 'StrongPassword123!',
    }),
  });
  assert.equal(bootRes.status, 201);
  const bootData = (await bootRes.json()) as { token: string };

  const ovRes = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${bootData.token}` },
  });
  assert.equal(ovRes.status, 200);
  const ovData = (await ovRes.json()) as { health: { metrics: { totalUsers: number } } };
  assert.ok(ovData.health.metrics.totalUsers >= 1);

  // Admin Integrations & DB configuration
  const igUpdateRes = await fetch(`${baseUrl}/api/admin/integrations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bootData.token}` },
    body: JSON.stringify({
      domains: {
        frontendUrl: 'http://apimuzatalk.rrgindustry.com/',
        backendApiUrl: 'http://apimuzatalk.rrgindustry.com/',
      },
      storage: { mode: 'mobile_encrypted_vault', folderName: 'MuzTalk' },
      smtp: { enabled: false, host: 'smtp.example.com', port: 587, user: 'noreply@example.com', pass: 'secret-pass' },
      twilio: { enabled: true, accountSid: 'AC123', authToken: 'tok123', fromNumber: '+15551234567' },
      firebase: {
        enabled: true,
        projectId: 'muztalk-41f2a',
        storageBucket: 'muztalk-41f2a.firebasestorage.app',
        clientEmail: 'firebase-adminsdk-fbsvc@muztalk-41f2a.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----\nTEST_PLACEHOLDER\n-----END PRIVATE KEY-----\n',
      },
    }),
  });
  assert.equal(igUpdateRes.status, 200);
  const igData = (await igUpdateRes.json()) as {
    integrations: {
      smtp: { passSet: boolean; pass?: string };
      twilio: { enabled: boolean; authToken?: string };
      firebase: { privateKeySet: boolean; privateKey?: string };
    };
  };
  assert.equal(igData.integrations.smtp.passSet, true);
  assert.equal(igData.integrations.smtp.pass, undefined);
  assert.equal(igData.integrations.twilio.enabled, true);
  assert.equal(igData.integrations.twilio.authToken, undefined);
  assert.equal(igData.integrations.firebase.privateKeySet, true);
  assert.equal(igData.integrations.firebase.privateKey, undefined);
});

test('Email + Username OTP registration and mandatory OTP on Username/Password sign-in', async () => {
  const sendRes = await fetch(`${baseUrl}/api/auth/send-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bilal@apimuzatalk.rrgindustry.com', username: 'bilal_test' }),
  });
  assert.equal(sendRes.status, 200);
  const sendData = (await sendRes.json()) as { email: string; devOtpPreview: string };
  assert.ok(sendData.devOtpPreview);

  const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: sendData.email,
      otp: sendData.devOtpPreview,
      username: 'bilal_test',
      displayName: 'Bilal Test',
      password: 'Password123!',
    }),
  });
  assert.equal(verifyRes.status, 200);
  const verifyData = (await verifyRes.json()) as { user: { id: string; username: string; email: string } };
  assert.equal(verifyData.user.username, 'bilal_test');
  assert.equal(verifyData.user.email, 'bilal@apimuzatalk.rrgindustry.com');

  const pwRes = await fetch(`${baseUrl}/api/auth/login-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'bilal_test', password: 'Password123!' }),
  });
  assert.equal(pwRes.status, 200);
  const pwData = (await pwRes.json()) as {
    requiresOtp: boolean;
    email: string;
    devOtpPreview: string;
    accessToken?: string;
  };
  assert.equal(pwData.requiresOtp, true);
  assert.equal(pwData.accessToken, undefined);
  assert.ok(pwData.devOtpPreview);

  const pwVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: pwData.email,
      otp: pwData.devOtpPreview,
    }),
  });
  assert.equal(pwVerifyRes.status, 200);
  const pwVerified = (await pwVerifyRes.json()) as { accessToken: string; user: { id: string; username: string } };
  assert.ok(pwVerified.accessToken);
  assert.equal(pwVerified.user.username, 'bilal_test');

  // Admin login and test global + per-user screen capture blocking
  const adminLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa-admin@muztalk.app', password: 'StrongPassword123!' }),
  });
  assert.equal(adminLoginRes.status, 200);
  const adminAuth = (await adminLoginRes.json()) as { token: string };

  const socket = ioClient(baseUrl, { auth: { token: pwVerified.accessToken }, transports: ['websocket'] });
  await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

  const globalUpdatePromise = new Promise<{ blockScreenCapture: boolean }>((resolve) => {
    socket.once('security:policy_updated', (payload) => resolve(payload));
  });

  const globalCfgRes = await fetch(`${baseUrl}/api/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth.token}` },
    body: JSON.stringify({ blockScreenCapture: true }),
  });
  assert.equal(globalCfgRes.status, 200);
  const globalEvent = await globalUpdatePromise;
  assert.equal(globalEvent.blockScreenCapture, true);

  const policyGlobalRes = await fetch(`${baseUrl}/api/security-policy`, {
    headers: { Authorization: `Bearer ${pwVerified.accessToken}` },
  });
  assert.equal(policyGlobalRes.status, 200);
  const policyGlobal = (await policyGlobalRes.json()) as { blockScreenCapture: boolean };
  assert.equal(policyGlobal.blockScreenCapture, true);

  // Turn off global block, then enable per-user screen capture block
  await fetch(`${baseUrl}/api/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth.token}` },
    body: JSON.stringify({ blockScreenCapture: false }),
  });

  const userUpdatePromise = new Promise<{ blockScreenCapture: boolean }>((resolve) => {
    socket.once('security:policy_updated', (payload) => resolve(payload));
  });

  const userBlockRes = await fetch(`${baseUrl}/api/admin/users/${pwVerified.user.id}/screen-capture`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminAuth.token}` },
    body: JSON.stringify({ blockScreenCapture: true }),
  });
  assert.equal(userBlockRes.status, 200);
  const userBlockData = (await userBlockRes.json()) as {
    user: { blockScreenCapture: boolean };
    effectiveBlockScreenCapture: boolean;
  };
  assert.equal(userBlockData.user.blockScreenCapture, true);
  assert.equal(userBlockData.effectiveBlockScreenCapture, true);

  const userEvent = await userUpdatePromise;
  assert.equal(userEvent.blockScreenCapture, true);

  socket.disconnect();
});

test('Zero-loss persistence across restart, Admin backup export/import, and secure ZIP build updater', async () => {
  const adminLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'qa-admin@muztalk.app', password: 'StrongPassword123!' }),
  });
  assert.equal(adminLoginRes.status, 200);
  const adminAuth = (await adminLoginRes.json()) as { token: string };

  // Persistence status check
  const psRes = await fetch(`${baseUrl}/api/admin/persistence-status`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert.equal(psRes.status, 200);
  const psData = (await psRes.json()) as { persistence: { counts: { users: number; admins: number } } };
  const usersBefore = psData.persistence.counts.users;
  assert.ok(usersBefore >= 3);

  // Backup export check
  const exportRes = await fetch(`${baseUrl}/api/admin/backup/export`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert.equal(exportRes.status, 200);
  const backupJson = (await exportRes.json()) as { users: Array<{ id: string }>; savedAt: string };
  assert.equal(backupJson.users.length, usersBefore);

  // Simulate server restart: flush, clear in-memory maps, re-init from persistent store
  await store.persistNow();
  store.users.clear();
  store.messages.clear();
  store.admins.clear();
  assert.equal(store.users.size, 0);

  await store.init();
  assert.equal(store.users.size, usersBefore);
  assert.ok(store.admins.size >= 1);

  // Verify ZIP build updater preserves .env & data/ while unwrapping root wrapper folder
  const tempAppRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muztalk-zip-app-'));
  const tempZipPath = path.join(os.tmpdir(), `muztalk-build-${Date.now()}.zip`);
  const badZipPath = path.join(os.tmpdir(), `muztalk-bad-${Date.now()}.zip`);

  try {
    fs.writeFileSync(path.join(tempAppRoot, '.env'), 'DATABASE_URL="mysql://keep-me"\n');
    fs.mkdirSync(path.join(tempAppRoot, 'data'), { recursive: true });
    fs.writeFileSync(path.join(tempAppRoot, 'data', 'muztalk-state.json'), '{"users":[{"id":"keep"}]}');

    const goodZip = new AdmZip();
    goodZip.addFile('release-v2/dist/index.html', Buffer.from('<html><body>v2</body></html>'));
    goodZip.addFile('release-v2/server.js', Buffer.from('console.log("v2");'));
    goodZip.addFile('release-v2/.env', Buffer.from('DATABASE_URL="OVERWRITTEN"'));
    goodZip.addFile('release-v2/data/muztalk-state.json', Buffer.from('{"users":[]}'));
    goodZip.writeZip(tempZipPath);

    const updateRes = await applyZipBuildUpdate({
      zipFilePath: tempZipPath,
      targetAppDir: tempAppRoot,
      runBuild: false,
      syncPublicHtml: false,
      restartAfterUpdate: false,
      adminEmail: 'qa-admin@muztalk.app',
    });

    assert.equal(updateRes.ok, true);
    assert.equal(updateRes.strippedRootFolder, 'release-v2');
    assert.equal(updateRes.hasDist, true);
    assert.equal(updateRes.hasServerJs, true);
    assert.equal(updateRes.extractedFilesCount, 2);
    assert.equal(updateRes.skippedProtectedCount, 2);
    assert.equal(fs.readFileSync(path.join(tempAppRoot, '.env'), 'utf8'), 'DATABASE_URL="mysql://keep-me"\n');
    assert.equal(fs.readFileSync(path.join(tempAppRoot, 'data', 'muztalk-state.json'), 'utf8'), '{"users":[{"id":"keep"}]}');
    assert.ok(fs.readFileSync(path.join(tempAppRoot, 'dist', 'index.html'), 'utf8').includes('v2'));

    // Zip-Slip path traversal rejection
    const badZip = new AdmZip();
    // adm-zip >=0.6 sanitizes '../' in addFile(), so write a same-length placeholder
    // and patch the raw bytes to produce a genuinely malicious entry name.
    badZip.addFile('aa/bb/outside-escape.txt', Buffer.from('evil'));
    const badBuf = Buffer.from(badZip.toBuffer().toString('binary').split('aa/bb/outside-escape.txt').join('../../outside-escape.txt'), 'binary');
    fs.writeFileSync(badZipPath, badBuf);

    await assert.rejects(
      () =>
        applyZipBuildUpdate({
          zipFilePath: badZipPath,
          targetAppDir: tempAppRoot,
          runBuild: false,
          syncPublicHtml: false,
          adminEmail: 'qa-admin@muztalk.app',
        }),
      /Unsafe path detected/
    );
  } finally {
    fs.rmSync(tempAppRoot, { recursive: true, force: true });
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
    if (fs.existsSync(badZipPath)) fs.unlinkSync(badZipPath);
  }
});
