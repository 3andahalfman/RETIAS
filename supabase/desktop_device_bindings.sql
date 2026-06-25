-- ============================================================
-- RETIAS — One RETIAS account per desktop device
-- Run once in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS desktop_device_bindings (
  device_id   TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,
  bound_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_desktop_device_bindings_user
  ON desktop_device_bindings (user_id);

ALTER TABLE desktop_device_bindings ENABLE ROW LEVEL SECURITY;

-- Clients register via RPC only (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION register_desktop_device(p_device_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT := auth.jwt() ->> 'email';
  existing_user_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) < 16 THEN
    RAISE EXCEPTION 'Invalid device id';
  END IF;

  SELECT user_id INTO existing_user_id
  FROM desktop_device_bindings
  WHERE device_id = p_device_id;

  IF existing_user_id IS NULL THEN
    INSERT INTO desktop_device_bindings (device_id, user_id, user_email)
    VALUES (p_device_id, v_user_id, coalesce(v_email, ''));
    RETURN;
  END IF;

  IF existing_user_id <> v_user_id THEN
    RAISE EXCEPTION
      'DEVICE_BOUND: This computer is already registered to another RETIAS account. Only one user may sign in on this device.';
  END IF;

  UPDATE desktop_device_bindings
  SET user_email = coalesce(v_email, user_email),
      bound_at = now()
  WHERE device_id = p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION register_desktop_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_desktop_device(TEXT) TO authenticated;
