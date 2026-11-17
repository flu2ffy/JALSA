-- JALSA V1.7 profile, feedback, moderation, and editable game-content features.
-- Apply once to each target database after V1.6 migration 0002.

ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN avatar_data_url TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN banned_at TEXT;
ALTER TABLE users ADD COLUMN banned_reason TEXT;

CREATE TABLE feedback (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_status ON feedback(status, created_at DESC);

CREATE TABLE game_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  image_url TEXT,
  icon TEXT NOT NULL DEFAULT '🎯',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_game_categories_sort ON game_categories(sort_order, name_en);

CREATE TABLE game_questions (
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
CREATE INDEX idx_game_questions_game_category ON game_questions(game_type, category_id, difficulty);
CREATE INDEX idx_game_questions_game_type ON game_questions(game_type, created_at DESC);

INSERT INTO d1_migrations (name) VALUES ('0003_v17_dashboard.sql');
