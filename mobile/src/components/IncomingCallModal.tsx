import React from 'react';
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { Mic, MicOff, Phone, PhoneOff, RefreshCw, Video, VideoOff, Volume2, VolumeX } from 'lucide-react-native';
import type { ActiveMobileCall } from '../store/useMuzTalkStore';
import { MuzTalkColors } from '../theme/tokens';
import { UserAvatar } from './UserAvatar';

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function IncomingCallModal({
  call,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleVideo,
  onSwitchCamera,
  onToggleSpeaker,
}: {
  call: ActiveMobileCall | null;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onToggleSpeaker: () => void;
}) {
  if (!call) return null;
  const isVideo = call.type === 'VIDEO' || call.type === 'GROUP_VIDEO';

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.encryptedLabel}>
            MuzTalk E2EE {isVideo ? 'Video Call' : 'Voice Call'}
          </Text>
          <Text style={styles.timer}>
            {call.status === 'active'
              ? formatSec(call.durationSec)
              : call.status === 'ringing'
                ? call.direction === 'incoming'
                  ? 'Incoming Call'
                  : 'Ringing...'
                : 'Connecting...'}
          </Text>
        </View>

        {/* Center Video / Avatar Stage */}
        <View style={styles.stage}>
          {isVideo && call.remoteStreamUrl ? (
            <RTCView streamURL={call.remoteStreamUrl} style={styles.remoteVideo} objectFit="cover" />
          ) : (
            <View style={styles.avatarCenter}>
              <UserAvatar src={call.peerAvatar} name={call.peerName} size={112} />
              <Text style={styles.peerName}>{call.peerName}</Text>
              <Text style={styles.subText}>
                {call.type.startsWith('GROUP') ? 'LiveKit SFU Group Room' : 'WebRTC P2P Channel'}
              </Text>
            </View>
          )}

          {isVideo && call.localStreamUrl && !call.isVideoOff && (
            <RTCView streamURL={call.localStreamUrl} style={styles.localPip} objectFit="cover" zOrder={1} />
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {call.direction === 'incoming' && call.status === 'ringing' ? (
            <>
              <TouchableOpacity style={[styles.circleBtn, styles.rejectBtn]} onPress={onReject}>
                <PhoneOff color="#FFFFFF" size={26} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.circleBtn, styles.acceptBtn]} onPress={onAccept}>
                <Phone color="#FFFFFF" size={26} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.smallBtn, call.isMuted && styles.activeBtn]}
                onPress={onToggleMute}
              >
                {call.isMuted ? <MicOff color="#101C35" size={22} /> : <Mic color="#FFFFFF" size={22} />}
              </TouchableOpacity>

              {isVideo && (
                <>
                  <TouchableOpacity
                    style={[styles.smallBtn, call.isVideoOff && styles.activeBtn]}
                    onPress={onToggleVideo}
                  >
                    {call.isVideoOff ? (
                      <VideoOff color="#101C35" size={22} />
                    ) : (
                      <Video color="#FFFFFF" size={22} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={onSwitchCamera}>
                    <RefreshCw color="#FFFFFF" size={22} />
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.smallBtn, call.isSpeakerOn && styles.activeBtn]}
                onPress={onToggleSpeaker}
              >
                {call.isSpeakerOn ? (
                  <Volume2 color="#101C35" size={22} />
                ) : (
                  <VolumeX color="#FFFFFF" size={22} />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[styles.circleBtn, styles.rejectBtn]} onPress={onHangup}>
                <PhoneOff color="#FFFFFF" size={26} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MuzTalkColors.secondary, justifyContent: 'space-between', padding: 20 },
  header: { alignItems: 'center', marginTop: 12 },
  encryptedLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  timer: { color: MuzTalkColors.accent, fontSize: 18, fontWeight: '700', marginTop: 4 },
  stage: { flex: 1, marginVertical: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: MuzTalkColors.darkBg, justifyContent: 'center', alignItems: 'center' },
  remoteVideo: { width: '100%', height: '100%' },
  localPip: { position: 'absolute', bottom: 16, right: 16, width: 108, height: 152, borderRadius: 16, overflow: 'hidden' },
  avatarCenter: { alignItems: 'center' },
  peerName: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: 16 },
  subText: { color: '#94A3B8', fontSize: 13, marginTop: 6 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 16 },
  circleBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  activeBtn: { backgroundColor: '#FFFFFF' },
  acceptBtn: { backgroundColor: MuzTalkColors.primary },
  rejectBtn: { backgroundColor: '#DC2626' },
});
