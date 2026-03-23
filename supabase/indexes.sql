-- ============================================================
-- RETIAS — Supabase performance indexes
-- Run once in the Supabase SQL Editor (or via supabase db push)
-- Safe to re-run: all use CREATE INDEX IF NOT EXISTS
-- ============================================================

-- past_sessions: filter by owner (authorization + dashboard metrics)
CREATE INDEX IF NOT EXISTS idx_past_sessions_user_id
  ON past_sessions (user_id);

-- past_sessions: recent sessions feed (already ordered DESC)
CREATE INDEX IF NOT EXISTS idx_past_sessions_user_started
  ON past_sessions (user_id, started_at DESC);

-- session_qa: look up all QA for a session
CREATE INDEX IF NOT EXISTS idx_session_qa_session_id
  ON session_qa (session_id);

-- session_transcript: look up all transcript lines for a session
CREATE INDEX IF NOT EXISTS idx_session_transcript_session_id
  ON session_transcript (session_id);

-- cvs: list CVs for a user
CREATE INDEX IF NOT EXISTS idx_cvs_user_id
  ON cvs (user_id);
