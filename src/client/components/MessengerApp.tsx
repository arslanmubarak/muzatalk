import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Bell,
  Bookmark,
  Check,
  CheckCheck,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Image as ImageIcon,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  MoreVertical,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Radio,
  Reply,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Smile,
  Square,
  Star,
  Sun,
  Trash2,
  UserPlus,
  Users,
  Video,
  VolumeX,
  X,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { api, setAuthTokens } from '../services/api';
import { connectSocket, disconnectSocket, emitReliable } from '../services/socket';
import { generateIdentityBundle } from '../services/e2ee';
import { useWebRTC } from '../hooks/useWebRTC';
import { MuzTalkLogo, UserAvatar } from './MuzTalkLogo';
import { CallOverlay } from './CallOverlay';
import { StatusViewerModal } from './StatusViewerModal';
import type {
  CallDTO,
  ChatListItemDTO,
  CommunityDTO,
  DeviceDTO,
  MessageDTO,
  StatusDTO,
  StickerPackDTO,
  UserDTO,
} from '../../shared/types';

type MainTab = 'chats' | 'updates' | 'communities' | 'calls' | 'settings';

const EMOJI_QUICK = ['👍', '💚', '😂', '🔥', '😮', '👏', '🙏', '🎉', '❤️', '✅', '🚀', '👋'];
const STATUS_COLORS = ['#101C35', '#20BFA5', '#0F766E', '#1E3A8A', '#7C2D12', '#334155'];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCallSeconds(sec: number): string {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MessengerApp({
  currentUser,
  onUserUpdated,
  onLoggedOut,
  onOpenAdmin,
  themeMode,
  onChangeTheme,
}: {
  currentUser: UserDTO;
  onUserUpdated: (u: UserDTO) => void;
  onLoggedOut: () => void;
  onOpenAdmin: () => void;
  themeMode: 'light' | 'dark' | 'system';
  onChangeTheme: (mode: 'light' | 'dark' | 'system') => void;
}) {
  const [activeTab, setActiveTab] = useState<MainTab>('chats');
  const [chats, setChats] = useState<ChatListItemDTO[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editingMsg, setEditingMsg] = useState<MessageDTO | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers'>('emoji');
  const [stickerPacks, setStickerPacks] = useState<StickerPackDTO[]>([]);
  const [activeMsgMenuId, setActiveMsgMenuId] = useState<string | null>(null);
  const [typingByChat, setTypingByChat] = useState<Record<string, boolean>>({});
  const [socketConnected, setSocketConnected] = useState(false);

  // Voice Note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  // Updates, Communities, Calls, Devices, Contacts
  const [statuses, setStatuses] = useState<StatusDTO[]>([]);
  const [viewingStatus, setViewingStatus] = useState<StatusDTO | null>(null);
  const [showNewStatusModal, setShowNewStatusModal] = useState(false);
  const [newStatusType, setNewStatusType] = useState<'TEXT' | 'IMAGE'>('TEXT');
  const [newStatusText, setNewStatusText] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#101C35');
  const [newStatusCaption, setNewStatusCaption] = useState('');

  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [showNewCommunity, setShowNewCommunity] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [communityDesc, setCommunityDesc] = useState('');

  const [callsHistory, setCallsHistory] = useState<CallDTO[]>([]);
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  // Modals: New Chat, New Group, Safety Shield, Report
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<UserDTO[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);

  // Profile edit state
  const [profileName, setProfileName] = useState(currentUser.displayName);
  const [profileAbout, setProfileAbout] = useState(currentUser.about || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [blockScreenCapture, setBlockScreenCapture] = useState(Boolean(currentUser.blockScreenCapture));
  const [isPrivacyBlurred, setIsPrivacyBlurred] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const statusImageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshChats = useCallback(async () => {
    const res = await api.getChats({
      q: chatSearch,
      unread: chatFilter === 'unread',
      archived: chatFilter === 'archived',
    });
    setChats(res.chats);
  }, [chatSearch, chatFilter]);

  const refreshSecondaryData = useCallback(async () => {
    const [st, cm, ch, sk, dv, me] = await Promise.all([
      api.getStatuses(),
      api.getCommunities(),
      api.getCallsHistory(),
      api.getStickers(),
      api.getDevices(),
      api.getMe(),
    ]);
    setStatuses(st.statuses);
    setCommunities(cm.communities);
    setCallsHistory(ch.calls);
    setStickerPacks(sk.packs);
    setDevices(dv.devices);
    setBlockedIds(me.blockedUserIds);
    if (me.securityPolicy) {
      setBlockScreenCapture(Boolean(me.securityPolicy.blockScreenCapture));
    }
  }, []);

  // WebRTC Hook
  const webrtc = useWebRTC(currentUser.id, () => {
    api.getCallsHistory().then((r) => setCallsHistory(r.calls)).catch(() => {});
  });

  // Initial load + Socket.IO lifecycle
  useEffect(() => {
    refreshChats().catch(() => {});
    refreshSecondaryData().catch(() => {});

    // Register Web Crypto E2EE key bundle if missing
    if (!currentUser.encryptionFingerprint) {
      generateIdentityBundle()
        .then((bundle) => api.registerEncryptionKeys(bundle))
        .catch(() => {});
    }

    const socket = connectSocket();
    if (!socket) return;

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onNewMessage = (msg: MessageDTO) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if (msg.conversationId !== selectedChatIdRef.current) return prev;
        return [...prev, msg];
      });
      if (msg.senderId !== currentUser.id) {
        socket.emit('message:delivered', { messageId: msg.id });
        if (msg.conversationId === selectedChatIdRef.current) {
          socket.emit('message:read', { conversationId: msg.conversationId });
        }
      }
      refreshChats().catch(() => {});
    };

    const onMessageEdit = (msg: MessageDTO) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      refreshChats().catch(() => {});
    };

    const onMessageDelete = (payload: { messageId: string; scope: string }) => {
      if (payload.scope === 'everyone') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, text: 'This message was deleted', attachments: [], deletedForAllAt: new Date().toISOString() }
              : m
          )
        );
      }
      refreshChats().catch(() => {});
    };

    const onReaction = (payload: { messageId: string; reactions: MessageDTO['reactions'] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m))
      );
    };

    const onRead = (payload: { conversationId: string; messageIds: string[] }) => {
      setMessages((prev) =>
        prev.map((m) => (payload.messageIds.includes(m.id) ? { ...m, receiptStatus: 'READ' } : m))
      );
    };

    const onDelivered = (payload: { messageId: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.messageId && m.receiptStatus === 'SENT' ? { ...m, receiptStatus: 'DELIVERED' } : m))
      );
    };

    const onTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.userId === currentUser.id) return;
      setTypingByChat((prev) => ({ ...prev, [payload.conversationId]: true }));
    };

    const onStopTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload.userId === currentUser.id) return;
      setTypingByChat((prev) => ({ ...prev, [payload.conversationId]: false }));
    };

    const onPresence = () => {
      refreshChats().catch(() => {});
    };

    const onSecurityPolicy = (payload: { blockScreenCapture?: boolean }) => {
      if (typeof payload.blockScreenCapture === 'boolean') {
        setBlockScreenCapture(payload.blockScreenCapture);
        showToast(
          payload.blockScreenCapture
            ? 'Admin enabled Screenshot & Screen Recording protection'
            : 'Screen Capture protection relaxed by Admin'
        );
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onNewMessage);
    socket.on('message:edit', onMessageEdit);
    socket.on('message:delete', onMessageDelete);
    socket.on('message:reaction', onReaction);
    socket.on('message:read', onRead);
    socket.on('message:delivered', onDelivered);
    socket.on('user:typing', onTyping);
    socket.on('user:stop_typing', onStopTyping);
    socket.on('user:online', onPresence);
    socket.on('user:offline', onPresence);
    socket.on('group:created', onPresence);
    socket.on('security:policy_updated', onSecurityPolicy);

    if (socket.connected) setSocketConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onNewMessage);
      socket.off('message:edit', onMessageEdit);
      socket.off('message:delete', onMessageDelete);
      socket.off('message:reaction', onReaction);
      socket.off('message:read', onRead);
      socket.off('message:delivered', onDelivered);
      socket.off('user:typing', onTyping);
      socket.off('user:stop_typing', onStopTyping);
      socket.off('user:online', onPresence);
      socket.off('user:offline', onPresence);
      socket.off('group:created', onPresence);
      socket.off('security:policy_updated', onSecurityPolicy);
    };
  }, [currentUser.id, currentUser.encryptionFingerprint, refreshChats, refreshSecondaryData, showToast]);

  useEffect(() => {
    if (!blockScreenCapture) {
      setIsPrivacyBlurred(false);
      return;
    }
    const onBlur = () => setIsPrivacyBlurred(true);
    const onFocus = () => setIsPrivacyBlurred(false);
    const onVisibility = () => setIsPrivacyBlurred(document.hidden);
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        e.key === 'PrintScreen' ||
        ((e.ctrlKey || e.metaKey) && (key === 'p' || key === 's' || (e.shiftKey && key === 's')))
      ) {
        e.preventDefault();
        setIsPrivacyBlurred(true);
        window.setTimeout(() => setIsPrivacyBlurred(false), 1200);
        showToast('Screenshots & screen capture are disabled by Admin');
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [blockScreenCapture, showToast]);

  const selectedChatIdRef = useRef<string | null>(null);
  selectedChatIdRef.current = selectedChatId;

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  // Load messages when selecting a chat
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }
    api.getMessages(selectedChatId, messageSearch).then((res) => {
      setMessages(res.messages);
      emitReliable('message:read', { conversationId: selectedChatId });
      setChats((prev) => prev.map((c) => (c.id === selectedChatId ? { ...c, unreadCount: 0 } : c)));
    }).catch(() => {});
  }, [selectedChatId, messageSearch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    refreshChats().catch(() => {});
  }, [refreshChats]);

  const totalUnread = useMemo(
    () => chats.reduce((acc, c) => acc + (c.isArchived ? 0 : c.unreadCount), 0),
    [chats]
  );

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedChatId) return;
    const trimmed = composerText.trim();
    if (!trimmed) return;

    if (editingMsg) {
      const updated = await api.editMessage(editingMsg.id, { text: trimmed });
      setMessages((prev) => prev.map((m) => (m.id === updated.message.id ? updated.message : m)));
      setEditingMsg(null);
      setComposerText('');
      return;
    }

    const clientMessageId = uuidv4();
    setComposerText('');
    const currentReply = replyTo;
    setReplyTo(null);
    emitReliable('user:stop_typing', { conversationId: selectedChatId });

    emitReliable(
      'message:send',
      {
        clientMessageId,
        conversationId: selectedChatId,
        type: 'TEXT',
        text: trimmed,
        isEncrypted: true,
        replyToId: currentReply?.id || null,
      },
      () => {
        refreshChats().catch(() => {});
      }
    );
  };

  const handleComposerChange = (val: string) => {
    setComposerText(val);
    if (!selectedChatId) return;
    emitReliable('user:typing', { conversationId: selectedChatId });
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      emitReliable('user:stop_typing', { conversationId: selectedChatId });
    }, 1500);
  };

  const handleSendSticker = (sticker: { label: string; imageUrl: string; emojiTag: string }) => {
    if (!selectedChatId) return;
    setShowEmojiPicker(false);
    emitReliable('message:send', {
      clientMessageId: uuidv4(),
      conversationId: selectedChatId,
      type: 'STICKER',
      text: `${sticker.emojiTag} ${sticker.label}`,
      attachments: [
        {
          id: uuidv4(),
          mediaFileId: sticker.label,
          url: sticker.imageUrl,
          originalName: sticker.label,
          mimeType: 'image/svg+xml',
          sizeBytes: 1024,
        },
      ],
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedChatId) return;
    try {
      const uploaded = await api.uploadMedia(file, file.name);
      const msgType = file.type.startsWith('image/')
        ? 'IMAGE'
        : file.type.startsWith('video/')
          ? 'VIDEO'
          : file.type.startsWith('audio/')
            ? 'AUDIO'
            : 'DOCUMENT';
      emitReliable('message:send', {
        clientMessageId: uuidv4(),
        conversationId: selectedChatId,
        type: msgType,
        text: file.name,
        attachments: [
          {
            id: uuidv4(),
            mediaFileId: uploaded.id,
            url: uploaded.url,
            originalName: uploaded.originalName,
            mimeType: uploaded.mimeType,
            sizeBytes: uploaded.sizeBytes,
          },
        ],
      });
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  // Voice Note Recording
  const startVoiceRecording = async () => {
    if (!selectedChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSec(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
      }, 1000);
    } catch {
      showToast('Microphone permission unavailable in this browser context.');
    }
  };

  const stopVoiceRecording = (send: boolean) => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    const durationMs = recordingSec * 1000;

    mr.onstop = async () => {
      mr.stream.getTracks().forEach((t) => t.stop());
      if (send && selectedChatId && recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        try {
          const uploaded = await api.uploadMedia(blob, `voice-note-${Date.now()}.webm`);
          emitReliable('message:send', {
            clientMessageId: uuidv4(),
            conversationId: selectedChatId,
            type: 'VOICE_NOTE',
            text: `Voice note (${formatCallSeconds(Math.max(1, Math.round(durationMs / 1000)))})`,
            attachments: [
              {
                id: uuidv4(),
                mediaFileId: uploaded.id,
                url: uploaded.url,
                originalName: uploaded.originalName,
                mimeType: uploaded.mimeType,
                sizeBytes: uploaded.sizeBytes,
                durationMs,
              },
            ],
          });
        } catch (err) {
          showToast((err as Error).message);
        }
      }
      setIsRecording(false);
      setRecordingSec(0);
    };
    mr.stop();
  };

  const openDirectoryForNewChat = async (mode: 'chat' | 'group') => {
    const res = await api.searchUsers('');
    setDirectoryUsers(res.users);
    if (mode === 'chat') setShowNewChatModal(true);
    else setShowNewGroupModal(true);
  };

  const handleStartDirectChat = async (peerId: string) => {
    const res = await api.createDirectChat(peerId);
    setShowNewChatModal(false);
    await refreshChats();
    setSelectedChatId(res.chat.id);
    setActiveTab('chats');
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const res = await api.createGroup({
      name: groupName.trim(),
      description: groupDesc.trim(),
      memberIds: selectedGroupMemberIds,
    });
    setShowNewGroupModal(false);
    setGroupName('');
    setGroupDesc('');
    setSelectedGroupMemberIds([]);
    await refreshChats();
    setSelectedChatId(res.group.conversationId);
    setActiveTab('chats');
  };

  const handleCreateCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!communityName.trim()) return;
    await api.createCommunity({ name: communityName.trim(), description: communityDesc.trim() });
    setShowNewCommunity(false);
    setCommunityName('');
    setCommunityDesc('');
    await refreshSecondaryData();
    showToast('Community created with official Announcement Channel');
  };

  const handleCreateTextStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusText.trim()) return;
    await api.createStatus({
      type: 'TEXT',
      contentText: newStatusText.trim(),
      bgColor: newStatusColor,
    });
    setShowNewStatusModal(false);
    setNewStatusText('');
    await refreshSecondaryData();
    showToast('24-hour status published');
  };

  const handleStatusImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const uploaded = await api.uploadMedia(file, file.name);
    await api.createStatus({
      type: 'IMAGE',
      mediaUrl: uploaded.url,
      caption: newStatusCaption.trim() || null,
    });
    setShowNewStatusModal(false);
    setNewStatusCaption('');
    await refreshSecondaryData();
    showToast('Image status published for 24 hours');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await api.updateMe({
        displayName: profileName.trim(),
        about: profileAbout.trim(),
      });
      onUserUpdated(res.user);
      showToast('Profile saved to MuzTalk server');
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: currentUser,
      chats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muztalk-backup-${currentUser.username || currentUser.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSignOut = async () => {
    await api.logout().catch(() => {});
    disconnectSocket();
    setAuthTokens(null, null);
    onLoggedOut();
  };

  const navItems: Array<{ id: MainTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'chats', label: 'Chats', icon: <MessageSquare className="w-5 h-5" />, badge: totalUnread },
    { id: 'updates', label: 'Updates', icon: <Radio className="w-5 h-5" />, badge: statuses.filter((s) => !s.viewedByMe).length },
    { id: 'communities', label: 'Communities', icon: <Users className="w-5 h-5" /> },
    { id: 'calls', label: 'Calls', icon: <Phone className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div
      onContextMenu={(e) => {
        if (blockScreenCapture) e.preventDefault();
      }}
      className={`h-screen w-full overflow-hidden bg-[#F7FAFC] dark:bg-[#101820] text-[#101C35] dark:text-slate-100 flex flex-col md:flex-row ${
        blockScreenCapture ? 'select-none print:hidden' : ''
      }`}
    >
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden md:flex w-[76px] shrink-0 bg-[#101C35] text-white flex-col items-center justify-between py-5 border-r border-slate-800">
        <div className="flex flex-col items-center gap-6 w-full">
          <img
            src="/src/assets/images/muztalk_brand_mark_1795586769906.jpg"
            alt="MuzTalk"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-xl object-cover"
          />

          <nav className="flex flex-col items-center gap-2 w-full px-2">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`relative w-full py-2.5 rounded-xl flex flex-col items-center gap-1 transition-colors ${
                    active ? 'bg-[#20BFA5] text-white' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {item.icon}
                  <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
                  {item.badge ? (
                    <span className="absolute top-1.5 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#48D6B8] text-[#101C35] text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onOpenAdmin}
            title="Admin Dashboard"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200"
          >
            <Shield className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            title={currentUser.displayName}
          >
            <UserAvatar src={currentUser.avatarUrl} name={currentUser.displayName} size="sm" isOnline={socketConnected} />
          </button>
        </div>
      </aside>

      {/* Main Responsive Workspace */}
      <div className="flex-1 flex min-w-0 min-h-0 relative pb-16 md:pb-0">
        {/* Left Pane (List View for Active Tab) */}
        <section
          className={`w-full md:w-[360px] lg:w-[390px] shrink-0 bg-white dark:bg-[#15202B] border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 ${
            activeTab === 'chats' && selectedChatId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Pane Header */}
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="md:hidden">
                <MuzTalkLogo size={28} />
              </div>
              <h1 className="hidden md:block font-display text-xl font-bold capitalize">
                {activeTab}
              </h1>
            </div>

            <div className="flex items-center gap-1">
              {activeTab === 'chats' && (
                <>
                  <button
                    type="button"
                    onClick={() => openDirectoryForNewChat('group')}
                    title="New Group"
                    className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                  >
                    <Users className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openDirectoryForNewChat('chat')}
                    title="New Chat"
                    className="min-w-[40px] min-h-[40px] rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </>
              )}
              {activeTab === 'updates' && (
                <button
                  type="button"
                  onClick={() => setShowNewStatusModal(true)}
                  className="px-3 py-2 rounded-xl bg-[#20BFA5] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Status</span>
                </button>
              )}
              {activeTab === 'communities' && (
                <button
                  type="button"
                  onClick={() => setShowNewCommunity(true)}
                  className="px-3 py-2 rounded-xl bg-[#20BFA5] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </button>
              )}
            </div>
          </div>

          {/* CHATS LIST */}
          {activeTab === 'chats' && (
            <>
              <div className="p-3 space-y-2.5 border-b border-slate-100 dark:border-slate-800/80">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search chats or messages..."
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-[#101820] text-sm focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#101820] rounded-lg">
                  {(['all', 'unread', 'archived'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setChatFilter(f)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                        chatFilter === f
                          ? 'bg-white dark:bg-[#15202B] text-[#101C35] dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                {chats.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No conversations match this view. Tap + to start a chat.
                  </div>
                ) : (
                  chats.map((chat) => {
                    const isSelected = chat.id === selectedChatId;
                    const isTyping = typingByChat[chat.id];
                    return (
                      <div
                        key={chat.id}
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#20BFA5]/10 dark:bg-[#20BFA5]/15'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <UserAvatar
                          src={chat.avatarUrl}
                          name={chat.title}
                          isOnline={chat.isOnline}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm truncate">{chat.title}</span>
                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              {formatTime(chat.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                              {isTyping ? (
                                <span className="text-[#20BFA5] font-medium">typing...</span>
                              ) : (
                                <>
                                  {chat.lastMessage?.senderId === currentUser.id && (
                                    chat.lastMessage.receiptStatus === 'READ' ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-[#20BFA5] shrink-0" />
                                    ) : chat.lastMessage.receiptStatus === 'DELIVERED' ? (
                                      <CheckCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    )
                                  )}
                                  <span className="truncate">
                                    {chat.lastMessage?.text || chat.subtitle || 'No messages yet'}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {chat.isPinned && <Pin className="w-3 h-3 text-slate-400" />}
                              {chat.isMuted && <VolumeX className="w-3 h-3 text-slate-400" />}
                              {chat.unreadCount > 0 && (
                                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#20BFA5] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                                  {chat.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* UPDATES / 24h STATUS TAB */}
          {activeTab === 'updates' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div
                onClick={() => setShowNewStatusModal(true)}
                className="p-3 rounded-xl border border-dashed border-[#20BFA5]/60 bg-[#20BFA5]/5 flex items-center gap-3 cursor-pointer hover:bg-[#20BFA5]/10"
              >
                <UserAvatar src={currentUser.avatarUrl} name={currentUser.displayName} />
                <div>
                  <div className="text-sm font-semibold">My Status</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Tap to post a 24-hour text or photo update
                  </div>
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2">
                Recent Updates ({statuses.length})
              </div>
              <div className="space-y-2">
                {statuses.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => setViewingStatus(st)}
                    className="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-3 cursor-pointer"
                  >
                    <div
                      className={`p-0.5 rounded-full ${
                        st.viewedByMe ? 'bg-slate-300 dark:bg-slate-700' : 'bg-[#20BFA5]'
                      }`}
                    >
                      <div className="p-0.5 rounded-full bg-white dark:bg-[#15202B]">
                        <UserAvatar src={st.userAvatar} name={st.userName} size="md" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{st.userName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {formatTime(st.createdAt)} · {st.viewsCount} views
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COMMUNITIES TAB */}
          {activeTab === 'communities' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {communities.map((comm) => (
                <div
                  key={comm.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                >
                  <div className="p-4 bg-slate-50 dark:bg-[#101820] border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display font-bold text-base">{comm.name}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(`https://muztalk.app/c/${comm.inviteCode}`);
                          showToast(`Invite code ${comm.inviteCode} copied`);
                        }}
                        className="text-xs font-mono text-[#20BFA5] hover:underline"
                      >
                        {comm.inviteCode}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{comm.description}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {comm.groups.map((g) => (
                      <button
                        key={g.groupId}
                        type="button"
                        onClick={() => {
                          setSelectedChatId(g.conversationId);
                          setActiveTab('chats');
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div>
                          <div className="text-sm font-medium">{g.name}</div>
                          <div className="text-xs text-slate-400">
                            {g.isAnnouncement ? 'Announcements Channel' : 'Community Group'} · {g.memberCount} members
                          </div>
                        </div>
                        <MessageSquare className="w-4 h-4 text-[#20BFA5]" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CALLS HISTORY TAB */}
          {activeTab === 'calls' && (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {callsHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No recent audio or video calls.
                </div>
              ) : (
                callsHistory.map((c) => {
                  const outgoing = c.initiatorId === currentUser.id;
                  const targetName = outgoing ? c.peerName : c.initiatorName;
                  const targetAvatar = outgoing ? c.peerAvatar : c.initiatorAvatar;
                  const targetId = outgoing ? c.peerId : c.initiatorId;
                  const isVideo = c.type === 'VIDEO' || c.type === 'GROUP_VIDEO';

                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar src={targetAvatar} name={targetName} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{targetName}</div>
                          <div className={`text-xs ${c.status === 'MISSED' ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
                            {outgoing ? 'Outgoing' : 'Incoming'} · {c.status} ·{' '}
                            <span className="tabular-nums">{formatCallSeconds(c.durationSec)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          webrtc.startCall({
                            peerUserId: targetId,
                            peerName: targetName,
                            peerAvatar: targetAvatar,
                            conversationId: c.conversationId,
                            type: c.type,
                          })
                        }
                        className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-[#20BFA5]"
                        aria-label="Redial"
                      >
                        {isVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Profile Card */}
              <form onSubmit={handleSaveProfile} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <UserAvatar src={currentUser.avatarUrl} name={currentUser.displayName} size="lg" />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{currentUser.displayName}</div>
                    <div className="text-xs text-slate-500 font-mono">{currentUser.phoneNumber}</div>
                  </div>
                </div>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Display Name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
                />
                <input
                  type="text"
                  value={profileAbout}
                  onChange={(e) => setProfileAbout(e.target.value)}
                  placeholder="About / Bio"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
                />
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-full py-2 rounded-lg bg-[#20BFA5] text-white text-xs font-semibold"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </form>

              {/* Appearance */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Appearance</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['light', 'dark', 'system'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onChangeTheme(m)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium capitalize flex items-center justify-center gap-1.5 border ${
                        themeMode === m
                          ? 'border-[#20BFA5] bg-[#20BFA5]/10 text-[#20BFA5]'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m === 'light' ? <Sun className="w-3.5 h-3.5" /> : m === 'dark' ? <Moon className="w-3.5 h-3.5" /> : null}
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Linked Devices */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Linked Devices ({devices.length})
                </div>
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs py-1">
                    <div>
                      <div className="font-medium">{d.deviceName}</div>
                      <div className="text-slate-400">{d.platform}</div>
                    </div>
                    {!d.isPrimary && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.revokeDevice(d.id);
                          refreshSecondaryData();
                        }}
                        className="text-red-500 hover:underline"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Security, Backup & Admin */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSafetyModal(true)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-[#20BFA5]" />
                    End-to-End Encryption Keys
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="flex items-center gap-2.5">
                    <Download className="w-4 h-4 text-[#20BFA5]" />
                    Export Encrypted Chat Backup
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <span className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#20BFA5]" />
                    Open Admin Dashboard
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full p-3 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center gap-2 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Pane: Active Conversation Viewport */}
        <main
          className={`flex-1 flex flex-col min-w-0 min-h-0 bg-[#F7FAFC] dark:bg-[#101820] ${
            activeTab === 'chats' && selectedChatId ? 'flex' : 'hidden md:flex'
          }`}
        >
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <header className="px-4 py-3 bg-white dark:bg-[#15202B] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedChatId(null)}
                    className="md:hidden min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Back to chats"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <UserAvatar
                    src={selectedChat.avatarUrl}
                    name={selectedChat.title}
                    isOnline={selectedChat.isOnline}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{selectedChat.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {typingByChat[selectedChat.id]
                        ? 'typing...'
                        : selectedChat.type === 'DIRECT'
                          ? selectedChat.isOnline
                            ? 'Online'
                            : selectedChat.lastSeenAt
                              ? `Last seen ${formatTime(selectedChat.lastSeenAt)}`
                              : 'Offline'
                          : `${selectedChat.memberCount || 0} members`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 relative">
                  <button
                    type="button"
                    onClick={() => setShowMessageSearch((v) => !v)}
                    className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                    aria-label="Search messages"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      webrtc.startCall({
                        peerUserId: selectedChat.peerUserId || null,
                        peerName: selectedChat.title,
                        peerAvatar: selectedChat.avatarUrl,
                        conversationId: selectedChat.id,
                        type: selectedChat.type === 'DIRECT' ? 'AUDIO' : 'GROUP_AUDIO',
                      })
                    }
                    className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-[#20BFA5]"
                    aria-label="Audio call"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      webrtc.startCall({
                        peerUserId: selectedChat.peerUserId || null,
                        peerName: selectedChat.title,
                        peerAvatar: selectedChat.avatarUrl,
                        conversationId: selectedChat.id,
                        type: selectedChat.type === 'DIRECT' ? 'VIDEO' : 'GROUP_VIDEO',
                      })
                    }
                    className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-[#20BFA5]"
                    aria-label="Video call"
                  >
                    <Video className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChatMenu((v) => !v)}
                    className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  {showChatMenu && (
                    <div className="absolute right-0 top-12 w-52 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 z-30 text-sm">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateChatPreferences(selectedChat.id, { isPinned: !selectedChat.isPinned });
                          setShowChatMenu(false);
                          refreshChats();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <Pin className="w-4 h-4" />
                        <span>{selectedChat.isPinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateChatPreferences(selectedChat.id, { isMuted: !selectedChat.isMuted });
                          setShowChatMenu(false);
                          refreshChats();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <VolumeX className="w-4 h-4" />
                        <span>{selectedChat.isMuted ? 'Unmute' : 'Mute Notifications'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateChatPreferences(selectedChat.id, { isArchived: !selectedChat.isArchived });
                          setShowChatMenu(false);
                          setSelectedChatId(null);
                          refreshChats();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <Archive className="w-4 h-4" />
                        <span>{selectedChat.isArchived ? 'Unarchive Chat' : 'Archive Chat'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowChatMenu(false);
                          setShowSafetyModal(true);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <Lock className="w-4 h-4 text-[#20BFA5]" />
                        <span>Encryption Verification</span>
                      </button>
                      {selectedChat.peerUserId && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              const pid = selectedChat.peerUserId!;
                              if (blockedIds.includes(pid)) {
                                await api.unblockUser(pid);
                                setBlockedIds((prev) => prev.filter((id) => id !== pid));
                                showToast('Contact unblocked');
                              } else {
                                await api.blockUser(pid);
                                setBlockedIds((prev) => [...prev, pid]);
                                showToast('Contact blocked');
                              }
                              setShowChatMenu(false);
                            }}
                            className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>{blockedIds.includes(selectedChat.peerUserId) ? 'Unblock User' : 'Block User'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.reportUser(selectedChat.peerUserId!, 'User reported from chat');
                              setShowChatMenu(false);
                              showToast('Report submitted to moderation team');
                            }}
                            className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5"
                          >
                            <Shield className="w-4 h-4" />
                            <span>Report Contact</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {/* In-chat message search bar */}
              {showMessageSearch && (
                <div className="px-4 py-2 bg-white dark:bg-[#15202B] border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter messages in this chat..."
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    className="flex-1 text-sm bg-transparent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMessageSearch('');
                      setShowMessageSearch(false);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
                <div className="mx-auto max-w-md text-center py-2 px-4 rounded-xl bg-teal-50/80 dark:bg-[#15202B] border border-teal-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  Messages and calls are end-to-end encrypted with Signal-style ECDH keys.
                </div>

                {messages.map((msg) => {
                  const isMine = msg.senderId === currentUser.id;
                  const isSticker = msg.type === 'STICKER';

                  return (
                    <div
                      key={msg.id}
                      className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`relative max-w-[82%] sm:max-w-[68%] flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                            isSticker
                              ? 'bg-transparent p-1'
                              : isMine
                                ? 'bg-[#101C35] dark:bg-[#1D3557] text-white rounded-br-sm'
                                : 'bg-white dark:bg-[#15202B] text-[#101C35] dark:text-slate-100 border border-slate-200/80 dark:border-slate-800 rounded-bl-sm'
                          }`}
                        >
                          {!isMine && selectedChat.type !== 'DIRECT' && (
                            <div className="text-[11px] font-semibold text-[#20BFA5] mb-0.5">
                              {msg.senderName}
                            </div>
                          )}

                          {msg.replyPreview && (
                            <div className={`mb-2 px-2.5 py-1.5 rounded-lg text-xs border-l-2 border-[#20BFA5] ${isMine ? 'bg-white/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
                              <div className="font-semibold text-[#48D6B8]">{msg.replyPreview.senderName}</div>
                              <div className="truncate opacity-80">{msg.replyPreview.text}</div>
                            </div>
                          )}

                          {/* Attachments */}
                          {msg.attachments.map((att) => (
                            <div key={att.id} className="mb-1.5">
                              {isSticker ? (
                                <img
                                  src={att.url}
                                  alt={att.originalName}
                                  referrerPolicy="no-referrer"
                                  className="w-28 h-28 object-contain"
                                />
                              ) : att.mimeType.startsWith('image/') ? (
                                <img
                                  src={att.url}
                                  alt={att.originalName}
                                  referrerPolicy="no-referrer"
                                  className="max-h-64 rounded-xl object-cover"
                                />
                              ) : att.mimeType.startsWith('audio/') || msg.type === 'VOICE_NOTE' ? (
                                <div className="flex items-center gap-2 py-1">
                                  <audio
                                    controls
                                    src={att.url}
                                    onPlay={(ev) => {
                                      ev.currentTarget.playbackRate = playbackRate;
                                    }}
                                    className="h-8 max-w-[210px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPlaybackRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1))
                                    }
                                    className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono"
                                  >
                                    {playbackRate}x
                                  </button>
                                </div>
                              ) : (
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2 p-2 rounded-lg bg-black/10 dark:bg-white/10 text-xs underline"
                                >
                                  <FileText className="w-4 h-4 shrink-0" />
                                  <span className="truncate max-w-[180px]">{att.originalName}</span>
                                </a>
                              )}
                            </div>
                          ))}

                          {!isSticker && (
                            <p className={`whitespace-pre-wrap break-words leading-relaxed ${msg.deletedForAllAt ? 'italic opacity-70' : ''}`}>
                              {msg.text}
                            </p>
                          )}

                          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-70 tabular-nums">
                            {msg.isStarred && <Star className="w-3 h-3 fill-amber-400 text-amber-400" />}
                            {msg.isPinned && <Pin className="w-3 h-3" />}
                            {msg.isEdited && <span>edited</span>}
                            <span>{formatTime(msg.createdAt)}</span>
                            {isMine && (
                              msg.receiptStatus === 'READ' ? (
                                <CheckCheck className="w-3.5 h-3.5 text-[#48D6B8]" />
                              ) : msg.receiptStatus === 'DELIVERED' ? (
                                <CheckCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )
                            )}
                          </div>
                        </div>

                        {/* Message quick actions button */}
                        <button
                          type="button"
                          onClick={() => setActiveMsgMenuId((cur) => (cur === msg.id ? null : msg.id))}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-opacity"
                          aria-label="Message actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMsgMenuId === msg.id && (
                          <div
                            className={`absolute top-8 ${isMine ? 'right-8' : 'left-8'} z-30 w-44 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 shadow-lg py-1.5 text-xs`}
                          >
                            <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                              {['👍', '💚', '😂', '🔥', '😮'].map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => {
                                    emitReliable('message:reaction', { messageId: msg.id, emoji: em });
                                    setActiveMsgMenuId(null);
                                  }}
                                  className="hover:scale-125 transition-transform"
                                >
                                  {em}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTo(msg);
                                setActiveMsgMenuId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Reply className="w-3.5 h-3.5" /> Reply
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(msg.text);
                                setActiveMsgMenuId(null);
                                showToast('Message copied');
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const upd = await api.editMessage(msg.id, { isStarred: !msg.isStarred });
                                setMessages((p) => p.map((x) => (x.id === msg.id ? upd.message : x)));
                                setActiveMsgMenuId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Star className="w-3.5 h-3.5" /> {msg.isStarred ? 'Unstar' : 'Star'}
                            </button>
                            {isMine && !msg.deletedForAllAt && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsg(msg);
                                    setComposerText(msg.text);
                                    setActiveMsgMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                                >
                                  <Edit3 className="w-3.5 h-3.5" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await api.deleteMessage(msg.id, 'everyone');
                                    setActiveMsgMenuId(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete for everyone
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await api.deleteMessage(msg.id, 'me');
                                setMessages((p) => p.filter((x) => x.id !== msg.id));
                                setActiveMsgMenuId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete for me
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Reactions row */}
                      {msg.reactions.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 px-1">
                          {Array.from(new Set(msg.reactions.map((r) => r.emoji))).map((em) => {
                            const count = msg.reactions.filter((r) => r.emoji === em).length;
                            return (
                              <button
                                key={em}
                                type="button"
                                onClick={() => emitReliable('message:reaction', { messageId: msg.id, emoji: em })}
                                className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-1 shadow-xs"
                              >
                                <span>{em}</span>
                                <span className="text-[10px] tabular-nums">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply / Edit Banner */}
              {(replyTo || editingMsg) && (
                <div className="px-4 py-2 bg-white dark:bg-[#15202B] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#20BFA5]">
                      {editingMsg ? 'Editing message' : `Replying to ${replyTo?.senderName}`}
                    </div>
                    <div className="truncate text-slate-500">{editingMsg?.text || replyTo?.text}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                      setEditingMsg(null);
                      if (editingMsg) setComposerText('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Emoji & Sticker Picker Popover */}
              {showEmojiPicker && (
                <div className="mx-4 mb-2 rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 shadow-lg p-3 max-w-sm">
                  <div className="flex gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPickerTab('emoji')}
                      className={`px-3 py-1 rounded-lg ${pickerTab === 'emoji' ? 'bg-[#20BFA5] text-white' : 'text-slate-500'}`}
                    >
                      Emojis
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('stickers')}
                      className={`px-3 py-1 rounded-lg ${pickerTab === 'stickers' ? 'bg-[#20BFA5] text-white' : 'text-slate-500'}`}
                    >
                      Stickers
                    </button>
                  </div>

                  {pickerTab === 'emoji' ? (
                    <div className="grid grid-cols-6 gap-2">
                      {EMOJI_QUICK.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setComposerText((t) => `${t}${em}`)}
                          className="h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xl"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-3">
                      {stickerPacks.map((pack) => (
                        <div key={pack.id}>
                          <div className="text-[11px] font-semibold text-slate-400 mb-1.5">{pack.title}</div>
                          <div className="grid grid-cols-4 gap-2">
                            {pack.stickers.map((stk) => (
                              <button
                                key={stk.id}
                                type="button"
                                onClick={() => handleSendSticker(stk)}
                                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-col items-center"
                              >
                                <img
                                  src={stk.imageUrl}
                                  alt={stk.label}
                                  referrerPolicy="no-referrer"
                                  className="w-14 h-14 object-contain"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Composer */}
              <footer className="px-3 sm:px-4 py-3 bg-white dark:bg-[#15202B] border-t border-slate-200 dark:border-slate-800 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {isRecording ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                    <div className="flex items-center gap-2.5 text-sm font-medium text-red-600 dark:text-red-400">
                      <Mic className="w-4 h-4" />
                      <span className="font-mono tabular-nums">Recording {formatCallSeconds(recordingSec)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stopVoiceRecording(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => stopVoiceRecording(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#20BFA5] text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Square className="w-3 h-3 fill-white" />
                        Send Voice
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendText} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker((v) => !v)}
                      className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                      aria-label="Emoji and stickers"
                    >
                      <Smile className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
                      aria-label="Attach media or document"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      placeholder="Message..."
                      value={composerText}
                      onChange={(e) => handleComposerChange(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-[#101820] text-sm focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                    />
                    {composerText.trim() ? (
                      <button
                        type="submit"
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white flex items-center justify-center"
                        aria-label="Send message"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-[#101C35] dark:bg-[#20BFA5] text-white flex items-center justify-center"
                        aria-label="Record voice note"
                      >
                        <Mic className="w-5 h-5" />
                      </button>
                    )}
                  </form>
                )}
              </footer>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <img
                src="/src/assets/images/muztalk_brand_mark_1795586769906.jpg"
                alt="MuzTalk"
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-2xl object-cover mb-5 shadow-sm"
              />
              <h2 className="font-display text-2xl font-bold text-[#101C35] dark:text-white">
                MuzTalk Messenger
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
                Select a conversation on the left to send end-to-end encrypted messages, voice notes, stickers, or start a live WebRTC audio/video call.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (<= 15% height, >= 44px touch targets) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-[#15202B]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                if (item.id !== 'chats') setSelectedChatId(null);
              }}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
                active ? 'text-[#20BFA5]' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium whitespace-nowrap">{item.label}</span>
              {item.badge ? (
                <span className="absolute top-0.5 right-3 min-w-[16px] h-4 px-1 rounded-full bg-[#20BFA5] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Start New Chat</h3>
              <button type="button" onClick={() => setShowNewChatModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {directoryUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleStartDirectChat(u.id)}
                  className="w-full py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-lg px-2"
                >
                  <UserAvatar src={u.avatarUrl} name={u.displayName} isOnline={u.isOnline} />
                  <div>
                    <div className="text-sm font-semibold">{u.displayName}</div>
                    <div className="text-xs text-slate-400">@{u.username} · {u.phoneNumber}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNewGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Create Group Chat</h3>
              <button type="button" onClick={() => setShowNewGroupModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <input
              type="text"
              required
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
            />
            <div className="text-xs font-semibold text-slate-500">Select Members</div>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {directoryUsers.map((u) => {
                const checked = selectedGroupMemberIds.includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedGroupMemberIds((prev) =>
                          checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                    />
                    <span className="text-sm font-medium">{u.displayName}</span>
                  </label>
                );
              })}
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#20BFA5] text-white text-sm font-semibold">
              Create Group
            </button>
          </form>
        </div>
      )}

      {showNewCommunity && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCommunity}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">New Community</h3>
              <button type="button" onClick={() => setShowNewCommunity(false)}><X className="w-5 h-5" /></button>
            </div>
            <input
              type="text"
              required
              placeholder="Community name"
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
            />
            <textarea
              placeholder="Community description..."
              value={communityDesc}
              onChange={(e) => setCommunityDesc(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#20BFA5] text-white text-sm font-semibold">
              Create Community
            </button>
          </form>
        </div>
      )}

      {showNewStatusModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Post 24-Hour Status</h3>
              <button type="button" onClick={() => setShowNewStatusModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewStatusType('TEXT')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${newStatusType === 'TEXT' ? 'bg-[#20BFA5] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                Text Status
              </button>
              <button
                type="button"
                onClick={() => setNewStatusType('IMAGE')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold ${newStatusType === 'IMAGE' ? 'bg-[#20BFA5] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                Photo Status
              </button>
            </div>

            {newStatusType === 'TEXT' ? (
              <form onSubmit={handleCreateTextStatus} className="space-y-3">
                <textarea
                  required
                  rows={4}
                  placeholder="Share a thought..."
                  value={newStatusText}
                  onChange={(e) => setNewStatusText(e.target.value)}
                  style={{ backgroundColor: newStatusColor }}
                  className="w-full p-4 rounded-xl text-white placeholder:text-white/60 text-center font-display text-lg focus:outline-none"
                />
                <div className="flex gap-2 justify-center">
                  {STATUS_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewStatusColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full ${newStatusColor === c ? 'ring-2 ring-[#20BFA5] ring-offset-2' : ''}`}
                    />
                  ))}
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl bg-[#20BFA5] text-white text-sm font-semibold">
                  Publish Text Status
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Optional caption..."
                  value={newStatusCaption}
                  onChange={(e) => setNewStatusCaption(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101820] text-sm"
                />
                <input
                  ref={statusImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleStatusImageUpload}
                />
                <button
                  type="button"
                  onClick={() => statusImageInputRef.current?.click()}
                  className="w-full py-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center gap-2 text-sm text-slate-500 hover:border-[#20BFA5]"
                >
                  <ImageIcon className="w-6 h-6 text-[#20BFA5]" />
                  <span>Choose Photo to Upload & Publish</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSafetyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#20BFA5] font-semibold text-sm">
                <Lock className="w-4 h-4" />
                <span>End-to-End Encryption</span>
              </div>
              <button type="button" onClick={() => setShowSafetyModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Your ECDH P-256 identity key fingerprint ensures private messages and calls cannot be read by MuzTalk servers or administrators.
            </p>
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-[#101820] font-mono text-sm tracking-widest text-center tabular-nums">
              {currentUser.encryptionFingerprint || 'Generating key bundle...'}
            </div>
            <button
              type="button"
              onClick={async () => {
                const bundle = await generateIdentityBundle();
                const res = await api.registerEncryptionKeys(bundle);
                onUserUpdated({ ...currentUser, encryptionFingerprint: res.fingerprint });
                showToast('ECDH identity keys rotated');
              }}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Rotate Device Keys
            </button>
          </div>
        </div>
      )}

      {viewingStatus && (
        <StatusViewerModal
          status={viewingStatus}
          currentUserId={currentUser.id}
          onClose={() => {
            setViewingStatus(null);
            refreshSecondaryData();
          }}
          onReact={async (id, emoji) => {
            await api.reactStatus(id, emoji);
            showToast(`Reacted ${emoji}`);
          }}
          onDelete={async (id) => {
            await api.deleteStatus(id);
            setViewingStatus(null);
            refreshSecondaryData();
          }}
          onReplyToChat={async (userId, text) => {
            const { chat } = await api.createDirectChat(userId);
            emitReliable('message:send', {
              clientMessageId: uuidv4(),
              conversationId: chat.id,
              type: 'TEXT',
              text,
            });
            setActiveTab('chats');
            setSelectedChatId(chat.id);
          }}
        />
      )}

      {webrtc.callState && (
        <CallOverlay
          callState={webrtc.callState}
          streamVersion={webrtc.streamVersion}
          localVideoRef={webrtc.localVideoElRef}
          remoteVideoRef={webrtc.remoteVideoElRef}
          onAttachStreams={webrtc.attachStreamsToVideos}
          onAccept={webrtc.acceptIncomingCall}
          onReject={webrtc.rejectIncomingCall}
          onHangup={webrtc.hangupCall}
          onToggleMute={webrtc.toggleMute}
          onToggleVideo={webrtc.toggleVideo}
          onToggleSpeaker={webrtc.toggleSpeaker}
        />
      )}

      {blockScreenCapture && isPrivacyBlurred && (
        <div className="fixed inset-0 z-[60] bg-[#101C35]/95 backdrop-blur-xl flex flex-col items-center justify-center text-white text-center px-6">
          <ShieldAlert className="w-12 h-12 text-[#20BFA5] mb-3" />
          <h2 className="font-display text-xl font-bold">Screen Capture Protection Active</h2>
          <p className="text-xs text-slate-300 mt-1.5 max-w-sm">
            Screenshots and screen recording have been disabled by your MuzTalk administrator. Return focus to this window to continue.
          </p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#101C35] text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
