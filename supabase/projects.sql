-- RETIAS — Projects (Claude Code / Codex-style context: instructions + files + linked folder)
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  folder_path  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Added after the first release of projects.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_path text;

CREATE TABLE IF NOT EXISTS project_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_id_idx       ON projects(user_id);
CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files(project_id);
CREATE INDEX IF NOT EXISTS project_files_user_id_idx    ON project_files(user_id);

ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so drop first to stay idempotent
DROP POLICY IF EXISTS "Users can view own projects"        ON projects;
DROP POLICY IF EXISTS "Users can insert own projects"      ON projects;
DROP POLICY IF EXISTS "Users can update own projects"      ON projects;
DROP POLICY IF EXISTS "Users can delete own projects"      ON projects;
DROP POLICY IF EXISTS "Users can view own project files"   ON project_files;
DROP POLICY IF EXISTS "Users can insert own project files" ON project_files;
DROP POLICY IF EXISTS "Users can delete own project files" ON project_files;

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own project files"
  ON project_files FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project files"
  ON project_files FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own project files"
  ON project_files FOR DELETE USING (auth.uid() = user_id);

-- Force PostgREST to refresh its schema cache so the app sees the new tables
NOTIFY pgrst, 'reload schema';
