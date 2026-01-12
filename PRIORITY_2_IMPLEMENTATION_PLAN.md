# 🎯 PRIORITY 2: Schema Inference Integration - Implementation Plan

## Obiettivo
Integrare Schema Inference Engine nel data ingestion flow per ridurre del 40-50% la manualità richiesta all'utente nella compilazione dei campi prodotti/servizi.

---

## 📊 Current Flow

```
User uploads file (Excel/CSV/PDF)
   ↓
POST /api/portfolio/ingest
   ↓
dataIngestionOrchestrator
   ├─ parseExcel / parsePDF / parseText → RawExtractedItem[]
   ├─ normalizeItems() → NormalizedItem[]
   │     ├─ detectType() (product vs service)
   │     ├─ getCategoryFromRAG() (category enrichment)
   │     └─ normalizeStatus/Priority()
   └─ Return items to frontend for review
   ↓
Frontend: User reviews/edits/confirms
   ↓
POST /api/portfolio/ingest/save
   ↓
Save to portfolio_products / portfolio_services tables
```

---

## 🎯 NEW Flow (with Schema Inference)

```
User uploads file
   ↓
POST /api/portfolio/ingest
   ↓
dataIngestionOrchestrator
   ├─ parseExcel / parsePDF / parseText → RawExtractedItem[]
   ├─ normalizeItems(items, tenantId) → NormalizedItem[]
   │     ├─ detectType() (product vs service)
   │     ├─ getCategoryFromRAG() (category enrichment)
   │     ├─ getStrategicProfile(tenantId) ✨ NEW
   │     └─ applySchemaInference(item, profile) ✨ NEW
   │           - inferProductSchema() → pre-fill 7+ fields
   │           - inferServiceSchema() → pre-fill 4+ fields
   └─ Return ENRICHED items to frontend (40-50% pre-filled)
   ↓
Frontend: User reviews minimal changes, confirms quickly
   ↓
POST /api/portfolio/ingest/save
   ↓
Save enriched items with inferred fields
```

---

## 🔧 Implementation Tasks

### Task 1: Create Strategic Profile Retrieval Function
**File:** `backend/src/repositories/assessmentSnapshotRepository.ts`

Add new function:
```typescript
export async function getLatestStrategicProfile(
  tenantId: string
): Promise<StrategicAssessmentProfile | null> {
  // Query company_assessment_snapshots
  // Order by created_at DESC
  // Extract strategic_profile from snapshot_data
  // Return parsed StrategicAssessmentProfile
}
```

**Why:** Need to retrieve the strategic profile created during assessment to use for schema inference.

---

### Task 2: Integrate Schema Inference in Normalizer
**File:** `backend/src/agents/subagents/ingestion/normalizerAgent.ts`

**Changes:**

1. **Add imports:**
```typescript
import { inferProductSchema, inferServiceSchema, applyProductInference, applyServiceInference } from '../../utils/schemaInferenceEngine';
import { getLatestStrategicProfile } from '../../../repositories/assessmentSnapshotRepository';
import type { StrategicAssessmentProfile } from '../../schemas/strategicAssessmentSchema';
```

2. **Add to normalizeItems() function:**
```typescript
export async function normalizeItems(input: NormalizerInput): Promise<NormalizerOutput> {
  const startTime = Date.now();

  // STEP 1: Retrieve strategic profile (NEW!)
  console.log(`\n🧠 Retrieving strategic profile for tenant: ${input.tenantId}`);
  const strategicProfile = await getLatestStrategicProfile(input.tenantId);

  if (strategicProfile) {
    console.log(`   ✅ Strategic profile found - Industry: ${strategicProfile.company_identity.industry}`);
    console.log(`   ✅ Will use schema inference to pre-fill fields`);
  } else {
    console.log(`   ⚠️  No strategic profile found - schema inference disabled`);
  }

  // ... existing normalization code ...

  // STEP 2: For each normalized item, apply schema inference (NEW!)
  for (const normalizedItem of normalizedItems) {
    if (strategicProfile) {
      // Apply schema inference based on type
      if (normalizedItem.type === 'product') {
        const inference = inferProductSchema(strategicProfile, {
          name: normalizedItem.name,
          description: normalizedItem.description || '',
          // Pass any existing fields to preserve them
          pricing_model: normalizedItem.pricing_model,
          lifecycle_stage: normalizedItem.lifecycle_stage,
          // ... other fields
        });

        // Apply inferred fields
        Object.assign(normalizedItem, applyProductInference(normalizedItem, inference));

        // Add inference metadata
        normalizedItem._schema_inference = {
          fields_inferred: inference.inferred_fields,
          confidence: inference.confidence_score,
          reasoning: inference.inference_reasoning,
        };
      } else if (normalizedItem.type === 'service') {
        const inference = inferServiceSchema(strategicProfile, {
          name: normalizedItem.name,
          description: normalizedItem.description || '',
          // Pass any existing fields
        });

        // Apply inferred fields
        Object.assign(normalizedItem, applyServiceInference(normalizedItem, inference));

        // Add inference metadata
        normalizedItem._schema_inference = {
          fields_inferred: inference.inferred_fields,
          confidence: inference.confidence_score,
          reasoning: inference.inference_reasoning,
        };
      }
    }
  }

  // ... return results ...
}
```

---

### Task 3: Update NormalizedItem Schema
**File:** `backend/src/agents/subagents/ingestion/normalizerAgent.ts`

Add schema fields to match Product/Service schemas:

```typescript
export const NormalizedItemSchema = z.object({
  // ... existing fields ...

  // NEW: Product/Service-specific fields (for schema inference)
  pricing_model: z.enum(['subscription', 'perpetual', 'usage_based', 'freemium', 'other']).optional(),
  lifecycle_stage: z.enum(['development', 'growth', 'maturity', 'decline', 'sunset']).optional(),
  target_segment: z.enum(['enterprise', 'smb', 'consumer', 'government']).optional(),
  sales_cycle_length: z.enum(['short', 'medium', 'long']).optional(),
  delivery_model: z.enum(['cloud', 'on_premise', 'hybrid', 'saas']).optional(),
  tipo_offerta: z.string().optional(), // product or service type
  tipo_servizio: z.string().optional(), // service-specific
  distribution_channel: z.array(z.string()).optional(),
  strategic_importance: z.enum(['core', 'supporting', 'experimental']).optional(),
  resource_intensity: z.enum(['low', 'medium', 'high']).optional(),

  // Inference metadata
  _schema_inference: z.object({
    fields_inferred: z.array(z.string()),
    confidence: z.number(),
    reasoning: z.array(z.string()),
  }).optional(),
});
```

---

### Task 4: Test Schema Inference Integration
**File:** `backend/test-priority-2-schema-inference.js` (NEW)

Create test script:
```javascript
/**
 * Test Priority 2: Schema Inference Integration
 * Verifies that schema inference is applied during data ingestion
 */

const { ingestText } = require('./dist/agents/subagents/dataIngestionOrchestrator');

async function testSchemaInferenceIntegration() {
  console.log('\\n🧪 Testing Schema Inference Integration\\n');

  // Mock tenant with strategic profile
  const tenantId = 'test-tenant-123';

  // Test 1: Ingest product text
  const productText = `
    CloudPlatform Pro
    Enterprise cloud management platform for large organizations.
    Pricing: Subscription-based
  `;

  console.log('📦 Test 1: Product Ingestion with Schema Inference');
  const productResult = await ingestText(productText, tenantId);

  const productItem = productResult.normalization.items[0];
  console.log('\\n   Inferred Product Fields:');
  if (productItem._schema_inference) {
    console.log(`   - Fields inferred: ${productItem._schema_inference.fields_inferred.length}`);
    console.log(`   - Confidence: ${(productItem._schema_inference.confidence * 100).toFixed(0)}%`);
    console.log(`   - Fields: ${productItem._schema_inference.fields_inferred.join(', ')}`);

    // Show inferred values
    for (const field of productItem._schema_inference.fields_inferred) {
      console.log(`     • ${field}: ${productItem[field]}`);
    }
  } else {
    console.log('   ⚠️  No schema inference metadata found');
  }

  // Test 2: Ingest service text
  const serviceText = `
    24/7 Support Services
    Continuous managed support for IT infrastructure.
    SLA: 99.9% uptime
  `;

  console.log('\\n\\n🔧 Test 2: Service Ingestion with Schema Inference');
  const serviceResult = await ingestText(serviceText, tenantId);

  const serviceItem = serviceResult.normalization.items[0];
  console.log('\\n   Inferred Service Fields:');
  if (serviceItem._schema_inference) {
    console.log(`   - Fields inferred: ${serviceItem._schema_inference.fields_inferred.length}`);
    console.log(`   - Confidence: ${(serviceItem._schema_inference.confidence * 100).toFixed(0)}%`);
    console.log(`   - Fields: ${serviceItem._schema_inference.fields_inferred.join(', ')}`);

    for (const field of serviceItem._schema_inference.fields_inferred) {
      console.log(`     • ${field}: ${serviceItem[field]}`);
    }
  } else {
    console.log('   ⚠️  No schema inference metadata found');
  }

  console.log('\\n✅ Schema Inference Integration Test Complete\\n');
}

testSchemaInferenceIntegration().catch(console.error);
```

---

## 📈 Expected Impact

### Before (Current State):
- User uploads file with 50 products
- Each product has 2-3 fields (name, description, maybe category)
- User must manually fill 12-15 additional fields per product
- **Total manual entry: 50 × 12 = 600 fields**

### After (With Schema Inference):
- User uploads file with 50 products
- Each product has 2-3 fields (name, description)
- Schema inference pre-fills 7-8 fields per product (85% confidence)
- User reviews/edits only 4-5 fields per product
- **Total manual entry: 50 × 5 = 250 fields**
- **Reduction: 58% less manual work! ✨**

---

## 🎯 Acceptance Criteria

✅ Strategic profile is retrieved during normalization
✅ Schema inference is applied to products (7+ fields)
✅ Schema inference is applied to services (4+ fields)
✅ User-specified fields are NEVER overwritten
✅ Inference metadata is included in response (`_schema_inference`)
✅ Frontend receives enriched items with pre-filled fields
✅ Test script passes with >80% confidence
✅ Manual data entry reduced by 40-50%

---

## 🚀 Implementation Order

1. ✅ Create `getLatestStrategicProfile()` function
2. ✅ Update `NormalizedItemSchema` with new fields
3. ✅ Integrate schema inference in `normalizeItems()`
4. ✅ Create test script
5. ✅ Run tests and verify
6. ✅ Document results in PRIORITY_2_COMPLETED.md

---

## ⚠️ Important Notes

1. **Preserve User Data**: NEVER overwrite fields that the user has already filled
2. **Confidence Threshold**: Only apply inferences with confidence > 50%
3. **Fallback Behavior**: If no strategic profile exists, skip schema inference (graceful degradation)
4. **Metadata Transparency**: Always include `_schema_inference` metadata so user can see what was inferred
5. **Frontend Compatibility**: Ensure frontend can handle new enriched fields

---

Created: 2025-01-13
Status: 🚧 IN PROGRESS
Priority: HIGH IMPACT UX
