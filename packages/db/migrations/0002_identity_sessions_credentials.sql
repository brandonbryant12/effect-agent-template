CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  auth_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, name)
VALUES ('tenant_00000000000000000000000000', 'Default tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, auth_subject)
VALUES (
  'user_00000000000000000000000000',
  'tenant_00000000000000000000000000',
  'local-system'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tenant_id text REFERENCES tenants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users(id) ON DELETE RESTRICT;

UPDATE projects
SET
  tenant_id = 'tenant_00000000000000000000000000',
  owner_user_id = 'user_00000000000000000000000000'
WHERE tenant_id IS NULL OR owner_user_id IS NULL;

ALTER TABLE projects
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN owner_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS projects_tenant_owner_idx
  ON projects(tenant_id, owner_user_id, created_at);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status IN ('provisioning', 'ready', 'running', 'awaiting-approval', 'paused', 'failed', 'terminated')
  ),
  sandbox_ref text,
  opencode_session_ref text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_sessions_owner_idx
  ON agent_sessions(tenant_id, user_id, created_at);

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS session_id text REFERENCES agent_sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS agent_runs_session_idx ON agent_runs(session_id, created_at);

CREATE TABLE IF NOT EXISTS credentials (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'github', 'custom')),
  ownership text NOT NULL DEFAULT 'personal' CHECK (ownership = 'personal'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  display_hint text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  secret_ref text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS credentials_owner_idx
  ON credentials(tenant_id, user_id, created_at);

CREATE TABLE IF NOT EXISTS credential_uploads (
  id text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL,
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX IF NOT EXISTS credential_uploads_pending_idx
  ON credential_uploads(expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_session_credentials (
  session_id text NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  credential_id text NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, credential_id)
);
