-- Terms of Service §7A: remove intimate images shared without consent, within 48 hours of a valid request.
-- No account needed; the requester never sends a copy of the image.
CREATE TABLE removal_requests (
	id TEXT PRIMARY KEY,
	location TEXT NOT NULL,          -- URL, profile or message location
	details TEXT NOT NULL,           -- circumstances / good-faith statement
	signature TEXT NOT NULL,         -- physical or electronic signature (typed name)
	contact TEXT NOT NULL,           -- how to reach them
	on_behalf INTEGER NOT NULL DEFAULT 0,  -- authorized representative
	user_id TEXT REFERENCES users(id),     -- if signed in (optional)
	status TEXT NOT NULL DEFAULT 'open',   -- open | removed | rejected
	due_at INTEGER NOT NULL,         -- received + 48 hours
	resolved_at INTEGER,
	resolved_by TEXT,
	note TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX removal_requests_open ON removal_requests(status, due_at);
