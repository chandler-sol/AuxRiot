-- Fake accounts made by the beta seeding tools (/admin/seed). Never set on the live site.
ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
CREATE INDEX users_test ON users(is_test) WHERE is_test = 1;
