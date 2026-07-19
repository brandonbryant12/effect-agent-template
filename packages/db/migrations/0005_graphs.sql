CREATE TABLE IF NOT EXISTS graphs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS graphs_project_idx ON graphs (project_id, created_at);

CREATE TABLE IF NOT EXISTS graph_runs (
  id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  status text NOT NULL,
  input text NOT NULL,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  command_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS graph_runs_graph_idx ON graph_runs (graph_id, created_at);

CREATE TABLE IF NOT EXISTS graph_run_nodes (
  graph_run_id text NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  status text NOT NULL,
  agent_run_id text NULL,
  session_id text NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (graph_run_id, node_id)
);
