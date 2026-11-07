-- Active trips: a trip Jillian marks as booked gets its arrival (and return) day, and key dates to act on.
-- Days are "YYYY-MM-DD". A reminder counted back from arrival keeps `days_before`, so it moves when the
-- arrival does; her own dates have none. Unbooking (or deleting the trip) removes them.
CREATE TABLE bookings (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations (id) ON DELETE CASCADE,
  arrival TEXT NOT NULL,
  departure TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE key_dates (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES bookings (conversation_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  due TEXT NOT NULL,
  days_before INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX key_dates_trip ON key_dates (conversation_id, due);
