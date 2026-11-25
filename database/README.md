# MuzTalk MySQL 8 Database Architecture

MuzTalk uses **MySQL 8.0+** exclusively with **InnoDB** and **`utf8mb4_unicode_ci`** collation via **Prisma ORM**.

## Initial Setup

```bash
# 1. Create MySQL 8 database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS muztalk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Configure DATABASE_URL in .env
DATABASE_URL="mysql://muztalk_app:YOUR_PASSWORD@127.0.0.1:3306/muztalk"

# 3. Generate Prisma Client & Apply Migrations
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Normalized Tables (34 Models)
- **Identity & Auth**: `users`, `user_profiles`, `user_devices`, `refresh_tokens`, `encryption_keys`, `user_settings`
- **Social Graph & Privacy**: `contacts`, `blocked_users`, `reports`
- **Messaging & Media**: `conversations`, `conversation_members`, `messages`, `message_receipts`, `message_reactions`, `message_attachments`, `media_files`
- **Groups & Communities**: `groups`, `group_members`, `group_invites`, `communities`, `community_groups`
- **24h Status Updates**: `statuses`, `status_views`, `status_reactions`
- **WebRTC & LiveKit Calling**: `calls`, `call_participants`, `call_events`
- **Stickers & Notifications**: `sticker_packs`, `stickers`, `notifications`, `notification_devices`
- **Administration & Governance**: `admin_roles`, `admin_users`, `audit_logs`
