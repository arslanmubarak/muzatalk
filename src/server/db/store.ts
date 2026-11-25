import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { envConfig } from '../config/env';
import type {
  AccountStatus,
  AuditLogDTO,
  CallDTO,
  CallStatus,
  CallType,
  ChatListItemDTO,
  CommunityDTO,
  ConversationType,
  DeviceDTO,
  GroupDTO,
  GroupRole,
  MessageAttachmentDTO,
  MessageDTO,
  MessageReactionDTO,
  MessageType,
  ReceiptStatus,
  ReportDTO,
  ReportStatus,
  StatusDTO,
  StatusPrivacyMode,
  StatusType,
  StickerPackDTO,
  SystemHealthDTO,
  SystemIntegrationsDTO,
  UserDTO,
  UserSettingsDTO,
} from '../../shared/types';

export interface StoredUser extends UserDTO {
  passwordHash: string | null;
  settings: UserSettingsDTO;
  encryptionKeyBundle?: {
    deviceId: string;
    identityKeyPub: string;
    signedPreKeyPub: string;
    signedPreKeySig: string;
    fingerprint: string;
  };
}

export interface StoredConversation {
  id: string;
  type: ConversationType;
  createdAt: string;
  lastMessageAt: string | null;
  members: Array<{
    userId: string;
    isPinned: boolean;
    isArchived: boolean;
    isMuted: boolean;
    unreadCount: number;
    lastReadAt: string | null;
  }>;
}

export interface StoredOtp {
  phoneNumber: string;
  countryCode: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

export interface StoredEmailOtp {
  email: string;
  username?: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

export interface StoredMedia {
  id: string;
  uploaderId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StoredAdmin {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'MODERATOR';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const DEFAULT_SETTINGS: UserSettingsDTO = {
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
};

class MuzTalkDataStore {
  private pool: Pool | null = null;
  private mysqlConnected = false;
  private mysqlVersion: string | null = null;
  private startTime = Date.now();
  private resolvedDataDir: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();
  private lastPersistedAt: string | null = null;

  // Structured relational collections (hydrated from MySQL 8 + persistent snapshot on boot)
  public users = new Map<string, StoredUser>();
  public devices = new Map<string, DeviceDTO>();
  public refreshTokens = new Map<string, { userId: string; expiresAt: number; revoked: boolean }>();
  public otps = new Map<string, StoredOtp>();
  public emailOtps = new Map<string, StoredEmailOtp>();
  public contacts = new Map<string, Array<{ contactUserId: string; aliasName: string | null; isFavorite: boolean }>>();
  public conversations = new Map<string, StoredConversation>();
  public messages = new Map<string, MessageDTO>();
  public groups = new Map<string, GroupDTO>();
  public communities = new Map<string, CommunityDTO>();
  public statuses = new Map<string, StatusDTO>();
  public calls = new Map<string, CallDTO>();
  public stickerPacks = new Map<string, StickerPackDTO>();
  public blockedUsers = new Map<string, Set<string>>();
  public reports = new Map<string, ReportDTO>();
  public notifications = new Map<string, Array<{ id: string; category: string; title: string; body: string; deepLink?: string; readAt: string | null; createdAt: string }>>();
  public fcmDevices = new Map<string, { id: string; userId: string; fcmToken: string; platform: string }>();
  public mediaFiles = new Map<string, StoredMedia>();
  public admins = new Map<string, StoredAdmin>();
  public auditLogs: AuditLogDTO[] = [];
  public appConfig = {
    maintenanceMode: false,
    allowNewRegistrations: true,
    maxUploadMb: 25,
    statusExpiryHours: 24,
    e2eeEnforced: true,
    blockScreenCapture: false,
  };
  public integrations: SystemIntegrationsDTO = {
    domains: {
      frontendUrl: envConfig.frontendUrl,
      backendApiUrl: envConfig.backendApiUrl,
    },
    storage: {
      mode: envConfig.storageMode,
      encryptionAlgorithm: 'AES-256-GCM',
      folderName: 'MuzTalk',
    },
    smtp: {
      enabled: Boolean(envConfig.smtpHost && envConfig.smtpUser),
      host: envConfig.smtpHost,
      port: envConfig.smtpPort,
      secure: envConfig.smtpSecure,
      user: envConfig.smtpUser,
      pass: envConfig.smtpPass,
      fromEmail: envConfig.smtpFromEmail,
      fromName: envConfig.smtpFromName,
    },
    twilio: {
      enabled: Boolean(envConfig.smsProviderApiKey),
      accountSid: envConfig.smsProviderApiKey ? 'configured' : '',
      authToken: envConfig.smsProviderApiKey,
      fromNumber: envConfig.smsProviderSenderId,
    },
    mysql: {
      host: envConfig.mysqlHost || '',
      port: envConfig.mysqlPort || 3306,
      database: envConfig.mysqlDatabase || 'muztalk',
      user: envConfig.mysqlUser || '',
      password: envConfig.mysqlPassword || '',
      connectionUrl: envConfig.databaseUrl,
    },
    firebase: {
      enabled: Boolean(envConfig.firebaseProjectId),
      projectId: envConfig.firebaseProjectId,
      storageBucket: envConfig.firebaseStorageBucket,
      clientEmail: envConfig.firebaseClientEmail,
      privateKey: envConfig.firebasePrivateKey,
      apiKey: '',
      appId: '',
    },
    calls: {
      stunServerUrl: envConfig.stunServerUrl,
      turnServerUrl: envConfig.turnServerUrl,
      turnUsername: envConfig.turnUsername,
      turnCredential: envConfig.turnCredential,
      livekitUrl: envConfig.livekitUrl,
      livekitApiKey: envConfig.livekitApiKey,
      livekitApiSecret: envConfig.livekitApiSecret,
    },
  };

  private resolvePersistentDataDir(): string {
    const explicit = (process.env.MUZTALK_DATA_DIR || envConfig.dataDir || '').trim();
    if (explicit) {
      const target = path.resolve(explicit);
      fs.mkdirSync(target, { recursive: true });
      return target;
    }

    const cwd = process.cwd();
    const normalizedCwd = cwd.replace(/\\/g, '/');
    const candidates: string[] = [];

    // Detect Hostinger / versioned release folder layout so data survives new build uploads
    if (/\/(versions|hbuilds|releases)\/[^/]+$/.test(normalizedCwd)) {
      candidates.push(path.resolve(cwd, '../../muztalk-persistent-data'));
    }
    if (
      path.basename(cwd) === 'current' ||
      fs.existsSync(path.resolve(cwd, '../versions')) ||
      fs.existsSync(path.resolve(cwd, '../hbuilds'))
    ) {
      candidates.push(path.resolve(cwd, '../muztalk-persistent-data'));
    }

    for (const candidate of candidates) {
      try {
        fs.mkdirSync(candidate, { recursive: true });
        fs.accessSync(candidate, fs.constants.W_OK);
        return candidate;
      } catch {
        // try next candidate
      }
    }

    const localDataDir = path.resolve(cwd, 'data');
    fs.mkdirSync(localDataDir, { recursive: true });
    return localDataDir;
  }

  public getDataDir(): string {
    if (!this.resolvedDataDir) {
      this.resolvedDataDir = this.resolvePersistentDataDir();
    }
    return this.resolvedDataDir;
  }

  public getUploadsDir(): string {
    const uploadsDir = path.join(this.getDataDir(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return uploadsDir;
  }

  private getSnapshotFilePath(): string {
    return path.join(this.getDataDir(), 'muztalk-state.json');
  }

  private getJwtKeysFilePath(): string {
    return path.join(this.getDataDir(), 'jwt-keys.json');
  }

  async init(): Promise<void> {
    this.resolvedDataDir = this.resolvePersistentDataDir();
    this.getUploadsDir();

    const uri = envConfig.databaseUrl?.trim();
    const hasStructured = Boolean(envConfig.mysqlHost && envConfig.mysqlUser && envConfig.mysqlDatabase);

    if ((uri && uri.startsWith('mysql://')) || hasStructured) {
      try {
        const poolOptions =
          uri && uri.startsWith('mysql://')
            ? { uri, waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4' }
            : {
                host: envConfig.mysqlHost,
                port: envConfig.mysqlPort || 3306,
                user: envConfig.mysqlUser,
                password: envConfig.mysqlPassword || undefined,
                database: envConfig.mysqlDatabase,
                waitForConnections: true,
                connectionLimit: 10,
                charset: 'utf8mb4',
              };
        this.pool = mysql.createPool(poolOptions);
        const [rows] = await this.pool.query<RowDataPacket[]>('SELECT VERSION() AS version');
        this.mysqlConnected = true;
        this.mysqlVersion = String(rows[0]?.version || '8.0');
        await this.ensureMysqlSchema(this.pool, { ...poolOptions, multipleStatements: true });
        console.log(`[MySQL 8] Connected successfully (version ${this.mysqlVersion})`);
      } catch (err) {
        this.mysqlConnected = false;
        console.warn('[MySQL 8] Database configured but connection failed; using persistent snapshot fallback until MySQL 8 is reachable.', (err as Error).message);
      }
    } else {
      console.log('[MySQL 8] DATABASE_URL / MYSQL_* not set; running with persistent local snapshot.');
    }

    await this.hydrateAllData();
    await this.ensurePersistentJwtKeys();
    this.seedInitialData();
    await this.persistNow();
  }

  private async ensurePersistentJwtKeys(): Promise<void> {
    if (
      process.env.JWT_ACCESS_SECRET &&
      process.env.JWT_REFRESH_SECRET &&
      process.env.ADMIN_JWT_SECRET &&
      process.env.MEDIA_SIGN_KEY
    ) {
      return;
    }

    let loaded: Record<string, string> | null = null;
    if (this.pool && this.mysqlConnected) {
      try {
        const [rows] = await this.pool.query<RowDataPacket[]>(
          "SELECT config_value FROM system_configs WHERE config_key = 'runtime_jwt_keys' LIMIT 1"
        );
        if (rows.length > 0 && rows[0].config_value) {
          loaded =
            typeof rows[0].config_value === 'string'
              ? JSON.parse(rows[0].config_value)
              : rows[0].config_value;
        }
      } catch {
        // fallback to disk
      }
    }

    const keysPath = this.getJwtKeysFilePath();
    if (!loaded && process.env.MUZTALK_DISABLE_DISK_PERSISTENCE !== 'true' && fs.existsSync(keysPath)) {
      try {
        loaded = JSON.parse(fs.readFileSync(keysPath, 'utf8')) as Record<string, string>;
      } catch {
        // ignore corrupt key file
      }
    }

    if (loaded) {
      if (!process.env.JWT_ACCESS_SECRET && loaded.jwtAccessSecret) envConfig.jwtAccessSecret = loaded.jwtAccessSecret;
      if (!process.env.JWT_REFRESH_SECRET && loaded.jwtRefreshSecret) envConfig.jwtRefreshSecret = loaded.jwtRefreshSecret;
      if (!process.env.ADMIN_JWT_SECRET && loaded.adminJwtSecret) envConfig.adminJwtSecret = loaded.adminJwtSecret;
      if (!process.env.MEDIA_SIGN_KEY && loaded.mediaSignKey) envConfig.mediaSignKey = loaded.mediaSignKey;
    } else {
      const payload = {
        jwtAccessSecret: envConfig.jwtAccessSecret,
        jwtRefreshSecret: envConfig.jwtRefreshSecret,
        adminJwtSecret: envConfig.adminJwtSecret,
        mediaSignKey: envConfig.mediaSignKey,
      };
      if (process.env.MUZTALK_DISABLE_DISK_PERSISTENCE !== 'true') {
        try {
          fs.writeFileSync(keysPath, JSON.stringify(payload), { mode: 0o600 });
        } catch {
          // ignore write errors
        }
      }
      if (this.pool && this.mysqlConnected) {
        await this.executeMysql(
          `INSERT INTO system_configs (id, config_key, config_value, updated_by, updated_at)
           VALUES (?, 'runtime_jwt_keys', ?, 'system', NOW())
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
          [uuidv4(), JSON.stringify(payload)]
        );
      }
    }
  }

  private async hydrateAllData(): Promise<void> {
    let mysqlSnap: Record<string, unknown> | null = null;
    let diskSnap: Record<string, unknown> | null = null;

    if (this.pool && this.mysqlConnected) {
      try {
        const [cfgRows] = await this.pool.query<RowDataPacket[]>(
          "SELECT config_key, config_value FROM system_configs WHERE config_key IN ('muztalk_full_snapshot', 'app_config')"
        );
        for (const row of cfgRows) {
          const val = typeof row.config_value === 'string' ? JSON.parse(row.config_value) : row.config_value;
          if (row.config_key === 'muztalk_full_snapshot' && val && typeof val === 'object') {
            mysqlSnap = val as Record<string, unknown>;
          } else if (row.config_key === 'app_config' && val && typeof val === 'object') {
            this.appConfig = { ...this.appConfig, ...(val as typeof this.appConfig) };
          }
        }
      } catch (err) {
        console.warn('[MySQL 8] Config snapshot read warning:', (err as Error).message);
      }
    }

    const snapPath = this.getSnapshotFilePath();
    if (process.env.MUZTALK_DISABLE_DISK_PERSISTENCE !== 'true' && fs.existsSync(snapPath)) {
      try {
        const raw = fs.readFileSync(snapPath, 'utf8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          diskSnap = parsed;
        }
      } catch (err) {
        console.warn('[Persistence] Local snapshot read warning:', (err as Error).message);
      }
    }

    // Apply newer snapshot first, then merge any extra records from older snapshot so zero records are lost
    const mysqlTime = mysqlSnap?.savedAt ? new Date(String(mysqlSnap.savedAt)).getTime() : 0;
    const diskTime = diskSnap?.savedAt ? new Date(String(diskSnap.savedAt)).getTime() : 0;

    if (mysqlTime >= diskTime) {
      if (mysqlSnap) this.applySnapshot(mysqlSnap);
      if (diskSnap) this.applySnapshot(diskSnap);
    } else {
      if (diskSnap) this.applySnapshot(diskSnap);
      if (mysqlSnap) this.applySnapshot(mysqlSnap);
    }

    // Also hydrate normalized users & user_profiles rows from MySQL (if seeded or inserted directly via SQL)
    if (this.pool && this.mysqlConnected) {
      try {
        const [userRows] = await this.pool.query<RowDataPacket[]>(
          `SELECT u.id, u.phone_number, u.country_code, u.email, u.username, u.password_hash, u.status,
                  u.last_seen_at, u.created_at, p.display_name, p.about, p.avatar_url
           FROM users u
           LEFT JOIN user_profiles p ON p.user_id = u.id
           WHERE u.deleted_at IS NULL`
        );
        for (const r of userRows) {
          const id = String(r.id);
          if (!this.users.has(id)) {
            this.users.set(id, {
              id,
              phoneNumber: String(r.phone_number),
              countryCode: String(r.country_code || '+00'),
              email: r.email ? String(r.email) : null,
              username: r.username ? String(r.username) : null,
              displayName: String(r.display_name || r.username || 'MuzTalk User'),
              about: String(r.about || 'Hey there! I am using MuzTalk.'),
              avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
              status: (r.status as AccountStatus) || 'ACTIVE',
              isOnline: false,
              lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : new Date().toISOString(),
              createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
              passwordHash: r.password_hash ? String(r.password_hash) : null,
              encryptionFingerprint: this.generateFingerprint(),
              blockScreenCapture: false,
              settings: { ...DEFAULT_SETTINGS },
            });
          } else {
            const existing = this.users.get(id)!;
            if (!existing.passwordHash && r.password_hash) existing.passwordHash = String(r.password_hash);
            if (!existing.email && r.email) existing.email = String(r.email);
            if (!existing.username && r.username) existing.username = String(r.username);
          }
        }
      } catch (err) {
        console.warn('[MySQL 8] User hydration warning:', (err as Error).message);
      }
    }
  }

  public applySnapshot(snap: Record<string, unknown>): void {
    const mergeArrayToMap = <T extends { id: string }>(
      arr: unknown,
      target: Map<string, T>,
      transform?: (item: T) => T
    ) => {
      if (!Array.isArray(arr)) return;
      for (const raw of arr) {
        if (raw && typeof raw === 'object' && 'id' in raw) {
          const item = transform ? transform(raw as T) : (raw as T);
          if (!target.has(item.id)) {
            target.set(item.id, item);
          }
        }
      }
    };

    mergeArrayToMap<StoredUser>(snap.users, this.users, (u) => ({
      ...u,
      isOnline: false,
      settings: { ...DEFAULT_SETTINGS, ...(u.settings || {}) },
      blockScreenCapture: Boolean(u.blockScreenCapture),
    }));
    mergeArrayToMap<DeviceDTO>(snap.devices, this.devices);
    mergeArrayToMap<StoredConversation>(snap.conversations, this.conversations);
    mergeArrayToMap<MessageDTO>(snap.messages, this.messages);
    mergeArrayToMap<GroupDTO>(snap.groups, this.groups);
    mergeArrayToMap<CommunityDTO>(snap.communities, this.communities);
    mergeArrayToMap<StatusDTO>(snap.statuses, this.statuses);
    mergeArrayToMap<CallDTO>(snap.calls, this.calls);
    mergeArrayToMap<ReportDTO>(snap.reports, this.reports);
    mergeArrayToMap<StoredMedia>(snap.mediaFiles, this.mediaFiles);
    mergeArrayToMap<StoredAdmin>(snap.admins, this.admins);

    if (Array.isArray(snap.refreshTokens)) {
      for (const entry of snap.refreshTokens as Array<[string, { userId: string; expiresAt: number; revoked: boolean }]>) {
        if (Array.isArray(entry) && entry[0] && entry[1] && !this.refreshTokens.has(entry[0])) {
          this.refreshTokens.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(snap.contacts)) {
      for (const entry of snap.contacts as Array<[string, Array<{ contactUserId: string; aliasName: string | null; isFavorite: boolean }>]>) {
        if (Array.isArray(entry) && entry[0] && Array.isArray(entry[1]) && !this.contacts.has(entry[0])) {
          this.contacts.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(snap.blockedUsers)) {
      for (const entry of snap.blockedUsers as Array<[string, string[]]>) {
        if (Array.isArray(entry) && entry[0] && Array.isArray(entry[1]) && !this.blockedUsers.has(entry[0])) {
          this.blockedUsers.set(entry[0], new Set(entry[1]));
        }
      }
    }
    if (Array.isArray(snap.notifications)) {
      for (const entry of snap.notifications as Array<[string, Array<{ id: string; category: string; title: string; body: string; deepLink?: string; readAt: string | null; createdAt: string }>]>) {
        if (Array.isArray(entry) && entry[0] && Array.isArray(entry[1]) && !this.notifications.has(entry[0])) {
          this.notifications.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(snap.fcmDevices)) {
      for (const entry of snap.fcmDevices as Array<[string, { id: string; userId: string; fcmToken: string; platform: string }]>) {
        if (Array.isArray(entry) && entry[0] && entry[1] && !this.fcmDevices.has(entry[0])) {
          this.fcmDevices.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(snap.auditLogs)) {
      const existingIds = new Set(this.auditLogs.map((l) => l.id));
      for (const log of snap.auditLogs as AuditLogDTO[]) {
        if (log?.id && !existingIds.has(log.id)) {
          this.auditLogs.push(log);
          existingIds.add(log.id);
        }
      }
    }
    if (snap.appConfig && typeof snap.appConfig === 'object') {
      this.appConfig = { ...this.appConfig, ...(snap.appConfig as typeof this.appConfig) };
    }
    if (snap.integrations && typeof snap.integrations === 'object') {
      this.updateIntegrations(snap.integrations as Partial<SystemIntegrationsDTO>);
    }
    if (typeof snap.savedAt === 'string') {
      this.lastPersistedAt = snap.savedAt;
    }
  }

  public serializeSnapshot(): Record<string, unknown> {
    const savedAt = new Date().toISOString();
    this.lastPersistedAt = savedAt;
    return {
      version: 1,
      savedAt,
      users: Array.from(this.users.values()),
      devices: Array.from(this.devices.values()),
      refreshTokens: Array.from(this.refreshTokens.entries()).filter(([, v]) => !v.revoked && v.expiresAt > Date.now()),
      contacts: Array.from(this.contacts.entries()),
      conversations: Array.from(this.conversations.values()),
      messages: Array.from(this.messages.values()),
      groups: Array.from(this.groups.values()),
      communities: Array.from(this.communities.values()),
      statuses: Array.from(this.statuses.values()),
      calls: Array.from(this.calls.values()),
      blockedUsers: Array.from(this.blockedUsers.entries()).map(([k, s]) => [k, Array.from(s)]),
      reports: Array.from(this.reports.values()),
      notifications: Array.from(this.notifications.entries()),
      fcmDevices: Array.from(this.fcmDevices.entries()),
      mediaFiles: Array.from(this.mediaFiles.values()),
      admins: Array.from(this.admins.values()),
      auditLogs: this.auditLogs.slice(0, 1000),
      appConfig: this.appConfig,
      integrations: this.integrations,
    };
  }

  public schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 200);
  }

  public async persistNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const run = this.persistQueue.then(async () => {
      const snapshot = this.serializeSnapshot();
      const json = JSON.stringify(snapshot);

      if (process.env.MUZTALK_DISABLE_DISK_PERSISTENCE !== 'true') {
        try {
          const target = this.getSnapshotFilePath();
          const tmp = `${target}.tmp`;
          fs.writeFileSync(tmp, json, { mode: 0o600 });
          fs.renameSync(tmp, target);
        } catch (err) {
          console.warn('[Persistence] Disk snapshot write warning:', (err as Error).message);
        }
      }

      if (this.pool && this.mysqlConnected) {
        await this.executeMysql(
          `INSERT INTO system_configs (id, config_key, config_value, updated_by, updated_at)
           VALUES (?, 'muztalk_full_snapshot', ?, 'system', NOW())
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
          [uuidv4(), json]
        );
      }
    });
    this.persistQueue = run.catch(() => undefined);
    return run;
  }

  public async syncUserToMysql(user: StoredUser): Promise<void> {
    if (!this.pool || !this.mysqlConnected) return;
    await this.executeMysql(
      `INSERT INTO users (id, phone_number, country_code, email, username, password_hash, status, is_online, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         username = VALUES(username),
         password_hash = COALESCE(VALUES(password_hash), password_hash),
         status = VALUES(status),
         is_online = VALUES(is_online),
         updated_at = NOW()`,
      [
        user.id,
        user.phoneNumber,
        user.countryCode,
        user.email || null,
        user.username || null,
        user.passwordHash || null,
        user.status,
        Boolean(user.isOnline),
      ]
    );
    await this.executeMysql(
      `INSERT INTO user_profiles (id, user_id, display_name, about, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         about = VALUES(about),
         avatar_url = VALUES(avatar_url),
         updated_at = NOW()`,
      [uuidv4(), user.id, user.displayName, user.about, user.avatarUrl || null]
    );
  }

  public getPersistenceInfo() {
    return {
      dataDir: this.getDataDir(),
      uploadsDir: this.getUploadsDir(),
      snapshotFile: this.getSnapshotFilePath(),
      mysqlConnected: this.mysqlConnected,
      mysqlVersion: this.mysqlVersion,
      lastPersistedAt: this.lastPersistedAt,
      counts: {
        users: this.users.size,
        admins: this.admins.size,
        conversations: this.conversations.size,
        messages: this.messages.size,
        groups: this.groups.size,
        calls: this.calls.size,
        mediaFiles: this.mediaFiles.size,
      },
    };
  }

  private async ensureMysqlSchema(
    targetPool: Pool,
    schemaConnOptions: mysql.PoolOptions & { uri?: string }
  ): Promise<void> {
    try {
      const [tables] = await targetPool.query<RowDataPacket[]>("SHOW TABLES LIKE 'users'");
      if (tables.length > 0) {
        await targetPool.query(`
          CREATE TABLE IF NOT EXISTS \`system_configs\` (
            \`id\` CHAR(36) NOT NULL,
            \`config_key\` VARCHAR(64) NOT NULL,
            \`config_value\` JSON NOT NULL,
            \`updated_by\` VARCHAR(160) NOT NULL,
            \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            PRIMARY KEY (\`id\`),
            UNIQUE INDEX \`system_configs_config_key_key\` (\`config_key\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        return;
      }
      const migrationPath = path.resolve(process.cwd(), 'database/prisma/migrations/0001_init/migration.sql');
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        const initConn = schemaConnOptions.uri
          ? await mysql.createConnection({ uri: schemaConnOptions.uri, charset: 'utf8mb4', multipleStatements: true })
          : await mysql.createConnection({
              host: schemaConnOptions.host,
              port: schemaConnOptions.port,
              user: schemaConnOptions.user,
              password: schemaConnOptions.password,
              database: schemaConnOptions.database,
              charset: 'utf8mb4',
              multipleStatements: true,
            });
        try {
          await initConn.query(sql);
          console.log('[MySQL 8] Initialized all 34 MuzTalk tables automatically from 0001_init/migration.sql');
        } finally {
          await initConn.end().catch(() => undefined);
        }
      }
    } catch (err) {
      console.warn('[MySQL 8] Schema auto-init warning:', (err as Error).message);
    }
  }

  public getPool(): Pool | null {
    return this.mysqlConnected ? this.pool : null;
  }

  public async executeMysql(
    sql: string,
    params: (string | number | boolean | Date | null | undefined)[] = []
  ): Promise<void> {
    if (!this.pool || !this.mysqlConnected) return;
    try {
      await this.pool.execute(sql, params.map((p) => (p === undefined ? null : p)));
    } catch (err) {
      console.error('[MySQL 8] Query execution warning:', (err as Error).message);
    }
  }

  private seedInitialData(): void {
    // Seed Official Sticker Packs only (no demo users, chats, calls, or statuses)
    if (this.stickerPacks.size === 0) {
      this.stickerPacks.set('pack-muztalk-essentials', {
        id: 'pack-muztalk-essentials',
        title: 'MuzTalk Essentials',
        author: 'MuzTech Studio',
        isOfficial: true,
        downloaded: true,
        stickers: [
          { id: 'stk-wave', packId: 'pack-muztalk-essentials', label: 'Salam / Wave', emojiTag: '👋', imageUrl: '/stickers/wave.svg', isAnimated: false },
          { id: 'stk-fire', packId: 'pack-muztalk-essentials', label: 'Awesome', emojiTag: '🔥', imageUrl: '/stickers/fire.svg', isAnimated: false },
          { id: 'stk-heart', packId: 'pack-muztalk-essentials', label: 'Appreciate', emojiTag: '💚', imageUrl: '/stickers/heart.svg', isAnimated: false },
          { id: 'stk-check', packId: 'pack-muztalk-essentials', label: 'Approved', emojiTag: '✅', imageUrl: '/stickers/check.svg', isAnimated: false },
        ],
      });
      this.stickerPacks.set('pack-dev-reactions', {
        id: 'pack-dev-reactions',
        title: 'Engineering Vibes',
        author: 'MuzTech Studio',
        isOfficial: true,
        downloaded: true,
        stickers: [
          { id: 'stk-ship', packId: 'pack-dev-reactions', label: 'Ship It', emojiTag: '🚀', imageUrl: '/stickers/ship.svg', isAnimated: false },
          { id: 'stk-lock', packId: 'pack-dev-reactions', label: 'Encrypted', emojiTag: '🔒', imageUrl: '/stickers/lock.svg', isAnimated: false },
        ],
      });
    }

    // Seed initial admin if ADMIN_BOOTSTRAP_PASSCODE is configured
    if (envConfig.adminBootstrapPasscode && !this.admins.has('adm-root')) {
      const hash = bcrypt.hashSync(envConfig.adminBootstrapPasscode, 10);
      this.admins.set('adm-root', {
        id: 'adm-root',
        email: 'admin@muztalk.app',
        displayName: 'MuzTalk Root Admin',
        passwordHash: hash,
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      });
    }
  }

  public sanitizeUser(u: StoredUser): UserDTO {
    return {
      id: u.id,
      phoneNumber: u.phoneNumber,
      countryCode: u.countryCode,
      email: u.email || null,
      username: u.username,
      displayName: u.displayName,
      about: u.about,
      avatarUrl: u.avatarUrl,
      status: u.status,
      isOnline: u.isOnline,
      lastSeenAt: u.lastSeenAt,
      createdAt: u.createdAt,
      settings: u.settings,
      encryptionFingerprint: u.encryptionFingerprint,
      blockScreenCapture: Boolean(u.blockScreenCapture),
    };
  }

  public getMaskedIntegrations(): SystemIntegrationsDTO {
    const i = this.integrations;
    return {
      domains: { ...i.domains },
      storage: {
        mode: i.storage.mode,
        encryptionAlgorithm: i.storage.encryptionAlgorithm,
        folderName: i.storage.folderName,
      },
      smtp: {
        enabled: i.smtp.enabled,
        host: i.smtp.host,
        port: i.smtp.port,
        secure: i.smtp.secure,
        user: i.smtp.user,
        passSet: Boolean(i.smtp.pass),
        fromEmail: i.smtp.fromEmail,
        fromName: i.smtp.fromName,
      },
      twilio: {
        enabled: i.twilio.enabled,
        accountSid: i.twilio.accountSid,
        authTokenSet: Boolean(i.twilio.authToken),
        fromNumber: i.twilio.fromNumber,
      },
      mysql: {
        host: i.mysql.host,
        port: i.mysql.port,
        database: i.mysql.database,
        user: i.mysql.user,
        passwordSet: Boolean(i.mysql.password),
        connectionUrlSet: Boolean(i.mysql.connectionUrl),
      },
      firebase: {
        enabled: i.firebase.enabled,
        projectId: i.firebase.projectId,
        storageBucket: i.firebase.storageBucket,
        clientEmail: i.firebase.clientEmail,
        privateKeySet: Boolean(i.firebase.privateKey),
        apiKey: i.firebase.apiKey,
        appId: i.firebase.appId,
      },
      calls: {
        stunServerUrl: i.calls.stunServerUrl,
        turnServerUrl: i.calls.turnServerUrl,
        turnUsername: i.calls.turnUsername,
        turnCredentialSet: Boolean(i.calls.turnCredential),
        livekitUrl: i.calls.livekitUrl,
        livekitApiKey: i.calls.livekitApiKey,
        livekitApiSecretSet: Boolean(i.calls.livekitApiSecret),
      },
    };
  }

  public updateIntegrations(patch: Partial<SystemIntegrationsDTO>): void {
    const keepOrSet = (incoming: string | undefined, current: string | undefined): string => {
      if (incoming === undefined || incoming === '' || incoming === '••••••••') return current || '';
      return incoming;
    };

    if (patch.domains) {
      this.integrations.domains = { ...this.integrations.domains, ...patch.domains };
    }
    if (patch.storage) {
      this.integrations.storage = {
        ...this.integrations.storage,
        ...patch.storage,
        encryptionAlgorithm: 'AES-256-GCM',
      };
    }
    if (patch.smtp) {
      this.integrations.smtp = {
        ...this.integrations.smtp,
        ...patch.smtp,
        pass: keepOrSet(patch.smtp.pass, this.integrations.smtp.pass),
      };
    }
    if (patch.twilio) {
      this.integrations.twilio = {
        ...this.integrations.twilio,
        ...patch.twilio,
        authToken: keepOrSet(patch.twilio.authToken, this.integrations.twilio.authToken),
      };
    }
    if (patch.mysql) {
      this.integrations.mysql = {
        ...this.integrations.mysql,
        ...patch.mysql,
        password: keepOrSet(patch.mysql.password, this.integrations.mysql.password),
        connectionUrl: keepOrSet(patch.mysql.connectionUrl, this.integrations.mysql.connectionUrl),
      };
    }
    if (patch.firebase) {
      this.integrations.firebase = {
        ...this.integrations.firebase,
        ...patch.firebase,
        privateKey: keepOrSet(patch.firebase.privateKey, this.integrations.firebase.privateKey),
      };
    }
    if (patch.calls) {
      this.integrations.calls = {
        ...this.integrations.calls,
        ...patch.calls,
        turnCredential: keepOrSet(patch.calls.turnCredential, this.integrations.calls.turnCredential),
        livekitApiSecret: keepOrSet(patch.calls.livekitApiSecret, this.integrations.calls.livekitApiSecret),
      };
    }
  }

  public async connectOrTestMysql(override?: Partial<SystemIntegrationsDTO['mysql']>): Promise<{
    connected: boolean;
    version: string | null;
    error?: string;
  }> {
    if (override) {
      this.updateIntegrations({ mysql: { ...this.integrations.mysql, ...override } });
    }
    const cfg = this.integrations.mysql;
    const uri = cfg.connectionUrl?.trim();
    try {
      const poolOptions =
        uri && uri.startsWith('mysql://')
          ? { uri, waitForConnections: true, connectionLimit: 10, charset: 'utf8mb4' }
          : cfg.host && cfg.user && cfg.database
            ? {
                host: cfg.host,
                port: cfg.port || 3306,
                user: cfg.user,
                password: cfg.password || undefined,
                database: cfg.database,
                waitForConnections: true,
                connectionLimit: 10,
                charset: 'utf8mb4',
              }
            : null;

      if (!poolOptions) {
        return { connected: false, version: null, error: 'Provide either MySQL Connection URL or Host + User + Database' };
      }

      const candidatePool = mysql.createPool(poolOptions);
      const [rows] = await candidatePool.query<RowDataPacket[]>('SELECT VERSION() AS version');
      await this.ensureMysqlSchema(candidatePool, poolOptions);
      if (this.pool) {
        await this.pool.end().catch(() => undefined);
      }
      this.pool = candidatePool;
      this.mysqlConnected = true;
      this.mysqlVersion = String(rows[0]?.version || '8.0');

      // Hydrate any existing MySQL records + push any in-memory records into MySQL without losing either
      await this.hydrateAllData();
      for (const user of this.users.values()) {
        await this.syncUserToMysql(user);
      }
      await this.persistNow();

      return { connected: true, version: this.mysqlVersion };
    } catch (err) {
      return { connected: false, version: null, error: (err as Error).message };
    }
  }

  public getUserChats(userId: string): ChatListItemDTO[] {
    const items: ChatListItemDTO[] = [];
    for (const conv of this.conversations.values()) {
      const member = conv.members.find((m) => m.userId === userId);
      if (!member) continue;

      const convMsgs = Array.from(this.messages.values())
        .filter((m) => m.conversationId === conv.id && !(m.deletedForUserIds || []).includes(userId))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const lastMessage = convMsgs[convMsgs.length - 1] || null;

      if (conv.type === 'DIRECT') {
        const peerMember = conv.members.find((m) => m.userId !== userId);
        const peer = peerMember ? this.users.get(peerMember.userId) : undefined;
        items.push({
          id: conv.id,
          type: conv.type,
          title: peer?.displayName || 'MuzTalk User',
          subtitle: peer?.username ? `@${peer.username}` : peer?.phoneNumber,
          avatarUrl: peer?.avatarUrl || null,
          peerUserId: peer?.id,
          isOnline: peer?.isOnline || false,
          lastSeenAt: peer?.lastSeenAt || null,
          isPinned: member.isPinned,
          isArchived: member.isArchived,
          isMuted: member.isMuted,
          unreadCount: member.unreadCount,
          lastMessage,
          lastMessageAt: lastMessage?.createdAt || conv.lastMessageAt,
        });
      } else {
        const grp = Array.from(this.groups.values()).find((g) => g.conversationId === conv.id);
        items.push({
          id: conv.id,
          type: conv.type,
          title: grp?.name || 'MuzTalk Group',
          subtitle: `${grp?.members.length || conv.members.length} members`,
          avatarUrl: grp?.avatarUrl || null,
          groupId: grp?.id,
          memberCount: grp?.members.length || conv.members.length,
          isPinned: member.isPinned,
          isArchived: member.isArchived,
          isMuted: member.isMuted,
          unreadCount: member.unreadCount,
          lastMessage,
          lastMessageAt: lastMessage?.createdAt || conv.lastMessageAt,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });
  }

  public getSystemHealth(): SystemHealthDTO {
    const activeUsers = Array.from(this.users.values()).filter((u) => u.status === 'ACTIVE').length;
    const onlineUsers = Array.from(this.users.values()).filter((u) => u.isOnline).length;
    const openReports = Array.from(this.reports.values()).filter((r) => r.status === 'OPEN').length;
    const storageBytes = Array.from(this.mediaFiles.values()).reduce((sum, f) => sum + f.sizeBytes, 0);

    return {
      status: 'healthy',
      uptimeSec: Math.floor((Date.now() - this.startTime) / 1000),
      database: {
        engine: 'MySQL 8',
        mode: this.mysqlConnected ? 'mysql_connected' : 'preview_memory_pending_mysql',
        connected: this.mysqlConnected,
        version: this.mysqlVersion,
        hostConfigured: Boolean(this.integrations.mysql.connectionUrl || this.integrations.mysql.host),
      },
      services: {
        expressApi: 'online',
        socketIo: 'online',
        fcmPush:
          this.integrations.firebase.enabled &&
          this.integrations.firebase.projectId &&
          ((this.integrations.firebase.clientEmail && this.integrations.firebase.privateKey) ||
            Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS))
            ? 'configured'
            : 'standby',
        coturn: this.integrations.calls.turnServerUrl ? 'configured' : 'stun_fallback',
        livekitSfu: this.integrations.calls.livekitUrl && this.integrations.calls.livekitApiKey ? 'configured' : 'standby',
        objectStorage: this.integrations.storage.mode,
      },
      metrics: {
        totalUsers: this.users.size,
        activeUsers,
        onlineUsers,
        totalGroups: this.groups.size,
        totalCommunities: this.communities.size,
        totalMessages: this.messages.size,
        totalCalls: this.calls.size,
        openReports,
        storageBytes,
      },
    };
  }

  public generateFingerprint(): string {
    const bytes = crypto.randomBytes(15);
    const chunks: string[] = [];
    for (let i = 0; i < 6; i++) {
      const n = ((bytes[i * 2] || 11) * 256 + (bytes[i * 2 + 1] || 22)) % 90000 + 10000;
      chunks.push(String(n));
    }
    return chunks.join(' ');
  }

  public createAuditLog(adminEmail: string, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> | null = null): void {
    this.auditLogs.unshift({
      id: uuidv4(),
      adminEmail,
      action,
      targetType,
      targetId,
      details,
      createdAt: new Date().toISOString(),
    });
    this.schedulePersist();
  }
}

export const store = new MuzTalkDataStore();

// Helper exports for type completeness
export type {
  AccountStatus,
  CallDTO,
  CallStatus,
  CallType,
  GroupRole,
  MessageAttachmentDTO,
  MessageReactionDTO,
  MessageType,
  ReceiptStatus,
  ReportStatus,
  StatusPrivacyMode,
  StatusType,
};
