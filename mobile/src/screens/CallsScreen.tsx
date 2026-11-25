import React, { useEffect } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Phone, Video } from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { useWebRTCMobile } from '../calling/useWebRTCMobile';
import { UserAvatar } from '../components/UserAvatar';
import { MuzTalkColors } from '../theme/tokens';

export function CallsScreen() {
  const { currentUser, callsHistory, setCallsHistory } = useMuzTalkStore();
  const { startCall } = useWebRTCMobile();

  useEffect(() => {
    mobileApi.getCallsHistory().then((r) => setCallsHistory(r.calls)).catch(() => {});
  }, [setCallsHistory]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Calls</Text>
      </View>

      <FlatList
        data={callsHistory}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => {
          const outgoing = item.initiatorId === currentUser?.id;
          const peerName = outgoing ? item.peerName : item.initiatorName;
          const peerId = outgoing ? item.peerId : item.initiatorId;
          const isVideo = item.type === 'VIDEO' || item.type === 'GROUP_VIDEO';

          return (
            <View style={styles.row}>
              <UserAvatar src={outgoing ? item.peerAvatar : item.initiatorAvatar} name={peerName} size={44} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{peerName}</Text>
                <Text style={[styles.sub, item.status === 'MISSED' && { color: '#DC2626' }]}>
                  {outgoing ? 'Outgoing' : 'Incoming'} · {item.status} · {item.durationSec}s
                </Text>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() =>
                  startCall({
                    peerUserId: peerId,
                    peerName,
                    peerAvatar: null,
                    conversationId: item.conversationId,
                    type: item.type,
                  })
                }
              >
                {isVideo ? <Video size={20} color={MuzTalkColors.primary} /> : <Phone size={20} color={MuzTalkColors.primary} />}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No recent call logs.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.white },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: MuzTalkColors.borderLight },
  title: { fontSize: 22, fontWeight: '800', color: MuzTalkColors.secondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  name: { fontSize: 15, fontWeight: '700', color: MuzTalkColors.secondary },
  sub: { fontSize: 12, color: MuzTalkColors.mutedText, marginTop: 2 },
  callBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, color: MuzTalkColors.mutedText },
});
