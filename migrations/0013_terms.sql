-- When the person agreed to the Terms/Privacy and confirmed they're 18+ (NULL for accounts made before the box existed).
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
