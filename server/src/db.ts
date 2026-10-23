import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'messenger.db');
export const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      avatar_url TEXT,
      auth_provider TEXT DEFAULT 'local',
      provider_id TEXT,
      status_text TEXT DEFAULT '',
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
      name TEXT,
      avatar_url TEXT,
      created_by TEXT,
      pinned_message_id TEXT,
      is_saved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file', 'voice')),
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      voice_duration REAL,
      reply_to_id TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);
  `);

  try {
    db.exec(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN provider_id TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN pinned_message_id TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN is_saved INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN is_channel INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN description TEXT DEFAULT '';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversation_members ADD COLUMN last_read_at DATETIME;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversation_members ADD COLUMN is_pinned INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversation_members ADD COLUMN is_muted INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE conversation_members ADD COLUMN is_archived INTEGER DEFAULT 0;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE users ADD COLUMN theme_settings TEXT DEFAULT '';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE messages ADD COLUMN voice_duration REAL;`);
  } catch {}

  // Migrate messages table check constraint if needed
  try {
    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'").get() as any)?.sql || '';
    if (tableSql && !tableSql.includes("'voice'")) {
      db.exec(`
        PRAGMA foreign_keys=OFF;
        CREATE TABLE messages_migration (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          text TEXT NOT NULL,
          type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file', 'voice')),
          file_url TEXT,
          file_name TEXT,
          file_size INTEGER,
          voice_duration REAL,
          reply_to_id TEXT,
          is_deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
        );
        INSERT INTO messages_migration (id, conversation_id, sender_id, text, type, file_url, file_name, file_size, reply_to_id, is_deleted, created_at, updated_at)
          SELECT id, conversation_id, sender_id, text, type, file_url, file_name, file_size, reply_to_id, is_deleted, created_at, updated_at FROM messages;
        DROP TABLE messages;
        ALTER TABLE messages_migration RENAME TO messages;
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
        PRAGMA foreign_keys=ON;
      `);
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}
