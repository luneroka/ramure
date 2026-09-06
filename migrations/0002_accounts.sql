-- Family accounts: several people sign in with their own email and land on the same trees.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE account_members (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, user_id)
);
CREATE INDEX account_members_user ON account_members(user_id);

CREATE TABLE account_invites (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

ALTER TABLE trees ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX trees_account ON trees(account_id);

-- Existing trees: one account per owner, named after them, with the owner as its owner.
INSERT INTO accounts (id, name, created_by, created_at)
  SELECT 'A' || substr(owner_id, 2), 'Famille', owner_id, MIN(created_at) FROM trees WHERE account_id IS NULL GROUP BY owner_id;
INSERT OR IGNORE INTO account_members (account_id, user_id, role, added_at)
  SELECT 'A' || substr(owner_id, 2), owner_id, 'owner', MIN(created_at) FROM trees WHERE account_id IS NULL GROUP BY owner_id;
UPDATE trees SET account_id = 'A' || substr(owner_id, 2) WHERE account_id IS NULL;
