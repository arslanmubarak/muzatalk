import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { envConfig } from '../config/env';
import { store } from '../db/store';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  deviceId?: string;
  adminId?: string;
  adminEmail?: string;
  adminRole?: 'SUPER_ADMIN' | 'MODERATOR';
}

export function issueUserTokens(userId: string, deviceId: string) {
  const accessToken = jwt.sign(
    { sub: userId, deviceId, type: 'access' },
    envConfig.jwtAccessSecret,
    { expiresIn: '2h' }
  );
  const refreshToken = jwt.sign(
    { sub: userId, deviceId, type: 'refresh', jti: crypto.randomUUID() },
    envConfig.jwtRefreshSecret,
    { expiresIn: '30d' }
  );
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  store.refreshTokens.set(tokenHash, {
    userId,
    expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
    revoked: false,
  });
  return { accessToken, refreshToken };
}

export function issueAdminToken(adminId: string, email: string, role: 'SUPER_ADMIN' | 'MODERATOR') {
  return jwt.sign(
    { sub: adminId, email, role, type: 'admin' },
    envConfig.adminJwtSecret,
    { expiresIn: '8h' }
  );
}

export function signMediaUrl(mediaId: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = crypto
    .createHmac('sha256', envConfig.mediaSignKey)
    .update(`${mediaId}:${exp}`)
    .digest('hex');
  return `/api/media/${mediaId}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(mediaId: string, expStr: string, sig: string): boolean {
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac('sha256', envConfig.mediaSignKey)
    .update(`${mediaId}:${exp}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig || '', 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, envConfig.jwtAccessSecret) as {
      sub: string;
      deviceId?: string;
      type: string;
    };
    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Invalid access token type' });
      return;
    }
    const user = store.users.get(decoded.sub);
    if (!user || user.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Account unavailable or suspended' });
      return;
    }
    req.userId = decoded.sub;
    req.deviceId = decoded.deviceId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireAdminAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, envConfig.adminJwtSecret) as {
      sub: string;
      email: string;
      role: 'SUPER_ADMIN' | 'MODERATOR';
      type: string;
    };
    if (decoded.type !== 'admin') {
      res.status(403).json({ error: 'Admin privilege required' });
      return;
    }
    req.adminId = decoded.sub;
    req.adminEmail = decoded.email;
    req.adminRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}
