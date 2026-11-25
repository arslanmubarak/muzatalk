package com.muztech.muztalk.crypto;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Hardware-backed Android Keystore AES-256-GCM encrypted file vault.
 * Creates dedicated folders on the user's mobile device under MuzTalk/
 * and ensures all chat data, voice notes, and media files are written encrypted (.enc).
 */
public final class EncryptedFileVault {

    private static final String KEY_ALIAS = "muztalk_mobile_vault_aes256";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    public static final class VaultSummary {
        public final String rootPath;
        public final int encryptedFileCount;
        public final long totalEncryptedBytes;

        public VaultSummary(String rootPath, int encryptedFileCount, long totalEncryptedBytes) {
            this.rootPath = rootPath;
            this.encryptedFileCount = encryptedFileCount;
            this.totalEncryptedBytes = totalEncryptedBytes;
        }
    }

    private final File rootDir;
    private final File chatsDir;
    private final File voiceNotesDir;
    private final File imagesDir;
    private final File documentsDir;

    public EncryptedFileVault(Context context) {
        File appStorage = context.getExternalFilesDir(null);
        if (appStorage == null) {
            appStorage = context.getFilesDir();
        }
        this.rootDir = new File(appStorage, "MuzTalk");
        this.chatsDir = new File(rootDir, "Chats");
        this.voiceNotesDir = new File(rootDir, "Media/VoiceNotes");
        this.imagesDir = new File(rootDir, "Media/Images");
        this.documentsDir = new File(rootDir, "Media/Documents");

        ensureFoldersExist();
    }

    public void ensureFoldersExist() {
        rootDir.mkdirs();
        chatsDir.mkdirs();
        voiceNotesDir.mkdirs();
        imagesDir.mkdirs();
        documentsDir.mkdirs();
    }

    public File getRootDir() { return rootDir; }
    public File getChatsDir() { return chatsDir; }
    public File getVoiceNotesDir() { return voiceNotesDir; }
    public File getImagesDir() { return imagesDir; }
    public File getDocumentsDir() { return documentsDir; }

    private synchronized SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
        }
        KeyGenerator keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build();
        keyGen.init(spec);
        return keyGen.generateKey();
    }

    public void writeEncryptedBytes(File targetFile, byte[] plainData) throws Exception {
        ensureFoldersExist();
        if (targetFile.getParentFile() != null) {
            targetFile.getParentFile().mkdirs();
        }
        SecretKey key = getOrCreateSecretKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] iv = cipher.getIV();
        byte[] cipherText = cipher.doFinal(plainData);

        try (FileOutputStream fos = new FileOutputStream(targetFile)) {
            fos.write(ByteBuffer.allocate(4).putInt(iv.length).array());
            fos.write(iv);
            fos.write(cipherText);
            fos.flush();
        }
    }

    public byte[] readDecryptedBytes(File sourceFile) throws Exception {
        byte[] all = readAllBytes(sourceFile);
        if (all.length < 5) {
            throw new IllegalStateException("Corrupted encrypted file");
        }
        ByteBuffer buffer = ByteBuffer.wrap(all);
        int ivLen = buffer.getInt();
        if (ivLen <= 0 || ivLen > 32 || all.length < 4 + ivLen) {
            throw new IllegalStateException("Invalid encryption header");
        }
        byte[] iv = new byte[ivLen];
        buffer.get(iv);
        byte[] cipherText = new byte[buffer.remaining()];
        buffer.get(cipherText);

        SecretKey key = getOrCreateSecretKey();
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(cipherText);
    }

    public void writeEncryptedText(File targetFile, String text) throws Exception {
        writeEncryptedBytes(targetFile, text.getBytes(StandardCharsets.UTF_8));
    }

    public String readDecryptedText(File sourceFile) throws Exception {
        return new String(readDecryptedBytes(sourceFile), StandardCharsets.UTF_8);
    }

    public void encryptFileAndDeleteSource(File plainSource, File encryptedTarget) throws Exception {
        byte[] plainBytes = readAllBytes(plainSource);
        writeEncryptedBytes(encryptedTarget, plainBytes);
        if (plainSource.exists()) {
            plainSource.delete();
        }
    }

    public VaultSummary getSummary() {
        int[] stats = new int[1];
        long[] bytes = new long[1];
        walkCount(rootDir, stats, bytes);
        return new VaultSummary(rootDir.getAbsolutePath(), stats[0], bytes[0]);
    }

    public void clearAll() {
        deleteRecursively(rootDir);
        ensureFoldersExist();
    }

    private void walkCount(File dir, int[] count, long[] bytes) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File f : children) {
            if (f.isDirectory()) {
                walkCount(f, count, bytes);
            } else if (f.getName().endsWith(".enc")) {
                count[0]++;
                bytes[0] += f.length();
            }
        }
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }

    private byte[] readAllBytes(File file) throws Exception {
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int read;
            while ((read = fis.read(buf)) != -1) {
                bos.write(buf, 0, read);
            }
            return bos.toByteArray();
        }
    }
}
