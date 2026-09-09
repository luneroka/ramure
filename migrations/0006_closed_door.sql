-- Closed registration: only invited addresses can sign in; an application
-- administrator issues invitations and approves account deletions.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE app_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX app_invites_email ON app_invites(email);

CREATE TABLE deletion_requests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  requested_at INTEGER NOT NULL,
  note TEXT
);

-- People without an invitation can ask for one; the administrator turns a request into an invitation.
CREATE TABLE access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  message TEXT,
  requested_at INTEGER NOT NULL
);
