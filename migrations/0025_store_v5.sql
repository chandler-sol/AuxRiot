-- Store rules v5 (Exclusive Beat License / Store Terms, Nov 27 2026).
-- A paid order RESERVES the beat; exclusivity activates on the first completed
-- private delivery of audio or stems. Listing status stays 'sold' while reserved;
-- listings.sold_at is set only on delivery (that's when the SOLD stamp appears).
ALTER TABLE orders ADD COLUMN delivered_at INTEGER;          -- first completed audio/stems delivery = license active
ALTER TABLE orders ADD COLUMN files_available_at INTEGER;    -- start of the 14-day delivery window
ALTER TABLE orders ADD COLUMN expiry_reminded_at INTEGER;
ALTER TABLE orders ADD COLUMN refund_fault TEXT;             -- ordinary | auxriot | auxriot_restore
ALTER TABLE orders ADD COLUMN refund_breakdown TEXT;         -- JSON itemized notice for the seller
-- Copyright notice blocking paid files (Store Terms §7)
ALTER TABLE orders ADD COLUMN blocked_at INTEGER;
ALTER TABLE orders ADD COLUMN block_deadline INTEGER;        -- 5 p.m. ET on the 14th business day
ALTER TABLE orders ADD COLUMN block_note TEXT;
ALTER TABLE users ADD COLUMN copyright_strikes INTEGER NOT NULL DEFAULT 0;

-- Existing sales: anything already downloaded counts as delivered.
UPDATE orders SET delivered_at = first_download_at WHERE first_download_at IS NOT NULL AND delivered_at IS NULL;
UPDATE orders SET files_available_at = paid_at WHERE paid_at IS NOT NULL AND files_available_at IS NULL;
UPDATE listings SET sold_at = NULL
 WHERE status = 'sold' AND id IN (SELECT listing_id FROM orders WHERE status = 'paid' AND delivered_at IS NULL);
CREATE INDEX orders_open ON orders(status, delivered_at, files_available_at);
