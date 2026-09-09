-- The two tables the accounts model replaced in 0002, which no query has read since.
--
-- They are dropped for a reason beyond tidiness: both carry a `REFERENCES
-- users(id)` with no ON DELETE clause, so a single row in either would block
-- deleting the user it names — which is the failure this migration's pass
-- exists to fix. Nothing references either table, so the drop cascades nowhere,
-- and both are empty in production (checked before writing this).
DROP TABLE IF EXISTS tree_members;
DROP TABLE IF EXISTS invites;
