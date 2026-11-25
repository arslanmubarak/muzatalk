# MuzTalk Android App (`com.muztech.muztalk`)

React Native + Expo + TypeScript Android application connected to the MuzTalk Express + MySQL 8 + Socket.IO backend.

## Features Implemented
- **Onboarding & OTP Auth (`OnboardingAuthScreen.tsx`)**: Country code + phone OTP verification, SecureStore token persistence, configurable backend server URL, and dev preview quick login.
- **5-Tab Thumb Navigation (`AppNavigator.tsx`)**: Chats, Updates, Communities, Calls, and Settings.
- **Real-Time Messaging (`ChatThreadScreen.tsx`)**: Socket.IO messaging with offline queue, delivery/read ticks, reply quotes, emoji reactions, copy/delete, `expo-image-picker` photos, `expo-document-picker` documents, and `expo-av` voice note recording & playback.
- **WebRTC Calling (`useWebRTCMobile.ts`, `IncomingCallModal.tsx`)**: Real `react-native-webrtc` audio/video calls with front/back camera switching, mic mute, speaker toggle, and STUN/TURN ICE config.
- **24-Hour Statuses, Communities & E2EE**: Full status creation/viewer, communities & announcement groups, FCM notification channel setup (`fcm.ts`), and `expo-crypto` identity key rotation.

## Running & Building APK / AAB

```bash
cd mobile
npm install

# Run on connected Android device or emulator (requires native development build for react-native-webrtc)
npx expo prebuild --platform android
npx expo run:android

# Or build cloud APK / Play Store AAB with EAS
npm run build:apk
npm run build:aab
```
