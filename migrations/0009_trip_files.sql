-- Trip files: what Jillian keeps with a trip (supplier itineraries, confirmations, invoices). The bytes live
-- in R2 under files/<trip id>/<id>; this keeps the name, type and size. Deleting the trip removes them.
CREATE TABLE trip_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX trip_files_trip ON trip_files (conversation_id, created_at);
