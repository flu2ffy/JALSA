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

-- Starter words; administrators can edit or remove these in the dashboard.
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-001','Fruit','Watermelon','بطيخ','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-002','Fruit','Pineapple','أناناس','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-003','Fruit','Strawberry','فراولة','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-004','Fruit','Mango','مانجو','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-005','Fruit','Orange','برتقال','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-006','Restaurant','McDonald''s','ماكدونالدز','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-007','Restaurant','Pizza Hut','بيتزا هت','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-008','Restaurant','KFC','كنتاكي','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-009','Restaurant','Shake Shack','شيك شاك','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-010','Restaurant','Starbucks','ستاربكس','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-011','Cars','Toyota Camry','تويوتا كامري','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-012','Cars','Tesla Model 3','تسلا موديل 3','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-013','Cars','Mercedes-Benz G-Class','مرسيدس جي كلاس','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-014','Cars','Porsche 911','بورش 911','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-015','Cars','Jeep Wrangler','جيب رانجلر','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-016','Electronics','iPhone','آيفون','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-017','Electronics','PlayStation 5','بلايستيشن 5','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-018','Electronics','AirPods','إيربودز','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-019','Electronics','Nintendo Switch','نينتندو سويتش','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-020','Electronics','MacBook','ماك بوك','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-021','Places','Airport','مطار','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-022','Places','Beach','شاطئ','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-023','Places','Cinema','سينما','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-024','Places','Shopping mall','مول','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-025','Places','Amusement park','مدينة ملاهي','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-026','Animals','Dolphin','دلفين','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-027','Animals','Penguin','بطريق','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-028','Animals','Giraffe','زرافة','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-029','Animals','Tiger','نمر','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO imposter_words (id,category,word_en,word_ar,created_at,updated_at) VALUES ('seed-030','Animals','Camel','جمل','2026-11-18T00:00:00.000Z','2026-11-18T00:00:00.000Z');
