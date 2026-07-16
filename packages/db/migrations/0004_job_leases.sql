CREATE INDEX IF NOT EXISTS jobs_available_lease_idx
  ON jobs(status, available_at, lease_expires_at, created_at);
