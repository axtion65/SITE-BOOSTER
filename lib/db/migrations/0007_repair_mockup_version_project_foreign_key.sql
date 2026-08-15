-- Repair production schema drift without deleting or rewriting customer data.
DO $$
DECLARE
  orphan_count BIGINT;
  constraint_is_correct BOOLEAN;
BEGIN
  SELECT COUNT(*)
    INTO orphan_count
    FROM mockup_versions mv
    LEFT JOIN mockup_projects mp ON mp.id = mv.mockup_project_id
   WHERE mp.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      USING
        MESSAGE = format(
          'Cannot repair mockup version relationship: %s orphaned mockup_versions row(s) require administrator review',
          orphan_count
        ),
        HINT = 'Restore the referenced mockup project rows before rerunning this migration. No customer data was changed.';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class child_table ON child_table.oid = c.conrelid
      JOIN pg_namespace child_schema ON child_schema.oid = child_table.relnamespace
      JOIN pg_class parent_table ON parent_table.oid = c.confrelid
      JOIN pg_namespace parent_schema ON parent_schema.oid = parent_table.relnamespace
     WHERE c.conname = 'mockup_versions_mockup_project_id_fkey'
       AND c.contype = 'f'
       AND child_schema.nspname = current_schema()
       AND child_table.relname = 'mockup_versions'
       AND parent_schema.nspname = current_schema()
       AND parent_table.relname = 'mockup_projects'
       AND c.confdeltype = 'c'
       AND c.convalidated
  ) INTO constraint_is_correct;

  IF NOT constraint_is_correct THEN
    ALTER TABLE mockup_versions
      DROP CONSTRAINT IF EXISTS mockup_versions_mockup_project_id_fkey;

    ALTER TABLE mockup_versions
      ADD CONSTRAINT mockup_versions_mockup_project_id_fkey
      FOREIGN KEY (mockup_project_id)
      REFERENCES mockup_projects(id)
      ON DELETE CASCADE
      NOT VALID;

    ALTER TABLE mockup_versions
      VALIDATE CONSTRAINT mockup_versions_mockup_project_id_fkey;
  END IF;
END
$$;
