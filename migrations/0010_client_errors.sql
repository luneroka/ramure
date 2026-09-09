-- Errors the browser reports about itself, for the operator; purged after thirty days.
CREATE TABLE client_errors (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id TEXT,
  version TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  agent TEXT
);
CREATE INDEX client_errors_at ON client_errors(at);
