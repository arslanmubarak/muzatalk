import type {
  AuditLogDTO,
  CallDTO,
  ChatListItemDTO,
  CommunityDTO,
  DeviceDTO,
  GroupDTO,
  MessageDTO,
  ReportDTO,
  StatusDTO,
  StickerPackDTO,
  SystemHealthDTO,
  SystemIntegrationsDTO,
  UserDTO,
} from '../../shared/types';

const API_BASE = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Tokens held strictly in JS memory (never localStorage/sessionStorage)
let accessToken: string | null = null;
let refreshToken: string | null = null;
let adminToken: string | null = null;

export function setAuthTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setAdminToken(token: string | null) {
  adminToken = token;
}

export function getAdminToken(): string | null {
  return adminToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  mode: 'user' | 'admin' | 'public' = 'user'
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (mode === 'user' && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  } else if (mode === 'admin' && adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && mode === 'user' && refreshToken) {
    const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (refreshRes.ok) {
      const tokens = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      headers.set('Authorization', `Bearer ${accessToken}`);
      res = await fetch(url, { ...options, headers });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  health: () => request<SystemHealthDTO>('/api/health', {}, 'public'),

  sendEmailOtp: (email: string, username?: string) =>
    request<{ sent: boolean; email: string; expiresInSeconds: number; provider: string; devOtpPreview?: string }>(
      '/api/auth/send-email-otp',
      { method: 'POST', body: JSON.stringify({ email, username: username || undefined }) },
      'public'
    ),

  verifyEmailOtp: (payload: {
    email: string;
    otp: string;
    username?: string;
    displayName?: string;
    password?: string;
    deviceName?: string;
    platform?: string;
  }) =>
    request<{ isNewUser: boolean; user: UserDTO; deviceId: string; accessToken: string; refreshToken: string }>(
      '/api/auth/verify-email-otp',
      { method: 'POST', body: JSON.stringify(payload) },
      'public'
    ),

  loginWithPassword: (payload: { identifier: string; password: string; deviceName?: string; platform?: string }) =>
    request<{ requiresOtp: boolean; email: string; expiresInSeconds: number; provider: string; devOtpPreview?: string }>(
      '/api/auth/login-password',
      { method: 'POST', body: JSON.stringify(payload) },
      'public'
    ),

  sendOtp: (countryCode: string, phoneNumber: string) =>
    request<{ sent: boolean; phoneNumber: string; expiresInSeconds: number; provider: string; devOtpPreview?: string }>(
      '/api/auth/send-otp',
      { method: 'POST', body: JSON.stringify({ countryCode, phoneNumber }) },
      'public'
    ),

  verifyOtp: (payload: {
    phoneNumber: string;
    otp: string;
    displayName?: string;
    username?: string;
    deviceName?: string;
    platform?: string;
  }) =>
    request<{ isNewUser: boolean; user: UserDTO; deviceId: string; accessToken: string; refreshToken: string }>(
      '/api/auth/verify-otp',
      { method: 'POST', body: JSON.stringify(payload) },
      'public'
    ),

  logout: () =>
    request<{ loggedOut: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  getDevices: () => request<{ devices: DeviceDTO[] }>('/api/auth/devices'),
  revokeDevice: (id: string) => request<{ deleted: boolean }>(`/api/auth/devices/${id}`, { method: 'DELETE' }),

  getSecurityPolicy: () =>
    request<{ blockScreenCapture: boolean; globalBlockScreenCapture: boolean }>('/api/security-policy'),

  getMe: () =>
    request<{ user: UserDTO; blockedUserIds: string[]; securityPolicy?: { blockScreenCapture: boolean } }>('/api/users/me'),
  updateMe: (payload: Record<string, unknown>) =>
    request<{ user: UserDTO }>('/api/users/me', { method: 'PUT', body: JSON.stringify(payload) }),
  searchUsers: (q = '') => request<{ users: UserDTO[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  blockUser: (id: string) => request<{ blocked: boolean }>(`/api/users/${id}/block`, { method: 'POST' }),
  unblockUser: (id: string) => request<{ blocked: boolean }>(`/api/users/${id}/block`, { method: 'DELETE' }),
  reportUser: (id: string, reason: string, details?: string) =>
    request<{ report: ReportDTO }>(`/api/users/${id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    }),
  registerEncryptionKeys: (payload: {
    identityKeyPub: string;
    signedPreKeyPub: string;
    signedPreKeySig: string;
    fingerprint: string;
  }) => request<{ stored: boolean; fingerprint: string }>('/api/users/me/keys', { method: 'POST', body: JSON.stringify(payload) }),

  getContacts: () => request<{ contacts: Array<UserDTO & { aliasName?: string | null; isFavorite?: boolean }> }>('/api/contacts'),
  addContact: (contactUserId: string) =>
    request<{ added: boolean }>('/api/contacts', { method: 'POST', body: JSON.stringify({ contactUserId }) }),

  getChats: (params?: { q?: string; unread?: boolean; archived?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.unread) sp.set('unread', 'true');
    if (params?.archived) sp.set('archived', 'true');
    return request<{ chats: ChatListItemDTO[] }>(`/api/chats?${sp.toString()}`);
  },
  createDirectChat: (peerUserId: string) =>
    request<{ chat: ChatListItemDTO }>('/api/chats', { method: 'POST', body: JSON.stringify({ peerUserId }) }),
  updateChatPreferences: (
    chatId: string,
    prefs: { isPinned?: boolean; isArchived?: boolean; isMuted?: boolean; markUnread?: boolean }
  ) => request<{ updated: boolean }>(`/api/chats/${chatId}/preferences`, { method: 'PATCH', body: JSON.stringify(prefs) }),
  getMessages: (chatId: string, q = '') =>
    request<{ messages: MessageDTO[] }>(`/api/chats/${chatId}/messages?q=${encodeURIComponent(q)}`),
  editMessage: (id: string, payload: { text?: string; isStarred?: boolean; isPinned?: boolean }) =>
    request<{ message: MessageDTO }>(`/api/messages/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMessage: (id: string, scope: 'me' | 'everyone') =>
    request<{ deleted: boolean }>(`/api/messages/${id}?scope=${scope}`, { method: 'DELETE' }),

  getGroups: () => request<{ groups: GroupDTO[] }>('/api/groups'),
  createGroup: (payload: { name: string; description: string; memberIds: string[]; onlyAdminsPost?: boolean }) =>
    request<{ group: GroupDTO }>('/api/groups', { method: 'POST', body: JSON.stringify(payload) }),
  addGroupMember: (groupId: string, userId: string) =>
    request<{ group: GroupDTO }>(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),

  getCommunities: () => request<{ communities: CommunityDTO[] }>('/api/communities'),
  createCommunity: (payload: { name: string; description: string }) =>
    request<{ community: CommunityDTO }>('/api/communities', { method: 'POST', body: JSON.stringify(payload) }),

  getCallsHistory: () => request<{ calls: CallDTO[] }>('/api/calls/history'),
  getIceConfig: () => request<{ iceServers: RTCIceServer[]; livekit: { configured: boolean; url: string | null } }>('/api/calls/ice-config'),
  startCall: (payload: { peerId?: string | null; conversationId?: string | null; type: 'AUDIO' | 'VIDEO' | 'GROUP_AUDIO' | 'GROUP_VIDEO' }) =>
    request<{ call: CallDTO }>('/api/calls', { method: 'POST', body: JSON.stringify(payload) }),
  endCall: (callId: string) => request<{ call: CallDTO }>(`/api/calls/${callId}/end`, { method: 'POST' }),

  getStatuses: () => request<{ statuses: StatusDTO[] }>('/api/status'),
  createStatus: (payload: {
    type: 'TEXT' | 'IMAGE' | 'VIDEO';
    contentText?: string | null;
    mediaUrl?: string | null;
    bgColor?: string | null;
    caption?: string | null;
    privacyMode?: 'CONTACTS' | 'EXCEPT_SELECTED' | 'ONLY_SELECTED';
  }) => request<{ status: StatusDTO }>('/api/status', { method: 'POST', body: JSON.stringify(payload) }),
  viewStatus: (id: string) => request<{ status: StatusDTO }>(`/api/status/${id}/view`, { method: 'POST' }),
  reactStatus: (id: string, emoji: string) =>
    request<{ status: StatusDTO }>(`/api/status/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  deleteStatus: (id: string) => request<{ deleted: boolean }>(`/api/status/${id}`, { method: 'DELETE' }),

  getStickers: () => request<{ packs: StickerPackDTO[] }>('/api/stickers'),
  uploadMedia: (file: File | Blob, filename?: string) => {
    const fd = new FormData();
    fd.append('file', file, filename || (file instanceof File ? file.name : 'voice-note.webm'));
    return request<{ id: string; url: string; originalName: string; mimeType: string; sizeBytes: number }>(
      '/api/media/upload',
      { method: 'POST', body: fd }
    );
  },

  // Admin endpoints
  adminBootstrapStatus: () =>
    request<{ needsSetup: boolean; hasEnvPasscode: boolean }>('/api/admin/bootstrap-status', {}, 'public'),
  adminBootstrap: (payload: { email: string; displayName: string; password: string }) =>
    request<{ token: string; admin: { id: string; email: string; displayName: string; role: string } }>(
      '/api/admin/bootstrap',
      { method: 'POST', body: JSON.stringify(payload) },
      'public'
    ),
  adminLogin: (payload: { email: string; password: string }) =>
    request<{ token: string; admin: { id: string; email: string; displayName: string; role: string } }>(
      '/api/admin/login',
      { method: 'POST', body: JSON.stringify(payload) },
      'public'
    ),
  adminOverview: () =>
    request<{
      health: SystemHealthDTO;
      config: {
        maintenanceMode: boolean;
        allowNewRegistrations: boolean;
        maxUploadMb: number;
        statusExpiryHours: number;
        e2eeEnforced: boolean;
        blockScreenCapture: boolean;
      };
    }>('/api/admin/overview', {}, 'admin'),
  adminUsers: (q = '') =>
    request<{ users: UserDTO[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`, {}, 'admin'),
  adminUpdateUserStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED') =>
    request<{ user: UserDTO }>(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, 'admin'),
  adminUpdateUserScreenCapture: (id: string, blockScreenCapture: boolean) =>
    request<{ user: UserDTO; effectiveBlockScreenCapture: boolean }>(
      `/api/admin/users/${id}/screen-capture`,
      { method: 'PATCH', body: JSON.stringify({ blockScreenCapture }) },
      'admin'
    ),
  adminReports: () => request<{ reports: ReportDTO[] }>('/api/admin/reports', {}, 'admin'),
  adminResolveReport: (id: string, status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED') =>
    request<{ report: ReportDTO }>(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, 'admin'),
  adminAuditLogs: () => request<{ logs: AuditLogDTO[] }>('/api/admin/audit-logs', {}, 'admin'),
  adminUpdateConfig: (config: Record<string, unknown>) =>
    request<{ config: Record<string, unknown> }>('/api/admin/config', { method: 'PUT', body: JSON.stringify(config) }, 'admin'),
  adminGetIntegrations: () => request<{ integrations: SystemIntegrationsDTO }>('/api/admin/integrations', {}, 'admin'),
  adminUpdateIntegrations: (payload: Partial<SystemIntegrationsDTO>) =>
    request<{ integrations: SystemIntegrationsDTO; health: SystemHealthDTO }>(
      '/api/admin/integrations',
      { method: 'PUT', body: JSON.stringify(payload) },
      'admin'
    ),
  adminTestSmtp: (payload: { to: string; smtp?: Partial<SystemIntegrationsDTO['smtp']> }) =>
    request<{ ok: boolean; message: string }>('/api/admin/integrations/test-smtp', { method: 'POST', body: JSON.stringify(payload) }, 'admin'),
  adminTestMysql: (payload: { mysql?: Partial<SystemIntegrationsDTO['mysql']> }) =>
    request<{ ok: boolean; version: string; health: SystemHealthDTO }>(
      '/api/admin/integrations/test-mysql',
      { method: 'POST', body: JSON.stringify(payload) },
      'admin'
    ),
  adminTestFirebase: (payload: { firebase?: Partial<SystemIntegrationsDTO['firebase']> }) =>
    request<{ ok: boolean; projectId: string; clientEmail: string; integrations: SystemIntegrationsDTO; health: SystemHealthDTO }>(
      '/api/admin/integrations/test-firebase',
      { method: 'POST', body: JSON.stringify(payload) },
      'admin'
    ),
  adminPersistenceStatus: () =>
    request<{
      persistence: {
        dataDir: string;
        uploadsDir: string;
        snapshotFile: string;
        mysqlConnected: boolean;
        mysqlVersion: string | null;
        lastPersistedAt: string | null;
        counts: {
          users: number;
          admins: number;
          conversations: number;
          messages: number;
          groups: number;
          calls: number;
          mediaFiles: number;
        };
      };
    }>('/api/admin/persistence-status', {}, 'admin'),
  adminDownloadBackup: async () => {
    const res = await fetch(`${API_BASE}/api/admin/backup/export`, {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Backup export failed');
    }
    return res.blob();
  },
  adminImportBackup: (snapshot: Record<string, unknown>) =>
    request<{ ok: boolean; persistence: { counts: { users: number; messages: number } } }>(
      '/api/admin/backup/import',
      { method: 'POST', body: JSON.stringify({ snapshot }) },
      'admin'
    ),
  adminUploadBuildZip: (
    file: File,
    options: { runBuild?: 'auto' | 'true' | 'false'; restartAfterUpdate?: boolean }
  ) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('runBuild', options.runBuild || 'auto');
    fd.append('restartAfterUpdate', String(Boolean(options.restartAfterUpdate)));
    return request<{
      ok: boolean;
      extractedFilesCount: number;
      skippedProtectedCount: number;
      strippedRootFolder: string | null;
      hasDist: boolean;
      hasServerJs: boolean;
      buildRan: boolean;
      buildOutput: string | null;
      syncedPublicHtml: boolean;
      restartTriggered: boolean;
      restartScheduled: boolean;
      persistence: {
        counts: { users: number; messages: number; groups: number };
      };
    }>('/api/admin/system/update-zip', { method: 'POST', body: fd }, 'admin');
  },
};
