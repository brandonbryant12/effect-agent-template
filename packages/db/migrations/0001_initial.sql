CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text,
  status text NOT NULL CHECK (status IN ('todo', 'in-progress', 'blocked', 'done', 'cancelled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id, created_at);

CREATE TABLE IF NOT EXISTS conversations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id text,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'awaiting-approval', 'completed', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_run_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_run_id_fkey FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agent_run_commands (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  admitted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_run_events (
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_call_id text NOT NULL,
  tool_name text NOT NULL,
  action text NOT NULL,
  resource_patterns jsonb NOT NULL,
  safe_metadata jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved-once', 'approved-session', 'rejected')),
  created_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,
  name text NOT NULL,
  media_type text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, available_at, created_at);
