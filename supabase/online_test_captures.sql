-- ============================================================
-- RETIAS — Online test screenshot captures + scoring
-- Run once in the Supabase SQL Editor (after auth.users exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS online_test_captures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email       TEXT NOT NULL,
  session_id       UUID REFERENCES past_sessions(id) ON DELETE SET NULL,
  test_type        TEXT NOT NULL,
  screenshot_paths TEXT[] NOT NULL DEFAULT '{}',
  screenshot_count INT NOT NULL DEFAULT 1,
  ai_answer        TEXT NOT NULL,
  score_accuracy   NUMERIC(5,2),
  score_completeness NUMERIC(5,2),
  score_overall    NUMERIC(5,2),
  score_notes      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE online_test_captures ENABLE ROW LEVEL SECURITY;

-- Users upload captures during online tests (insert only — no read)
CREATE POLICY "Users insert own online test captures"
  ON online_test_captures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin dashboard — read all captures
CREATE POLICY "Admin reads all online test captures"
  ON online_test_captures FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'admin@retias.com');

CREATE INDEX IF NOT EXISTS idx_online_test_captures_created
  ON online_test_captures (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_test_captures_user
  ON online_test_captures (user_id);

CREATE INDEX IF NOT EXISTS idx_online_test_captures_test_type
  ON online_test_captures (test_type);

-- ── Storage bucket (private) ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'online-test-screenshots',
  'online-test-screenshots',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Users upload into their own folder: {user_id}/{capture_id}/{n}.png
CREATE POLICY "Users upload own online test screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'online-test-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin (and uploader for signed URLs during upload verification) can read
CREATE POLICY "Admin reads online test screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'online-test-screenshots'
    AND (
      (auth.jwt() ->> 'email') = 'admin@retias.com'
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
