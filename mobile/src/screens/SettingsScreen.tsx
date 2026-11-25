import React, { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Lock, LogOut, Smartphone } from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { disconnectMobileSocket } from '../services/socket';
import { generateAndRegisterMobileKeys } from '../services/e2ee';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { UserAvatar } from '../components/UserAvatar';
import { MuzTalkColors } from '../theme/tokens';

export function SettingsScreen() {
  const { currentUser, setCurrentUser, devices, setDevices, logoutLocal, serverUrl } = useMuzTalkStore();
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [about, setAbout] = useState(currentUser?.about || '');

  useEffect(() => {
    mobileApi.getDevices().then((r) => setDevices(r.devices)).catch(() => {});
  }, [setDevices]);

  const handleSave = async () => {
    const res = await mobileApi.updateMe({ displayName: displayName.trim(), about: about.trim() });
    setCurrentUser(res.user);
    Alert.alert('Saved', 'Profile updated on MuzTalk server.');
  };

  const handleRotateKeys = async () => {
    const fp = await generateAndRegisterMobileKeys();
    if (currentUser) setCurrentUser({ ...currentUser, encryptionFingerprint: fp });
    Alert.alert('Keys Rotated', `New safety fingerprint:\n${fp}`);
  };

  const handleLogout = async () => {
    await mobileApi.logout().catch(() => {});
    disconnectMobileSocket();
    await logoutLocal();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <View style={styles.profileHead}>
            <UserAvatar src={currentUser?.avatarUrl} name={currentUser?.displayName || 'User'} size={56} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.name}>{currentUser?.displayName}</Text>
              <Text style={styles.sub}>{currentUser?.phoneNumber}</Text>
            </View>
          </View>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Display Name" />
          <TextInput style={styles.input} value={about} onChangeText={setAbout} placeholder="About" />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Save Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.rowIcon}>
            <Lock size={18} color={MuzTalkColors.primary} />
            <Text style={styles.cardTitle}>End-to-End Encryption</Text>
          </View>
          <Text style={styles.fingerprint}>{currentUser?.encryptionFingerprint || 'Pending key registration'}</Text>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleRotateKeys}>
            <Text style={styles.outlineText}>Rotate Device Identity Keys</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.rowIcon}>
            <Smartphone size={18} color={MuzTalkColors.primary} />
            <Text style={styles.cardTitle}>Linked Devices ({devices.length})</Text>
          </View>
          {devices.map((d) => (
            <View key={d.id} style={styles.deviceRow}>
              <Text style={styles.deviceName}>{d.deviceName} ({d.platform})</Text>
            </View>
          ))}
          <Text style={styles.sub}>Server: {serverUrl}</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.lightBg },
  container: { padding: 16, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', color: MuzTalkColors.secondary },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: MuzTalkColors.borderLight },
  profileHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  name: { fontSize: 17, fontWeight: '700', color: MuzTalkColors.secondary },
  sub: { fontSize: 12, color: MuzTalkColors.mutedText, marginTop: 2 },
  input: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 10, padding: 10, marginTop: 10 },
  saveBtn: { backgroundColor: MuzTalkColors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: MuzTalkColors.secondary },
  fingerprint: { fontSize: 13, fontWeight: '600', color: MuzTalkColors.secondary, backgroundColor: '#F1F5F9', padding: 10, borderRadius: 8, textAlign: 'center' },
  outlineBtn: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  outlineText: { fontSize: 13, fontWeight: '600', color: MuzTalkColors.secondary },
  deviceRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  deviceName: { fontSize: 13, color: MuzTalkColors.secondary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  logoutText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
});
