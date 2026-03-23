-- ============================================================
-- RETIAS — Row Level Security policies
-- Run once in the Supabase SQL Editor
-- These are the REQUIRED policies for data isolation between users
-- ============================================================

-- Enable RLS on all user-owned tables
ALTER TABLE past_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_qa         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvs                ENABLE ROW LEVEL SECURITY;

-- ── past_sessions ────────────────────────────────────────────
CREATE POLICY "Users can view own sessions"
  ON past_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON past_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON past_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON past_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ── session_qa ───────────────────────────────────────────────
-- Access via parent session ownership
CREATE POLICY "Users can view own session QA"
  ON session_qa FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own session QA"
  ON session_qa FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own session QA"
  ON session_qa FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

-- ── session_transcript ───────────────────────────────────────
CREATE POLICY "Users can view own session transcript"
  ON session_transcript FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own session transcript"
  ON session_transcript FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own session transcript"
  ON session_transcript FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM past_sessions WHERE user_id = auth.uid()
    )
  );

-- ── cvs ─────────────────────────────────────────────────────
CREATE POLICY "Users can view own CVs"
  ON cvs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own CVs"
  ON cvs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own CVs"
  ON cvs FOR DELETE
  USING (auth.uid() = user_id);
