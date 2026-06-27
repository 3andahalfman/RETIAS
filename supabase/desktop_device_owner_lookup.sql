-- Lookup device owner for login screen (anon-safe via SECURITY DEFINER).
-- Only returns email when the bound auth user still exists.

CREATE OR REPLACE FUNCTION get_desktop_device_owner(p_device_id TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT b.user_email
  FROM desktop_device_bindings b
  INNER JOIN auth.users u ON u.id = b.user_id
  WHERE b.device_id = p_device_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_desktop_device_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_desktop_device_owner(TEXT) TO anon, authenticated;

-- Remove bindings for deleted accounts (e.g. after admin@retias.com removal)
DELETE FROM desktop_device_bindings d
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id);
