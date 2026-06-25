-- Allow admin to opt-in each solved question for user selection paraphrase/humanize.
ALTER TABLE solved_questions
  ADD COLUMN IF NOT EXISTS paraphrase_enabled BOOLEAN NOT NULL DEFAULT false;
