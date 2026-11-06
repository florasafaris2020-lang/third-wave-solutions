CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  asking_price TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  public_description TEXT NOT NULL DEFAULT '',
  public_title TEXT,
  public_location TEXT,
  public_price TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER,
  uploads TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS businesses_status_created ON businesses(status, created_at DESC);
