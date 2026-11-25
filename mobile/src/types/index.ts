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
export type CallType = 'AUDIO' | 'VIDEO' | 'GROUP_AUDIO' | 'GROUP_VIDEO';
export type CallStatus = 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'REJECTED' | 'FAILED';

export interface UserDTO {
  id: string;
  phoneNumber: string;
  countryCode: string;
  username: string | null;
  displayName: string;
  about: string;
  avatarUrl: string | null;
  status: AccountStatus;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  encryptionFingerprint?: string;
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
  replyToId?: string | null;
  replyPreview?: {
    id: string;
    senderName: string;
    text: string;
    type: MessageType;
  } | null;
  isStarred: boolean;
  isPinned: boolean;
  isEdited: boolean;
  deletedForAllAt?: string | null;
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

export interface CommunityDTO {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  groups: Array<{
    groupId: string;
    conversationId: string;
    name: string;
    memberCount: number;
    isAnnouncement: boolean;
  }>;
  memberCount: number;
}

export interface StatusDTO {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO';
  contentText: string | null;
  mediaUrl: string | null;
  bgColor: string | null;
  caption: string | null;
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
  startedAt: string;
  durationSec: number;
}

export interface StickerPackDTO {
  id: string;
  title: string;
  author: string;
  stickers: Array<{
    id: string;
    packId: string;
    label: string;
    emojiTag: string;
    imageUrl: string;
  }>;
}
