export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type ConversationType = 'DIRECT' | 'GROUP' | 'COMMUNITY_ANNOUNCEMENT';
export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'VOICE_NOTE'
  | 'DOCUMENT'
  | 'STICKER'
  | 'GIF'
  | 'LOCATION'
  | 'CONTACT'
  | 'SYSTEM';
export type ReceiptStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type StatusType = 'TEXT' | 'IMAGE' | 'VIDEO';
export type StatusPrivacyMode = 'CONTACTS' | 'EXCEPT_SELECTED' | 'ONLY_SELECTED';
export type CallType = 'AUDIO' | 'VIDEO' | 'GROUP_AUDIO' | 'GROUP_VIDEO';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'REJECTED' | 'FAILED';
export type ReportStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface UserSettingsDTO {
  theme: 'light' | 'dark' | 'system';
  language: string;
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  avatarVisibility: 'everyone' | 'contacts' | 'nobody';
  aboutVisibility: 'everyone' | 'contacts' | 'nobody';
  readReceipts: boolean;
  messageAlerts: boolean;
  groupAlerts: boolean;
  callAlerts: boolean;
  autoDownloadMedia: boolean;
  chatWallpaper: string;
}

export interface UserDTO {
  id: string;
  phoneNumber: string;
  countryCode: string;
  email?: string | null;
  username: string | null;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  status: AccountStatus;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  settings?: UserSettingsDTO;
  encryptionFingerprint?: string;
  blockScreenCapture?: boolean;
}

export interface SystemIntegrationsDTO {
  domains: {
    frontendUrl: string;
    backendApiUrl: string;
  };
  storage: {
    mode: 'mobile_encrypted_vault' | 'server_temp_relay';
    encryptionAlgorithm: 'AES-256-GCM';
    folderName: string;
  };
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    passSet?: boolean;
    pass?: string;
    fromEmail: string;
    fromName: string;
  };
  twilio: {
    enabled: boolean;
    accountSid: string;
    authTokenSet?: boolean;
    authToken?: string;
    fromNumber: string;
  };
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    passwordSet?: boolean;
    password?: string;
    connectionUrlSet?: boolean;
    connectionUrl?: string;
  };
  firebase: {
    enabled: boolean;
    projectId: string;
    storageBucket: string;
    clientEmail: string;
    privateKeySet?: boolean;
    privateKey?: string;
    apiKey: string;
    appId: string;
  };
  calls: {
    stunServerUrl: string;
    turnServerUrl: string;
    turnUsername: string;
    turnCredentialSet?: boolean;
    turnCredential?: string;
    livekitUrl: string;
    livekitApiKey: string;
    livekitApiSecretSet?: boolean;
    livekitApiSecret?: string;
  };
}

export interface DeviceDTO {
  id: string;
  userId: string;
  deviceName: string;
  platform: string;
  isPrimary: boolean;
  lastActiveAt: string;
}

export interface MessageReactionDTO {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export interface MessageAttachmentDTO {
  id: string;
  mediaFileId: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption?: string | null;
  durationMs?: number | null;
}

export interface MessageDTO {
  id: string;
  clientMessageId?: string | null;
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string | null;
  type: MessageType;
  text: string;
  ciphertext?: string | null;
  isEncrypted?: boolean;
  replyToId?: string | null;
  replyPreview?: {
    id: string;
    senderName: string;
    text: string;
    type: MessageType;
  } | null;
  forwardedFromId?: string | null;
  isStarred: boolean;
  isPinned: boolean;
  isEdited: boolean;
  deletedForAllAt?: string | null;
  deletedForUserIds?: string[];
  receiptStatus: ReceiptStatus;
  reactions: MessageReactionDTO[];
  attachments: MessageAttachmentDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatListItemDTO {
  id: string;
  type: ConversationType;
  title: string;
  subtitle?: string;
  avatarUrl: string | null;
  peerUserId?: string;
  isOnline?: boolean;
  lastSeenAt?: string | null;
  groupId?: string;
  memberCount?: number;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  unreadCount: number;
  lastMessage: MessageDTO | null;
  lastMessageAt: string | null;
}

export interface GroupDTO {
  id: string;
  conversationId: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  onlyAdminsPost: boolean;
  inviteCode: string;
  createdById: string;
  members: Array<{
    userId: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    role: GroupRole;
    isOnline: boolean;
  }>;
  createdAt: string;
}

export interface CommunityDTO {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  inviteCode: string;
  createdById: string;
  announcementGroupId: string | null;
  groups: Array<{
    groupId: string;
    conversationId: string;
    name: string;
    memberCount: number;
    isAnnouncement: boolean;
  }>;
  memberCount: number;
  createdAt: string;
}

export interface StatusDTO {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  type: StatusType;
  contentText: string | null;
  mediaUrl: string | null;
  bgColor: string | null;
  caption: string | null;
  privacyMode: StatusPrivacyMode;
  viewsCount: number;
  viewedByMe: boolean;
  viewers: Array<{ userId: string; displayName: string; viewedAt: string }>;
  reactions: Array<{ userId: string; emoji: string }>;
  expiresAt: string;
  createdAt: string;
}

export interface CallDTO {
  id: string;
  conversationId: string | null;
  initiatorId: string;
  initiatorName: string;
  initiatorAvatar: string | null;
  peerId: string | null;
  peerName: string;
  peerAvatar: string | null;
  type: CallType;
  status: CallStatus;
  livekitRoom: string | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number;
}

export interface StickerPackDTO {
  id: string;
  title: string;
  author: string;
  isOfficial: boolean;
  downloaded?: boolean;
  stickers: Array<{
    id: string;
    packId: string;
    label: string;
    emojiTag: string;
    imageUrl: string;
    isAnimated: boolean;
  }>;
}

export interface ReportDTO {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface SystemHealthDTO {
  status: 'healthy' | 'degraded';
  uptimeSec: number;
  database: {
    engine: 'MySQL 8';
    mode: 'mysql_connected' | 'preview_memory_pending_mysql';
    connected: boolean;
    version: string | null;
    hostConfigured: boolean;
  };
  services: {
    expressApi: 'online';
    socketIo: 'online';
    fcmPush: 'configured' | 'standby';
    coturn: 'configured' | 'stun_fallback';
    livekitSfu: 'configured' | 'standby';
    objectStorage: 'mobile_encrypted_vault' | 'server_temp_relay';
  };
  metrics: {
    totalUsers: number;
    activeUsers: number;
    onlineUsers: number;
    totalGroups: number;
    totalCommunities: number;
    totalMessages: number;
    totalCalls: number;
    openReports: number;
    storageBytes: number;
  };
}
