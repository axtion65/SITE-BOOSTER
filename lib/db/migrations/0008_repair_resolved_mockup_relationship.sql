-- Target the exact relations resolved by the application's search path.
-- This repairs same-named constraints that may exist on an obsolete schema/table.
DO $$
DECLARE
  child_table REGCLASS := to_regclass('mockup_versions');
  parent_table REGCLASS := to_regclass('mockup_projects');
  constraint_record RECORD;
  orphan_count BIGINT;
BEGIN
  IF child_table IS NULL OR parent_table IS NULL THEN
    RAISE EXCEPTION 'Mockup persistence relations are unavailable';
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM %s mv LEFT JOIN %s mp ON mp.id = mv.mockup_project_id WHERE mp.id IS NULL',
    child_table,
    parent_table
  ) INTO orphan_count;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      USING MESSAGE = format(
        'Cannot repair resolved mockup relationship: %s orphaned version row(s) require administrator review',
        orphan_count
      );
  END IF;

  FOR constraint_record IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = child_table
       AND c.conname = 'mockup_versions_mockup_project_id_fkey'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      child_table,
      constraint_record.conname
    );
  END LOOP;

  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT mockup_versions_mockup_project_id_fkey FOREIGN KEY (mockup_project_id) REFERENCES %s(id) ON DELETE CASCADE NOT VALID',
    child_table,
    parent_table
  );
  EXECUTE format(
    'ALTER TABLE %s VALIDATE CONSTRAINT mockup_versions_mockup_project_id_fkey',
    child_table
  );

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = child_table
       AND c.confrelid = parent_table
       AND c.conname = 'mockup_versions_mockup_project_id_fkey'
       AND c.confdeltype = 'c'
       AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Resolved mockup persistence relationship did not validate';
  END IF;
END
$$;
