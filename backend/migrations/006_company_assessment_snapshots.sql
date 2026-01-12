-- Migration: Create company_assessment_snapshots table
-- Created: 2025-11-30

-- Ensure uuid support exists (project already uses uuid-ossp)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table to store generated assessment snapshots (one per assessment_id)
CREATE TABLE IF NOT EXISTS public.company_assessment_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id TEXT NOT NULL,
  tenant_id TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a unique constraint so a single assessment_id maps to one latest snapshot
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_assessment_snapshots_assessment_id ON public.company_assessment_snapshots (assessment_id);

-- Helpful index for tenant lookups
CREATE INDEX IF NOT EXISTS idx_company_assessment_snapshots_tenant_id ON public.company_assessment_snapshots (tenant_id);
