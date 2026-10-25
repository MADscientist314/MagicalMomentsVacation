-- Saved trips and chats. Everything belongs to a conversation; deleting one
-- deletes its messages and deliverables (D1 always enforces foreign keys).
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('trip', 'chat')),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  pinned INTEGER NOT NULL DEFAULT 0,
  busy_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX conversations_list ON conversations (kind, pinned DESC, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, seq)
);

CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('proposal', 'itinerary', 'estimate')),
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, kind, version)
);

-- Failed sign-ins, for the rate limit.
CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX login_failures_ip ON login_failures (ip, at);
