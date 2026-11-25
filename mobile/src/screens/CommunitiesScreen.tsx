import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MessageSquare, Plus, X } from 'lucide-react-native';
import { mobileApi } from '../services/api';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { MuzTalkColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/AppNavigator';

export function CommunitiesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { communities, setCommunities } = useMuzTalkStore();
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const load = () => {
    mobileApi.getCommunities().then((r) => setCommunities(r.communities)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await mobileApi.createCommunity({ name: name.trim(), description: desc.trim() });
    setModal(false);
    setName('');
    setDesc('');
    load();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Communities</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
          <Plus size={18} color="#FFF" />
          <Text style={styles.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={communities}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.commName}>{item.name}</Text>
              <Text style={styles.invite}>{item.inviteCode}</Text>
            </View>
            <Text style={styles.desc}>{item.description}</Text>
            {item.groups.map((g) => (
              <TouchableOpacity
                key={g.groupId}
                style={styles.groupRow}
                onPress={() =>
                  navigation.navigate('ChatThread', {
                    conversationId: g.conversationId,
                    title: g.name,
                  })
                }
              >
                <View>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupSub}>
                    {g.isAnnouncement ? 'Announcements' : 'Group'} · {g.memberCount} members
                  </Text>
                </View>
                <MessageSquare size={18} color={MuzTalkColors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      />

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <View style={styles.modalCard}>
            <View style={styles.cardTop}>
              <Text style={styles.commName}>Create Community</Text>
              <TouchableOpacity onPress={() => setModal(false)}><X size={22} color={MuzTalkColors.secondary} /></TouchableOpacity>
            </View>
            <TextInput style={styles.input} placeholder="Community name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Description" value={desc} onChangeText={setDesc} />
            <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Create Community</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.lightBg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: MuzTalkColors.borderLight },
  title: { fontSize: 22, fontWeight: '800', color: MuzTalkColors.secondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: MuzTalkColors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: MuzTalkColors.borderLight },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commName: { fontSize: 16, fontWeight: '700', color: MuzTalkColors.secondary },
  invite: { fontSize: 12, fontWeight: '700', color: MuzTalkColors.primary },
  desc: { fontSize: 13, color: MuzTalkColors.mutedText, marginTop: 4, marginBottom: 10 },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  groupName: { fontSize: 14, fontWeight: '600', color: MuzTalkColors.secondary },
  groupSub: { fontSize: 12, color: MuzTalkColors.mutedText },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  input: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 12, padding: 12, marginTop: 12 },
  createBtn: { backgroundColor: MuzTalkColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
});
