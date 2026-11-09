-- Core schema. All timestamps are unix epoch milliseconds.

CREATE TABLE users (
	id TEXT PRIMARY KEY,
	username TEXT NOT NULL UNIQUE COLLATE NOCASE,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT,              -- NULL for OAuth-only accounts (future)
	created_at INTEGER NOT NULL,
	is_admin INTEGER NOT NULL DEFAULT 0,
	shadowbanned INTEGER NOT NULL DEFAULT 0,
	wins INTEGER NOT NULL DEFAULT 0,
	losses INTEGER NOT NULL DEFAULT 0,
	ties INTEGER NOT NULL DEFAULT 0
);

-- Session id is stored hashed so a DB leak can't be replayed as cookies.
CREATE TABLE sessions (
	id_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Future OAuth (Google/Discord) links. Unused for now.
CREATE TABLE oauth_accounts (
	provider TEXT NOT NULL,
	provider_user_id TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	PRIMARY KEY (provider, provider_user_id)
);

-- Fraud signals: salted hashes of IPs and device cookies seen per account.
CREATE TABLE user_signals (
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,              -- 'ip' | 'device'
	value_hash TEXT NOT NULL,
	first_seen INTEGER NOT NULL,
	last_seen INTEGER NOT NULL,
	PRIMARY KEY (user_id, kind, value_hash)
);
CREATE INDEX user_signals_value ON user_signals(kind, value_hash);

CREATE TABLE battles (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	creator_id TEXT NOT NULL REFERENCES users(id),
	challenger_id TEXT REFERENCES users(id),
	status TEXT NOT NULL,            -- open | voting | closed | expired | removed
	vote_hours INTEGER NOT NULL,     -- 24 or 48
	created_at INTEGER NOT NULL,
	voting_started_at INTEGER,
	voting_ends_at INTEGER,
	winner_id TEXT,                  -- NULL on tie
	result_json TEXT
);
CREATE INDEX battles_status ON battles(status, created_at);
CREATE INDEX battles_voting_end ON battles(status, voting_ends_at);
CREATE INDEX battles_creator ON battles(creator_id);
CREATE INDEX battles_challenger ON battles(challenger_id);

CREATE TABLE entries (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	slot INTEGER NOT NULL,           -- 0 = creator, 1 = challenger
	audio_key TEXT NOT NULL,
	duration_ms INTEGER NOT NULL,
	peaks TEXT NOT NULL,             -- JSON array of 0..255 ints for the waveform
	created_at INTEGER NOT NULL,
	removed INTEGER NOT NULL DEFAULT 0,
	UNIQUE (battle_id, slot)         -- makes "first to respond takes it" atomic
);

-- Server-validated listening progress, used for the 75% listen-through rule.
CREATE TABLE listens (
	user_id TEXT NOT NULL,
	entry_id TEXT NOT NULL,
	first_at INTEGER NOT NULL,
	last_at INTEGER NOT NULL,
	listened_ms INTEGER NOT NULL,
	PRIMARY KEY (user_id, entry_id)
);

-- One ballot per voter per battle; scores are 1..5 per category per slot.
CREATE TABLE votes (
	battle_id TEXT NOT NULL REFERENCES battles(id),
	voter_id TEXT NOT NULL REFERENCES users(id),
	s0_drums INTEGER NOT NULL, s0_melody INTEGER NOT NULL, s0_mix INTEGER NOT NULL, s0_overall INTEGER NOT NULL,
	s1_drums INTEGER NOT NULL, s1_melody INTEGER NOT NULL, s1_mix INTEGER NOT NULL, s1_overall INTEGER NOT NULL,
	favored_user_id TEXT,            -- whoever this ballot scored higher (NULL on even)
	weight REAL NOT NULL DEFAULT 1,  -- silently reduced for suspicious ballots
	flags TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (battle_id, voter_id)
);
CREATE INDEX votes_voter ON votes(voter_id);

CREATE TABLE comments (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	body TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX comments_battle ON comments(battle_id, created_at);
CREATE INDEX comments_user ON comments(user_id, created_at);

CREATE TABLE reports (
	id TEXT PRIMARY KEY,
	reporter_id TEXT NOT NULL REFERENCES users(id),
	target_type TEXT NOT NULL,       -- user | battle | comment
	target_id TEXT NOT NULL,
	reason TEXT NOT NULL,
	details TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'open'  -- open | dismissed | actioned
);
CREATE INDEX reports_status ON reports(status, created_at);

CREATE TABLE dmca_requests (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL,
	slot INTEGER,                    -- which entry, NULL = unsure/both
	claimant_name TEXT NOT NULL,
	claimant_email TEXT NOT NULL,
	work_description TEXT NOT NULL,
	good_faith INTEGER NOT NULL,
	accuracy INTEGER NOT NULL,
	signature TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'open'  -- open | removed | rejected
);
