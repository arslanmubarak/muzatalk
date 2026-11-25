import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { mobileApi } from '../services/api';
import { MuzTalkColors } from '../theme/tokens';

export function UserAvatar({
  src,
  name,
  size = 46,
  isOnline,
}: {
  src?: string | null;
  name: string;
  size?: number;
  isOnline?: boolean;
}) {
  const resolved = mobileApi.resolveUrl(src);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {resolved ? (
        <Image
          source={{ uri: resolved }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E2E8F0' }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.initials, { fontSize: Math.max(12, size * 0.34) }]}>
            {initials || 'MT'}
          </Text>
        </View>
      )}
      {isOnline && (
        <View
          style={[
            styles.dot,
            {
              width: Math.max(10, size * 0.24),
              height: Math.max(10, size * 0.24),
              borderRadius: 999,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: MuzTalkColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: MuzTalkColors.accent,
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: MuzTalkColors.primary,
    borderWidth: 2,
    borderColor: MuzTalkColors.white,
  },
});
