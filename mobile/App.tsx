import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useMuzTalkStore } from './src/store/useMuzTalkStore';
import { mobileApi } from './src/services/api';
import { connectMobileSocket, disconnectMobileSocket } from './src/services/socket';
import { registerAndroidFcmChannels } from './src/notifications/fcm';
import { generateAndRegisterMobileKeys } from './src/services/e2ee';
import { useWebRTCMobile } from './src/calling/useWebRTCMobile';
import { AppNavigator } from './src/navigation/AppNavigator';
import { OnboardingAuthScreen } from './src/screens/OnboardingAuthScreen';
import { IncomingCallModal } from './src/components/IncomingCallModal';

export default function App() {
  const { accessToken, currentUser, serverUrl, setCurrentUser, hydrateSession } = useMuzTalkStore();
  const webrtc = useWebRTCMobile();

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!accessToken) {
      disconnectMobileSocket();
      return;
    }

    if (!currentUser) {
      mobileApi.getMe().then((r) => setCurrentUser(r.user)).catch(() => {});
    }

    connectMobileSocket();
    registerAndroidFcmChannels(serverUrl, accessToken).catch(() => {});

    if (currentUser && !currentUser.encryptionFingerprint) {
      generateAndRegisterMobileKeys()
        .then((fp) => setCurrentUser({ ...currentUser, encryptionFingerprint: fp }))
        .catch(() => {});
    }
  }, [accessToken, currentUser, serverUrl, setCurrentUser]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {currentUser ? (
        <NavigationContainer>
          <AppNavigator />
          <IncomingCallModal
            call={webrtc.activeCall}
            onAccept={webrtc.acceptCall}
            onReject={webrtc.rejectCall}
            onHangup={webrtc.hangupCall}
            onToggleMute={webrtc.toggleMute}
            onToggleVideo={webrtc.toggleVideo}
            onSwitchCamera={webrtc.switchCamera}
            onToggleSpeaker={webrtc.toggleSpeaker}
          />
        </NavigationContainer>
      ) : (
        <OnboardingAuthScreen />
      )}
    </SafeAreaProvider>
  );
}
