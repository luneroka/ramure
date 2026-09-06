-- A read-only account role, and invite links that carry a role.
-- SQLite cannot change a CHECK constraint in place: rebuild account_members.

CREATE TABLE account_members_new (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, user_id)
);
INSERT INTO account_members_new (account_id, user_id, role, added_at) SELECT account_id, user_id, role, added_at FROM account_members;
DROP TABLE account_members;
ALTER TABLE account_members_new RENAME TO account_members;
CREATE INDEX account_members_user ON account_members(user_id);

ALTER TABLE account_invites ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
