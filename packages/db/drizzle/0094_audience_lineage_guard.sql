CREATE OR REPLACE FUNCTION enforce_audience_current_version_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM audience_versions
    WHERE audience_versions.id = NEW.current_version_id
      AND audience_versions.audience_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Audience current version must belong to the same audience';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audience_current_version_lineage_guard
BEFORE INSERT OR UPDATE OF current_version_id ON audiences
FOR EACH ROW
EXECUTE FUNCTION enforce_audience_current_version_lineage();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audience_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM audiences WHERE audiences.id = OLD.audience_id
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audience versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audience_version_immutable_guard
BEFORE UPDATE OR DELETE ON audience_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_audience_version_mutation();
