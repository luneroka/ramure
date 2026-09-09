-- A removed file waits before it is really gone, so an undo can bring it back.
ALTER TABLE media ADD COLUMN deleted_at INTEGER;
