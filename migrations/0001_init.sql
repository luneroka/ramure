-- Ramure: initial schema for Cloudflare D1.
-- Trees are stored as a materialised GEDCOM document plus an append-only op log.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL
);

-- One-time sign-in links. Only the hash of the token is stored.
CREATE TABLE magic_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE trees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  -- Number of ops applied so far; the client sends the version it built on.
  version INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL,
  people INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE tree_members (
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (tree_id, user_id)
);
CREATE INDEX tree_members_user ON tree_members(user_id);

CREATE TABLE tree_ops (
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  op_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  op TEXT NOT NULL,
  PRIMARY KEY (tree_id, seq)
);
CREATE UNIQUE INDEX tree_ops_op_id ON tree_ops(tree_id, op_id);

CREATE TABLE tree_snapshots (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  doc TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX tree_snapshots_tree ON tree_snapshots(tree_id, created_at);

CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  -- Reusable by design: one link for the whole family, revocable.
  revoked_at INTEGER
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX media_tree ON media(tree_id);
