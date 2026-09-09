-- A sign-in is bound to the browser that asked for it, and abuse is counted per address and per client.
ALTER TABLE magic_links ADD COLUMN browser_hash TEXT;
CREATE INDEX IF NOT EXISTS magic_links_email ON magic_links(email, expires_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
