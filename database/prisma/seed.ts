import 'dotenv/config';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must be configured as a MySQL 8 connection string (mysql://...)');
  }

  const connection = await mysql.createConnection(databaseUrl);
  console.log('Seeding MuzTalk MySQL 8 database...');

  try {
    const superAdminRoleId = uuidv4();
    const modRoleId = uuidv4();

    await connection.execute(
      `INSERT IGNORE INTO admin_roles (id, name, permissions) VALUES (?, ?, ?)`,
      [superAdminRoleId, 'SUPER_ADMIN', JSON.stringify(['users:manage', 'reports:resolve', 'system:read', 'config:write', 'audit:read'])]
    );
    await connection.execute(
      `INSERT IGNORE INTO admin_roles (id, name, permissions) VALUES (?, ?, ?)`,
      [modRoleId, 'MODERATOR', JSON.stringify(['users:read', 'reports:resolve', 'audit:read'])]
    );

    const packId = 'pack-muztalk-essentials';
    await connection.execute(
      `INSERT IGNORE INTO sticker_packs (id, title, author, is_official) VALUES (?, ?, ?, ?)`,
      [packId, 'MuzTalk Essentials', 'MuzTech Studio', true]
    );

    const stickerItems = [
      { id: 'stk-wave', label: 'Salam / Wave', emojiTag: '👋', imageUrl: '/stickers/wave.svg' },
      { id: 'stk-fire', label: 'Awesome', emojiTag: '🔥', imageUrl: '/stickers/fire.svg' },
      { id: 'stk-heart', label: 'Appreciate', emojiTag: '💚', imageUrl: '/stickers/heart.svg' },
      { id: 'stk-check', label: 'Approved', emojiTag: '✅', imageUrl: '/stickers/check.svg' },
    ];

    for (const s of stickerItems) {
      await connection.execute(
        `INSERT IGNORE INTO stickers (id, pack_id, label, emoji_tag, image_url, is_animated) VALUES (?, ?, ?, ?, ?, ?)`,
        [s.id, packId, s.label, s.emojiTag, s.imageUrl, false]
      );
    }

    console.log('MySQL 8 seed completed.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
