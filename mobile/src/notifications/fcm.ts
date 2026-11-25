import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerAndroidFcmChannels(apiBaseUrl: string, accessToken: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Incoming Audio & Video Calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 300, 500],
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const pushToken = await Notifications.getDevicePushTokenAsync();
  await fetch(`${apiBaseUrl}/api/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ fcmToken: String(pushToken.data), platform: 'android' }),
  });
  return pushToken.data;
}
