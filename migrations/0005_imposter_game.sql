-- Imposter multiplayer game and editable word bank.
CREATE TABLE IF NOT EXISTS imposter_words (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  word_en TEXT NOT NULL,
  word_ar TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imposter_words_category ON imposter_words(category, word_en);

CREATE TABLE IF NOT EXISTS imposter_rooms (
  room_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_imposter_rooms_host ON imposter_rooms(host_user_id, created_at);
