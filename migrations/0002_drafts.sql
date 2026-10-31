-- Saved drafts from the one-off tools (Welcome Center, Inbox Helper, Spread the Magic,
-- Magic Mail), so Jillian can come back to them by name.
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  title TEXT NOT NULL,
  request TEXT NOT NULL,           -- JSON: the fields and refinements behind the draft
  content TEXT NOT NULL,           -- the draft as shown (reply plus "For Jillian only" notes)
  sources TEXT NOT NULL DEFAULT '[]',
  handled INTEGER NOT NULL DEFAULT 0,  -- Inbox Helper: already dealt with
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX drafts_list ON drafts (tool, handled, updated_at DESC);
