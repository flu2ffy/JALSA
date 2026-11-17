CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  birth_date TEXT,
  avatar_data_url TEXT,
  last_login_at TEXT,
  banned_at TEXT,
  banned_reason TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'reset')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_email_created
  ON verification_codes(email, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);


CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  image_url TEXT,
  icon TEXT NOT NULL DEFAULT '🎯',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_categories_sort ON game_categories(sort_order, name_en);

CREATE TABLE IF NOT EXISTS game_questions (
  id TEXT PRIMARY KEY NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('zanko', 'price')),
  category_id TEXT REFERENCES game_categories(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question_en TEXT NOT NULL DEFAULT '',
  question_ar TEXT NOT NULL DEFAULT '',
  answer_en TEXT NOT NULL DEFAULT '',
  answer_ar TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'none' CHECK (media_type IN ('none', 'image', 'video', 'audio')),
  media_url TEXT,
  product_name_en TEXT,
  product_name_ar TEXT,
  product_emoji TEXT,
  price_value REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_questions_game_category ON game_questions(game_type, category_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_game_questions_game_type ON game_questions(game_type, created_at DESC);
