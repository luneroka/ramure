-- Sessions expire when unused: the last request is recorded (at most once an hour).
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
