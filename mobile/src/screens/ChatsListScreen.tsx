import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pin, Plus, Search, Users, VolumeX, X } from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { UserAvatar } from '../components/UserAvatar';
import { MuzTalkColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { ChatListItemDTO, UserDTO } from '../types';

export function ChatsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { chats, setChats, typingByChat, themeMode } = useMuzTalkStore();
  const isDark = themeMode === 'dark';

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [newChatModal, setNewChatModal] = useState(false);
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [directory, setDirectory] = useState<UserDTO[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const loadChats = useCallback(async () => {
    const res = await mobileApi.getChats({
      q: search,
      unread: filter === 'unread',
      archived: filter === 'archived',
    });
    setChats(res.chats);
  }, [search, filter, setChats]);

  useEffect(() => {
    loadChats().catch(() => {});
  }, [loadChats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChats().catch(() => {});
    setRefreshing(false);
  };

  const openDirectory = async (mode: 'chat' | 'group') => {
    const res = await mobileApi.searchUsers('');
    setDirectory(res.users);
    if (mode === 'chat') setNewChatModal(true);
    else setNewGroupModal(true);
  };

  const handleStartDirect = async (peerId: string) => {
    const { chat } = await mobileApi.createDirectChat(peerId);
    setNewChatModal(false);
    await loadChats();
    navigation.navigate('ChatThread', {
      conversationId: chat.id,
      title: chat.title,
      peerUserId: chat.peerUserId,
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    const { group } = await mobileApi.createGroup({
      name: groupName.trim(),
      description: '',
      memberIds: selectedMembers,
    });
    setNewGroupModal(false);
    setGroupName('');
    setSelectedMembers([]);
    await loadChats();
    navigation.navigate('ChatThread', {
      conversationId: group.conversationId,
      title: group.name,
    });
  };

  const renderChat = ({ item }: { item: ChatListItemDTO }) => {
    const typing = typingByChat[item.id];
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: isDark ? MuzTalkColors.borderDark : MuzTalkColors.borderLight }]}
        onPress={() =>
          navigation.navigate('ChatThread', {
            conversationId: item.id,
            title: item.title,
            peerUserId: item.peerUserId,
          })
        }
        onLongPress={async () => {
          await mobileApi.updateChatPreferences(item.id, { isPinned: !item.isPinned });
          loadChats();
        }}
      >
        <UserAvatar src={item.avatarUrl} name={item.title} isOnline={item.isOnline} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.chatTitle, isDark && styles.textLight]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.timeText}>
              {item.lastMessageAt
                ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.previewText, typing && { color: MuzTalkColors.primary }]} numberOfLines={1}>
              {typing ? 'typing...' : item.lastMessage?.text || item.subtitle || 'No messages yet'}
            </Text>
            <View style={styles.badges}>
              {item.isPinned && <Pin size={13} color={MuzTalkColors.mutedText} />}
              {item.isMuted && <VolumeX size={13} color={MuzTalkColors.mutedText} />}
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <View style={styles.topHeader}>
        <Text style={[styles.headerTitle, isDark && styles.textLight]}>MuzTalk</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openDirectory('group')}>
            <Users size={20} color={isDark ? '#E2E8F0' : MuzTalkColors.secondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.fabBtn} onPress={() => openDirectory('chat')}>
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color={MuzTalkColors.mutedText} />
        <TextInput
          style={[styles.searchInput, isDark && styles.textLight]}
          placeholder="Search chats..."
          placeholderTextColor={MuzTalkColors.mutedText}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filterRow}>
        {(['all', 'unread', 'archived'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        renderItem={renderChat}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No chats found. Tap + to start a conversation.</Text>
        }
      />

      {/* New Chat Modal */}
      <Modal visible={newChatModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start Chat</Text>
              <TouchableOpacity onPress={() => setNewChatModal(false)}>
                <X size={22} color={MuzTalkColors.secondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={directory}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.dirRow} onPress={() => handleStartDirect(item.id)}>
                  <UserAvatar src={item.avatarUrl} name={item.displayName} isOnline={item.isOnline} size={40} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.dirName}>{item.displayName}</Text>
                    <Text style={styles.dirSub}>@{item.username} · {item.phoneNumber}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* New Group Modal */}
      <Modal visible={newGroupModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Group</Text>
              <TouchableOpacity onPress={() => setNewGroupModal(false)}>
                <X size={22} color={MuzTalkColors.secondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Group Name"
              value={groupName}
              onChangeText={setGroupName}
            />
            <FlatList
              data={directory}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => {
                const picked = selectedMembers.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.dirRow, picked && { backgroundColor: '#ECFDF5' }]}
                    onPress={() =>
                      setSelectedMembers((prev) =>
                        picked ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                      )
                    }
                  >
                    <Text style={styles.dirName}>{picked ? '✓ ' : ''}{item.displayName}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.createBtn} onPress={handleCreateGroup}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.white },
  safeDark: { backgroundColor: MuzTalkColors.darkBg },
  textLight: { color: '#F8FAFC' },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: MuzTalkColors.secondary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fabBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: MuzTalkColors.primary, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: MuzTalkColors.secondary },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9' },
  filterBtnActive: { backgroundColor: MuzTalkColors.primary },
  filterText: { fontSize: 11, fontWeight: '700', color: MuzTalkColors.mutedText },
  filterTextActive: { color: '#FFFFFF' },
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 1 },
  rowBody: { flex: 1, marginLeft: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatTitle: { fontSize: 15, fontWeight: '700', color: MuzTalkColors.secondary, flex: 1, marginRight: 8 },
  timeText: { fontSize: 11, color: MuzTalkColors.mutedText },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  previewText: { fontSize: 13, color: MuzTalkColors.mutedText, flex: 1, marginRight: 8 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: MuzTalkColors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  emptyText: { textAlign: 'center', marginTop: 48, color: MuzTalkColors.mutedText },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: MuzTalkColors.secondary },
  modalInput: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  dirRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  dirName: { fontSize: 15, fontWeight: '600', color: MuzTalkColors.secondary },
  dirSub: { fontSize: 12, color: MuzTalkColors.mutedText },
  createBtn: { backgroundColor: MuzTalkColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
});
