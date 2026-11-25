import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Eye, Plus, Trash2, X } from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { UserAvatar } from '../components/UserAvatar';
import { MuzTalkColors } from '../theme/tokens';
import type { StatusDTO } from '../types';

export function UpdatesScreen() {
  const { currentUser, statuses, setStatuses } = useMuzTalkStore();
  const [viewing, setViewing] = useState<StatusDTO | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [text, setText] = useState('');
  const [bgColor, setBgColor] = useState('#101C35');

  const load = () => {
    mobileApi.getStatuses().then((r) => setStatuses(r.statuses)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handlePublishText = async () => {
    if (!text.trim()) return;
    await mobileApi.createStatus({ type: 'TEXT', contentText: text.trim(), bgColor });
    setNewModal(false);
    setText('');
    load();
  };

  const handlePublishPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const uploaded = await mobileApi.uploadFile(asset.uri, `status-${Date.now()}.jpg`, asset.mimeType || 'image/jpeg');
    await mobileApi.createStatus({ type: 'IMAGE', mediaUrl: uploaded.url });
    setNewModal(false);
    load();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Updates</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setNewModal(true)}>
          <Plus size={18} color="#FFF" />
          <Text style={styles.addBtnText}>Add Status</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={statuses}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              setViewing(item);
              mobileApi.viewStatus(item.id).then(load).catch(() => {});
            }}
          >
            <View style={[styles.ring, item.viewedByMe && { borderColor: '#CBD5E1' }]}>
              <UserAvatar src={item.userAvatar} name={item.userName} size={44} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.userName}</Text>
              <Text style={styles.sub}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {item.viewsCount} views
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No active 24-hour statuses.</Text>}
      />

      {/* New Status Modal */}
      <Modal visible={newModal} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>Post 24-Hour Status</Text>
              <TouchableOpacity onPress={() => setNewModal(false)}><X size={22} color={MuzTalkColors.secondary} /></TouchableOpacity>
            </View>
            <TextInput
              style={[styles.statusInput, { backgroundColor: bgColor }]}
              multiline
              placeholder="Write a status update..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={text}
              onChangeText={setText}
            />
            <View style={styles.colorRow}>
              {['#101C35', '#20BFA5', '#0F766E', '#1E3A8A', '#7C2D12'].map((c) => (
                <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }]} onPress={() => setBgColor(c)} />
              ))}
            </View>
            <TouchableOpacity style={styles.publishBtn} onPress={handlePublishText}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Publish Text Status</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={handlePublishPhoto}>
              <Text style={{ color: MuzTalkColors.secondary, fontWeight: '600' }}>Upload Photo Status</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Viewer */}
      <Modal visible={Boolean(viewing)} animationType="fade">
        {viewing && (
          <SafeAreaView style={[styles.viewerSafe, { backgroundColor: viewing.bgColor || '#101820' }]}>
            <View style={styles.viewerTop}>
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>{viewing.userName}</Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                {viewing.userId === currentUser?.id && (
                  <TouchableOpacity
                    onPress={async () => {
                      await mobileApi.deleteStatus(viewing.id);
                      setViewing(null);
                      load();
                    }}
                  >
                    <Trash2 size={22} color="#F87171" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setViewing(null)}>
                  <X size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.viewerBody}>
              {viewing.type === 'IMAGE' && viewing.mediaUrl ? (
                <Image
                  source={{ uri: mobileApi.resolveUrl(viewing.mediaUrl) || '' }}
                  style={{ width: '100%', height: '80%', resizeMode: 'contain' }}
                />
              ) : (
                <Text style={styles.viewerText}>{viewing.contentText}</Text>
              )}
            </View>
            <View style={styles.viewerFooter}>
              <Eye size={16} color="#48D6B8" />
              <Text style={{ color: '#FFF', fontSize: 13 }}>{viewing.viewsCount} views</Text>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: MuzTalkColors.borderLight },
  title: { fontSize: 22, fontWeight: '800', color: MuzTalkColors.secondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: MuzTalkColors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { padding: 2, borderRadius: 999, borderWidth: 2, borderColor: MuzTalkColors.primary },
  name: { fontSize: 15, fontWeight: '700', color: MuzTalkColors.secondary },
  sub: { fontSize: 12, color: MuzTalkColors.mutedText, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: MuzTalkColors.mutedText },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: MuzTalkColors.secondary },
  statusInput: { height: 150, borderRadius: 16, padding: 16, color: '#FFF', fontSize: 18, textAlign: 'center', textAlignVertical: 'center' },
  colorRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  publishBtn: { backgroundColor: MuzTalkColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  photoBtn: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  viewerSafe: { flex: 1, justifyContent: 'space-between', padding: 18 },
  viewerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewerBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewerText: { color: '#FFF', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  viewerFooter: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
});
