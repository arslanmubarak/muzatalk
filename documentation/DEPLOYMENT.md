# MuzTalk Deployment Guide (MySQL 8 + Node.js + WebRTC + LiveKit)

## 1. Recommended Production Deployment (VPS + Docker Compose)

MuzTalk requires persistent WebSocket connections (Socket.IO), WebRTC STUN/TURN relay (Coturn UDP/TCP ports), LiveKit SFU for group calling, Redis for ephemeral presence/adapter state, and MySQL 8.0+ as the sole primary relational database.

```bash
# 1. Copy and configure production secrets
cp .env.example .env

# 2. Launch MySQL 8, Redis, Coturn, LiveKit, MuzTalk App, and Nginx
docker compose up -d --build

# 3. Verify health endpoint
curl http://localhost/api/health
```

## 2. cPanel / Shared Hosting Compatibility & Limitations

- **Compatible**: MySQL 8.0 databases and static Admin Dashboard builds (`npm run build`) can run on standard cPanel shared hosting.
- **Incompatible / Limitations**: Standard shared cPanel hosting generally kills persistent long-lived Node.js daemons, restricts WebSocket upgrades, blocks UDP port ranges (`50000-60000`) needed by LiveKit SFU, and cannot run native Coturn TURN servers.
- **Recommended Alternative**: Deploy the Node.js + Socket.IO backend, Redis, Coturn, and LiveKit on an Ubuntu 24.04 VPS (e.g. DigitalOcean, Hetzner, AWS EC2) behind Nginx + Let's Encrypt HTTPS, optionally connecting to managed MySQL 8 or local Docker MySQL 8.

## 3. Android APK / AAB Build

```bash
cd mobile
npm install
npx eas-cli build --platform android --profile preview   # APK
npx eas-cli build --platform android --profile production # Play Store AAB
```
