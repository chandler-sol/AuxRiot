-- Stripe checkout: a short hold while someone pays for an exclusive, and order bookkeeping.
ALTER TABLE listings ADD COLUMN held_until INTEGER;
ALTER TABLE listings ADD COLUMN held_by TEXT;
ALTER TABLE orders ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN expires_at INTEGER;
ALTER TABLE orders ADD COLUMN refunded_at INTEGER;
ALTER TABLE orders ADD COLUMN refund_reason TEXT;
CREATE UNIQUE INDEX orders_session ON orders(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX orders_listing ON orders(listing_id, status);
-- Collect sales tax at checkout (Stripe Tax). Off until registrations exist.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('store_tax_enabled', '0', 0);
