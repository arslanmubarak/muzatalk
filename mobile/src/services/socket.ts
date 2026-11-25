import { io, Socket } from 'socket.io-client';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { mobileApi } from './api';
import type { MessageDTO } from '../types';

let socket: Socket | null = null;
const offlineQueue: Array<{ event: string; payload: unknown; ack?: (res: unknown) => void }> = [];

export function connectMobileSocket(): Socket | null {
  const { serverUrl, accessToken, currentUser, setSocketConnected, appendMessage, updateMessage, setTyping, setChats } =
    useMuzTalkStore.getState();

  if (!accessToken || !currentUser) return null;

  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();

  socket = io(serverUrl, {
    auth: (cb) => cb({ token: useMuzTalkStore.getState().accessToken }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    setSocketConnected(true);
    while (offlineQueue.length > 0) {
      const next = offlineQueue.shift();
      if (next) socket?.emit(next.event, next.payload, next.ack);
    }
  });

  socket.on('disconnect', () => {
    setSocketConnected(false);
  });

  socket.on('message:new', (msg: MessageDTO) => {
    appendMessage(msg);
    if (msg.senderId !== currentUser.id) {
      socket?.emit('message:delivered', { messageId: msg.id });
    }
    mobileApi.getChats().then((r) => setChats(r.chats)).catch(() => {});
  });

  socket.on('message:edit', (msg: MessageDTO) => {
    updateMessage(msg);
    mobileApi.getChats().then((r) => setChats(r.chats)).catch(() => {});
  });

  socket.on('message:reaction', (payload: { messageId: string; conversationId: string; reactions: MessageDTO['reactions'] }) => {
    const existing = useMuzTalkStore.getState().messagesByChat[payload.conversationId] || [];
    const target = existing.find((m) => m.id === payload.messageId);
    if (target) {
      updateMessage({ ...target, reactions: payload.reactions });
    }
  });

  socket.on('user:typing', (payload: { conversationId: string; userId: string }) => {
    if (payload.userId !== currentUser.id) setTyping(payload.conversationId, true);
  });

  socket.on('user:stop_typing', (payload: { conversationId: string; userId: string }) => {
    if (payload.userId !== currentUser.id) setTyping(payload.conversationId, false);
  });

  socket.on('user:online', () => {
    mobileApi.getChats().then((r) => setChats(r.chats)).catch(() => {});
  });

  socket.on('user:offline', () => {
    mobileApi.getChats().then((r) => setChats(r.chats)).catch(() => {});
  });

  return socket;
}

export function getMobileSocket(): Socket | null {
  return socket;
}

export function disconnectMobileSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  offlineQueue.length = 0;
  useMuzTalkStore.getState().setSocketConnected(false);
}

export function emitMobileReliable(event: string, payload: unknown, ack?: (res: unknown) => void): void {
  if (socket && socket.connected) {
    socket.emit(event, payload, ack);
  } else {
    offlineQueue.push({ event, payload, ack });
  }
}
