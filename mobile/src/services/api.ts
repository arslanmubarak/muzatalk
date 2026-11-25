import { useMuzTalkStore } from '../store/useMuzTalkStore';
import type {
  CallDTO,
  CallType,
  ChatListItemDTO,
  CommunityDTO,
  DeviceDTO,
  MessageDTO,
  StatusDTO,
  StickerPackDTO,
  UserDTO,
} from '../types';

async function mobileFetch<T>(
  path: string,
  options: RequestInit = {},
  authRequired = true
): Promise<T> {
  const { serverUrl, accessToken, refreshToken, setTokens } = useMuzTalkStore.getState();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authRequired && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res = await fetch(`${serverUrl}${path}`, { ...options, headers });

  if (res.status === 401 && authRequired && refreshToken) {
    const refreshRes = await fetch(`${serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (refreshRes.ok) {
      const tokens = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
      await setTokens(tokens.accessToken, tokens.refreshToken);
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      res = await fetch(`${serverUrl}${path}`, { ...options, headers });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const mobileApi = {
  resolveUrl: (relativeOrAbsolute: string | null | undefined): string | null => {
    if (!relativeOrAbsolute) return null;
    if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
      return relativeOrAbsolute;
    }
    const { serverUrl } = useMuzTalkStore.getState();
    return `${serverUrl}${relativeOrAbsolute}`;
  },

  sendOtp: (countryCode: string, phoneNumber: string) =>
    mobileFetch<{ sent: boolean; phoneNumber: string; devOtpPreview?: string }>(
      '/api/auth/send-otp',
      { method: 'POST', body: JSON.stringify({ countryCode, phoneNumber }) },
      false
    ),

  verifyOtp: (payload: {
    phoneNumber: string;
    otp: string;
    displayName?: string;
    deviceName?: string;
    platform?: string;
  }) =>
    mobileFetch<{ user: UserDTO; deviceId: string; accessToken: string; refreshToken: string }>(
      '/api/auth/verify-otp',
      { method: 'POST', body: JSON.stringify(payload) },
      false
    ),

  demoSession: (userId: string) =>
    mobileFetch<{ user: UserDTO; deviceId: string; accessToken: string; refreshToken: string }>(
      '/api/auth/demo-session',
      { method: 'POST', body: JSON.stringify({ userId }) },
      false
    ),

  logout: () => {
    const { refreshToken } = useMuzTalkStore.getState();
    return mobileFetch<{ loggedOut: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  getMe: () => mobileFetch<{ user: UserDTO; blockedUserIds: string[] }>('/api/users/me'),
  updateMe: (payload: Record<string, unknown>) =>
    mobileFetch<{ user: UserDTO }>('/api/users/me', { method: 'PUT', body: JSON.stringify(payload) }),
  searchUsers: (q = '') => mobileFetch<{ users: UserDTO[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  getDevices: () => mobileFetch<{ devices: DeviceDTO[] }>('/api/auth/devices'),
  revokeDevice: (id: string) => mobileFetch<{ deleted: boolean }>(`/api/auth/devices/${id}`, { method: 'DELETE' }),
  registerEncryptionKeys: (payload: {
    identityKeyPub: string;
    signedPreKeyPub: string;
    signedPreKeySig: string;
    fingerprint: string;
  }) => mobileFetch<{ stored: boolean; fingerprint: string }>('/api/users/me/keys', { method: 'POST', body: JSON.stringify(payload) }),

  getChats: (params?: { q?: string; unread?: boolean; archived?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.unread) sp.set('unread', 'true');
    if (params?.archived) sp.set('archived', 'true');
    return mobileFetch<{ chats: ChatListItemDTO[] }>(`/api/chats?${sp.toString()}`);
  },
  createDirectChat: (peerUserId: string) =>
    mobileFetch<{ chat: ChatListItemDTO }>('/api/chats', { method: 'POST', body: JSON.stringify({ peerUserId }) }),
  updateChatPreferences: (chatId: string, prefs: { isPinned?: boolean; isArchived?: boolean; isMuted?: boolean }) =>
    mobileFetch<{ updated: boolean }>(`/api/chats/${chatId}/preferences`, { method: 'PATCH', body: JSON.stringify(prefs) }),
  getMessages: (chatId: string, q = '') =>
    mobileFetch<{ messages: MessageDTO[] }>(`/api/chats/${chatId}/messages?q=${encodeURIComponent(q)}`),
  editMessage: (id: string, payload: { text?: string; isStarred?: boolean; isPinned?: boolean }) =>
    mobileFetch<{ message: MessageDTO }>(`/api/messages/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMessage: (id: string, scope: 'me' | 'everyone') =>
    mobileFetch<{ deleted: boolean }>(`/api/messages/${id}?scope=${scope}`, { method: 'DELETE' }),

  createGroup: (payload: { name: string; description: string; memberIds: string[] }) =>
    mobileFetch<{ group: { id: string; conversationId: string; name: string } }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCommunities: () => mobileFetch<{ communities: CommunityDTO[] }>('/api/communities'),
  createCommunity: (payload: { name: string; description: string }) =>
    mobileFetch<{ community: CommunityDTO }>('/api/communities', { method: 'POST', body: JSON.stringify(payload) }),

  getStatuses: () => mobileFetch<{ statuses: StatusDTO[] }>('/api/status'),
  createStatus: (payload: { type: 'TEXT' | 'IMAGE'; contentText?: string; mediaUrl?: string; bgColor?: string; caption?: string }) =>
    mobileFetch<{ status: StatusDTO }>('/api/status', { method: 'POST', body: JSON.stringify(payload) }),
  viewStatus: (id: string) => mobileFetch<{ status: StatusDTO }>(`/api/status/${id}/view`, { method: 'POST' }),
  reactStatus: (id: string, emoji: string) =>
    mobileFetch<{ status: StatusDTO }>(`/api/status/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  deleteStatus: (id: string) => mobileFetch<{ deleted: boolean }>(`/api/status/${id}`, { method: 'DELETE' }),

  getCallsHistory: () => mobileFetch<{ calls: CallDTO[] }>('/api/calls/history'),
  getIceConfig: () => mobileFetch<{ iceServers: Array<{ urls: string; username?: string; credential?: string }> }>('/api/calls/ice-config'),
  startCall: (payload: { peerId?: string | null; conversationId?: string | null; type: CallType }) =>
    mobileFetch<{ call: CallDTO }>('/api/calls', { method: 'POST', body: JSON.stringify(payload) }),
  endCall: (callId: string) => mobileFetch<{ call: CallDTO }>(`/api/calls/${callId}/end`, { method: 'POST' }),

  getStickers: () => mobileFetch<{ packs: StickerPackDTO[] }>('/api/stickers'),

  uploadFile: async (uri: string, name: string, mimeType: string) => {
    const fd = new FormData();
    fd.append('file', { uri, name, type: mimeType } as unknown as Blob);
    return mobileFetch<{ id: string; url: string; originalName: string; mimeType: string; sizeBytes: number }>(
      '/api/media/upload',
      { method: 'POST', body: fd }
    );
  },
};
