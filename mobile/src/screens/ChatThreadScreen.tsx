import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { v4 as uuidv4 } from 'uuid';
import {
  Check,
  CheckCheck,
  Mic,
  Paperclip,
  Phone,
  Play,
  Send,
  Smile,
  Square,
  Video,
  X,
} from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { emitMobileReliable } from '../services/socket';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { useWebRTCMobile } from '../calling/useWebRTCMobile';
import { MuzTalkColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { MessageDTO } from '../types';

const QUICK_EMOJIS = ['👍', '💚', '😂', '🔥', '😮', '👏', '🚀', '👋'];

export function ChatThreadScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ChatThread'>>();
  const navigation = useNavigation();
  const { conversationId, title, peerUserId } = route.params;

  const { currentUser, messagesByChat, setChatMessages, typingByChat, stickerPacks, setStickerPacks } =
    useMuzTalkStore();
  const { startCall } = useWebRTCMobile();

  const messages = messagesByChat[conversationId] || [];
  const isTyping = typingByChat[conversationId];

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordSec, setRecordSec] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity
            onPress={() =>
              startCall({
                peerUserId: peerUserId || null,
                peerName: title,
                peerAvatar: null,
                conversationId,
                type: peerUserId ? 'AUDIO' : 'GROUP_AUDIO',
              })
            }
          >
            <Phone size={20} color={MuzTalkColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              startCall({
                peerUserId: peerUserId || null,
                peerName: title,
                peerAvatar: null,
                conversationId,
                type: peerUserId ? 'VIDEO' : 'GROUP_VIDEO',
              })
            }
          >
            <Video size={20} color={MuzTalkColors.primary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, title, peerUserId, conversationId, startCall]);

  useEffect(() => {
    mobileApi.getMessages(conversationId).then((res) => {
      setChatMessages(conversationId, res.messages);
      emitMobileReliable('message:read', { conversationId });
    }).catch(() => {});
    if (stickerPacks.length === 0) {
      mobileApi.getStickers().then((r) => setStickerPacks(r.packs)).catch(() => {});
    }
  }, [conversationId, setChatMessages, stickerPacks.length, setStickerPacks]);

  const handleSend = () => {
    const clean = text.trim();
    if (!clean) return;
    setText('');
    const reply = replyTo;
    setReplyTo(null);

    emitMobileReliable('message:send', {
      clientMessageId: uuidv4(),
      conversationId,
      type: 'TEXT',
      text: clean,
      isEncrypted: true,
      replyToId: reply?.id || null,
    });
  };

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const uploaded = await mobileApi.uploadFile(
      asset.uri,
      asset.fileName || `photo-${Date.now()}.jpg`,
      asset.mimeType || 'image/jpeg'
    );
    emitMobileReliable('message:send', {
      clientMessageId: uuidv4(),
      conversationId,
      type: 'IMAGE',
      text: uploaded.originalName,
      attachments: [{ ...uploaded, mediaFileId: uploaded.id }],
    });
  };

  const handlePickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const uploaded = await mobileApi.uploadFile(
      asset.uri,
      asset.name,
      asset.mimeType || 'application/octet-stream'
    );
    emitMobileReliable('message:send', {
      clientMessageId: uuidv4(),
      conversationId,
      type: 'DOCUMENT',
      text: asset.name,
      attachments: [{ ...uploaded, mediaFileId: uploaded.id }],
    });
  };

  const startVoiceRecord = async () => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone Required', 'Allow microphone access to record voice notes.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    setRecording(rec);
    setRecordSec(0);
    recordTimerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
  };

  const stopVoiceRecord = async (send: boolean) => {
    if (!recording) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (send && uri) {
      const uploaded = await mobileApi.uploadFile(uri, `voice-${Date.now()}.m4a`, 'audio/m4a');
      emitMobileReliable('message:send', {
        clientMessageId: uuidv4(),
        conversationId,
        type: 'VOICE_NOTE',
        text: `Voice note (${recordSec}s)`,
        attachments: [{ ...uploaded, mediaFileId: uploaded.id, durationMs: recordSec * 1000 }],
      });
    }
    setRecordSec(0);
  };

  const playVoiceUri = async (url: string) => {
    const resolved = mobileApi.resolveUrl(url);
    if (!resolved) return;
    const { sound } = await Audio.Sound.createAsync({ uri: resolved });
    await sound.playAsync();
  };

  const handleMessageLongPress = (msg: MessageDTO) => {
    Alert.alert('Message Actions', msg.text.slice(0, 60), [
      { text: 'Reply', onPress: () => setReplyTo(msg) },
      { text: 'React 💚', onPress: () => emitMobileReliable('message:reaction', { messageId: msg.id, emoji: '💚' }) },
      { text: 'Copy', onPress: () => Clipboard.setStringAsync(msg.text) },
      ...(msg.senderId === currentUser?.id
        ? [
            {
              text: 'Delete for Everyone',
              style: 'destructive' as const,
              onPress: () => mobileApi.deleteMessage(msg.id, 'everyone'),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderMessage = ({ item }: { item: MessageDTO }) => {
    const isMine = item.senderId === currentUser?.id;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => handleMessageLongPress(item)}
        style={[styles.msgRow, isMine ? styles.msgMineAlign : styles.msgPeerAlign]}
      >
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubblePeer]}>
          {item.replyPreview && (
            <View style={styles.replyBox}>
              <Text style={styles.replyAuthor}>{item.replyPreview.senderName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>{item.replyPreview.text}</Text>
            </View>
          )}

          {item.attachments.map((att) => {
            const url = mobileApi.resolveUrl(att.url);
            if (!url) return null;
            if (item.type === 'IMAGE') {
              return <Image key={att.id} source={{ uri: url }} style={styles.attImage} />;
            }
            if (item.type === 'VOICE_NOTE' || att.mimeType.startsWith('audio/')) {
              return (
                <TouchableOpacity key={att.id} style={styles.voiceRow} onPress={() => playVoiceUri(att.url)}>
                  <Play size={16} color={isMine ? '#FFFFFF' : MuzTalkColors.primary} />
                  <Text style={{ color: isMine ? '#FFFFFF' : MuzTalkColors.secondary, fontSize: 13 }}>
                    Play Voice Note
                  </Text>
                </TouchableOpacity>
              );
            }
            return null;
          })}

          <Text style={[styles.msgText, isMine ? { color: '#FFFFFF' } : { color: MuzTalkColors.secondary }]}>
            {item.text}
          </Text>

          <View style={styles.metaRow}>
            <Text style={[styles.metaTime, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMine &&
              (item.receiptStatus === 'READ' ? (
                <CheckCheck size={14} color={MuzTalkColors.accent} />
              ) : item.receiptStatus === 'DELIVERED' ? (
                <CheckCheck size={14} color="rgba(255,255,255,0.75)" />
              ) : (
                <Check size={14} color="rgba(255,255,255,0.75)" />
              ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        {isTyping && (
          <View style={styles.typingBar}>
            <Text style={styles.typingText}>Typing...</Text>
          </View>
        )}

        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 14, gap: 8 }}
        />

        {replyTo && (
          <View style={styles.replyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyAuthor}>Replying to {replyTo.senderName}</Text>
              <Text numberOfLines={1} style={styles.replyText}>{replyTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <X size={18} color={MuzTalkColors.mutedText} />
            </TouchableOpacity>
          </View>
        )}

        {showStickers && (
          <View style={styles.emojiTray}>
            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 8 }}>
              {QUICK_EMOJIS.map((em) => (
                <TouchableOpacity key={em} onPress={() => setText((t) => `${t}${em}`)}>
                  <Text style={{ fontSize: 22 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.composer}>
          {recording ? (
            <View style={styles.recordingRow}>
              <Text style={styles.recordingText}>Recording voice note {recordSec}s</Text>
              <TouchableOpacity onPress={() => stopVoiceRecord(false)}>
                <Text style={{ color: MuzTalkColors.mutedText, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={() => stopVoiceRecord(true)}>
                <Square size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.toolBtn} onPress={() => setShowStickers((v) => !v)}>
                <Smile size={22} color={MuzTalkColors.mutedText} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() =>
                  Alert.alert('Attach', 'Choose media type', [
                    { text: 'Photo Library', onPress: handlePickImage },
                    { text: 'Document / PDF', onPress: handlePickDocument },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
              >
                <Paperclip size={22} color={MuzTalkColors.mutedText} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  emitMobileReliable('user:typing', { conversationId });
                }}
              />
              {text.trim() ? (
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                  <Send size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.micBtn} onPress={startVoiceRecord}>
                  <Mic size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.lightBg },
  typingBar: { paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#ECFDF5' },
  typingText: { fontSize: 12, color: MuzTalkColors.primary, fontWeight: '600' },
  msgRow: { flexDirection: 'row', marginVertical: 2 },
  msgMineAlign: { justifyContent: 'flex-end' },
  msgPeerAlign: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: MuzTalkColors.secondary, borderBottomRightRadius: 4 },
  bubblePeer: { backgroundColor: MuzTalkColors.white, borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderBottomLeftRadius: 4 },
  msgText: { fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  metaTime: { fontSize: 10, color: MuzTalkColors.mutedText },
  replyBox: { backgroundColor: 'rgba(32,191,165,0.15)', borderLeftWidth: 3, borderLeftColor: MuzTalkColors.primary, padding: 6, borderRadius: 6, marginBottom: 6 },
  replyAuthor: { fontSize: 11, fontWeight: '700', color: MuzTalkColors.primary },
  replyText: { fontSize: 12, color: MuzTalkColors.mutedText },
  attImage: { width: 210, height: 180, borderRadius: 10, marginBottom: 6 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: MuzTalkColors.borderLight },
  emojiTray: { backgroundColor: '#FFFFFF', padding: 12, borderTopWidth: 1, borderTopColor: MuzTalkColors.borderLight },
  composer: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: MuzTalkColors.borderLight, gap: 6 },
  toolBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: MuzTalkColors.secondary },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: MuzTalkColors.primary, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: MuzTalkColors.secondary, alignItems: 'center', justifyContent: 'center' },
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  recordingText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
});
