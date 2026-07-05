-- Subscription tier change audit log (manual admin upgrades vs Paystack payments).
-- Run once in Supabase SQL Editor (or: supabase db execute --linked -f supabase/subscription_events.sql)

CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  from_tier text CHECK (from_tier IS NULL OR from_tier IN ('pro', 'plus')),
  to_tier text CHECK (to_tier IS NULL OR to_tier IN ('pro', 'plus')),
  event_type text NOT NULL CHECK (event_type IN ('upgrade', 'downgrade', 'renewal', 'cancel')),
  upgrade_source text NOT NULL CHECK (upgrade_source IN ('manual', 'payment')),
  admin_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_user_id_idx ON subscription_events (user_id);
CREATE INDEX IF NOT EXISTS subscription_events_created_at_idx ON subscription_events (created_at DESC);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Admin billing dashboard (retiasai.com) reads via authenticated admin JWT
DROP POLICY IF EXISTS "Admin reads subscription events" ON subscription_events;
CREATE POLICY "Admin reads subscription events"
  ON subscription_events FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'juliaodaramola@gmail.com');

-- Service role / SQL editor inserts bypass RLS; edge functions use service role key.
