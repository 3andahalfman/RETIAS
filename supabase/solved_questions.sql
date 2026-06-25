-- ============================================================
-- RETIAS — Solved Test bank (curated Q&A from screenshot library)
-- One row per question. Admin inserts via "Send to Solved" in the
-- Screenshot Library. Premium+ users browse via the Solve Test page.
-- Run once in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS solved_questions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform           TEXT NOT NULL,
  assessment_type    TEXT NOT NULL,
  question           TEXT NOT NULL,
  answer             TEXT NOT NULL,
  answer_variants    TEXT[] DEFAULT '{}',
  paraphrase_enabled BOOLEAN NOT NULL DEFAULT false,
  source_capture_id  UUID REFERENCES online_test_captures(id) ON DELETE SET NULL,
  source_url         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE solved_questions ENABLE ROW LEVEL SECURITY;

-- Premium+ users (and admin) can browse the bank
DROP POLICY IF EXISTS "Premium plus reads solved questions" ON solved_questions;
CREATE POLICY "Premium plus reads solved questions"
  ON solved_questions FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_premium_plus')::boolean = true
    OR (auth.jwt() ->> 'email') = 'admin@retias.com'
  );

-- Only admin writes
DROP POLICY IF EXISTS "Admin inserts solved questions" ON solved_questions;
CREATE POLICY "Admin inserts solved questions"
  ON solved_questions FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'admin@retias.com');

DROP POLICY IF EXISTS "Admin updates solved questions" ON solved_questions;
CREATE POLICY "Admin updates solved questions"
  ON solved_questions FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'admin@retias.com');

DROP POLICY IF EXISTS "Admin deletes solved questions" ON solved_questions;
CREATE POLICY "Admin deletes solved questions"
  ON solved_questions FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'admin@retias.com');

CREATE INDEX IF NOT EXISTS idx_solved_questions_platform_assessment
  ON solved_questions (platform, assessment_type);

CREATE INDEX IF NOT EXISTS idx_solved_questions_created
  ON solved_questions (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_solved_questions_dedup
  ON solved_questions (platform, assessment_type, question);
