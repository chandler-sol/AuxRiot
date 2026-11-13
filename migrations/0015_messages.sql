-- Public Q&A on store listings, and private buyer <-> producer messages.

CREATE TABLE listing_questions (
	id TEXT PRIMARY KEY,
	listing_id TEXT NOT NULL REFERENCES listings(id),
	user_id TEXT NOT NULL REFERENCES users(id),
	body TEXT NOT NULL,
	answer TEXT,                       -- the producer's public reply
	answered_at INTEGER,
	held INTEGER NOT NULL DEFAULT 0,   -- blocked-words filter, like comments
	hidden INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);
CREATE INDEX listing_questions_listing ON listing_questions(listing_id, created_at);

-- One private thread per buyer per listing (an order thread reuses it after purchase).
CREATE TABLE conversations (
	id TEXT PRIMARY KEY,
	listing_id TEXT REFERENCES listings(id),
	order_id TEXT REFERENCES orders(id),
	buyer_id TEXT NOT NULL REFERENCES users(id),
	seller_id TEXT NOT NULL REFERENCES users(id),
	buyer_read_at INTEGER NOT NULL DEFAULT 0,
	seller_read_at INTEGER NOT NULL DEFAULT 0,
	buyer_emailed_at INTEGER NOT NULL DEFAULT 0,
	seller_emailed_at INTEGER NOT NULL DEFAULT 0,
	last_message_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (listing_id, buyer_id)
);
CREATE INDEX conversations_buyer ON conversations(buyer_id, last_message_at);
CREATE INDEX conversations_seller ON conversations(seller_id, last_message_at);

CREATE TABLE messages (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations(id),
	sender_id TEXT NOT NULL REFERENCES users(id),
	body TEXT NOT NULL,
	off_platform INTEGER NOT NULL DEFAULT 0,  -- mentions a phone, email or payment handle
	hidden INTEGER NOT NULL DEFAULT 0,        -- removed by a moderator
	created_at INTEGER NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX messages_sender ON messages(sender_id, created_at);

CREATE TABLE user_blocks (
	blocker_id TEXT NOT NULL REFERENCES users(id),
	blocked_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL,
	PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE users ADD COLUMN notify_messages INTEGER NOT NULL DEFAULT 1;
