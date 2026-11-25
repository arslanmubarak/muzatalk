import crypto from 'crypto';

// Ephemeral in-memory fallback secrets generated per process when env vars are unset
const EPHEMERAL_ACCESS_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_ADMIN_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_MEDIA_SIGN_KEY = crypto.randomBytes(32).toString('hex');

export const envConfig = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: process.env.MUZTALK_DATA_DIR || '',
  devOtpMode: process.env.DEV_OTP_MODE !== 'false' && process.env.NODE_ENV !== 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://apimuzatalk.rrgindustry.com/',
  backendApiUrl: process.env.BACKEND_API_URL || 'http://apimuzatalk.rrgindustry.com/',
  databaseUrl: process.env.DATABASE_URL || '',
  mysqlHost: process.env.MYSQL_HOST || '',
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlDatabase: process.env.MYSQL_DATABASE || '',
  mysqlUser: process.env.MYSQL_USER || '',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || EPHEMERAL_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || EPHEMERAL_REFRESH_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || EPHEMERAL_ADMIN_SECRET,
  mediaSignKey: process.env.MEDIA_SIGN_KEY || EPHEMERAL_MEDIA_SIGN_KEY,
  adminBootstrapPasscode: process.env.ADMIN_BOOTSTRAP_PASSCODE || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@apimuzatalk.rrgindustry.com',
  smtpFromName: process.env.SMTP_FROM_NAME || 'MuzTalk',
  smsProviderApiKey: process.env.SMS_PROVIDER_API_KEY || '',
  smsProviderSenderId: process.env.SMS_PROVIDER_SENDER_ID || '',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'muztalk-41f2a',
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'muztalk-41f2a.firebasestorage.app',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  storageMode: (process.env.STORAGE_MODE as 'mobile_encrypted_vault' | 'server_temp_relay') || 'mobile_encrypted_vault',
  stunServerUrl: process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
  turnServerUrl: process.env.TURN_SERVER_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  livekitUrl: process.env.LIVEKIT_URL || '',
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
};
