-- V1.7 price-game reset: remove the old JOD/emoji product bank.
-- Apply to Preview first. Apply to Production only as part of the approved V1.7 release.

DELETE FROM game_questions WHERE game_type = 'price';

INSERT INTO d1_migrations (name)
SELECT '0004_price_usd_media_storage.sql'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0004_price_usd_media_storage.sql'
);
