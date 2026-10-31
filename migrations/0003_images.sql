-- Photos Jillian uploads and images Nano Banana makes. The bytes live in R2 (images/<id>);
-- each row belongs to a saved post (draft) or a trip, and goes when that's deleted.
CREATE TABLE images (
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
  CHECK ((draft_id IS NULL) <> (conversation_id IS NULL))
);

CREATE INDEX images_draft ON images (draft_id, created_at DESC);
CREATE INDEX images_conversation ON images (conversation_id, created_at DESC);
CREATE INDEX images_made ON images (kind, created_at);
