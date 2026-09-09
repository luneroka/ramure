-- Account invitations are addressed: the owner types the address, the mail carries the link,
-- and that address may sign in without an invitation from the application administrator.
ALTER TABLE account_invites ADD COLUMN email TEXT;
ALTER TABLE account_invites ADD COLUMN used_at INTEGER;
CREATE INDEX account_invites_email ON account_invites(email);
