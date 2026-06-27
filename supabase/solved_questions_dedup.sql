-- Dedup solved questions: re-sending the same platform + assessment + question updates the row.
-- Run once in the Supabase SQL Editor after solved_questions.sql.

-- Remove existing duplicates (keep the newest row per platform + assessment + question).
DELETE FROM solved_questions a
USING solved_questions b
WHERE a.id < b.id
  AND a.platform = b.platform
  AND a.assessment_type = b.assessment_type
  AND a.question = b.question;

CREATE UNIQUE INDEX IF NOT EXISTS idx_solved_questions_dedup
  ON solved_questions (platform, assessment_type, question);

DROP POLICY IF EXISTS "Admin updates solved questions" ON solved_questions;
CREATE POLICY "Admin updates solved questions"
  ON solved_questions FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');
