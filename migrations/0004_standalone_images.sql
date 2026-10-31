-- Images can also stand alone (Picture Perfect): neither a post nor a trip, just Jillian's library.
-- SQLite can't change a CHECK, so the table is rebuilt with the same rows. Nothing references images.
CREATE TABLE images_new (
  id TEXT PRIMARY KEY,
  draft_id TEXT REFERENCES drafts (id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('upload', 'generated')),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  shape TEXT,
  prompt TEXT NOT NULL DEFAULT '',  -- her direction for a generated image (masked)
  model TEXT,
  cost_usd REAL NOT NULL DEFAULT 0, -- estimated, for the monthly cost tracker
  created_at INTEGER NOT NULL,
  CHECK (draft_id IS NULL OR conversation_id IS NULL)
);

INSERT INTO images_new (id, draft_id, conversation_id, kind, mime, bytes, shape, prompt, model, cost_usd, created_at)
  SELECT id, draft_id, conversation_id, kind, mime, bytes, shape, prompt, model, cost_usd, created_at FROM images;

DROP TABLE images;
ALTER TABLE images_new RENAME TO images;

CREATE INDEX images_draft ON images (draft_id, created_at DESC);
CREATE INDEX images_conversation ON images (conversation_id, created_at DESC);
CREATE INDEX images_made ON images (kind, created_at);
CREATE INDEX images_library ON images (created_at DESC) WHERE draft_id IS NULL AND conversation_id IS NULL;
