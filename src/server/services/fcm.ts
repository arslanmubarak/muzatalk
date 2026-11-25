import crypto from 'crypto';
import fs from 'fs';
import { App, cert, deleteApp, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { store } from '../db/store';

let activeApp: App | null = null;
let activeFingerprint = '';

function normalizePrivateKey(rawKey: string): string {
  return rawKey.replace(/\\n/g, '\n').trim();
}

function getCredentialFingerprint(): string {
  const fb = store.integrations.firebase;
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  return crypto
    .createHash('sha256')
    .update(`${fb.enabled}|${fb.projectId}|${fb.clientEmail}|${fb.privateKey}|${gac}`)
    .digest('hex');
}

async function getFirebaseApp(): Promise<App | null> {
  const fb = store.integrations.firebase;
  if (!fb.enabled) return null;

  const nextFingerprint = getCredentialFingerprint();
  if (activeApp && activeFingerprint === nextFingerprint) {
    return activeApp;
  }

  // Clean up previous dynamic app instance if credentials changed
  for (const existing of getApps()) {
    if (existing.name === 'muztalk-fcm') {
      await deleteApp(existing).catch(() => undefined);
    }
  }
  activeApp = null;
  activeFingerprint = '';

  const projectId = fb.projectId?.trim() || '';
  const clientEmail = fb.clientEmail?.trim() || '';
  const privateKey = fb.privateKey || '';
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (projectId && clientEmail && privateKey) {
    activeApp = initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizePrivateKey(privateKey),
        }),
        projectId,
        storageBucket: fb.storageBucket || undefined,
      },
      'muztalk-fcm'
    );
    activeFingerprint = nextFingerprint;
    return activeApp;
  }

  if (gacPath && fs.existsSync(gacPath)) {
    activeApp = initializeApp(
      {
        credential: applicationDefault(),
        projectId: fb.projectId || undefined,
        storageBucket: fb.storageBucket || undefined,
      },
      'muztalk-fcm'
    );
    activeFingerprint = nextFingerprint;
    return activeApp;
  }

  return null;
}

export function isFirebaseAdminReady(): boolean {
  const fb = store.integrations.firebase;
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return Boolean(
    fb.enabled &&
      ((fb.projectId && fb.clientEmail && fb.privateKey) || (gacPath && fs.existsSync(gacPath)))
  );
}

export async function verifyFirebaseAdminCredentials(): Promise<{
  ok: boolean;
  projectId?: string;
  clientEmail?: string;
  error?: string;
}> {
  const fb = store.integrations.firebase;
  if (!fb.projectId || !fb.clientEmail || !fb.privateKey) {
    const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!gacPath || !fs.existsSync(gacPath)) {
      return {
        ok: false,
        error: 'Provide Firebase Project ID, Service Account Client Email, and Private Key (or upload the Admin SDK JSON).',
      };
    }
  }

  try {
    const normalizedKey = fb.privateKey ? normalizePrivateKey(fb.privateKey) : '';
    if (fb.privateKey && !normalizedKey.includes('BEGIN PRIVATE KEY')) {
      return { ok: false, error: 'Invalid Private Key format (must be PEM RSA private key).' };
    }

    const credential =
      fb.projectId && fb.clientEmail && normalizedKey
        ? cert({
            projectId: fb.projectId,
            clientEmail: fb.clientEmail,
            privateKey: normalizedKey,
          })
        : applicationDefault();

    // Verify private key signature by requesting a Google OAuth2 access token
    await credential.getAccessToken();
    await getFirebaseApp();
    return {
      ok: true,
      projectId: fb.projectId,
      clientEmail: fb.clientEmail,
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
    };
  }
}

export async function sendPushNotificationToUsers(
  userIds: string[],
  payload: {
    category: 'message' | 'call';
    title: string;
    body: string;
    data?: Record<string, string>;
  }
): Promise<{ sentCount: number; failedCount: number }> {
  const app = await getFirebaseApp();
  if (!app || userIds.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const targetSet = new Set(userIds);
  const tokens: string[] = [];
  for (const device of store.fcmDevices.values()) {
    if (targetSet.has(device.userId) && device.fcmToken) {
      tokens.push(device.fcmToken);
    }
  }

  if (tokens.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const isCall = payload.category === 'call';
  try {
    const messaging = getMessaging(app);
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        category: payload.category,
        title: payload.title,
        body: payload.body,
        ...(payload.data || {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: isCall ? 'muztalk_calls' : 'muztalk_messages',
          priority: isCall ? 'max' : 'high',
          sound: 'default',
        },
      },
    });

    // Clean up invalid/expired FCM tokens automatically
    response.responses.forEach((res, idx) => {
      const code = res.error?.code;
      if (
        !res.success &&
        (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')
      ) {
        store.fcmDevices.delete(tokens[idx]);
      }
    });

    return {
      sentCount: response.successCount,
      failedCount: response.failureCount,
    };
  } catch (err) {
    console.warn('[FCM] Push dispatch error:', (err as Error).message);
    return { sentCount: 0, failedCount: tokens.length };
  }
}
