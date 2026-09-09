-- A short code travels with each magic link, for mail clients that block links.
ALTER TABLE magic_links ADD COLUMN code_hash TEXT;
ALTER TABLE magic_links ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
