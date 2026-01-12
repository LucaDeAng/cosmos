# API Migration Guide: Legacy to New Ingestion Endpoints

**Version**: 1.0
**Date**: 2025-12-17
**Sunset Date**: 2026-03-31 (3 months)

---

## 📋 Overview

This guide helps you migrate from the legacy document ingestion endpoints to the new multi-agent AI ingestion system. The new system provides enhanced AI capabilities, better confidence tracking, and strategic profile integration.

---

## ⚠️ Deprecation Notice

The following endpoints are **deprecated** and will be removed on **March 31, 2026**:

| Deprecated Endpoint | Replacement | Status |
|---------------------|-------------|--------|
| `POST /api/portfolio/upload-document` | `POST /api/portfolio/ingest` | ⚠️ Deprecated |
| `POST /api/portfolio/extract-intelligent` | `POST /api/portfolio/ingest/text` | ⚠️ Deprecated |

**Timeline**:
- ✅ Dec 17, 2025: Deprecation announced
- 📅 Jan 31, 2026: Reminder notifications
- 📅 Feb 28, 2026: Final warning
- 🗑️ Mar 31, 2026: Endpoints removed

---

## 🎯 Why Migrate?

### Old System Limitations
- ❌ Single file upload only
- ❌ Simple confidence score (no breakdown)
- ❌ No strategic profile integration
- ❌ Limited type detection (includes deprecated "initiatives")
- ❌ No field-level confidence tracking

### New System Benefits
- ✅ Multi-file upload (up to 10 files)
- ✅ Multi-level confidence scoring with detailed breakdown
- ✅ Strategic profile integration for smart classification
- ✅ Enhanced RAG semantic search across 7 catalog types
- ✅ Products and services only (initiatives removed)
- ✅ Field-level confidence tracking
- ✅ Extraction metadata with source tracking
- ✅ Better error handling and validation

---

## 📖 Migration #1: Upload Document → Ingest

### Old Endpoint: POST /api/portfolio/upload-document

```typescript
// OLD WAY ❌
const formData = new FormData();
formData.append('file', file);
formData.append('tenantId', tenantId);
formData.append('itemType', 'initiatives'); // deprecated type

const response = await fetch('/api/portfolio/upload-document', {
  method: 'POST',
  body: formData
});

const data = await response.json();
// {
//   success: true,
//   imported: 5,
//   items: [...],
//   preview: [...],
//   extraction: { confidence: 'medium' }
// }
```

### New Endpoint: POST /api/portfolio/ingest

```typescript
// NEW WAY ✅
const formData = new FormData();

// Can add multiple files!
files.forEach(file => {
  formData.append('files', file);
});

formData.append('tenantId', tenantId);
formData.append('userContext', 'Portfolio for tech company'); // optional
formData.append('language', 'it'); // optional
formData.append('typePreference', 'product'); // 'product' or 'service'

const response = await fetch('/api/portfolio/ingest', {
  method: 'POST',
  body: formData
});

const data = await response.json();
// {
//   success: true,
//   requestId: 'req-xxx',
//   items: [
//     {
//       id: '...',
//       name: 'Product Name',
//       type: 'product', // 'product' or 'service' only
//       confidence: 0.85,
//       confidence_breakdown: {
//         overall: 0.85,
//         type: 0.9,
//         fields: { budget: 0.9, owner: 0.85, category: 0.7 },
//         reasoning: ['High confidence - all key fields present'],
//         quality_indicators: {
//           source_clarity: 0.95,
//           rag_match: 0.8,
//           schema_fit: 0.9
//         }
//       },
//       extraction_metadata: {
//         source_type: 'excel_row',
//         source_row: 5
//       },
//       strategicAlignment: 8,  // NEW: from strategic profile
//       businessValue: 9,       // NEW: from strategic profile
//       // ... other fields
//     }
//   ],
//   stats: {
//     filesProcessed: 2,
//     totalExtracted: 15,
//     totalNormalized: 15,
//     byType: {
//       products: 10,
//       services: 5
//     },
//     confidence: 0.82,
//     processingTime: 3500
//   },
//   parsing: [
//     {
//       fileName: 'portfolio.xlsx',
//       itemsExtracted: 10,
//       confidence: 0.9
//     }
//   ],
//   errors: [],
//   warnings: []
// }
```

### Key Differences

| Feature | Old | New |
|---------|-----|-----|
| **Files** | Single file | Multiple files (up to 10) |
| **Types** | initiative/product/service | product/service only |
| **Confidence** | Simple string ('high'/'medium'/'low') | Detailed breakdown (0-1 scale) |
| **Strategic data** | ❌ None | ✅ strategicAlignment, businessValue |
| **Field confidence** | ❌ None | ✅ Per-field tracking |
| **Quality indicators** | ❌ None | ✅ Source clarity, RAG match, schema fit |
| **Metadata** | ❌ None | ✅ Extraction source, page, row |
| **Errors** | Single error message | Array of errors and warnings |

---

## 📖 Migration #2: Extract Intelligent → Ingest Text

### Old Endpoint: POST /api/portfolio/extract-intelligent

```typescript
// OLD WAY ❌
const response = await fetch('/api/portfolio/extract-intelligent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: `Our portfolio includes:
           - Cloud Platform (product, €350k)
           - Security Monitoring (service, €180k)`,
    tenantId: tenantId,
    preferredType: 'mixed'
  })
});

const data = await response.json();
// {
//   success: true,
//   items: [...],
//   extraction: {
//     totalExtracted: 2,
//     averageConfidence: 75,
//     byType: { initiatives: 0, products: 1, services: 1 }
//   }
// }
```

### New Endpoint: POST /api/portfolio/ingest/text

```typescript
// NEW WAY ✅
const response = await fetch('/api/portfolio/ingest/text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: `Our portfolio includes:
           - Cloud Platform (product, €350k)
           - Security Monitoring (service, €180k)`,
    tenantId: tenantId,
    userContext: 'Tech company portfolio', // optional
    language: 'it', // optional
    typePreference: 'mixed' // 'product', 'service', or 'mixed'
  })
});

const data = await response.json();
// Same rich response structure as /ingest endpoint
// {
//   success: true,
//   requestId: 'req-xxx',
//   items: [...], // with confidence_breakdown, strategicAlignment, etc.
//   stats: { ... },
//   errors: [],
//   warnings: []
// }
```

### Key Differences

| Feature | Old | New |
|---------|-----|-----|
| **Input** | text, tenantId, preferredType | text, tenantId, userContext, language, typePreference |
| **Types returned** | initiative/product/service | product/service only |
| **Confidence** | averageConfidence (%) | Individual item confidence with breakdown |
| **Strategic enrichment** | ❌ None | ✅ Auto-calculated from strategic profile |
| **Response format** | Simple extraction object | Rich stats and metadata |

---

## 🔄 Migration Steps

### Step 1: Update API Calls
Replace old endpoints with new ones using the examples above.

### Step 2: Update Type Handling
```typescript
// OLD ❌
if (item.type === 'initiative') { ... }

// NEW ✅
// Remove initiative handling - only 'product' and 'service' now
if (item.type === 'product') { ... }
else if (item.type === 'service') { ... }
```

### Step 3: Use Enhanced Confidence Data
```typescript
// OLD ❌
const confidence = item.confidence; // just a number

// NEW ✅
const { confidence_breakdown } = item;
console.log('Overall:', confidence_breakdown.overall);
console.log('Type confidence:', confidence_breakdown.type);
console.log('Field confidence:', confidence_breakdown.fields);
console.log('Quality indicators:', confidence_breakdown.quality_indicators);
console.log('AI reasoning:', confidence_breakdown.reasoning);
```

### Step 4: Display Strategic Data
```typescript
// NEW - Use strategic enrichment data
if (item.strategicAlignment) {
  displayStrategicFit(item.strategicAlignment); // 1-10 scale
}
if (item.businessValue) {
  displayBusinessValue(item.businessValue); // 1-10 scale
}
```

### Step 5: Handle Multiple Files
```typescript
// NEW - Upload multiple files at once
const formData = new FormData();
selectedFiles.forEach(file => {
  formData.append('files', file); // Note: 'files' not 'file'
});
```

### Step 6: Show Confidence Breakdown UI
```typescript
// NEW - Display transparent AI decisions
if (item.confidence_breakdown && item.confidence < 0.9) {
  return (
    <details>
      <summary>Why {Math.round(item.confidence * 100)}% confidence?</summary>
      <div>
        <h4>Quality Indicators</h4>
        <ProgressBar
          label="Source Clarity"
          value={item.confidence_breakdown.quality_indicators.source_clarity}
        />
        <ProgressBar
          label="RAG Match"
          value={item.confidence_breakdown.quality_indicators.rag_match}
        />

        <h4>AI Reasoning</h4>
        <ul>
          {item.confidence_breakdown.reasoning.map(reason => (
            <li>{reason}</li>
          ))}
        </ul>

        {/* Show fields needing verification */}
        {Object.entries(item.confidence_breakdown.fields)
          .filter(([_, conf]) => conf < 0.8)
          .map(([field, conf]) => (
            <div>⚠️ {field}: {Math.round(conf * 100)}% confidence</div>
          ))
        }
      </div>
    </details>
  );
}
```

---

## ✅ Migration Checklist

### Backend Changes
- [ ] Replace `/upload-document` calls with `/ingest`
- [ ] Replace `/extract-intelligent` calls with `/ingest/text`
- [ ] Update request payload structure
- [ ] Handle new response format
- [ ] Remove initiative type handling

### Frontend Changes
- [ ] Update API client/service layer
- [ ] Update TypeScript interfaces (remove 'initiative' type)
- [ ] Add confidence breakdown UI components
- [ ] Display strategic alignment and business value
- [ ] Show quality indicators
- [ ] Handle multiple file uploads

### Testing
- [ ] Test single file upload
- [ ] Test multiple file upload (new feature)
- [ ] Test text extraction
- [ ] Verify confidence breakdown display
- [ ] Test error handling
- [ ] Verify strategic data shows correctly

### Monitoring
- [ ] Update API monitoring dashboards
- [ ] Set up alerts for old endpoint usage
- [ ] Track migration progress

---

## 🐛 Troubleshooting

### Issue: "items_by_type.initiatives is undefined"
**Cause**: New endpoint doesn't return initiatives
**Fix**: Update code to only expect products and services

```typescript
// OLD ❌
const { initiatives, products, services } = stats.byType;

// NEW ✅
const { products, services } = stats.byType;
```

### Issue: "confidence_breakdown is undefined"
**Cause**: Using old response structure
**Fix**: Access confidence breakdown from item object

```typescript
// Access breakdown
const breakdown = item.confidence_breakdown;
if (breakdown) {
  // Display quality indicators
}
```

### Issue: "strategicAlignment is null"
**Cause**: No strategic profile exists for tenant
**Fix**: This is expected - strategic values only present when profile exists

```typescript
// Check if strategic data available
if (item.strategicAlignment) {
  // Display strategic fit
} else {
  // Show "Configure strategic profile" message
}
```

---

## 📚 Additional Resources

- [Full API Documentation](https://docs.example.com/api/ingestion)
- [Confidence Scoring Guide](https://docs.example.com/confidence-scoring)
- [Strategic Profile Setup](https://docs.example.com/strategic-profile)
- [Migration Support](mailto:support@example.com)

---

## 🤝 Support

Need help with migration?

- 📧 Email: api-support@example.com
- 💬 Slack: #api-migration
- 📖 Docs: https://docs.example.com/migration
- 🎫 Open an issue: https://github.com/your-org/portfolio-api/issues

---

## 📅 Migration Timeline

| Week | Action |
|------|--------|
| Week 1-2 | Review this guide and plan migration |
| Week 3-6 | Implement changes in development |
| Week 7-8 | Test thoroughly in staging |
| Week 9-10 | Deploy to production |
| Week 11-12 | Monitor and verify |
| Week 13+ | Old endpoints removed |

**Don't wait until the last minute!** Start migrating today.

---

**Last Updated**: 2025-12-17
**Version**: 1.0
**Status**: Active Migration Period

