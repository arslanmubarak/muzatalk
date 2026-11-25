import * as Crypto from 'expo-crypto';
import { mobileApi } from './api';

export async function generateAndRegisterMobileKeys(): Promise<string> {
  const randomSeed = Crypto.getRandomBytes(32);
  const hexSeed = Array.from(randomSeed)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hexSeed);
  const blocks: string[] = [];
  for (let i = 0; i < 6; i++) {
    const chunk = parseInt(digest.slice(i * 4, i * 4 + 4), 16) % 90000 + 10000;
    blocks.push(String(chunk));
  }
  const fingerprint = blocks.join(' ');

  await mobileApi.registerEncryptionKeys({
    identityKeyPub: digest,
    signedPreKeyPub: hexSeed.slice(0, 64),
    signedPreKeySig: digest.slice(0, 64),
    fingerprint,
  });

  return fingerprint;
}
