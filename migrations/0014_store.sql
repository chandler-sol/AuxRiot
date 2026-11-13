-- Beat store: exclusive sales of battle beats (one buyer per beat).
CREATE TABLE listings (
	id TEXT PRIMARY KEY,
	battle_id TEXT NOT NULL REFERENCES battles(id),
	entry_id TEXT NOT NULL UNIQUE REFERENCES entries(id),   -- one listing per beat
	seller_id TEXT NOT NULL REFERENCES users(id),
	status TEXT NOT NULL DEFAULT 'draft',      -- draft | listed | unlisted | sold | removed
	price_cents INTEGER,                       -- Exclusive
	stems_price_cents INTEGER,                 -- Exclusive + Stems (total), NULL = no stems offered
	bpm INTEGER,
	music_key TEXT,                            -- e.g. "F# minor"
	genre TEXT,
	moods TEXT NOT NULL DEFAULT '',            -- comma-separated tags
	-- The private file the buyer gets (never the 2:00 battle preview)
	file_key TEXT, file_name TEXT, file_size INTEGER, file_format TEXT,   -- wav | mp3
	tagged INTEGER NOT NULL DEFAULT 0,         -- producer tag still in the file
	stems_key TEXT, stems_name TEXT, stems_size INTEGER,
	attested_at INTEGER,                       -- "never sold or leased elsewhere; samples are my responsibility"
	buyer_id TEXT REFERENCES users(id),
	sold_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX listings_status ON listings(status, created_at);
CREATE INDEX listings_seller ON listings(seller_id, status);

-- In-progress multipart uploads (big WAVs and stems go up in chunks).
CREATE TABLE store_uploads (
	upload_id TEXT PRIMARY KEY,
	listing_id TEXT NOT NULL REFERENCES listings(id),
	kind TEXT NOT NULL,                        -- file | stems
	r2_key TEXT NOT NULL,
	file_name TEXT NOT NULL,
	declared_size INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

-- Phase 2 (Stripe): orders, discount codes and payout accounts. Created now so the shape is settled.
CREATE TABLE orders (
	id TEXT PRIMARY KEY,
	listing_id TEXT NOT NULL REFERENCES listings(id),
	buyer_id TEXT NOT NULL REFERENCES users(id),
	seller_id TEXT NOT NULL REFERENCES users(id),
	includes_stems INTEGER NOT NULL DEFAULT 0,
	list_price_cents INTEGER NOT NULL,
	discount_code_id TEXT,
	discount_cents INTEGER NOT NULL DEFAULT 0,  -- producer code: comes off the sale; site code: AuxRiot covers it
	amount_cents INTEGER NOT NULL,              -- what the buyer paid (before tax)
	platform_fee_cents INTEGER NOT NULL,
	processing_fee_cents INTEGER NOT NULL,
	seller_net_cents INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',     -- pending | paid | refunded | failed
	stripe_session_id TEXT,
	stripe_payment_intent TEXT,
	download_count INTEGER NOT NULL DEFAULT 0,
	first_download_at INTEGER,
	created_at INTEGER NOT NULL,
	paid_at INTEGER
);
CREATE INDEX orders_buyer ON orders(buyer_id, created_at);
CREATE INDEX orders_seller ON orders(seller_id, created_at);

CREATE TABLE discount_codes (
	id TEXT PRIMARY KEY,
	code TEXT NOT NULL UNIQUE COLLATE NOCASE,
	seller_id TEXT REFERENCES users(id),        -- NULL = site-wide (AuxRiot-funded)
	listing_id TEXT REFERENCES listings(id),    -- NULL = all of the seller's beats (or the whole store)
	percent_off INTEGER NOT NULL,
	expires_at INTEGER,
	max_uses INTEGER,
	uses INTEGER NOT NULL DEFAULT 0,
	once_per_buyer INTEGER NOT NULL DEFAULT 1,
	active INTEGER NOT NULL DEFAULT 1,
	created_by TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN stripe_account_id TEXT;
ALTER TABLE users ADD COLUMN payouts_enabled INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('store_fee_pct', '20', 0);
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('store_min_price_cents', '2000', 0);
