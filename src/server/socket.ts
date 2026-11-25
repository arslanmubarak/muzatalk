import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { envConfig } from './config/env';
import { store } from './db/store';
import { sendPushNotificationToUsers } from './services/fcm';
import type { MessageDTO } from '../shared/types';

interface AuthedSocket extends Socket {
  userId?: string;
}

const sendMessageSchema = z.object({
  clientMessageId: z.string().max(64).optional(),
  conversationId: z.string().min(1).max(64),
  type: z
    .enum([
      'TEXT',
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'VOICE_NOTE',
      'DOCUMENT',
      'STICKER',
      'GIF',
      'LOCATION',
      'CONTACT',
      'SYSTEM',
    ])
    .default('TEXT'),
  text: z.string().max(4000).default(''),
  ciphertext: z.string().max(8000).optional().nullable(),
  isEncrypted: z.boolean().optional(),
  replyToId: z.string().max(64).optional().nullable(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        mediaFileId: z.string(),
        url: z.string(),
        originalName: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
        caption: z.string().optional().nullable(),
        durationMs: z.number().optional().nullable(),
      })
    )
    .optional(),
});

let ioInstance: SocketIOServer | null = null;
const userSockets = new Map<string, Set<string>>();

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance = io;

  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ?? undefined);

    if (!token) {
      next(new Error('Unauthorized: missing token'));
      return;
    }
    try {
      const decoded = jwt.verify(token, envConfig.jwtAccessSecret) as { sub: string; type: string };
      if (decoded.type !== 'access') {
        next(new Error('Unauthorized: invalid token type'));
        return;
      }
      const user = store.users.get(decoded.sub);
      if (!user || user.status !== 'ACTIVE') {
        next(new Error('Forbidden: account suspended or missing'));
        return;
      }
      socket.userId = decoded.sub;
      next();
    } catch {
      next(new Error('Unauthorized: invalid token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.userId!;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket.id);

    socket.join(`user:${userId}`);

    // Join all user conversations
    for (const conv of store.conversations.values()) {
      if (conv.members.some((m) => m.userId === userId)) {
        socket.join(`chat:${conv.id}`);
      }
    }

    // Broadcast online presence
    const user = store.users.get(userId);
    if (user) {
      user.isOnline = true;
      user.lastSeenAt = new Date().toISOString();
      io.emit('user:online', { userId, isOnline: true, lastSeenAt: user.lastSeenAt });
    }

    // Messaging: Send with idempotency + ack
    socket.on('message:send', async (rawPayload, ack) => {
      try {
        const parsed = sendMessageSchema.safeParse(rawPayload);
        if (!parsed.success) {
          ack?.({ ok: false, error: 'Invalid message payload' });
          return;
        }
        const data = parsed.data;
        const conv = store.conversations.get(data.conversationId);
        if (!conv || !conv.members.some((m) => m.userId === userId)) {
          ack?.({ ok: false, error: 'Conversation not found or access denied' });
          return;
        }

        // Enforce blocked user check on direct chats
        if (conv.type === 'DIRECT') {
          const peer = conv.members.find((m) => m.userId !== userId);
          if (peer) {
            const peerBlocked = store.blockedUsers.get(peer.userId);
            if (peerBlocked?.has(userId)) {
              ack?.({ ok: false, error: 'Message could not be delivered' });
              return;
            }
          }
        }

        // Idempotency guard by clientMessageId
        if (data.clientMessageId) {
          const existing = Array.from(store.messages.values()).find(
            (m) => m.clientMessageId === data.clientMessageId
          );
          if (existing) {
            ack?.({ ok: true, message: existing });
            return;
          }
        }

        const sender = store.users.get(userId)!;
        const replyTarget = data.replyToId ? store.messages.get(data.replyToId) : undefined;
        const now = new Date().toISOString();
        const message: MessageDTO = {
          id: uuidv4(),
          clientMessageId: data.clientMessageId || null,
          conversationId: conv.id,
          senderId: userId,
          senderName: sender.displayName,
          senderAvatar: sender.avatarUrl,
          type: data.type,
          text: data.text,
          ciphertext: data.ciphertext || null,
          isEncrypted: data.isEncrypted ?? true,
          replyToId: data.replyToId || null,
          replyPreview: replyTarget
            ? {
                id: replyTarget.id,
                senderName: replyTarget.senderName || 'User',
                text: replyTarget.text,
                type: replyTarget.type,
              }
            : null,
          isStarred: false,
          isPinned: false,
          isEdited: false,
          receiptStatus: 'SENT',
          reactions: [],
          attachments: data.attachments || [],
          createdAt: now,
          updatedAt: now,
        };

        store.messages.set(message.id, message);
        conv.lastMessageAt = now;

        // Increment unread counts for other members & track offline users for FCM push
        let deliveredToAny = false;
        const offlineMemberIds: string[] = [];
        for (const m of conv.members) {
          if (m.userId !== userId) {
            m.unreadCount += 1;
            const peerSockets = userSockets.get(m.userId);
            if (peerSockets && peerSockets.size > 0) {
              deliveredToAny = true;
            } else {
              offlineMemberIds.push(m.userId);
            }
          }
        }
        if (deliveredToAny) {
          message.receiptStatus = 'DELIVERED';
        }

        await store.executeMysql(
          `INSERT INTO messages (id, client_message_id, conversation_id, sender_id, type, ciphertext, preview_text, reply_to_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [message.id, message.clientMessageId, message.conversationId, message.senderId, message.type, message.ciphertext, message.text.slice(0, 200), message.replyToId]
        );
        store.schedulePersist();

        io.to(`chat:${conv.id}`).emit('message:new', message);
        if (offlineMemberIds.length > 0) {
          void sendPushNotificationToUsers(offlineMemberIds, {
            category: 'message',
            title: sender.displayName,
            body: message.text || `Sent ${message.type.toLowerCase()}`,
            data: { conversationId: conv.id, messageId: message.id },
          });
        }
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('message:delivered', ({ messageId }: { messageId: string }) => {
      const msg = store.messages.get(messageId);
      if (!msg || msg.senderId === userId) return;
      if (msg.receiptStatus === 'SENT') {
        msg.receiptStatus = 'DELIVERED';
        store.schedulePersist();
        io.to(`chat:${msg.conversationId}`).emit('message:delivered', {
          messageId,
          conversationId: msg.conversationId,
          receiptStatus: 'DELIVERED',
        });
      }
    });

    socket.on('message:read', ({ conversationId }: { conversationId: string }) => {
      const conv = store.conversations.get(conversationId);
      if (!conv) return;
      const member = conv.members.find((m) => m.userId === userId);
      if (member) {
        member.unreadCount = 0;
        member.lastReadAt = new Date().toISOString();
      }
      const updatedIds: string[] = [];
      for (const msg of store.messages.values()) {
        if (msg.conversationId === conversationId && msg.senderId !== userId && msg.receiptStatus !== 'READ') {
          msg.receiptStatus = 'READ';
          updatedIds.push(msg.id);
        }
      }
      if (member || updatedIds.length > 0) {
        store.schedulePersist();
      }
      if (updatedIds.length > 0) {
        io.to(`chat:${conversationId}`).emit('message:read', {
          conversationId,
          readerId: userId,
          messageIds: updatedIds,
        });
      }
    });

    socket.on('message:reaction', ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const msg = store.messages.get(messageId);
      if (!msg) return;
      const existingIdx = msg.reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
      if (existingIdx >= 0) {
        msg.reactions.splice(existingIdx, 1);
      } else {
        msg.reactions.push({ id: uuidv4(), messageId, userId, emoji });
      }
      store.schedulePersist();
      io.to(`chat:${msg.conversationId}`).emit('message:reaction', {
        messageId,
        conversationId: msg.conversationId,
        reactions: msg.reactions,
      });
    });

    socket.on('user:typing', ({ conversationId }: { conversationId: string }) => {
      socket.to(`chat:${conversationId}`).emit('user:typing', { conversationId, userId });
    });

    socket.on('user:stop_typing', ({ conversationId }: { conversationId: string }) => {
      socket.to(`chat:${conversationId}`).emit('user:stop_typing', { conversationId, userId });
    });

    // Real WebRTC Signaling Events
    socket.on('call:incoming', (payload: { callId: string; toUserId: string; type: 'AUDIO' | 'VIDEO' | 'GROUP_AUDIO' | 'GROUP_VIDEO'; conversationId?: string }) => {
      const caller = store.users.get(userId);
      emitToUser(payload.toUserId, 'call:incoming', {
        ...payload,
        fromUserId: userId,
        fromName: caller?.displayName || 'MuzTalk User',
        fromAvatar: caller?.avatarUrl || null,
      });
      if (!userSockets.get(payload.toUserId)?.size) {
        void sendPushNotificationToUsers([payload.toUserId], {
          category: 'call',
          title: `Incoming ${payload.type.includes('VIDEO') ? 'Video' : 'Audio'} Call`,
          body: `${caller?.displayName || 'MuzTalk User'} is calling you`,
          data: { callId: payload.callId, fromUserId: userId, callType: payload.type },
        });
      }
    });

    socket.on('call:accept', (payload: { callId: string; toUserId: string }) => {
      const call = store.calls.get(payload.callId);
      if (call) {
        call.status = 'ACTIVE';
        call.answeredAt = new Date().toISOString();
        store.schedulePersist();
      }
      emitToUser(payload.toUserId, 'call:accept', { callId: payload.callId, fromUserId: userId });
    });

    socket.on('call:reject', (payload: { callId: string; toUserId: string }) => {
      const call = store.calls.get(payload.callId);
      if (call) {
        call.status = 'REJECTED';
        call.endedAt = new Date().toISOString();
        store.schedulePersist();
      }
      emitToUser(payload.toUserId, 'call:reject', { callId: payload.callId, fromUserId: userId });
    });

    socket.on('call:end', (payload: { callId: string; toUserId?: string }) => {
      const call = store.calls.get(payload.callId);
      if (call) {
        call.status = call.answeredAt ? 'ENDED' : 'MISSED';
        call.endedAt = new Date().toISOString();
        if (call.answeredAt) {
          call.durationSec = Math.max(
            1,
            Math.floor((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1000)
          );
        }
        store.schedulePersist();
      }
      if (payload.toUserId) {
        emitToUser(payload.toUserId, 'call:end', { callId: payload.callId, fromUserId: userId });
      }
    });

    socket.on('call:offer', (payload: { callId: string; toUserId: string; sdp: unknown }) => {
      emitToUser(payload.toUserId, 'call:offer', { ...payload, fromUserId: userId });
    });

    socket.on('call:answer', (payload: { callId: string; toUserId: string; sdp: unknown }) => {
      emitToUser(payload.toUserId, 'call:answer', { ...payload, fromUserId: userId });
    });

    socket.on('call:ice_candidate', (payload: { callId: string; toUserId: string; candidate: unknown }) => {
      emitToUser(payload.toUserId, 'call:ice_candidate', { ...payload, fromUserId: userId });
    });

    socket.on('disconnect', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
          const u = store.users.get(userId);
          if (u) {
            u.isOnline = false;
            u.lastSeenAt = new Date().toISOString();
            io.emit('user:offline', { userId, isOnline: false, lastSeenAt: u.lastSeenAt });
            io.emit('user:last_seen', { userId, lastSeenAt: u.lastSeenAt });
          }
        }
      }
    });
  });

  return io;
}
