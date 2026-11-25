import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { envConfig } from '../config/env';
import { store } from '../db/store';
import {
  AuthenticatedRequest,
  issueAdminToken,
  issueUserTokens,
  requireAdminAuth,
  requireAuth,
  signMediaUrl,
  verifyMediaSignature,
} from '../middleware/auth';
import { emitToUser, getIO } from '../socket';
import { sendPushNotificationToUsers, verifyFirebaseAdminCredentials } from '../services/fcm';
import { applyZipBuildUpdate } from '../services/updater';
import type { CallDTO, CommunityDTO, GroupDTO, MessageDTO, StatusDTO } from '../../shared/types';

export const apiRouter = express.Router();

const legacyUploadsDir = path.resolve(process.cwd(), 'uploads');
const allowedMimePrefixes = ['image/', 'video/', 'audio/', 'application/pdf', 'text/plain', 'application/zip', 'application/octet-stream'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, store.getUploadsDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = allowedMimePrefixes.some((p) => file.mimetype.startsWith(p));
    cb(null, ok);
  },
});

const zipUpload = multer({
  dest: path.join(os.tmpdir(), 'muztalk-zip-updates'),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const lower = file.originalname.toLowerCase();
    const ok = lower.endsWith('.zip') || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.mimetype === 'application/octet-stream';
    cb(null, ok);
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait a moment.' },
});

// ============================================================================
// HEALTH & INFRASTRUCTURE STATUS
// ============================================================================
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json(store.getSystemHealth());
});

apiRouter.get('/security-policy', (req: Request, res: Response) => {
  let userBlocked = false;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), envConfig.jwtAccessSecret) as { sub: string; type: string };
      if (decoded.type === 'access') {
        const user = store.users.get(decoded.sub);
        if (user?.blockScreenCapture) userBlocked = true;
      }
    } catch {
      // ignore invalid optional token
    }
  }
  res.json({
    blockScreenCapture: Boolean(store.appConfig.blockScreenCapture || userBlocked),
    globalBlockScreenCapture: Boolean(store.appConfig.blockScreenCapture),
  });
});

apiRouter.get('/calls/ice-config', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const callsCfg = store.integrations.calls;
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: callsCfg.stunServerUrl || envConfig.stunServerUrl },
  ];
  if (callsCfg.turnServerUrl) {
    iceServers.push({
      urls: callsCfg.turnServerUrl,
      username: callsCfg.turnUsername,
      credential: callsCfg.turnCredential,
    });
  }
  res.json({
    iceServers,
    livekit: {
      configured: Boolean(callsCfg.livekitUrl && callsCfg.livekitApiKey),
      url: callsCfg.livekitUrl || null,
    },
  });
});

async function sendSmtpMail(to: string, subject: string, text: string, html: string): Promise<{ sent: boolean; provider: string; error?: string }> {
  const smtp = store.integrations.smtp;
  if (!smtp.enabled || !smtp.host || !smtp.user || !smtp.pass) {
    return { sent: false, provider: 'development_testing_mode' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: Boolean(smtp.secure),
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
    await transporter.sendMail({
      from: `"${smtp.fromName || 'MuzTalk'}" <${smtp.fromEmail || smtp.user}>`,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, provider: 'smtp' };
  } catch (err) {
    return { sent: false, provider: 'smtp_error', error: (err as Error).message };
  }
}

// ============================================================================
// AUTHENTICATION (SMTP Email + Username, Password, Optional Twilio Phone OTP)
// ============================================================================
apiRouter.post('/auth/send-email-otp', authLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email().max(160),
    username: z.string().min(3).max(40).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email address required' });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const cleanUsername = parsed.data.username?.trim().replace(/^@/, '').toLowerCase();

  const otpCode = String(crypto.randomInt(100000, 999999));
  const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');

  store.emailOtps.set(normalizedEmail, {
    email: normalizedEmail,
    username: cleanUsername,
    codeHash,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  const mailRes = await sendSmtpMail(
    normalizedEmail,
    'Your MuzTalk Verification Code',
    `Your MuzTalk verification code is ${otpCode}. It expires in 10 minutes.`,
    `<div style="font-family:sans-serif;padding:16px"><h2>MuzTalk Verification</h2><p>Your 6-digit login code is:</p><h1 style="letter-spacing:4px;color:#20BFA5">${otpCode}</h1><p>This code expires in 10 minutes.</p></div>`
  );

  if (mailRes.provider === 'smtp_error') {
    res.status(502).json({ error: `SMTP delivery failed: ${mailRes.error}` });
    return;
  }

  const response: Record<string, unknown> = {
    sent: true,
    email: normalizedEmail,
    expiresInSeconds: 600,
    provider: mailRes.sent ? 'smtp' : 'development_testing_mode',
  };
  if (!mailRes.sent && envConfig.devOtpMode) {
    response.devOtpPreview = otpCode;
  }
  res.json(response);
});

apiRouter.post('/auth/verify-email-otp', authLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email().max(160),
    otp: z.string().length(6),
    username: z.string().min(3).max(40).optional(),
    displayName: z.string().min(2).max(100).optional(),
    password: z.string().min(6).max(128).optional(),
    deviceName: z.string().max(120).default('MuzTalk Client'),
    platform: z.string().max(32).default('Web'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and 6-digit otp required' });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const record = store.emailOtps.get(normalizedEmail);
  if (!record || record.expiresAt < Date.now()) {
    res.status(400).json({ error: 'Email OTP expired or not requested' });
    return;
  }
  record.attempts += 1;
  if (record.attempts > 5) {
    store.emailOtps.delete(normalizedEmail);
    res.status(429).json({ error: 'Maximum OTP attempts exceeded' });
    return;
  }

  const candidateHash = crypto.createHash('sha256').update(parsed.data.otp).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.codeHash))) {
    res.status(401).json({ error: 'Incorrect OTP code' });
    return;
  }
  store.emailOtps.delete(normalizedEmail);

  const requestedUsername = (parsed.data.username || record.username || '').trim().replace(/^@/, '').toLowerCase();
  let user = Array.from(store.users.values()).find((u) => u.email?.toLowerCase() === normalizedEmail);
  let isNewUser = false;

  if (!user) {
    if (!store.appConfig.allowNewRegistrations) {
      res.status(403).json({ error: 'New registrations are currently paused by administrator' });
      return;
    }
    if (
      requestedUsername &&
      Array.from(store.users.values()).some((u) => u.username?.toLowerCase() === requestedUsername)
    ) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }
    isNewUser = true;
    const id = uuidv4();
    const fallbackHandle = normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';
    const finalUsername = requestedUsername || `${fallbackHandle}_${crypto.randomInt(10, 99)}`;
    const cleanName = parsed.data.displayName?.trim() || finalUsername;
    const syntheticPhone = `mail_${crypto.randomInt(10000000, 99999999)}`;

    user = {
      id,
      phoneNumber: syntheticPhone,
      countryCode: '+00',
      email: normalizedEmail,
      username: finalUsername,
      displayName: cleanName,
      about: 'Hey there! I am using MuzTalk.',
      avatarUrl: null,
      status: 'ACTIVE',
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      passwordHash: parsed.data.password ? bcrypt.hashSync(parsed.data.password, 10) : null,
      encryptionFingerprint: store.generateFingerprint(),
      settings: {
        theme: 'system',
        language: 'en',
        lastSeenVisibility: 'everyone',
        avatarVisibility: 'everyone',
        aboutVisibility: 'everyone',
        readReceipts: true,
        messageAlerts: true,
        groupAlerts: true,
        callAlerts: true,
        autoDownloadMedia: true,
        chatWallpaper: 'default',
      },
    };
    store.users.set(id, user);

    await store.executeMysql(
      `INSERT INTO users (id, phone_number, country_code, email, username, password_hash, status, is_online, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', TRUE, NOW(), NOW())`,
      [user.id, user.phoneNumber, user.countryCode, user.email, user.username, user.passwordHash]
    );
    await store.executeMysql(
      `INSERT INTO user_profiles (id, user_id, display_name, about, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), user.id, user.displayName, user.about]
    );
  } else {
    if (user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account is suspended or deleted' });
      return;
    }
    if (parsed.data.password && !user.passwordHash) {
      user.passwordHash = bcrypt.hashSync(parsed.data.password, 10);
    }
  }

  const deviceId = uuidv4();
  store.devices.set(deviceId, {
    id: deviceId,
    userId: user.id,
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
    isPrimary: isNewUser,
    lastActiveAt: new Date().toISOString(),
  });

  const tokens = issueUserTokens(user.id, deviceId);
  await store.syncUserToMysql(user);
  await store.persistNow();
  res.json({
    isNewUser,
    user: store.sanitizeUser(user),
    deviceId,
    ...tokens,
  });
});

apiRouter.post('/auth/login-password', authLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    identifier: z.string().min(3).max(160),
    password: z.string().min(6).max(128),
    deviceName: z.string().max(120).default('MuzTalk Client'),
    platform: z.string().max(32).default('Web'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Username/email and password (min 6 chars) required' });
    return;
  }

  const ident = parsed.data.identifier.trim().replace(/^@/, '').toLowerCase();
  const user = Array.from(store.users.values()).find(
    (u) => u.email?.toLowerCase() === ident || (u.username || '').toLowerCase() === ident
  );

  if (!user || !user.passwordHash || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid username/email or password' });
    return;
  }
  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is suspended or deleted' });
    return;
  }
  if (!user.email) {
    res.status(400).json({ error: 'No email linked to this account. Please sign in with Email or Phone OTP.' });
    return;
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const otpCode = String(crypto.randomInt(100000, 999999));
  const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');

  store.emailOtps.set(normalizedEmail, {
    email: normalizedEmail,
    username: user.username || undefined,
    codeHash,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  const mailRes = await sendSmtpMail(
    normalizedEmail,
    'MuzTalk Login Verification Code',
    `Your MuzTalk login OTP code is ${otpCode}. It expires in 10 minutes.`,
    `<div style="font-family:sans-serif;padding:16px"><h2>MuzTalk Login Verification</h2><p>Your 6-digit login code is:</p><h1 style="letter-spacing:4px;color:#20BFA5">${otpCode}</h1><p>This code expires in 10 minutes.</p></div>`
  );

  if (mailRes.provider === 'smtp_error') {
    res.status(502).json({ error: `SMTP delivery failed: ${mailRes.error}` });
    return;
  }

  const response: Record<string, unknown> = {
    requiresOtp: true,
    email: normalizedEmail,
    expiresInSeconds: 600,
    provider: mailRes.sent ? 'smtp' : 'development_testing_mode',
  };
  if (!mailRes.sent && envConfig.devOtpMode) {
    response.devOtpPreview = otpCode;
  }
  res.json(response);
});

// Optional Phone OTP (uses Twilio if configured in Admin Panel, otherwise dev mode)
apiRouter.post('/auth/send-otp', authLimiter, (req: Request, res: Response) => {
  const schema = z.object({
    countryCode: z.string().min(1).max(8).default('+92'),
    phoneNumber: z.string().min(6).max(24),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid phone number and country code required' });
    return;
  }

  const normalizedPhone = parsed.data.phoneNumber.startsWith('+')
    ? parsed.data.phoneNumber.replace(/\s+/g, '')
    : `${parsed.data.countryCode}${parsed.data.phoneNumber.replace(/^0+/, '').replace(/\s+/g, '')}`;

  const otpCode = String(crypto.randomInt(100000, 999999));
  const codeHash = crypto.createHash('sha256').update(otpCode).digest('hex');

  store.otps.set(normalizedPhone, {
    phoneNumber: normalizedPhone,
    countryCode: parsed.data.countryCode,
    codeHash,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  const twilioConfigured = store.integrations.twilio.enabled && Boolean(store.integrations.twilio.accountSid);
  const response: Record<string, unknown> = {
    sent: true,
    phoneNumber: normalizedPhone,
    expiresInSeconds: 300,
    provider: twilioConfigured ? 'twilio_gateway' : 'development_testing_mode',
  };
  if (envConfig.devOtpMode) {
    response.devOtpPreview = otpCode;
  }
  res.json(response);
});

apiRouter.post('/auth/verify-otp', authLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    phoneNumber: z.string().min(6).max(24),
    otp: z.string().length(6),
    displayName: z.string().min(2).max(100).optional(),
    username: z.string().min(3).max(40).optional(),
    deviceName: z.string().max(120).default('MuzTalk Web Browser'),
    platform: z.string().max(32).default('Web'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid phoneNumber and 6-digit otp required' });
    return;
  }

  const normalizedPhone = parsed.data.phoneNumber.replace(/\s+/g, '');
  const record = store.otps.get(normalizedPhone);
  if (!record || record.expiresAt < Date.now()) {
    res.status(400).json({ error: 'OTP expired or not requested' });
    return;
  }
  record.attempts += 1;
  if (record.attempts > 5) {
    store.otps.delete(normalizedPhone);
    res.status(429).json({ error: 'Maximum OTP attempts exceeded' });
    return;
  }

  const candidateHash = crypto.createHash('sha256').update(parsed.data.otp).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(record.codeHash))) {
    res.status(401).json({ error: 'Incorrect OTP code' });
    return;
  }
  store.otps.delete(normalizedPhone);

  let user = Array.from(store.users.values()).find((u) => u.phoneNumber === normalizedPhone);
  let isNewUser = false;

  if (!user) {
    if (!store.appConfig.allowNewRegistrations) {
      res.status(403).json({ error: 'New registrations are currently paused by administrator' });
      return;
    }
    isNewUser = true;
    const id = uuidv4();
    const cleanName = parsed.data.displayName?.trim() || `User ${normalizedPhone.slice(-4)}`;
    user = {
      id,
      phoneNumber: normalizedPhone,
      countryCode: record.countryCode,
      username: parsed.data.username || `user_${normalizedPhone.slice(-4)}_${crypto.randomInt(10, 99)}`,
      displayName: cleanName,
      about: 'Hey there! I am using MuzTalk.',
      avatarUrl: null,
      status: 'ACTIVE',
      isOnline: true,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      passwordHash: null,
      encryptionFingerprint: store.generateFingerprint(),
      settings: {
        theme: 'system',
        language: 'en',
        lastSeenVisibility: 'everyone',
        avatarVisibility: 'everyone',
        aboutVisibility: 'everyone',
        readReceipts: true,
        messageAlerts: true,
        groupAlerts: true,
        callAlerts: true,
        autoDownloadMedia: true,
        chatWallpaper: 'default',
      },
    };
    store.users.set(id, user);

    await store.executeMysql(
      `INSERT INTO users (id, phone_number, country_code, username, status, is_online, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', TRUE, NOW(), NOW())`,
      [user.id, user.phoneNumber, user.countryCode, user.username]
    );
    await store.executeMysql(
      `INSERT INTO user_profiles (id, user_id, display_name, about, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), user.id, user.displayName, user.about]
    );
  } else if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is suspended or deleted' });
    return;
  }

  const deviceId = uuidv4();
  store.devices.set(deviceId, {
    id: deviceId,
    userId: user.id,
    deviceName: parsed.data.deviceName,
    platform: parsed.data.platform,
    isPrimary: isNewUser,
    lastActiveAt: new Date().toISOString(),
  });

  const tokens = issueUserTokens(user.id, deviceId);
  await store.syncUserToMysql(user);
  await store.persistNow();
  res.json({
    isNewUser,
    user: store.sanitizeUser(user),
    deviceId,
    ...tokens,
  });
});

apiRouter.post('/auth/register', authLimiter, (req: Request, res: Response) => {
  // Alias redirecting cleanly to send-otp validation flow
  res.status(200).json({
    message: 'Use /api/auth/send-otp followed by /api/auth/verify-otp to register with phone verification.',
  });
});

apiRouter.post('/auth/login', authLimiter, (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Use /api/auth/send-otp followed by /api/auth/verify-otp to sign in.',
  });
});

apiRouter.post('/auth/refresh', (req: Request, res: Response) => {
  const schema = z.object({ refreshToken: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'refreshToken required' });
    return;
  }
  const tokenHash = crypto.createHash('sha256').update(parsed.data.refreshToken).digest('hex');
  const existing = store.refreshTokens.get(tokenHash);
  if (!existing || existing.revoked || existing.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Invalid or revoked refresh token' });
    return;
  }
  try {
    const decoded = jwt.verify(parsed.data.refreshToken, envConfig.jwtRefreshSecret) as {
      sub: string;
      deviceId?: string;
    };
    existing.revoked = true; // Rotate refresh token
    const tokens = issueUserTokens(decoded.sub, decoded.deviceId || uuidv4());
    store.schedulePersist();
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Refresh token verification failed' });
  }
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken === 'string') {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const existing = store.refreshTokens.get(tokenHash);
    if (existing) existing.revoked = true;
  }
  if (req.deviceId) {
    store.devices.delete(req.deviceId);
  }
  store.schedulePersist();
  res.json({ loggedOut: true });
});

apiRouter.get('/auth/devices', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const list = Array.from(store.devices.values()).filter((d) => d.userId === req.userId);
  res.json({ devices: list });
});

apiRouter.delete('/auth/devices/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const device = store.devices.get(req.params.id);
  if (!device || device.userId !== req.userId) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }
  store.devices.delete(device.id);
  res.json({ deleted: true });
});

// ============================================================================
// USERS, PROFILES, PRIVACY, E2EE KEYS & CONTACTS
// ============================================================================
apiRouter.get('/users/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = store.users.get(req.userId!)!;
  const blockedIds = Array.from(store.blockedUsers.get(req.userId!) || []);
  res.json({
    user: store.sanitizeUser(user),
    blockedUserIds: blockedIds,
    securityPolicy: {
      blockScreenCapture: Boolean(store.appConfig.blockScreenCapture || user.blockScreenCapture),
    },
  });
});

apiRouter.put('/users/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_]+$/).optional(),
    about: z.string().max(255).optional(),
    avatarUrl: z.string().max(512).nullable().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update fields' });
    return;
  }
  const user = store.users.get(req.userId!)!;
  if (parsed.data.username && parsed.data.username !== user.username) {
    const taken = Array.from(store.users.values()).some(
      (u) => u.id !== user.id && u.username?.toLowerCase() === parsed.data.username!.toLowerCase()
    );
    if (taken) {
      res.status(409).json({ error: 'Username already in use' });
      return;
    }
    user.username = parsed.data.username;
  }
  if (parsed.data.displayName !== undefined) user.displayName = parsed.data.displayName;
  if (parsed.data.about !== undefined) user.about = parsed.data.about;
  if (parsed.data.avatarUrl !== undefined) user.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.settings) {
    user.settings = { ...user.settings, ...(parsed.data.settings as Partial<typeof user.settings>) };
  }

  await store.syncUserToMysql(user);
  store.schedulePersist();

  res.json({ user: store.sanitizeUser(user) });
});

apiRouter.get('/users/search', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const list = Array.from(store.users.values())
    .filter((u) => u.id !== req.userId && u.status === 'ACTIVE')
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        u.phoneNumber.includes(q)
    )
    .map((u) => store.sanitizeUser(u));
  res.json({ users: list });
});

apiRouter.get('/users/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const target = store.users.get(req.params.id);
  if (!target || target.status === 'DELETED') {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: store.sanitizeUser(target) });
});

apiRouter.post('/users/:id/block', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!store.blockedUsers.has(req.userId!)) store.blockedUsers.set(req.userId!, new Set());
  store.blockedUsers.get(req.userId!)!.add(req.params.id);
  res.json({ blocked: true });
});

apiRouter.delete('/users/:id/block', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  store.blockedUsers.get(req.userId!)?.delete(req.params.id);
  res.json({ blocked: false });
});

apiRouter.post('/users/:id/report', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    reason: z.string().min(3).max(120),
    details: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid report reason required' });
    return;
  }
  const reporter = store.users.get(req.userId!)!;
  const reported = store.users.get(req.params.id);
  if (!reported) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const report = {
    id: uuidv4(),
    reporterId: reporter.id,
    reporterName: reporter.displayName,
    reportedUserId: reported.id,
    reportedUserName: reported.displayName,
    reason: parsed.data.reason,
    details: parsed.data.details || null,
    status: 'OPEN' as const,
    resolvedById: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.reports.set(report.id, report);
  store.schedulePersist();
  res.status(201).json({ report });
});

// E2EE Key Bundle registration / lookup
apiRouter.post('/users/me/keys', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    identityKeyPub: z.string().min(10),
    signedPreKeyPub: z.string().min(10),
    signedPreKeySig: z.string().min(10),
    fingerprint: z.string().min(10).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid public key bundle required' });
    return;
  }
  const user = store.users.get(req.userId!)!;
  user.encryptionFingerprint = parsed.data.fingerprint;
  user.encryptionKeyBundle = {
    deviceId: req.deviceId || 'default',
    ...parsed.data,
  };
  store.schedulePersist();
  res.json({ stored: true, fingerprint: user.encryptionFingerprint });
});

apiRouter.get('/contacts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const entries = store.contacts.get(req.userId!) || [];
  const contacts = entries
    .map((entry) => {
      const target = store.users.get(entry.contactUserId);
      if (!target) return null;
      return {
        ...store.sanitizeUser(target),
        aliasName: entry.aliasName,
        isFavorite: entry.isFavorite,
      };
    })
    .filter(Boolean);
  res.json({ contacts });
});

apiRouter.post('/contacts', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    contactUserId: z.string().min(1),
    aliasName: z.string().max(100).optional(),
    isFavorite: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'contactUserId required' });
    return;
  }
  const list = store.contacts.get(req.userId!) || [];
  if (!list.some((c) => c.contactUserId === parsed.data.contactUserId)) {
    list.push({
      contactUserId: parsed.data.contactUserId,
      aliasName: parsed.data.aliasName || null,
      isFavorite: parsed.data.isFavorite || false,
    });
    store.contacts.set(req.userId!, list);
    store.schedulePersist();
  }
  res.status(201).json({ added: true });
});

// ============================================================================
// CHATS & MESSAGES
// ============================================================================
apiRouter.get('/chats', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const unreadOnly = req.query.unread === 'true';
  const includeArchived = req.query.archived === 'true';

  let chats = store.getUserChats(req.userId!);
  if (!includeArchived) {
    chats = chats.filter((c) => !c.isArchived);
  } else {
    chats = chats.filter((c) => c.isArchived);
  }
  if (unreadOnly) {
    chats = chats.filter((c) => c.unreadCount > 0);
  }
  if (q) {
    chats = chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessage?.text || '').toLowerCase().includes(q)
    );
  }
  res.json({ chats });
});

apiRouter.post('/chats', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ peerUserId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'peerUserId required' });
    return;
  }
  const peer = store.users.get(parsed.data.peerUserId);
  if (!peer) {
    res.status(404).json({ error: 'Recipient user not found' });
    return;
  }

  // Return existing direct chat if present
  for (const conv of store.conversations.values()) {
    if (
      conv.type === 'DIRECT' &&
      conv.members.some((m) => m.userId === req.userId) &&
      conv.members.some((m) => m.userId === peer.id)
    ) {
      const chat = store.getUserChats(req.userId!).find((c) => c.id === conv.id);
      res.json({ chat });
      return;
    }
  }

  const convId = uuidv4();
  const now = new Date().toISOString();
  store.conversations.set(convId, {
    id: convId,
    type: 'DIRECT',
    createdAt: now,
    lastMessageAt: now,
    members: [
      { userId: req.userId!, isPinned: false, isArchived: false, isMuted: false, unreadCount: 0, lastReadAt: now },
      { userId: peer.id, isPinned: false, isArchived: false, isMuted: false, unreadCount: 0, lastReadAt: now },
    ],
  });

  // Join active sockets to new chat room
  const io = getIO();
  if (io) {
    io.in(`user:${req.userId}`).socketsJoin(`chat:${convId}`);
    io.in(`user:${peer.id}`).socketsJoin(`chat:${convId}`);
  }

  const chat = store.getUserChats(req.userId!).find((c) => c.id === convId);
  store.schedulePersist();
  res.status(201).json({ chat });
});

apiRouter.patch('/chats/:id/preferences', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const conv = store.conversations.get(req.params.id);
  if (!conv) {
    res.status(404).json({ error: 'Chat not found' });
    return;
  }
  const member = conv.members.find((m) => m.userId === req.userId);
  if (!member) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const { isPinned, isArchived, isMuted, markUnread } = req.body || {};
  if (typeof isPinned === 'boolean') member.isPinned = isPinned;
  if (typeof isArchived === 'boolean') member.isArchived = isArchived;
  if (typeof isMuted === 'boolean') member.isMuted = isMuted;
  if (markUnread === true) member.unreadCount = Math.max(1, member.unreadCount);
  if (markUnread === false) member.unreadCount = 0;

  res.json({ updated: true });
});

apiRouter.get('/chats/:id/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const conv = store.conversations.get(req.params.id);
  if (!conv || !conv.members.some((m) => m.userId === req.userId)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  const q = String(req.query.q || '').trim().toLowerCase();
  const list = Array.from(store.messages.values())
    .filter((m) => m.conversationId === conv.id && !(m.deletedForUserIds || []).includes(req.userId!))
    .filter((m) => !q || m.text.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  res.json({ messages: list });
});

apiRouter.post('/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    clientMessageId: z.string().max(64).optional(),
    conversationId: z.string().min(1),
    type: z
      .enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE_NOTE', 'DOCUMENT', 'STICKER', 'GIF', 'LOCATION', 'CONTACT', 'SYSTEM'])
      .default('TEXT'),
    text: z.string().max(4000).default(''),
    replyToId: z.string().optional().nullable(),
    forwardedFromId: z.string().optional().nullable(),
    attachments: z.array(z.any()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid message body' });
    return;
  }
  const conv = store.conversations.get(parsed.data.conversationId);
  if (!conv || !conv.members.some((m) => m.userId === req.userId)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  const sender = store.users.get(req.userId!)!;
  const replyTarget = parsed.data.replyToId ? store.messages.get(parsed.data.replyToId) : undefined;
  const now = new Date().toISOString();
  const msg: MessageDTO = {
    id: uuidv4(),
    clientMessageId: parsed.data.clientMessageId || null,
    conversationId: conv.id,
    senderId: sender.id,
    senderName: sender.displayName,
    senderAvatar: sender.avatarUrl,
    type: parsed.data.type,
    text: parsed.data.text,
    isEncrypted: true,
    replyToId: parsed.data.replyToId || null,
    replyPreview: replyTarget
      ? { id: replyTarget.id, senderName: replyTarget.senderName || 'User', text: replyTarget.text, type: replyTarget.type }
      : null,
    forwardedFromId: parsed.data.forwardedFromId || null,
    isStarred: false,
    isPinned: false,
    isEdited: false,
    receiptStatus: 'SENT',
    reactions: [],
    attachments: parsed.data.attachments || [],
    createdAt: now,
    updatedAt: now,
  };
  store.messages.set(msg.id, msg);
  conv.lastMessageAt = now;
  for (const m of conv.members) {
    if (m.userId !== sender.id) m.unreadCount += 1;
  }
  store.schedulePersist();
  getIO()?.to(`chat:${conv.id}`).emit('message:new', msg);
  const recipientIds = conv.members.filter((m) => m.userId !== sender.id).map((m) => m.userId);
  void sendPushNotificationToUsers(recipientIds, {
    category: 'message',
    title: sender.displayName,
    body: parsed.data.text || `Sent ${parsed.data.type.toLowerCase()}`,
    data: { conversationId: conv.id, messageId: msg.id },
  });
  res.status(201).json({ message: msg });
});

apiRouter.put('/messages/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const msg = store.messages.get(req.params.id);
  if (!msg || msg.senderId !== req.userId) {
    res.status(404).json({ error: 'Message not found or unauthorized' });
    return;
  }
  const { text, isStarred, isPinned } = req.body || {};
  if (typeof text === 'string' && text.trim()) {
    msg.text = text.trim();
    msg.isEdited = true;
  }
  if (typeof isStarred === 'boolean') msg.isStarred = isStarred;
  if (typeof isPinned === 'boolean') msg.isPinned = isPinned;
  msg.updatedAt = new Date().toISOString();
  store.schedulePersist();

  getIO()?.to(`chat:${msg.conversationId}`).emit('message:edit', msg);
  res.json({ message: msg });
});

apiRouter.delete('/messages/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const msg = store.messages.get(req.params.id);
  if (!msg) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  const scope = req.query.scope === 'everyone' ? 'everyone' : 'me';
  if (scope === 'everyone') {
    if (msg.senderId !== req.userId) {
      res.status(403).json({ error: 'Only sender can delete for everyone' });
      return;
    }
    msg.text = 'This message was deleted';
    msg.attachments = [];
    msg.deletedForAllAt = new Date().toISOString();
    getIO()?.to(`chat:${msg.conversationId}`).emit('message:delete', {
      messageId: msg.id,
      conversationId: msg.conversationId,
      scope: 'everyone',
    });
  } else {
    msg.deletedForUserIds = [...(msg.deletedForUserIds || []), req.userId!];
  }
  store.schedulePersist();
  res.json({ deleted: true, scope });
});

// ============================================================================
// GROUPS & COMMUNITIES
// ============================================================================
apiRouter.get('/groups', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const list = Array.from(store.groups.values()).filter((g) =>
    g.members.some((m) => m.userId === req.userId)
  );
  res.json({ groups: list });
});

apiRouter.post('/groups', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).default(''),
    memberIds: z.array(z.string()).default([]),
    onlyAdminsPost: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid group name required' });
    return;
  }

  const now = new Date().toISOString();
  const convId = uuidv4();
  const groupId = uuidv4();
  const uniqueIds = Array.from(new Set([req.userId!, ...parsed.data.memberIds])).filter((id) =>
    store.users.has(id)
  );

  store.conversations.set(convId, {
    id: convId,
    type: 'GROUP',
    createdAt: now,
    lastMessageAt: now,
    members: uniqueIds.map((uid) => ({
      userId: uid,
      isPinned: false,
      isArchived: false,
      isMuted: false,
      unreadCount: uid === req.userId ? 0 : 1,
      lastReadAt: now,
    })),
  });

  const group: GroupDTO = {
    id: groupId,
    conversationId: convId,
    name: parsed.data.name,
    description: parsed.data.description,
    avatarUrl: null,
    onlyAdminsPost: parsed.data.onlyAdminsPost,
    inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    createdById: req.userId!,
    members: uniqueIds.map((uid) => {
      const u = store.users.get(uid)!;
      return {
        userId: u.id,
        displayName: u.displayName,
        username: u.username,
        avatarUrl: u.avatarUrl,
        role: uid === req.userId ? 'OWNER' : 'MEMBER',
        isOnline: u.isOnline,
      };
    }),
    createdAt: now,
  };
  store.groups.set(groupId, group);
  store.schedulePersist();

  const io = getIO();
  if (io) {
    uniqueIds.forEach((uid) => {
      io.in(`user:${uid}`).socketsJoin(`chat:${convId}`);
      emitToUser(uid, 'group:created', group);
    });
  }

  res.status(201).json({ group });
});

apiRouter.post('/groups/:id/members', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const group = store.groups.get(req.params.id);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }
  const { userId } = req.body || {};
  const target = store.users.get(userId);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (!group.members.some((m) => m.userId === target.id)) {
    group.members.push({
      userId: target.id,
      displayName: target.displayName,
      username: target.username,
      avatarUrl: target.avatarUrl,
      role: 'MEMBER',
      isOnline: target.isOnline,
    });
    const conv = store.conversations.get(group.conversationId);
    conv?.members.push({
      userId: target.id,
      isPinned: false,
      isArchived: false,
      isMuted: false,
      unreadCount: 0,
      lastReadAt: new Date().toISOString(),
    });
    getIO()?.in(`user:${target.id}`).socketsJoin(`chat:${group.conversationId}`);
    getIO()?.to(`chat:${group.conversationId}`).emit('group:member_added', { groupId: group.id, userId: target.id });
  }
  res.json({ group });
});

apiRouter.get('/communities', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ communities: Array.from(store.communities.values()) });
});

apiRouter.post('/communities', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(120),
    description: z.string().max(500).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Community name required' });
    return;
  }

  const now = new Date().toISOString();
  const creator = store.users.get(req.userId!)!;
  const annConvId = uuidv4();
  const annGrpId = uuidv4();

  store.conversations.set(annConvId, {
    id: annConvId,
    type: 'COMMUNITY_ANNOUNCEMENT',
    createdAt: now,
    lastMessageAt: now,
    members: [
      { userId: creator.id, isPinned: false, isArchived: false, isMuted: false, unreadCount: 0, lastReadAt: now },
    ],
  });

  store.groups.set(annGrpId, {
    id: annGrpId,
    conversationId: annConvId,
    name: `${parsed.data.name} Announcements`,
    description: parsed.data.description,
    avatarUrl: null,
    onlyAdminsPost: true,
    inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    createdById: creator.id,
    members: [
      {
        userId: creator.id,
        displayName: creator.displayName,
        username: creator.username,
        avatarUrl: creator.avatarUrl,
        role: 'OWNER',
        isOnline: creator.isOnline,
      },
    ],
    createdAt: now,
  });

  const community: CommunityDTO = {
    id: uuidv4(),
    name: parsed.data.name,
    description: parsed.data.description,
    avatarUrl: null,
    inviteCode: crypto.randomBytes(4).toString('hex').toUpperCase(),
    createdById: creator.id,
    announcementGroupId: annGrpId,
    groups: [
      {
        groupId: annGrpId,
        conversationId: annConvId,
        name: `${parsed.data.name} Announcements`,
        memberCount: 1,
        isAnnouncement: true,
      },
    ],
    memberCount: 1,
    createdAt: now,
  };
  store.communities.set(community.id, community);
  store.schedulePersist();
  getIO()?.in(`user:${creator.id}`).socketsJoin(`chat:${annConvId}`);
  res.status(201).json({ community });
});

// ============================================================================
// CALLS (1:1 Audio/Video WebRTC + Group SFU Call History)
// ============================================================================
apiRouter.get('/calls/history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const history = Array.from(store.calls.values())
    .filter((c) => c.initiatorId === req.userId || c.peerId === req.userId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  res.json({ calls: history });
});

apiRouter.post('/calls', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    peerId: z.string().optional().nullable(),
    conversationId: z.string().optional().nullable(),
    type: z.enum(['AUDIO', 'VIDEO', 'GROUP_AUDIO', 'GROUP_VIDEO']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid call parameters required' });
    return;
  }
  const initiator = store.users.get(req.userId!)!;
  const peer = parsed.data.peerId ? store.users.get(parsed.data.peerId) : undefined;
  const call: CallDTO = {
    id: uuidv4(),
    conversationId: parsed.data.conversationId || null,
    initiatorId: initiator.id,
    initiatorName: initiator.displayName,
    initiatorAvatar: initiator.avatarUrl,
    peerId: peer?.id || null,
    peerName: peer?.displayName || 'Group Call Room',
    peerAvatar: peer?.avatarUrl || null,
    type: parsed.data.type,
    status: 'RINGING',
    livekitRoom: parsed.data.type.startsWith('GROUP') ? `muztalk-room-${uuidv4().slice(0, 8)}` : null,
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    durationSec: 0,
  };
  store.calls.set(call.id, call);
  store.schedulePersist();

  if (peer) {
    emitToUser(peer.id, 'call:incoming', {
      callId: call.id,
      fromUserId: initiator.id,
      fromName: initiator.displayName,
      fromAvatar: initiator.avatarUrl,
      type: call.type,
      conversationId: call.conversationId,
    });
    void sendPushNotificationToUsers([peer.id], {
      category: 'call',
      title: `Incoming ${call.type.includes('VIDEO') ? 'Video' : 'Audio'} Call`,
      body: `${initiator.displayName} is calling you on MuzTalk`,
      data: { callId: call.id, fromUserId: initiator.id, callType: call.type },
    });
  }
  res.status(201).json({ call });
});

apiRouter.post('/calls/:id/end', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const call = store.calls.get(req.params.id);
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  call.status = call.answeredAt ? 'ENDED' : 'MISSED';
  call.endedAt = new Date().toISOString();
  if (call.answeredAt) {
    call.durationSec = Math.max(
      1,
      Math.floor((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1000)
    );
  }
  store.schedulePersist();
  res.json({ call });
});

// ============================================================================
// STATUSES (24-Hour Ephemeral Updates)
// ============================================================================
apiRouter.get('/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const nowMs = Date.now();
  const active = Array.from(store.statuses.values())
    .filter((s) => new Date(s.expiresAt).getTime() > nowMs)
    .map((s) => ({
      ...s,
      viewedByMe: s.viewers.some((v) => v.userId === req.userId),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ statuses: active });
});

apiRouter.post('/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    type: z.enum(['TEXT', 'IMAGE', 'VIDEO']).default('TEXT'),
    contentText: z.string().max(700).optional().nullable(),
    mediaUrl: z.string().max(512).optional().nullable(),
    bgColor: z.string().max(24).optional().nullable(),
    caption: z.string().max(300).optional().nullable(),
    privacyMode: z.enum(['CONTACTS', 'EXCEPT_SELECTED', 'ONLY_SELECTED']).default('CONTACTS'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status update' });
    return;
  }
  const user = store.users.get(req.userId!)!;
  const now = Date.now();
  const status: StatusDTO = {
    id: uuidv4(),
    userId: user.id,
    userName: user.displayName,
    userAvatar: user.avatarUrl,
    type: parsed.data.type,
    contentText: parsed.data.contentText || null,
    mediaUrl: parsed.data.mediaUrl || null,
    bgColor: parsed.data.bgColor || '#101C35',
    caption: parsed.data.caption || null,
    privacyMode: parsed.data.privacyMode,
    viewsCount: 0,
    viewedByMe: true,
    viewers: [],
    reactions: [],
    expiresAt: new Date(now + 24 * 3_600_000).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  store.statuses.set(status.id, status);
  store.schedulePersist();
  res.status(201).json({ status });
});

apiRouter.post('/status/:id/view', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const status = store.statuses.get(req.params.id);
  if (!status) {
    res.status(404).json({ error: 'Status not found' });
    return;
  }
  const viewer = store.users.get(req.userId!)!;
  if (status.userId !== viewer.id && !status.viewers.some((v) => v.userId === viewer.id)) {
    status.viewers.push({ userId: viewer.id, displayName: viewer.displayName, viewedAt: new Date().toISOString() });
    status.viewsCount = status.viewers.length;
    store.schedulePersist();
  }
  res.json({ status });
});

apiRouter.post('/status/:id/react', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const status = store.statuses.get(req.params.id);
  if (!status) {
    res.status(404).json({ error: 'Status not found' });
    return;
  }
  const emoji = String(req.body?.emoji || '💚').slice(0, 8);
  const existing = status.reactions.find((r) => r.userId === req.userId);
  if (existing) existing.emoji = emoji;
  else status.reactions.push({ userId: req.userId!, emoji });
  store.schedulePersist();
  res.json({ status });
});

apiRouter.delete('/status/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const status = store.statuses.get(req.params.id);
  if (!status || status.userId !== req.userId) {
    res.status(404).json({ error: 'Status not found or unauthorized' });
    return;
  }
  store.statuses.delete(status.id);
  store.schedulePersist();
  res.json({ deleted: true });
});

// ============================================================================
// STICKERS & MEDIA UPLOADS (Path-Confined + Signed URLs)
// ============================================================================
apiRouter.get('/stickers', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ packs: Array.from(store.stickerPacks.values()) });
});

apiRouter.post('/media/upload', requireAuth, upload.single('file'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Valid media file required (max 25MB)' });
    return;
  }
  const id = uuidv4();
  const storageKey = path.basename(req.file.filename);
  store.mediaFiles.set(id, {
    id,
    uploaderId: req.userId!,
    storageKey,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    createdAt: new Date().toISOString(),
  });
  store.schedulePersist();
  res.status(201).json({
    id,
    url: signMediaUrl(id),
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  });
});

apiRouter.get('/media/:id', (req: Request, res: Response) => {
  const media = store.mediaFiles.get(req.params.id);
  if (!media) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  // Allow access either via valid HMAC signed query params or Bearer JWT
  const exp = String(req.query.exp || '');
  const sig = String(req.query.sig || '');
  let authorized = verifyMediaSignature(media.id, exp, sig);

  if (!authorized && req.headers.authorization?.startsWith('Bearer ')) {
    try {
      jwt.verify(req.headers.authorization.slice(7), envConfig.jwtAccessSecret);
      authorized = true;
    } catch {
      authorized = false;
    }
  }
  if (!authorized) {
    res.status(401).json({ error: 'Signed media URL expired or unauthorized' });
    return;
  }

  const persistentUploadsDir = store.getUploadsDir();
  const safeKey = path.basename(media.storageKey);
  const persistentPath = path.resolve(persistentUploadsDir, safeKey);
  const legacyPath = path.resolve(legacyUploadsDir, safeKey);

  let resolvedPath: string | null = null;
  if (persistentPath.startsWith(persistentUploadsDir + path.sep) && fs.existsSync(persistentPath)) {
    resolvedPath = persistentPath;
  } else if (legacyPath.startsWith(legacyUploadsDir + path.sep) && fs.existsSync(legacyPath)) {
    resolvedPath = legacyPath;
  }

  if (!resolvedPath) {
    res.status(404).json({ error: 'Media file missing on storage' });
    return;
  }
  res.type(media.mimeType);
  res.sendFile(resolvedPath);
});

// ============================================================================
// NOTIFICATIONS & FCM DEVICES
// ============================================================================
apiRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const list = store.notifications.get(req.userId!) || [];
  res.json({ notifications: list });
});

apiRouter.post('/devices/register', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({
    fcmToken: z.string().min(8).max(512),
    platform: z.enum(['android', 'ios', 'web']).default('web'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid fcmToken required' });
    return;
  }
  const id = uuidv4();
  store.fcmDevices.set(parsed.data.fcmToken, {
    id,
    userId: req.userId!,
    fcmToken: parsed.data.fcmToken,
    platform: parsed.data.platform,
  });
  res.status(201).json({ registered: true, id });
});

// ============================================================================
// ADMIN CONSOLE API (RBAC Protected, Never Exposes Private Decrypted Messages)
// ============================================================================
apiRouter.get('/admin/bootstrap-status', (_req: Request, res: Response) => {
  res.json({
    needsSetup: store.admins.size === 0 && !envConfig.adminBootstrapPasscode,
    hasEnvPasscode: Boolean(envConfig.adminBootstrapPasscode),
  });
});

apiRouter.post('/admin/bootstrap', authLimiter, async (req: Request, res: Response) => {
  if (store.admins.size > 0 || envConfig.adminBootstrapPasscode) {
    res.status(403).json({ error: 'Admin account already initialized' });
    return;
  }
  const schema = z.object({
    email: z.string().email().max(160),
    displayName: z.string().min(2).max(100),
    password: z.string().min(8).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email, displayName, and password (min 8 chars) required' });
    return;
  }
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);
  store.admins.set(id, {
    id,
    email: parsed.data.email.toLowerCase(),
    displayName: parsed.data.displayName,
    passwordHash,
    role: 'SUPER_ADMIN',
    isActive: true,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  store.createAuditLog(parsed.data.email.toLowerCase(), 'ADMIN_BOOTSTRAP', 'admin_users', id);
  await store.persistNow();
  const token = issueAdminToken(id, parsed.data.email.toLowerCase(), 'SUPER_ADMIN');
  res.status(201).json({
    token,
    admin: { id, email: parsed.data.email.toLowerCase(), displayName: parsed.data.displayName, role: 'SUPER_ADMIN' },
  });
});

apiRouter.post('/admin/login', authLimiter, (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email().max(160),
    password: z.string().min(1).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  // Check env passcode override first
  if (envConfig.adminBootstrapPasscode && parsed.data.password === envConfig.adminBootstrapPasscode) {
    const token = issueAdminToken('adm-env', normalizedEmail, 'SUPER_ADMIN');
    store.createAuditLog(normalizedEmail, 'ADMIN_LOGIN_ENV', 'admin_users', 'adm-env');
    res.json({
      token,
      admin: { id: 'adm-env', email: normalizedEmail, displayName: 'MuzTalk Administrator', role: 'SUPER_ADMIN' },
    });
    return;
  }

  const admin = Array.from(store.admins.values()).find((a) => a.email === normalizedEmail);
  if (!admin || !admin.isActive || !bcrypt.compareSync(parsed.data.password, admin.passwordHash)) {
    res.status(401).json({ error: 'Invalid administrator credentials' });
    return;
  }
  admin.lastLoginAt = new Date().toISOString();
  store.createAuditLog(admin.email, 'ADMIN_LOGIN', 'admin_users', admin.id);
  const token = issueAdminToken(admin.id, admin.email, admin.role);
  res.json({
    token,
    admin: { id: admin.id, email: admin.email, displayName: admin.displayName, role: admin.role },
  });
});

apiRouter.get('/admin/overview', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    health: store.getSystemHealth(),
    config: store.appConfig,
  });
});

apiRouter.get('/admin/users', requireAdminAuth, (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const users = Array.from(store.users.values())
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        u.phoneNumber.includes(q)
    )
    .map((u) => store.sanitizeUser(u));
  res.json({ users });
});

apiRouter.patch('/admin/users/:id/status', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid status required (ACTIVE or SUSPENDED)' });
    return;
  }
  const user = store.users.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  user.status = parsed.data.status;
  if (parsed.data.status === 'SUSPENDED') user.isOnline = false;
  store.createAuditLog(req.adminEmail!, `USER_STATUS_${parsed.data.status}`, 'users', user.id);
  await store.syncUserToMysql(user);
  await store.persistNow();
  res.json({ user: store.sanitizeUser(user) });
});

apiRouter.patch('/admin/users/:id/screen-capture', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ blockScreenCapture: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid blockScreenCapture boolean required' });
    return;
  }
  const user = store.users.get(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  user.blockScreenCapture = parsed.data.blockScreenCapture;
  const effective = Boolean(store.appConfig.blockScreenCapture || user.blockScreenCapture);
  emitToUser(user.id, 'security:policy_updated', { blockScreenCapture: effective });
  store.createAuditLog(
    req.adminEmail!,
    parsed.data.blockScreenCapture ? 'USER_SCREEN_CAPTURE_BLOCKED' : 'USER_SCREEN_CAPTURE_ALLOWED',
    'users',
    user.id
  );
  await store.persistNow();
  res.json({ user: store.sanitizeUser(user), effectiveBlockScreenCapture: effective });
});

apiRouter.get('/admin/reports', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ reports: Array.from(store.reports.values()) });
});

apiRouter.patch('/admin/reports/:id', requireAdminAuth, (req: AuthenticatedRequest, res: Response) => {
  const schema = z.object({ status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid report status' });
    return;
  }
  const report = store.reports.get(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  report.status = parsed.data.status;
  report.resolvedById = req.adminId || null;
  report.resolvedAt = new Date().toISOString();
  store.createAuditLog(req.adminEmail!, `REPORT_${parsed.data.status}`, 'reports', report.id);
  store.schedulePersist();
  res.json({ report });
});

apiRouter.get('/admin/audit-logs', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ logs: store.auditLogs });
});

apiRouter.put('/admin/config', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const schema = z.object({
    maintenanceMode: z.boolean().optional(),
    allowNewRegistrations: z.boolean().optional(),
    maxUploadMb: z.number().min(1).max(200).optional(),
    e2eeEnforced: z.boolean().optional(),
    blockScreenCapture: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid config values' });
    return;
  }
  store.appConfig = { ...store.appConfig, ...parsed.data };
  await store.executeMysql(
    `INSERT INTO system_configs (id, config_key, config_value, updated_by, updated_at)
     VALUES (?, 'app_config', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [uuidv4(), JSON.stringify(store.appConfig), req.adminEmail || 'admin']
  );
  if (typeof parsed.data.blockScreenCapture === 'boolean') {
    for (const u of store.users.values()) {
      emitToUser(u.id, 'security:policy_updated', {
        blockScreenCapture: Boolean(store.appConfig.blockScreenCapture || u.blockScreenCapture),
      });
    }
  }
  store.createAuditLog(req.adminEmail!, 'APP_CONFIG_UPDATED', 'system_config', 'global', parsed.data);
  await store.persistNow();
  res.json({ config: store.appConfig });
});

apiRouter.get('/admin/integrations', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ integrations: store.getMaskedIntegrations() });
});

apiRouter.put('/admin/integrations', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const body = req.body || {};
  store.updateIntegrations(body);
  await store.executeMysql(
    `INSERT INTO system_configs (id, config_key, config_value, updated_by, updated_at)
     VALUES (?, 'integrations_meta', ?, ?, NOW())
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [uuidv4(), JSON.stringify(store.getMaskedIntegrations()), req.adminEmail || 'admin']
  );
  store.createAuditLog(req.adminEmail!, 'INTEGRATIONS_UPDATED', 'system_config', 'integrations');
  await store.persistNow();
  res.json({ integrations: store.getMaskedIntegrations(), health: store.getSystemHealth() });
});

apiRouter.post('/admin/integrations/test-smtp', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const to = String(req.body?.to || req.adminEmail || '').trim();
  if (!to || !to.includes('@')) {
    res.status(400).json({ error: 'Valid recipient email required for SMTP test' });
    return;
  }
  if (req.body?.smtp) {
    store.updateIntegrations({ smtp: req.body.smtp });
  }
  const result = await sendSmtpMail(
    to,
    'MuzTalk SMTP Test Email',
    'SMTP integration from MuzTalk Admin Panel is working correctly.',
    '<p><strong>MuzTalk SMTP integration</strong> from the Admin Console is active and working.</p>'
  );
  if (!result.sent) {
    res.status(400).json({ ok: false, error: result.error || 'SMTP is not enabled or missing host/user/password' });
    return;
  }
  store.createAuditLog(req.adminEmail!, 'SMTP_TEST_SENT', 'system_config', to);
  res.json({ ok: true, message: `Test email sent to ${to}` });
});

apiRouter.post('/admin/integrations/test-mysql', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const result = await store.connectOrTestMysql(req.body?.mysql);
  if (!result.connected) {
    res.status(400).json({ ok: false, error: result.error || 'MySQL connection failed' });
    return;
  }
  store.createAuditLog(req.adminEmail!, 'MYSQL_CONNECTED', 'database', result.version || '8.0');
  res.json({ ok: true, version: result.version, health: store.getSystemHealth() });
});

apiRouter.post('/admin/integrations/test-firebase', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  if (req.body?.firebase) {
    store.updateIntegrations({ firebase: req.body.firebase });
  }
  const result = await verifyFirebaseAdminCredentials();
  if (!result.ok) {
    res.status(400).json({ ok: false, error: result.error || 'Firebase Admin credential verification failed' });
    return;
  }
  store.createAuditLog(req.adminEmail!, 'FIREBASE_ADMIN_VERIFIED', 'system_config', result.projectId || 'muztalk');
  await store.persistNow();
  res.json({
    ok: true,
    projectId: result.projectId,
    clientEmail: result.clientEmail,
    integrations: store.getMaskedIntegrations(),
    health: store.getSystemHealth(),
  });
});

// ============================================================================
// ADMIN PERSISTENCE STATUS, BACKUP/RESTORE & IN-PLACE ZIP BUILD UPDATER
// ============================================================================
apiRouter.get('/admin/persistence-status', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ persistence: store.getPersistenceInfo() });
});

apiRouter.get('/admin/backup/export', requireAdminAuth, (_req: AuthenticatedRequest, res: Response) => {
  if (_req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const snapshot = store.serializeSnapshot();
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="muztalk-backup-${stamp}.json"`);
  res.send(JSON.stringify(snapshot, null, 2));
});

apiRouter.post('/admin/backup/import', requireAdminAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (req.adminRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super Admin privileges required' });
    return;
  }
  const payload = req.body?.snapshot || req.body;
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { users?: unknown }).users)) {
    res.status(400).json({ error: 'Invalid backup snapshot JSON format' });
    return;
  }
  store.applySnapshot(payload as Record<string, unknown>);
  for (const user of store.users.values()) {
    await store.syncUserToMysql(user);
  }
  store.createAuditLog(req.adminEmail!, 'BACKUP_IMPORTED_MERGED', 'system', 'snapshot');
  await store.persistNow();
  res.json({ ok: true, persistence: store.getPersistenceInfo() });
});

apiRouter.post(
  '/admin/system/update-zip',
  requireAdminAuth,
  zipUpload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.adminRole !== 'SUPER_ADMIN') {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Please select a valid .zip build package (max 150 MB)' });
      return;
    }

    const runBuildRaw = String(req.body?.runBuild ?? 'auto').toLowerCase();
    const runBuild = runBuildRaw === 'true' ? true : runBuildRaw === 'false' ? false : undefined;
    const restartAfterUpdate = String(req.body?.restartAfterUpdate ?? 'false').toLowerCase() === 'true';

    try {
      const result = await applyZipBuildUpdate({
        zipFilePath: req.file.path,
        runBuild,
        syncPublicHtml: true,
        restartAfterUpdate,
        adminEmail: req.adminEmail || 'admin',
      });

      const willExitForRespawn = restartAfterUpdate && process.env.NODE_ENV !== 'test';
      res.json({
        ...result,
        restartScheduled: willExitForRespawn,
      });

      if (willExitForRespawn) {
        setTimeout(() => {
          process.exit(0);
        }, 750);
      }
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  }
);
