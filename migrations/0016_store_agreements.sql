-- Store legal records: one-time seller agreement, private legal name, and a signed license per listing.
ALTER TABLE users ADD COLUMN legal_name TEXT;                 -- private; printed on licenses only
ALTER TABLE users ADD COLUMN seller_agreed_at INTEGER;
ALTER TABLE users ADD COLUMN seller_agreement_version TEXT;

ALTER TABLE listings ADD COLUMN sample_disclosure TEXT;       -- "none" or what's sampled and how it's cleared
ALTER TABLE listings ADD COLUMN producer_signature TEXT;      -- typed full legal name
ALTER TABLE listings ADD COLUMN producer_signed_at INTEGER;
ALTER TABLE listings ADD COLUMN license_version TEXT;

-- Buyer side of the license (filled at checkout in phase 2).
ALTER TABLE orders ADD COLUMN buyer_legal_name TEXT;
ALTER TABLE orders ADD COLUMN buyer_signature TEXT;
ALTER TABLE orders ADD COLUMN buyer_signed_at INTEGER;
ALTER TABLE orders ADD COLUMN license_version TEXT;
