CREATE TABLE IF NOT EXISTS remote_rooms (
  room_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL DEFAULT '{}',
  controller_id TEXT,
  command_seq INTEGER NOT NULL DEFAULT 0,
  command_json TEXT,
  last_command_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_remote_rooms_expiry ON remote_rooms(expires_at);
CREATE INDEX IF NOT EXISTS idx_remote_rooms_host ON remote_rooms(host_user_id, created_at);
