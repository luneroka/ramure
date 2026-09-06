-- Named versions: a member can save a version on purpose, with a label.
ALTER TABLE tree_snapshots ADD COLUMN label TEXT;
ALTER TABLE tree_snapshots ADD COLUMN created_by TEXT;
