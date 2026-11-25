package com.muztech.muztalk.crypto;

import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.spec.ECGenParameterSpec;

/**
 * Java E2EE key helper generating standard ECDH P-256 key pairs
 * and 30-digit SHA-256 safety verification fingerprints.
 */
public final class E2EEKeyHelper {

    public static final class KeyBundle {
        public final String identityKeyPub;
        public final String signedPreKeyPub;
        public final String signedPreKeySig;
        public final String fingerprint;

        public KeyBundle(String identityKeyPub, String signedPreKeyPub, String signedPreKeySig, String fingerprint) {
            this.identityKeyPub = identityKeyPub;
            this.signedPreKeyPub = signedPreKeyPub;
            this.signedPreKeySig = signedPreKeySig;
            this.fingerprint = fingerprint;
        }
    }

    private E2EEKeyHelper() {}

    public static KeyBundle generateKeyBundle() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));

        KeyPair identityPair = kpg.generateKeyPair();
        KeyPair preKeyPair = kpg.generateKeyPair();

        byte[] idPubBytes = identityPair.getPublic().getEncoded();
        byte[] prePubBytes = preKeyPair.getPublic().getEncoded();

        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        byte[] digest = sha256.digest(idPubBytes);

        StringBuilder fp = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            int high = digest[i * 2] & 0xFF;
            int low = digest[i * 2 + 1] & 0xFF;
            int block = ((high << 8) | low) % 90000 + 10000;
            if (i > 0) fp.append(" ");
            fp.append(block);
        }

        return new KeyBundle(
                Base64.encodeToString(idPubBytes, Base64.NO_WRAP),
                Base64.encodeToString(prePubBytes, Base64.NO_WRAP),
                Base64.encodeToString(digest, Base64.NO_WRAP),
                fp.toString()
        );
    }

    public static String sha256Hex(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
