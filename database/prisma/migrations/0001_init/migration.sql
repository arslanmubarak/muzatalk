-- ============================================================================
-- MuzTalk MySQL 8.0+ Initial Migration (0001_init)
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `phone_number` VARCHAR(24) NOT NULL,
  `country_code` VARCHAR(8) NOT NULL,
  `email` VARCHAR(160) NULL,
  `username` VARCHAR(40) NULL,
  `password_hash` VARCHAR(255) NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  `is_online` BOOLEAN NOT NULL DEFAULT FALSE,
  `last_seen_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `users_phone_number_key` (`phone_number`),
  UNIQUE INDEX `users_email_key` (`email`),
  UNIQUE INDEX `users_username_key` (`username`),
  INDEX `users_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `about` VARCHAR(255) NULL,
  `avatar_url` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_profiles_user_id_key` (`user_id`),
  CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_devices` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `device_name` VARCHAR(120) NOT NULL,
  `platform` VARCHAR(32) NOT NULL,
  `device_token` VARCHAR(128) NOT NULL,
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE,
  `last_active_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_devices_device_token_key` (`device_token`),
  INDEX `user_devices_user_id_idx` (`user_id`),
  CONSTRAINT `user_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `device_id` CHAR(36) NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `refresh_tokens_token_hash_key` (`token_hash`),
  INDEX `refresh_tokens_user_id_idx` (`user_id`),
  INDEX `refresh_tokens_expires_at_idx` (`expires_at`),
  CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `refresh_tokens_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `user_devices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contacts` (
  `id` CHAR(36) NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `contact_user_id` CHAR(36) NOT NULL,
  `alias_name` VARCHAR(100) NULL,
  `is_favorite` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `contacts_owner_id_contact_user_id_key` (`owner_id`, `contact_user_id`),
  CONSTRAINT `contacts_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `contacts_contact_user_id_fkey` FOREIGN KEY (`contact_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversations` (
  `id` CHAR(36) NOT NULL,
  `type` ENUM('DIRECT', 'GROUP', 'COMMUNITY_ANNOUNCEMENT') NOT NULL DEFAULT 'DIRECT',
  `last_message_id` CHAR(36) NULL,
  `last_message_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `conversations_last_message_at_idx` (`last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_members` (
  `id` CHAR(36) NOT NULL,
  `conversation_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `is_pinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_archived` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_muted` BOOLEAN NOT NULL DEFAULT FALSE,
  `muted_until` DATETIME(3) NULL,
  `unread_count` INT NOT NULL DEFAULT 0,
  `last_read_at` DATETIME(3) NULL,
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `conversation_members_conversation_id_user_id_key` (`conversation_id`, `user_id`),
  INDEX `conversation_members_user_id_is_archived_is_pinned_idx` (`user_id`, `is_archived`, `is_pinned`),
  CONSTRAINT `conversation_members_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conversation_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` CHAR(36) NOT NULL,
  `client_message_id` VARCHAR(64) NULL,
  `conversation_id` CHAR(36) NOT NULL,
  `sender_id` CHAR(36) NOT NULL,
  `type` ENUM('TEXT','IMAGE','VIDEO','AUDIO','VOICE_NOTE','DOCUMENT','STICKER','GIF','LOCATION','CONTACT','SYSTEM') NOT NULL DEFAULT 'TEXT',
  `ciphertext` TEXT NULL,
  `preview_text` VARCHAR(500) NULL,
  `reply_to_id` CHAR(36) NULL,
  `forwarded_from_id` CHAR(36) NULL,
  `is_starred` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_pinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_edited` BOOLEAN NOT NULL DEFAULT FALSE,
  `edited_at` DATETIME(3) NULL,
  `deleted_for_all_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `messages_client_message_id_key` (`client_message_id`),
  INDEX `messages_conversation_id_created_at_idx` (`conversation_id`, `created_at`),
  CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_receipts` (
  `id` CHAR(36) NOT NULL,
  `message_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `status` ENUM('SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'SENT',
  `delivered_at` DATETIME(3) NULL,
  `read_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `message_receipts_message_id_user_id_key` (`message_id`, `user_id`),
  CONSTRAINT `message_receipts_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `message_receipts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_reactions` (
  `id` CHAR(36) NOT NULL,
  `message_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `message_reactions_message_id_user_id_emoji_key` (`message_id`, `user_id`, `emoji`),
  CONSTRAINT `message_reactions_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `message_reactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_files` (
  `id` CHAR(36) NOT NULL,
  `uploader_id` CHAR(36) NOT NULL,
  `storage_key` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `thumbnail_url` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `media_files_storage_key_key` (`storage_key`),
  CONSTRAINT `media_files_uploader_id_fkey` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_attachments` (
  `id` CHAR(36) NOT NULL,
  `message_id` CHAR(36) NOT NULL,
  `media_file_id` CHAR(36) NOT NULL,
  `caption` VARCHAR(500) NULL,
  `duration_ms` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `message_attachments_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `message_attachments_media_file_id_fkey` FOREIGN KEY (`media_file_id`) REFERENCES `media_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `groups` (
  `id` CHAR(36) NOT NULL,
  `conversation_id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `avatar_url` VARCHAR(512) NULL,
  `only_admins_post` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `groups_conversation_id_key` (`conversation_id`),
  CONSTRAINT `groups_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `group_members` (
  `id` CHAR(36) NOT NULL,
  `group_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `group_members_group_id_user_id_key` (`group_id`, `user_id`),
  CONSTRAINT `group_members_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `group_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `group_invites` (
  `id` CHAR(36) NOT NULL,
  `group_id` CHAR(36) NOT NULL,
  `invite_code` VARCHAR(32) NOT NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `group_invites_invite_code_key` (`invite_code`),
  CONSTRAINT `group_invites_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `communities` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `avatar_url` VARCHAR(512) NULL,
  `invite_code` VARCHAR(32) NOT NULL,
  `created_by_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `communities_invite_code_key` (`invite_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `community_groups` (
  `id` CHAR(36) NOT NULL,
  `community_id` CHAR(36) NOT NULL,
  `group_id` CHAR(36) NOT NULL,
  `is_announcement` BOOLEAN NOT NULL DEFAULT FALSE,
  `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `community_groups_community_id_group_id_key` (`community_id`, `group_id`),
  CONSTRAINT `community_groups_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `community_groups_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `statuses` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `type` ENUM('TEXT', 'IMAGE', 'VIDEO') NOT NULL DEFAULT 'TEXT',
  `content_text` VARCHAR(700) NULL,
  `media_url` VARCHAR(512) NULL,
  `bg_color` VARCHAR(24) NULL,
  `caption` VARCHAR(300) NULL,
  `privacy_mode` ENUM('CONTACTS', 'EXCEPT_SELECTED', 'ONLY_SELECTED') NOT NULL DEFAULT 'CONTACTS',
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `statuses_user_id_expires_at_idx` (`user_id`, `expires_at`),
  CONSTRAINT `statuses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `status_views` (
  `id` CHAR(36) NOT NULL,
  `status_id` CHAR(36) NOT NULL,
  `viewer_id` CHAR(36) NOT NULL,
  `viewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `status_views_status_id_viewer_id_key` (`status_id`, `viewer_id`),
  CONSTRAINT `status_views_status_id_fkey` FOREIGN KEY (`status_id`) REFERENCES `statuses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `status_views_viewer_id_fkey` FOREIGN KEY (`viewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `status_reactions` (
  `id` CHAR(36) NOT NULL,
  `status_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `status_reactions_status_id_user_id_key` (`status_id`, `user_id`),
  CONSTRAINT `status_reactions_status_id_fkey` FOREIGN KEY (`status_id`) REFERENCES `statuses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `status_reactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `calls` (
  `id` CHAR(36) NOT NULL,
  `conversation_id` CHAR(36) NULL,
  `initiator_id` CHAR(36) NOT NULL,
  `type` ENUM('AUDIO', 'VIDEO', 'GROUP_AUDIO', 'GROUP_VIDEO') NOT NULL DEFAULT 'AUDIO',
  `status` ENUM('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'RINGING',
  `livekit_room` VARCHAR(128) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `answered_at` DATETIME(3) NULL,
  `ended_at` DATETIME(3) NULL,
  `duration_sec` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `calls_initiator_id_started_at_idx` (`initiator_id`, `started_at`),
  CONSTRAINT `calls_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `calls_initiator_id_fkey` FOREIGN KEY (`initiator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `call_participants` (
  `id` CHAR(36) NOT NULL,
  `call_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `joined_at` DATETIME(3) NULL,
  `left_at` DATETIME(3) NULL,
  `is_muted` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_video_on` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `call_participants_call_id_user_id_key` (`call_id`, `user_id`),
  CONSTRAINT `call_participants_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `calls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `call_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `call_events` (
  `id` CHAR(36) NOT NULL,
  `call_id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NOT NULL,
  `event_type` VARCHAR(48) NOT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `call_events_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `calls` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sticker_packs` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `author` VARCHAR(80) NOT NULL,
  `is_official` BOOLEAN NOT NULL DEFAULT TRUE,
  `cover_url` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stickers` (
  `id` CHAR(36) NOT NULL,
  `pack_id` CHAR(36) NOT NULL,
  `label` VARCHAR(64) NOT NULL,
  `emoji_tag` VARCHAR(16) NOT NULL,
  `image_url` VARCHAR(512) NOT NULL,
  `is_animated` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `stickers_pack_id_fkey` FOREIGN KEY (`pack_id`) REFERENCES `sticker_packs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blocked_users` (
  `id` CHAR(36) NOT NULL,
  `blocker_id` CHAR(36) NOT NULL,
  `blocked_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `blocked_users_blocker_id_blocked_id_key` (`blocker_id`, `blocked_id`),
  CONSTRAINT `blocked_users_blocker_id_fkey` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `blocked_users_blocked_id_fkey` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
  `id` CHAR(36) NOT NULL,
  `reporter_id` CHAR(36) NOT NULL,
  `reported_user_id` CHAR(36) NOT NULL,
  `reason` VARCHAR(120) NOT NULL,
  `details` VARCHAR(1000) NULL,
  `status` ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
  `resolved_by_id` CHAR(36) NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `reports_reporter_id_fkey` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reports_reported_user_id_fkey` FOREIGN KEY (`reported_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `category` VARCHAR(48) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `body` VARCHAR(500) NOT NULL,
  `deep_link` VARCHAR(255) NULL,
  `read_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_devices` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `fcm_token` VARCHAR(512) NOT NULL,
  `platform` VARCHAR(24) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notification_devices_fcm_token_key` (`fcm_token`),
  CONSTRAINT `notification_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_settings` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `theme` VARCHAR(16) NOT NULL DEFAULT 'system',
  `language` VARCHAR(16) NOT NULL DEFAULT 'en',
  `last_seen_visibility` VARCHAR(24) NOT NULL DEFAULT 'everyone',
  `avatar_visibility` VARCHAR(24) NOT NULL DEFAULT 'everyone',
  `about_visibility` VARCHAR(24) NOT NULL DEFAULT 'everyone',
  `read_receipts` BOOLEAN NOT NULL DEFAULT TRUE,
  `message_alerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `group_alerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `call_alerts` BOOLEAN NOT NULL DEFAULT TRUE,
  `auto_download_media` BOOLEAN NOT NULL DEFAULT TRUE,
  `chat_wallpaper` VARCHAR(64) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_settings_user_id_key` (`user_id`),
  CONSTRAINT `user_settings_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `encryption_keys` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `device_id` VARCHAR(64) NOT NULL,
  `identity_key_pub` TEXT NOT NULL,
  `signed_pre_key_pub` TEXT NOT NULL,
  `signed_pre_key_sig` TEXT NOT NULL,
  `fingerprint` VARCHAR(128) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `encryption_keys_user_id_device_id_key` (`user_id`, `device_id`),
  CONSTRAINT `encryption_keys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_roles` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(48) NOT NULL,
  `permissions` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `admin_roles_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(160) NOT NULL,
  `display_name` VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `last_login_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `admin_users_email_key` (`email`),
  CONSTRAINT `admin_users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` CHAR(36) NOT NULL,
  `admin_user_id` CHAR(36) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(48) NOT NULL,
  `target_id` VARCHAR(64) NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `audit_logs_admin_user_id_created_at_idx` (`admin_user_id`, `created_at`),
  CONSTRAINT `audit_logs_admin_user_id_fkey` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_configs` (
  `id` CHAR(36) NOT NULL,
  `config_key` VARCHAR(64) NOT NULL,
  `config_value` JSON NOT NULL,
  `updated_by` VARCHAR(160) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `system_configs_config_key_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
