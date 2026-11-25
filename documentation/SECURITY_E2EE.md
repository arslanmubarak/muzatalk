# MuzTalk Privacy, End-to-End Encryption & Security Architecture

## 1. End-to-End Encryption Design
- **Key Generation**: Client devices generate standard ECDH P-256 identity and signed prekey pairs using `window.crypto.subtle` (Web) or native Signal Protocol / LibSignal bindings (Android).
- **Zero Server Plaintext Access**: Administrators and backend services never receive decrypted private message contents in Admin Console endpoints.
- **Safety Fingerprints**: Users can inspect and verify their 30-digit SHA-256 identity key fingerprint and rotate device keys from Settings or any Chat Header.

## 2. Security Implications of Backups, Groups & Linked Devices
- **Chat Backups**: Exporting chat backups creates a client-side JSON archive. For cloud backups, backups should be encrypted with a user-held passphrase or recovery key before upload so server storage never holds plaintext archives.
- **Group Messaging**: In group conversations, sender keys or pairwise sessions distribute keys to all current group members. When a participant is removed or leaves, clients must rotate the group sender key so removed members cannot decrypt future messages.
- **Linked Devices**: Each linked device (`user_devices` + `encryption_keys`) maintains its own key pair and refresh token. Revoking a linked device immediately invalidates its refresh token and removes its public key bundle from future fan-out.

## 3. Transport, Auth & Storage Safeguards
- Short-lived JWT access tokens + rotating SHA-256-hashed refresh tokens.
- Helmet security headers, Zod schema validation on all REST & Socket.IO payloads, and rate limiting on OTP/auth endpoints.
- Parameterized prepared MySQL 8 queries (`mysql2` / Prisma) preventing SQL injection.
- Path-confined media serving with HMAC-signed time-limited URLs (`/api/media/:id?exp=...&sig=...`).
