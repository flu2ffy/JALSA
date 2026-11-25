-- Zanko category grouping and optional second-answer media.
-- The Preview Worker applies these columns lazily on first Zanko content request.
ALTER TABLE game_categories ADD COLUMN group_en TEXT NOT NULL DEFAULT '';
ALTER TABLE game_categories ADD COLUMN group_ar TEXT NOT NULL DEFAULT '';
ALTER TABLE game_questions ADD COLUMN answer_media_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE game_questions ADD COLUMN answer_media_url TEXT;

UPDATE game_categories SET group_en=CASE WHEN id IN ('cartoon','disney') THEN 'Movies' WHEN id IN ('biology','physics','math') THEN 'Science' WHEN id='music' THEN 'Music' ELSE 'Other' END WHERE COALESCE(group_en,'')='';
UPDATE game_categories SET group_ar=CASE WHEN id IN ('cartoon','disney') THEN 'أفلام' WHEN id IN ('biology','physics','math') THEN 'العلوم' WHEN id='music' THEN 'الموسيقى' ELSE 'أخرى' END WHERE COALESCE(group_ar,'')='';
