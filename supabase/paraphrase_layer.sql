-- ============================================================
-- RETIAS — Paraphrase layer for Solved Assessment answers.
-- Two-step humanization:
--   1) On admin import, generate 5 base variants of the answer.
--   2) On first user view, pick a base variant deterministically
--      and paraphrase it once more for that user — cached.
-- ============================================================

-- 1) Base variants generated on import (legacy — optional)
ALTER TABLE solved_questions
  ADD COLUMN IF NOT EXISTS answer_variants TEXT[] DEFAULT '{}';

-- Admin opt-in: users can highlight + rewrite answer text on Solved Assessment page
ALTER TABLE solved_questions
  ADD COLUMN IF NOT EXISTS paraphrase_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2) Per-user cached personalisation
CREATE TABLE IF NOT EXISTS solved_answer_user_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES solved_questions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_text  TEXT NOT NULL,
  base_variant_idx INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

ALTER TABLE solved_answer_user_cache ENABLE ROW LEVEL SECURITY;

-- Single SELECT policy (avoids multiple-permissive-policy linter warning)
DROP POLICY IF EXISTS "Users read own cached answers" ON solved_answer_user_cache;
DROP POLICY IF EXISTS "Admin reads all cached answers" ON solved_answer_user_cache;
CREATE POLICY "Users and admin read cached answers"
  ON solved_answer_user_cache FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com'
  );

-- A user can insert their own row (desktop main process writes on user's behalf)
DROP POLICY IF EXISTS "Users insert own cached answers" ON solved_answer_user_cache;
CREATE POLICY "Users insert own cached answers"
  ON solved_answer_user_cache FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_solved_answer_cache_question_user
  ON solved_answer_user_cache (question_id, user_id);
