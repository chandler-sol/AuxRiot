-- Services (mixing, mastering, custom beats…) and stream-only work samples.
CREATE TABLE services (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id),
	category TEXT NOT NULL,                 -- mixing | mastering | custom_beat | vocal_mix | feature
	title TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	price_from_cents INTEGER NOT NULL,
	turnaround_days INTEGER NOT NULL,
	revisions INTEGER NOT NULL DEFAULT 1,
	status TEXT NOT NULL DEFAULT 'active',   -- active | paused | removed
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX services_user ON services(user_id, status);
CREATE INDEX services_category ON services(category, status, updated_at);

-- Samples stream like battle beats (2:00 max, never downloadable). Mixing/mastering can pair a "before" with the "after".
CREATE TABLE service_samples (
	id TEXT PRIMARY KEY,
	service_id TEXT NOT NULL REFERENCES services(id),
	title TEXT NOT NULL,
	audio_key TEXT NOT NULL,       -- the finished / "after" version
	duration_ms INTEGER NOT NULL,
	peaks TEXT NOT NULL,
	before_key TEXT,               -- optional raw / "before" version
	before_duration_ms INTEGER,
	before_peaks TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX service_samples_service ON service_samples(service_id, created_at);

-- Quote requests reuse private messaging: one thread per buyer per service.
ALTER TABLE conversations ADD COLUMN service_id TEXT REFERENCES services(id);
CREATE UNIQUE INDEX conversations_service_buyer ON conversations(service_id, buyer_id) WHERE service_id IS NOT NULL;

-- Signed up to offer services (engineers who may not battle).
ALTER TABLE users ADD COLUMN provider INTEGER NOT NULL DEFAULT 0;
