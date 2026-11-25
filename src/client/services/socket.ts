import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;
const pendingQueue: Array<{ event: string; payload: unknown; ack?: (res: unknown) => void }> = [];

export function connectSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;

  if (socket && socket.connected) {
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  const socketBase =
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '').replace(/\/$/, '') ||
    window.location.origin;

  socket = io(socketBase, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    while (pendingQueue.length > 0) {
      const item = pendingQueue.shift();
      if (item) {
        socket?.emit(item.event, item.payload, item.ack);
      }
    }
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  pendingQueue.length = 0;
}

export function emitReliable(event: string, payload: unknown, ack?: (res: unknown) => void): void {
  if (socket && socket.connected) {
    socket.emit(event, payload, ack);
  } else {
    pendingQueue.push({ event, payload, ack });
  }
}
