export interface Migration {
  version: number;
  name: string;
  up: (isPostgres: boolean) => string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (isPostgres: boolean) => {
      const serialType = isPostgres ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
      const timestampType = isPostgres ? 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

      return [
        // 1. Users table
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          password_hash TEXT,
          avatar_url TEXT,
          auth_provider TEXT DEFAULT 'local',
          provider_id TEXT,
          status_text TEXT DEFAULT '',
          bio TEXT DEFAULT '',
          theme_settings TEXT DEFAULT '',
          last_seen ${timestampType},
          created_at ${timestampType}
        );`,

        // 2. Conversations table
        `CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
          name TEXT,
          avatar_url TEXT,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          pinned_message_id TEXT,
          is_saved INTEGER DEFAULT 0,
          is_channel INTEGER DEFAULT 0,
          description TEXT DEFAULT '',
          created_at ${timestampType},
          updated_at ${timestampType}
        );`,

        // 3. Conversation members table
        `CREATE TABLE IF NOT EXISTS conversation_members (
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT DEFAULT 'member',
          is_pinned INTEGER DEFAULT 0,
          is_muted INTEGER DEFAULT 0,
          is_archived INTEGER DEFAULT 0,
          last_read_at ${timestampType},
          joined_at ${timestampType},
          PRIMARY KEY (conversation_id, user_id)
        );`,

        // 4. Messages table
        `CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file', 'voice')),
          file_url TEXT,
          file_name TEXT,
          file_size INTEGER,
          voice_duration REAL,
          reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          is_deleted INTEGER DEFAULT 0,
          seq BIGINT,
          client_message_id TEXT,
          created_at ${timestampType},
          updated_at ${timestampType}
        );`,

        // 5. Server metadata (stores server_epoch, schema versions, etc.)
        `CREATE TABLE IF NOT EXISTS server_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );`,

        // 6. Real-time delta sync events log
        `CREATE TABLE IF NOT EXISTS sync_events (
          seq ${serialType},
          user_id TEXT,
          conversation_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at ${timestampType}
        );`,

        // 7. Message reactions
        `CREATE TABLE IF NOT EXISTS reactions (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          created_at ${timestampType},
          UNIQUE(message_id, user_id, emoji)
        );`,

        // 8. Refresh tokens table (with hash, family_id for rotation, and revoke tracking)
        `CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          device_info TEXT DEFAULT '',
          ip_address TEXT DEFAULT '',
          family_id TEXT NOT NULL,
          is_revoked INTEGER DEFAULT 0,
          expires_at ${timestampType} NOT NULL,
          created_at ${timestampType},
          last_used_at ${timestampType}
        );`,

        // 9. Auth codes table for OAuth PKCE exchange
        `CREATE TABLE IF NOT EXISTS auth_codes (
          code TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_challenge TEXT NOT NULL,
          code_challenge_method TEXT DEFAULT 'S256',
          redirect_uri TEXT NOT NULL,
          expires_at ${timestampType} NOT NULL,
          used INTEGER DEFAULT 0,
          created_at ${timestampType}
        );`,

        // 10. Performance Indexes
        `CREATE INDEX IF NOT EXISTS idx_sync_events_seq ON sync_events(seq);`,
        `CREATE INDEX IF NOT EXISTS idx_sync_events_user ON sync_events(user_id, seq);`,
        `CREATE INDEX IF NOT EXISTS idx_sync_events_conv ON sync_events(conversation_id, seq);`,
        `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);`,
        `CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);`,
        `CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);`,
        `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`,
        `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);`,
        `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);`,
        `CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON auth_codes(code);`,
      ];
    },
  },
  {
    version: 2,
    name: '002_oauth_states_persistence',
    up: (isPostgres: boolean) => {
      const timestampType = isPostgres ? 'TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

      return [
        // 1. Pending OAuth States table (survives container restarts between redirect & callback)
        `CREATE TABLE IF NOT EXISTS oauth_states (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          client_state TEXT DEFAULT '',
          redirect_uri TEXT NOT NULL,
          code_challenge TEXT DEFAULT '',
          code_challenge_method TEXT DEFAULT 'S256',
          expires_at ${timestampType} NOT NULL,
          used INTEGER DEFAULT 0,
          created_at ${timestampType}
        );`,

        // 2. Indexes for fast lookup and cleanup
        `CREATE INDEX IF NOT EXISTS idx_oauth_states_id ON oauth_states(id);`,
        `CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);`,
      ];
    },
  },
];
