import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
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

const ACCESS_TOKEN_KEY = 'muztalk_access_token';
const REFRESH_TOKEN_KEY = 'muztalk_refresh_token';
const SERVER_URL_KEY = 'muztalk_server_url';

export interface ActiveMobileCall {
  callId: string;
  direction: 'outgoing' | 'incoming';
  peerUserId: string | null;
  peerName: string;
  peerAvatar: string | null;
  type: CallType;
  status: 'ringing' | 'connecting' | 'active' | 'ended';
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  durationSec: number;
  localStreamUrl: string | null;
  remoteStreamUrl: string | null;
}

interface MuzTalkState {
  serverUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: UserDTO | null;
  themeMode: 'light' | 'dark' | 'system';
  socketConnected: boolean;

  chats: ChatListItemDTO[];
  messagesByChat: Record<string, MessageDTO[]>;
  typingByChat: Record<string, boolean>;
  statuses: StatusDTO[];
  communities: CommunityDTO[];
  callsHistory: CallDTO[];
  stickerPacks: StickerPackDTO[];
  devices: DeviceDTO[];
  activeCall: ActiveMobileCall | null;

  hydrateSession: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  setTokens: (access: string | null, refresh: string | null) => Promise<void>;
  setCurrentUser: (user: UserDTO | null) => void;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  setSocketConnected: (connected: boolean) => void;
  setChats: (chats: ChatListItemDTO[]) => void;
  setChatMessages: (chatId: string, messages: MessageDTO[]) => void;
  appendMessage: (msg: MessageDTO) => void;
  updateMessage: (msg: MessageDTO) => void;
  setTyping: (chatId: string, typing: boolean) => void;
  setStatuses: (statuses: StatusDTO[]) => void;
  setCommunities: (communities: CommunityDTO[]) => void;
  setCallsHistory: (calls: CallDTO[]) => void;
  setStickerPacks: (packs: StickerPackDTO[]) => void;
  setDevices: (devices: DeviceDTO[]) => void;
  setActiveCall: (call: ActiveMobileCall | null | ((prev: ActiveMobileCall | null) => ActiveMobileCall | null)) => void;
  logoutLocal: () => Promise<void>;
}

export const useMuzTalkStore = create<MuzTalkState>((set) => ({
  // Default Android emulator localhost alias; users can switch to their live HTTPS backend URL on sign-in
  serverUrl: 'http://10.0.2.2:3000',
  accessToken: null,
  refreshToken: null,
  currentUser: null,
  themeMode: 'light',
  socketConnected: false,

  chats: [],
  messagesByChat: {},
  typingByChat: {},
  statuses: [],
  communities: [],
  callsHistory: [],
  stickerPacks: [],
  devices: [],
  activeCall: null,

  hydrateSession: async () => {
    const [access, refresh, url] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(SERVER_URL_KEY),
    ]);
    set({
      accessToken: access,
      refreshToken: refresh,
      serverUrl: url || 'http://10.0.2.2:3000',
    });
  },

  setServerUrl: async (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    await SecureStore.setItemAsync(SERVER_URL_KEY, clean);
    set({ serverUrl: clean });
  },

  setTokens: async (access, refresh) => {
    if (access) await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);

    if (refresh) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
    else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);

    set({ accessToken: access, refreshToken: refresh });
  },

  setCurrentUser: (user) => set({ currentUser: user }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setChats: (chats) => set({ chats }),

  setChatMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChat: { ...state.messagesByChat, [chatId]: messages },
    })),

  appendMessage: (msg) =>
    set((state) => {
      const existing = state.messagesByChat[msg.conversationId] || [];
      if (existing.some((m) => m.id === msg.id)) return state;
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [msg.conversationId]: [...existing, msg],
        },
      };
    }),

  updateMessage: (msg) =>
    set((state) => {
      const existing = state.messagesByChat[msg.conversationId] || [];
      return {
        messagesByChat: {
          ...state.messagesByChat,
          [msg.conversationId]: existing.map((m) => (m.id === msg.id ? msg : m)),
        },
      };
    }),

  setTyping: (chatId, typing) =>
    set((state) => ({
      typingByChat: { ...state.typingByChat, [chatId]: typing },
    })),

  setStatuses: (statuses) => set({ statuses }),
  setCommunities: (communities) => set({ communities }),
  setCallsHistory: (callsHistory) => set({ callsHistory }),
  setStickerPacks: (stickerPacks) => set({ stickerPacks }),
  setDevices: (devices) => set({ devices }),

  setActiveCall: (updater) =>
    set((state) => ({
      activeCall: typeof updater === 'function' ? updater(state.activeCall) : updater,
    })),

  logoutLocal: async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      currentUser: null,
      chats: [],
      messagesByChat: {},
      activeCall: null,
    });
  },
}));
