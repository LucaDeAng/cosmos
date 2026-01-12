# Database Migration Guide

## Product/Service Schema Enhancement Migration

This guide covers the database migration to support the new 3-section schema for Products and Services.

---

## Table of Contents

1. [Overview](#overview)
2. [What's New](#whats-new)
3. [Migration Files](#migration-files)
4. [Pre-Migration Checklist](#pre-migration-checklist)
5. [Running the Migration](#running-the-migration)
6. [Post-Migration Verification](#post-migration-verification)
7. [Rollback Procedure](#rollback-procedure)
8. [API Changes](#api-changes)

---

## Overview

### Purpose

This migration enhances the existing `products` and `services` tables to support:

- **3-section schema structure** (A: Identity, B: Value, C: GTM/Pricing)
- **Completeness scoring** to track data quality
- **Missing field tracking** to identify gaps
- **Q&A session support** for gathering missing data
- **Structured JSONB storage** for rich data

### Schema Version

- **Current Version**: 0 (legacy schema)
- **New Version**: 1 (enhanced schema)

---

## What's New

### New Columns in `products` table:

| Column | Type | Description |
|--------|------|-------------|
| `schema_version` | INTEGER | Schema version tracking (default: 1) |
| `item_type` | TEXT | Always 'product' |
| `completeness_score` | DECIMAL(3,2) | Data completeness (0-1 scale) |
| `identity_data` | JSONB | Section A: Identity & Classification |
| `value_proposition_data` | JSONB | Section B: Customer & Value Proposition |
| `go_to_market_data` | JSONB | Section C: Go-to-market & Pricing |
| `missing_fields` | JSONB | Array of missing field paths |
| `data_sources` | JSONB | Array of data source identifiers |
| `last_reviewed` | TIMESTAMPTZ | Last review timestamp |
| `tipo_offerta` | TEXT | Type of offering (saas, on_premise, etc.) |
| `linea_di_business` | TEXT | Business line |
| `target_market` | JSONB | Target market definition |
| `technologies` | JSONB | Core technologies array |
| `integrations` | JSONB | Available integrations array |

### New Columns in `services` table:

| Column | Type | Description |
|--------|------|-------------|
| `schema_version` | INTEGER | Schema version tracking (default: 1) |
| `item_type` | TEXT | Always 'service' |
| `completeness_score` | DECIMAL(3,2) | Data completeness (0-1 scale) |
| `identity_data` | JSONB | Section A: Identity & Classification |
| `delivery_data` | JSONB | Section B: Service Delivery & Value |
| `pricing_sla_data` | JSONB | Section C: Pricing & SLA |
| `missing_fields` | JSONB | Array of missing field paths |
| `data_sources` | JSONB | Array of data source identifiers |
| `last_reviewed` | TIMESTAMPTZ | Last review timestamp |
| `tipo_servizio` | TEXT | Type of service (managed_service, consulting, etc.) |
| `delivery_model` | TEXT | Delivery model (fully_managed, remote, etc.) |
| `linea_di_business` | TEXT | Business line |
| `target_market` | JSONB | Target market definition |
| `availability` | JSONB | Service availability (hours, coverage) |
| `sla_data` | JSONB | SLA details |
| `contract_terms` | JSONB | Contract terms |
| `support_channels` | JSONB | Available support channels array |

### New Table: `qa_sessions`

Tracks interactive Q&A sessions for gathering missing data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | TEXT | Unique session identifier |
| `tenant_id` | UUID | Tenant reference |
| `item_type` | TEXT | 'product' or 'service' |
| `item_id` | UUID | Reference to product/service |
| `item_name` | TEXT | Item name for reference |
| `current_data` | JSONB | Current item data |
| `missing_fields` | JSONB | Array of missing fields |
| `completeness_score` | DECIMAL(3,2) | Completeness score |
| `questions_asked` | JSONB | Array of questions asked |
| `answers_received` | JSONB | Array of answers received |
| `status` | TEXT | 'active', 'completed', 'abandoned' |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `completed_at` | TIMESTAMPTZ | Completion timestamp |

### New Database Functions:

- `calculate_product_completeness(product_id UUID)` - Calculates completeness score for a product
- `calculate_service_completeness(service_id UUID)` - Calculates completeness score for a service

---

## Migration Files

### SQL Migration

**File**: `supabase/migrations/006_product_service_schema_enhancement.sql`

This migration:
1. Adds new columns to `products` and `services` tables
2. Updates constraints and indexes
3. Creates `qa_sessions` table
4. Adds helper functions for completeness calculation
5. Adds documentation comments

**Run in Supabase**: This can be applied directly in the Supabase SQL Editor.

### Data Migration Utility

**File**: `src/migrations/migrateProductServiceData.ts`

This TypeScript utility:
1. Fetches all existing products and services
2. Classifies each item using RAG to verify correct type
3. Transforms legacy data to new schema format
4. Calculates completeness scores
5. Identifies missing fields
6. Updates database records

**CLI Script**: `run-migration.js`

---

## Pre-Migration Checklist

Before running the migration:

- [ ] **Backup database** - Create a full backup of your Supabase database
- [ ] **Review SQL migration** - Read through `006_product_service_schema_enhancement.sql`
- [ ] **Check environment variables** - Ensure `.env` has correct Supabase credentials
- [ ] **Compile TypeScript** - Run `npm run build` to compile migration code
- [ ] **Bootstrap RAG** - Ensure RAG is bootstrapped with reference catalogs
- [ ] **Test environment** - Consider testing on a staging database first

---

## Running the Migration

### Step 1: Apply SQL Migration

Apply the SQL schema changes in Supabase:

```bash
# Copy the SQL file content
cat supabase/migrations/006_product_service_schema_enhancement.sql

# Paste into Supabase SQL Editor and run
```

Or use Supabase CLI (if configured):

```bash
supabase migration up
```

### Step 2: Test Data Migration (Dry Run)

Run migration in dry-run mode to preview changes:

```bash
# Test with sample data
node test-migration.js

# Or test with real data (no changes saved)
node run-migration.js --dry-run
```

Review the output to ensure:
- Products and services are classified correctly
- Completeness scores look reasonable
- No unexpected errors

### Step 3: Run Data Migration (Live)

Apply the data migration:

```bash
# Migrate all data
node run-migration.js --live

# Or migrate with custom batch size
node run-migration.js --live --batch-size 100

# Or migrate specific tenant only
node run-migration.js --live --tenant-id YOUR_TENANT_ID
```

### Step 4: Monitor Progress

The migration will output:
- Progress for each batch
- Completeness scores for each item
- Any type classification warnings
- Error details if any occur

Example output:

```
📦 Migrating Products...

   ✅ Migrated product: "Enterprise CRM Platform" (67% complete)
   ✅ Migrated product: "Analytics Dashboard" (53% complete)
   Processed 50/200 products

🔧 Migrating Services...

   ✅ Migrated service: "Managed Cloud Infrastructure" (73% complete)
   ✅ Migrated service: "24/7 Support Services" (80% complete)
   Processed 30/80 services

╔═══════════════════════════════════════════════════════════════╗
║                    MIGRATION SUMMARY                          ║
╚═══════════════════════════════════════════════════════════════╝

   Products Processed: 200
   Products Migrated: 200
   Services Processed: 80
   Services Migrated: 80
   Type Changes Detected: 0
   Errors: 0

✅ MIGRATION COMPLETE
```

---

## Post-Migration Verification

After migration completes, verify:

### 1. Check Completeness Scores

```sql
-- Products with low completeness
SELECT id, name, completeness_score, array_length(missing_fields, 1) as missing_count
FROM products
WHERE completeness_score < 0.5
ORDER BY completeness_score ASC
LIMIT 10;

-- Services with low completeness
SELECT id, name, completeness_score, array_length(missing_fields, 1) as missing_count
FROM services
WHERE completeness_score < 0.5
ORDER BY completeness_score ASC
LIMIT 10;
```

### 2. Verify Structured Data

```sql
-- Check products have identity data
SELECT id, name,
       identity_data ? 'product_id' as has_product_id,
       identity_data ? 'nome_prodotto' as has_nome,
       identity_data ? 'categoria_prodotto' as has_categoria
FROM products
LIMIT 5;

-- Check services have identity data
SELECT id, name,
       identity_data ? 'service_id' as has_service_id,
       identity_data ? 'nome_servizio' as has_nome,
       identity_data ? 'categoria_servizio' as has_categoria
FROM services
LIMIT 5;
```

### 3. Test Helper Functions

```sql
-- Test completeness calculation
SELECT
  id,
  name,
  completeness_score,
  calculate_product_completeness(id) as calculated_score
FROM products
LIMIT 5;
```

### 4. Check for Errors

```sql
-- Products with errors (completeness = 0)
SELECT id, name, missing_fields
FROM products
WHERE completeness_score = 0;

-- Services with errors (completeness = 0)
SELECT id, name, missing_fields
FROM services
WHERE completeness_score = 0;
```

---

## Rollback Procedure

If you need to rollback the migration:

### Step 1: Restore Data from Backup

```bash
# Restore from your database backup
# (Specific commands depend on your backup method)
```

### Step 2: Drop New Columns (Optional)

If you only want to remove new columns but keep data:

```sql
-- Products table
ALTER TABLE products DROP COLUMN IF EXISTS schema_version;
ALTER TABLE products DROP COLUMN IF EXISTS item_type;
ALTER TABLE products DROP COLUMN IF EXISTS completeness_score;
ALTER TABLE products DROP COLUMN IF EXISTS identity_data;
ALTER TABLE products DROP COLUMN IF EXISTS value_proposition_data;
ALTER TABLE products DROP COLUMN IF EXISTS go_to_market_data;
ALTER TABLE products DROP COLUMN IF EXISTS missing_fields;
ALTER TABLE products DROP COLUMN IF EXISTS data_sources;
ALTER TABLE products DROP COLUMN IF EXISTS last_reviewed;
ALTER TABLE products DROP COLUMN IF EXISTS tipo_offerta;
ALTER TABLE products DROP COLUMN IF EXISTS linea_di_business;
ALTER TABLE products DROP COLUMN IF EXISTS target_market;
ALTER TABLE products DROP COLUMN IF EXISTS technologies;
ALTER TABLE products DROP COLUMN IF EXISTS integrations;

-- Services table
ALTER TABLE services DROP COLUMN IF EXISTS schema_version;
ALTER TABLE services DROP COLUMN IF EXISTS item_type;
ALTER TABLE services DROP COLUMN IF EXISTS completeness_score;
ALTER TABLE services DROP COLUMN IF EXISTS identity_data;
ALTER TABLE services DROP COLUMN IF EXISTS delivery_data;
ALTER TABLE services DROP COLUMN IF EXISTS pricing_sla_data;
ALTER TABLE services DROP COLUMN IF EXISTS missing_fields;
ALTER TABLE services DROP COLUMN IF EXISTS data_sources;
ALTER TABLE services DROP COLUMN IF EXISTS last_reviewed;
ALTER TABLE services DROP COLUMN IF EXISTS tipo_servizio;
ALTER TABLE services DROP COLUMN IF EXISTS delivery_model;
ALTER TABLE services DROP COLUMN IF EXISTS linea_di_business;
ALTER TABLE services DROP COLUMN IF EXISTS target_market;
ALTER TABLE services DROP COLUMN IF EXISTS availability;
ALTER TABLE services DROP COLUMN IF EXISTS sla_data;
ALTER TABLE services DROP COLUMN IF EXISTS contract_terms;
ALTER TABLE services DROP COLUMN IF EXISTS support_channels;

-- Drop QA sessions table
DROP TABLE IF EXISTS qa_sessions;

-- Drop helper functions
DROP FUNCTION IF EXISTS calculate_product_completeness(UUID);
DROP FUNCTION IF EXISTS calculate_service_completeness(UUID);
```

---

## API Changes

### New TypeScript Types

Import from `src/types/database.ts`:

```typescript
import { ProductRow, ServiceRow, QASessionRow } from './types/database';
import { isProduct, isService } from './types/database';
```

### Using Structured Data

```typescript
// Create product with structured data
const product: ProductInsert = {
  name: 'My Product',
  description: 'Product description',
  status: 'active',
  owner: 'Product Team',

  // New fields
  schema_version: 1,
  item_type: 'product',
  completeness_score: 0.67,
  identity_data: {
    product_id: 'uuid-here',
    nome_prodotto: 'My Product',
    categoria_prodotto: 'Software',
    tipo_offerta: 'saas',
    // ... other identity fields
  },
  value_proposition_data: {
    segmenti_target: [/* ... */],
    problema_principale: {/* ... */},
    // ... other value prop fields
  },
  go_to_market_data: {
    canali: [/* ... */],
    modello_prezzo: {/* ... */},
    // ... other GTM fields
  },
  missing_fields: ['A.product_id', 'B.value_proposition'],
  data_sources: ['user_input', 'rag_extraction'],
};

// Insert into database
const { data, error } = await supabase
  .from('products')
  .insert(product)
  .select()
  .single();
```

### Calculating Completeness

```typescript
import { calculateCompletenessScore } from './agents/schemas/productSchema';

const score = calculateCompletenessScore(partialProduct);
console.log(`Product is ${Math.round(score * 100)}% complete`);
```

### Identifying Missing Fields

```typescript
import { identifyMissingFields } from './agents/schemas/productSchema';

const missing = identifyMissingFields(partialProduct);
console.log('Missing fields:', missing);
// Output: ['A.product_id', 'B.segmenti_target', 'C.modello_prezzo']
```

---

## Support

For issues or questions:

1. Check migration output logs for error details
2. Review this guide for troubleshooting steps
3. Consult `PRODUCT_SERVICE_SYSTEM.md` for schema details
4. Check database logs in Supabase dashboard

---

## Next Steps

After successful migration:

1. ✅ **API Integration** - Implement endpoints to use new schema
2. ✅ **UI Updates** - Update forms to capture structured data
3. ✅ **Q&A Integration** - Enable interactive Q&A for missing fields
4. ✅ **Monitoring** - Set up alerts for low completeness scores
5. ✅ **Data Quality** - Run Q&A sessions to fill missing fields

See `PRODUCT_SERVICE_SYSTEM.md` for implementation examples.
