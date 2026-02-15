-- Repair migration: this file was previously corrupted (`au`) and broke clean schema rollouts.
-- Keep this migration intentionally no-op so existing environments remain stable while
-- preserving migration ordering and deterministic applies.
DO $$
BEGIN
  RAISE NOTICE '20260214213000_demo_admin_configuration_rights: no-op repair migration applied.';
END
$$;
