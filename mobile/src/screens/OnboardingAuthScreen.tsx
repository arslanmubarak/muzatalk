import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { mobileApi } from '../services/api';
import { useMuzTalkStore } from '../store/useMuzTalkStore';
import { MuzTalkColors } from '../theme/tokens';

export function OnboardingAuthScreen() {
  const { serverUrl, setServerUrl, setTokens, setCurrentUser } = useMuzTalkStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [backendInput, setBackendInput] = useState(serverUrl);
  const [countryCode, setCountryCode] = useState('+92');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await setServerUrl(backendInput);
      const res = await mobileApi.sendOtp(countryCode.trim(), phoneNumber.trim());
      setNormalizedPhone(res.phoneNumber);
      setDevOtpHint(res.devOtpPreview || null);
      setStep('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await mobileApi.verifyOtp({
        phoneNumber: normalizedPhone,
        otp: otp.trim(),
        displayName: displayName.trim() || undefined,
        deviceName: `MuzTalk Android (${Platform.OS})`,
        platform: 'Android',
      });
      await setTokens(res.accessToken, res.refreshToken);
      setCurrentUser(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (userId: string) => {
    setError(null);
    setLoading(true);
    try {
      await setServerUrl(backendInput);
      const res = await mobileApi.demoSession(userId);
      await setTokens(res.accessToken, res.refreshToken);
      setCurrentUser(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.brandBlock}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoLetter}>M</Text>
            </View>
            <Text style={styles.title}>MuzTalk</Text>
            <Text style={styles.tagline}>Connect. Chat. Call.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {step === 'phone' ? 'Verify your phone number' : 'Enter 6-digit OTP'}
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {step === 'phone' ? (
              <>
                <Text style={styles.label}>Backend Server URL</Text>
                <TextInput
                  style={styles.input}
                  value={backendInput}
                  onChangeText={setBackendInput}
                  autoCapitalize="none"
                  placeholder="https://your-muztalk-server.com"
                />

                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.phoneRow}>
                  <TextInput
                    style={[styles.input, { width: 78 }]}
                    value={countryCode}
                    onChangeText={setCountryCode}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    placeholder="300 111 2233"
                  />
                </View>

                <Text style={styles.label}>Display Name (new users)</Text>
                <TextInput
                  style={styles.input}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                />

                <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOtp} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send OTP Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {devOtpHint && (
                  <TouchableOpacity style={styles.devOtpBanner} onPress={() => setOtp(devOtpHint)}>
                    <Text style={styles.devOtpText}>Dev OTP: {devOtpHint} (Tap to fill)</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.label}>Verification Code for {normalizedPhone}</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                />

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('phone')}>
                    <Text style={styles.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleVerifyOtp} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.helperLabel}>Development Preview Accounts</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.demoBtn} onPress={() => handleQuickDemo('usr-ayesha')}>
                <Text style={styles.demoBtnText}>Ayesha Khan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.demoBtn} onPress={() => handleQuickDemo('usr-sara')}>
                <Text style={styles.demoBtnText}>Sara Malik</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MuzTalkColors.lightBg },
  container: { padding: 20, justifyContent: 'center', flexGrow: 1 },
  brandBlock: { alignItems: 'center', marginBottom: 24 },
  logoBadge: { width: 64, height: 64, borderRadius: 18, backgroundColor: MuzTalkColors.secondary, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { color: MuzTalkColors.accent, fontSize: 32, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: MuzTalkColors.secondary, marginTop: 10 },
  tagline: { fontSize: 13, fontWeight: '600', color: MuzTalkColors.primary, marginTop: 2 },
  card: { backgroundColor: MuzTalkColors.white, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: MuzTalkColors.borderLight },
  cardTitle: { fontSize: 18, fontWeight: '700', color: MuzTalkColors.secondary, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: MuzTalkColors.mutedText, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: MuzTalkColors.secondary, backgroundColor: '#F8FAFC' },
  phoneRow: { flexDirection: 'row', gap: 8 },
  otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  primaryBtn: { backgroundColor: MuzTalkColors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14, justifyContent: 'center', marginTop: 18 },
  secondaryBtnText: { color: MuzTalkColors.secondary, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  errorBox: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, padding: 10, marginBottom: 8 },
  errorText: { color: '#B91C1C', fontSize: 13 },
  devOtpBanner: { backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginBottom: 8 },
  devOtpText: { color: '#065F46', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  divider: { height: 1, backgroundColor: MuzTalkColors.borderLight, marginVertical: 18 },
  helperLabel: { fontSize: 12, color: MuzTalkColors.mutedText, marginBottom: 8 },
  demoBtn: { flex: 1, borderWidth: 1, borderColor: MuzTalkColors.borderLight, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  demoBtnText: { fontSize: 13, fontWeight: '600', color: MuzTalkColors.secondary },
});
