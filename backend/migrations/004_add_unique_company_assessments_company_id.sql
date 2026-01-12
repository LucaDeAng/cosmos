-- Migration 004: Add UNIQUE constraint on company_assessments.company_id
-- This migration ensures ON CONFLICT on company_id works for upsert operations.

BEGIN;

-- Defensive: if there are duplicate company_id rows, pick the latest by updated_at and remove others.
-- (If you prefer to keep all duplicates, stop here and review.)

WITH duplicates AS (
  SELECT id
  FROM (
    SELECT id, company_id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY coalesce(updated_at, created_at) DESC) as rn
    FROM company_assessments
  ) t
  WHERE t.rn > 1
)
DELETE FROM company_assessments c
USING duplicates d
WHERE c.id = d.id;

-- Create unique index (constraint) on company_id
ALTER TABLE company_assessments
  ADD CONSTRAINT company_assessments_company_id_key UNIQUE (company_id);

COMMIT;
