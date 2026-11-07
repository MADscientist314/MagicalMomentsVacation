-- A fourth kind of client document, Extras (packing list, apps, before-you-go checklist), so none of it
-- gets crammed into a day of the itinerary. SQLite can't change a CHECK, so the table is rebuilt with the
-- same rows. Nothing references deliverables yet (share links, added later, will: rebuild with care).
CREATE TABLE deliverables_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('proposal', 'itinerary', 'estimate', 'extras')),
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, kind, version)
);

INSERT INTO deliverables_new (id, conversation_id, kind, version, data, created_at)
  SELECT id, conversation_id, kind, version, data, created_at FROM deliverables;

DROP TABLE deliverables;
ALTER TABLE deliverables_new RENAME TO deliverables;
