# Zanko content bank v2

This test branch adds 15 Zanko categories and 900 prompts.

- 14 categories have 30 text prompts and 30 image prompts each.
- Who Am I? has 60 country and landmark photo prompts.
- Image prompts use real source imagery. Wikimedia Commons items expose attribution/source links; Fortnite cosmetics use catalogue artwork.
- The Worker loads the JSON bank from static assets and seeds D1 with JSON1-backed inserts, avoiding multi-row bind parameter limits.
- The update is for Preview review only. Do not merge to Production until the site owner approves the preview.
