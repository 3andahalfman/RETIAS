-- Transfer admin RLS from admin@retias.com → juliaodaramola@gmail.com
-- Run once in Supabase SQL Editor (or: supabase db execute --linked -f supabase/admin_email_julia.sql)

-- online_test_captures
DROP POLICY IF EXISTS "Admin reads all online test captures" ON online_test_captures;
CREATE POLICY "Admin reads all online test captures"
  ON online_test_captures FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

DROP POLICY IF EXISTS "Admin deletes online test captures" ON online_test_captures;
CREATE POLICY "Admin deletes online test captures"
  ON online_test_captures FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

-- storage.objects (online-test-screenshots bucket)
DROP POLICY IF EXISTS "Admin reads online test screenshots" ON storage.objects;
CREATE POLICY "Admin reads online test screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'online-test-screenshots'
    AND (
      (auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com'
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Admin deletes online test screenshots" ON storage.objects;
CREATE POLICY "Admin deletes online test screenshots"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'online-test-screenshots'
    AND (auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com'
  );

-- solved_questions
DROP POLICY IF EXISTS "Premium plus reads solved questions" ON solved_questions;
CREATE POLICY "Premium plus reads solved questions"
  ON solved_questions FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_premium_plus')::boolean = true
    OR (auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com'
  );

DROP POLICY IF EXISTS "Admin inserts solved questions" ON solved_questions;
CREATE POLICY "Admin inserts solved questions"
  ON solved_questions FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

DROP POLICY IF EXISTS "Admin updates solved questions" ON solved_questions;
CREATE POLICY "Admin updates solved questions"
  ON solved_questions FOR UPDATE
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

DROP POLICY IF EXISTS "Admin deletes solved questions" ON solved_questions;
CREATE POLICY "Admin deletes solved questions"
  ON solved_questions FOR DELETE
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

-- solved_answer_user_cache
DROP POLICY IF EXISTS "Users and admin read cached answers" ON solved_answer_user_cache;
CREATE POLICY "Users and admin read cached answers"
  ON solved_answer_user_cache FOR SELECT
  USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com'
  );

-- Remove legacy policy if present (older deployments)
DROP POLICY IF EXISTS "Read own or admin reads all" ON solved_answer_user_cache;
