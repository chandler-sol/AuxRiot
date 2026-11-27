-- Remember a seller's last signed answers (credit, signer, rights schedule) to pre-fill their next listing.
ALTER TABLE users ADD COLUMN listing_defaults TEXT;
