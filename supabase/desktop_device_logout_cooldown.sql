-- ============================================================
-- RETIAS — 1-hour cooldown before another account can bind
-- Run once in the Supabase SQL Editor (after desktop_device_bindings.sql)
-- ============================================================

ALTER TABLE desktop_device_bindings
  ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ;

-- Called on desktop sign-out by the bound user.
CREATE OR REPLACE FUNCTION record_desktop_device_logout(p_device_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) < 16 THEN
    RETURN;
  END IF;

  UPDATE desktop_device_bindings
  SET last_logout_at = now()
  WHERE device_id = p_device_id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION record_desktop_device_logout(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_desktop_device_logout(TEXT) TO authenticated;

-- Re-register with cooldown + transfer rules.
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
  existing_logout_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) < 16 THEN
    RAISE EXCEPTION 'Invalid device id';
  END IF;

  SELECT user_id, last_logout_at
  INTO existing_user_id, existing_logout_at
  FROM desktop_device_bindings
  WHERE device_id = p_device_id;

  IF existing_user_id IS NULL THEN
    INSERT INTO desktop_device_bindings (device_id, user_id, user_email)
    VALUES (p_device_id, v_user_id, coalesce(v_email, ''));
    RETURN;
  END IF;

  IF existing_user_id <> v_user_id THEN
    IF existing_logout_at IS NULL THEN
      RAISE EXCEPTION
        'DEVICE_BOUND: This computer is already registered to another RETIAS account. Only one user may sign in on this device.';
    END IF;

    IF existing_logout_at + interval '1 hour' > now() THEN
      RAISE EXCEPTION
        'DEVICE_COOLDOWN: This device was recently signed out. Wait one hour before signing in with a different account.';
    END IF;

    UPDATE desktop_device_bindings
    SET user_id = v_user_id,
        user_email = coalesce(v_email, ''),
        bound_at = now(),
        last_logout_at = NULL
    WHERE device_id = p_device_id;
    RETURN;
  END IF;

  UPDATE desktop_device_bindings
  SET user_email = coalesce(v_email, user_email),
      bound_at = now(),
      last_logout_at = NULL
  WHERE device_id = p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION register_desktop_device(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_desktop_device(TEXT) TO authenticated;
