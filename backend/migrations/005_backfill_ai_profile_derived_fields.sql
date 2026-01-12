-- Migration: 005_backfill_ai_profile_derived_fields.sql
-- Backfill derived UX-friendly fields into company_assessments.ai_profile
-- Adds 'digitalMaturity' (label from ppmMaturityLevel) and 'innovationIndex' (avg of governance/visibility)

BEGIN;

-- Update assessments where the derived fields are missing
UPDATE company_assessments
SET ai_profile = ai_profile || jsonb_build_object(
  'digitalMaturity',
  COALESCE(
    ai_profile->>'digitalMaturity',
    CASE
      WHEN ai_profile->>'ppmMaturityLevel' IS NOT NULL THEN
        CASE (ai_profile->>'ppmMaturityLevel')::int
          WHEN 1 THEN 'Starter'
          WHEN 2 THEN 'Emergente'
          WHEN 3 THEN 'Definito'
          WHEN 4 THEN 'Gestito'
          WHEN 5 THEN 'Ottimizzato'
          ELSE NULL
        END
      ELSE NULL
    END
  ),
  'innovationIndex',
  COALESCE(
    (ai_profile->>'innovationIndex')::int,
    CASE
      WHEN (ai_profile->>'governanceScore') IS NOT NULL AND (ai_profile->>'visibilityScore') IS NOT NULL
        THEN (( (ai_profile->>'governanceScore')::int + (ai_profile->>'visibilityScore')::int ) / 2)
      ELSE 0
    END
  )
)
WHERE ai_profile IS NOT NULL
  AND (ai_profile->>'digitalMaturity' IS NULL OR ai_profile->>'innovationIndex' IS NULL);

COMMIT;
