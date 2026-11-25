# MuzTalk Android Studio Project (`com.muztech.muztalk`)

Native Android application built for **Android SDK 36 (Android 16)** in **Kotlin** (Jetpack Compose, Material 3, Retrofit 2, Socket.IO, WebRTC, EncryptedSharedPreferences) and **Java** (`EncryptedFileVault.java` & `E2EEKeyHelper.java`).

## Architecture (Android App + Web Admin Panel)

- **Compile & Target SDK**: `36` (`compileSdk = 36`, `targetSdk = 36`)
- **Encrypted Mobile Device Folder Storage (`EncryptedFileVault.java`)**:
  - Creates dedicated folders inside the user's mobile device storage (`MuzTalk/Chats/`, `MuzTalk/Media/VoiceNotes/`, `MuzTalk/Media/Images/`, `MuzTalk/Media/Documents/`).
  - Encrypts **all** stored files (`.enc`) using hardware-backed **Android Keystore AES-256-GCM** with random IVs and GCM authentication tags.
- **Backend & Admin Panel URLs**:
  - Default API URL (`BuildConfig.DEFAULT_BASE_URL`): `http://apimuzatalk.rrgindustry.com/`
  - Admin Panel URL (`BuildConfig.FRONTEND_URL`): `http://apimuzatalk.rrgindustry.com/`
  - Cleartext HTTP permitted via `res/xml/network_security_config.xml`
- **Firebase Cloud Messaging**: `app/google-services.json` (`project_id: muztalk-41f2a`) wired with `com.google.gms.google-services` and automatic FCM token registration to `/api/devices/register`.
- **Email & Username Authentication**: Sign in via SMTP Email OTP or `@username` + password (no Redis required; all settings managed from the Web Admin Panel).

## How to Open & Build in Android Studio

1. Open **Android Studio** (Meerkat / Narwhal or newer with Android SDK 36 installed).
2. Set **Gradle JDK** to **JDK 17** or **JDK 21 (`jbr-21`)** (do **not** use JDK 25 — Gradle 8.11.1 throws `Unsupported class file major version 69` on JDK 25):
   - Go to **File > Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK** and select **17** or **jbr-21**.
3. Select **File > Open** and choose the `/android` folder.
4. Wait for Gradle Sync (`google-services.json` is already inside `android/app/`).
5. Run on an Android device/emulator or build APK/AAB via **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
