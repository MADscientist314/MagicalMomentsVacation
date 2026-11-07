-- Share links: a private web page for the family (/p/<token>), showing one saved version of a client
-- document for about 30 days. One link per trip and kind of document: sharing a newer version moves the
-- same link to it. Deleting the trip (or that version) removes the link.
CREATE TABLE shares (
  token TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (conversation_id, kind)
);
