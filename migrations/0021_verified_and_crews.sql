-- Verified creators (streamers, known producers…) and the crews they bring.
ALTER TABLE users ADD COLUMN verified_label TEXT;      -- NULL = not verified; e.g. 'Streamer'
ALTER TABLE users ADD COLUMN verified_at INTEGER;
ALTER TABLE users ADD COLUMN crew_id TEXT REFERENCES users(id);   -- the verified creator this user reps
ALTER TABLE users ADD COLUMN crew_joined_at INTEGER;
CREATE INDEX users_crew ON users(crew_id) WHERE crew_id IS NOT NULL;
