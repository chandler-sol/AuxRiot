-- Multi-beat battles (best of 3 or 5) and overtime.
PRAGMA defer_foreign_keys = true;

-- Entries gain a round number. Round 1..N are the set; round N+1 is overtime.
-- UNIQUE(battle_id, slot, round) keeps "first to answer takes it" atomic for every round.
-- Rebuilt under its own name (not create-then-rename), so rows referencing
-- entries (store listings) find their parents again inside this migration.
CREATE TABLE entries_copy AS SELECT * FROM entries;
DROP TABLE entries;
CREATE TABLE entries (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	slot INTEGER NOT NULL,           -- 0 = creator, 1 = challenger
	round INTEGER NOT NULL DEFAULT 1,
	audio_key TEXT NOT NULL,
	duration_ms INTEGER NOT NULL,
	peaks TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	removed INTEGER NOT NULL DEFAULT 0,
	UNIQUE (battle_id, slot, round)
);
INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at, removed)
	SELECT id, battle_id, user_id, slot, 1, audio_key, duration_ms, peaks, created_at, removed FROM entries_copy;
DROP TABLE entries_copy;
CREATE INDEX entries_battle ON entries(battle_id, round, slot);
CREATE INDEX entries_user ON entries(user_id);

-- Battle format and overtime state.
ALTER TABLE battles ADD COLUMN rounds INTEGER NOT NULL DEFAULT 1;          -- 1, 3 or 5
ALTER TABLE battles ADD COLUMN ot_status TEXT;      -- offered | voting | done | declined
ALTER TABLE battles ADD COLUMN ot_mode TEXT;        -- tie | forced
ALTER TABLE battles ADD COLUMN ot_deadline INTEGER; -- battlers must both submit by then
ALTER TABLE battles ADD COLUMN ot_ends_at INTEGER;  -- overtime vote closes
ALTER TABLE battles ADD COLUMN base_result_json TEXT; -- the set's result before overtime

-- Per-round scores. A multi-beat ballot counts once every round is scored; the
-- votes row (weight, flags, overtime request) is written at that point.
CREATE TABLE round_votes (
	battle_id TEXT NOT NULL REFERENCES battles(id),
	voter_id TEXT NOT NULL REFERENCES users(id),
	round INTEGER NOT NULL,
	s0_drums INTEGER NOT NULL, s0_melody INTEGER NOT NULL, s0_mix INTEGER NOT NULL, s0_overall INTEGER NOT NULL,
	s1_drums INTEGER NOT NULL, s1_melody INTEGER NOT NULL, s1_mix INTEGER NOT NULL, s1_overall INTEGER NOT NULL,
	weight REAL NOT NULL DEFAULT 1,  -- used for overtime-round ballots (fair-play checks at save time)
	flags TEXT NOT NULL DEFAULT '',
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (battle_id, voter_id, round)
);
CREATE INDEX round_votes_voter ON round_votes(voter_id);

ALTER TABLE votes ADD COLUMN wants_ot INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('ot_margin', '0.1', 0);
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('judge_round_cap', '30', 0);
