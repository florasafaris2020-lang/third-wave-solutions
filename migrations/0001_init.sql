-- Third Wave Solutions — business submissions
-- Run with:
--   npx wrangler d1 migrations apply third-wave-businesses --remote

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seller_name TEXT,
  description TEXT,
  price TEXT,
  location TEXT,
  contact TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  documents TEXT,
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  reviewed_at INTEGER,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_businesses_created_at ON businesses(created_at);
