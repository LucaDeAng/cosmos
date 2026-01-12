# RAG System Optimizations

## Overview

This document describes the comprehensive optimizations applied to the THEMIS RAG (Retrieval Augmented Generation) system to improve search accuracy, relevance, and overall performance.

## Optimization Summary

### 1. Improved Chunking Strategy (✅ Implemented)

**Problem:**
- Original chunk size of 8000 characters was too large
- Reduced semantic precision - embeddings covered too much diverse content
- Harder for embedding model to capture specific concepts

**Solution:**
- Reduced `MAX_CHUNK_SIZE` from 8000 to **1024 characters**
- Adjusted `CHUNK_OVERLAP` from 200 to **128 characters** (~12.5% overlap)
- Added `MIN_CHUNK_SIZE` of **100 characters** to prevent fragments

**Benefits:**
- Better semantic precision - each chunk focuses on specific concepts
- Improved retrieval accuracy - more granular matching
- Research shows 512-1024 chars optimal for most RAG applications

**Enhanced Algorithm:**
1. Priority 1: Break at paragraph boundaries (`\n\n`)
2. Priority 2: Break at sentence boundaries (`. ! ?`)
3. Priority 3: Break at line boundaries (`\n`)
4. Priority 4: Break at word boundaries (` `)
5. Merge small chunks to avoid fragments

---

### 2. Hybrid Search (Dense + Sparse) (✅ Implemented)

**Problem:**
- Pure semantic search (dense vectors) can miss exact keyword matches
- Technical terms, product names, IDs may not embed well semantically

**Solution:**
Implemented hybrid search combining:
- **Dense retrieval:** Semantic similarity via embeddings (cosine distance)
- **Sparse retrieval:** Keyword matching via BM25 algorithm

**Configuration:**
```typescript
{
  useHybridSearch: true,
  hybridAlpha: 0.7  // 70% semantic, 30% keyword
}
```

**BM25 Parameters:**
- `k1 = 1.2`: Term frequency saturation
- `b = 0.75`: Length normalization

**Algorithm:**
1. Fetch 3x more results than needed
2. Calculate BM25 scores for keyword relevance
3. Normalize both semantic and BM25 scores (0-1 range)
4. Combine using weighted average: `alpha * semantic + (1-alpha) * keyword`
5. Re-rank and return top results

**Benefits:**
- Best of both worlds: semantic understanding + exact matches
- Better handling of technical terminology
- Improved recall for specific entity names

---

### 3. Query Expansion with HyDE (✅ Implemented)

**Problem:**
- Single query may not capture all relevant aspects
- Query-document vocabulary mismatch (users ask questions, documents contain answers)

**Solution:**
Implemented **HyDE (Hypothetical Document Embeddings)** and query expansion:

**HyDE Technique:**
1. Generate a hypothetical document that would answer the query using GPT-4o-mini
2. Embed the hypothetical document instead of just the query
3. Search for documents similar to this hypothetical answer

**Query Expansion:**
1. Generate 2-3 alternative phrasings of the query
2. Execute searches for all variations in parallel
3. Aggregate results by ID, averaging similarity scores
4. Return deduplicated, ranked results

**Configuration:**
```typescript
{
  useQueryExpansion: true
  // Or provide pre-expanded queries:
  expandedQueries: ['query1', 'query2', 'query3']
}
```

**Benefits:**
- Bridges query-document vocabulary gap
- Better recall - captures different aspects of the question
- More robust to query phrasing variations

---

### 4. Adaptive Similarity Threshold (✅ Implemented)

**Problem:**
- Fixed threshold (0.7) not optimal for all queries
- Some queries have clear winners, others have gradual decline
- No automatic quality filtering

**Solution:**
Implemented **adaptive threshold** using the "elbow method":

**Algorithm:**
1. Get all result similarity scores
2. Sort in descending order
3. Calculate gaps between consecutive scores
4. Find largest gap (elbow point)
5. Set threshold just below the elbow
6. Constrain threshold to reasonable range (0.5 - 0.9)

**Configuration:**
```typescript
{
  useAdaptiveThreshold: true
}
```

**Example:**
```
Scores: [0.92, 0.90, 0.88, 0.65, 0.63, 0.61]
Gaps:   [0.02, 0.02, 0.23, 0.02, 0.02]
                    ^^^^ Largest gap
Threshold: 0.65 (just below the elbow)
Keeps top 3 high-quality results, filters out 3 mediocre ones
```

**Benefits:**
- Automatic quality filtering
- Adapts to result distribution
- Prevents low-quality results from polluting context

---

### 5. Enhanced Context Formatting (✅ Implemented)

**Problem:**
- Simple markdown formatting lacked structure
- No relevance indicators for LLM
- Metadata not fully utilized
- Hard to distinguish between result quality

**Solution:**
Complete redesign of `formatSearchResultsForContext`:

**Features:**
1. **Structured Headers:** Clear source numbering and relevance scores
2. **Relevance Labels:** "Excellent", "Very Good", "Good", "Moderate", "Fair"
3. **Rich Metadata:** Title, type, category, status, priority, tags
4. **Grouped View Option:** Group results by source type
5. **Smart Truncation:** Handle length constraints gracefully
6. **Increased Limit:** Default from 4000 to 6000 chars

**Configuration:**
```typescript
formatSearchResultsForContext(results, 6000, {
  includeMetadata: true,        // Show rich metadata
  includeSimilarityScores: true, // Show relevance scores
  groupBySource: false,          // Group by type or sequential
  summarize: false               // Auto-truncate long content
})
```

**Example Output:**
```markdown
# Retrieved Knowledge

Found 3 relevant sources.

## Source 1 - 92% match (Excellent)

**Title:** Cloud Migration Strategy
**Type:** Strategy Docs
**Category:** Digital Transformation
**Status:** Active
**Tags:** cloud, migration, AWS

**Content:**

Our cloud migration follows a 3-phase approach...

---

## Source 2 - 87% match (Very Good)

...
```

**Benefits:**
- LLM can better weigh source importance
- Richer context for answer generation
- Better traceability and citations
- Improved user experience

---

## Usage Examples

### Basic Semantic Search (Original)
```typescript
const results = await semanticSearch(
  companyId,
  "What is our cloud migration strategy?",
  {
    limit: 10,
    similarityThreshold: 0.7
  }
);
```

### Optimized Hybrid Search
```typescript
const results = await semanticSearch(
  companyId,
  "What is our cloud migration strategy?",
  {
    limit: 10,
    useHybridSearch: true,
    hybridAlpha: 0.7,
    useAdaptiveThreshold: true
  }
);
```

### Maximum Quality (All Optimizations)
```typescript
const results = await semanticSearch(
  companyId,
  "What is our cloud migration strategy?",
  {
    limit: 10,
    useHybridSearch: true,
    hybridAlpha: 0.7,
    useQueryExpansion: true,
    useAdaptiveThreshold: true
  }
);

// Format with enhanced context
const context = formatSearchResultsForContext(results, 6000, {
  includeMetadata: true,
  includeSimilarityScores: true,
  groupBySource: false
});
```

---

## Performance Considerations

### Computational Cost

| Feature | Cost Impact | Latency Impact | Recommendation |
|---------|-------------|----------------|----------------|
| Hybrid Search | Low | +50-100ms | Enable by default |
| Query Expansion (HyDE) | Medium | +500-1000ms | Use for complex queries |
| Adaptive Threshold | Negligible | +5ms | Enable by default |
| Enhanced Formatting | Negligible | +10ms | Enable by default |

### When to Use Each Optimization

**Always Enable:**
- Hybrid Search (small cost, big benefit)
- Adaptive Threshold (negligible cost)
- Enhanced Formatting (better UX)

**Use Selectively:**
- Query Expansion (HyDE): For complex, multi-faceted questions
  - Good: "What are the best practices for digital transformation?"
  - Skip: "What is the budget for project X?"

---

## Migration Guide

### For Existing Code

**Before:**
```typescript
const results = await semanticSearch(companyId, query);
const context = formatSearchResultsForContext(results);
```

**After (Recommended):**
```typescript
const results = await semanticSearch(companyId, query, {
  useHybridSearch: true,
  useAdaptiveThreshold: true
});

const context = formatSearchResultsForContext(results, 6000, {
  includeMetadata: true,
  includeSimilarityScores: true
});
```

### Backward Compatibility

All optimizations are **opt-in** via options - existing code continues to work without changes.

---

## Testing & Validation

### Recommended Test Cases

1. **Keyword-Heavy Queries:**
   - Test: "Find all mentions of AWS Lambda"
   - Verify: Hybrid search finds exact term matches

2. **Semantic Queries:**
   - Test: "What are our serverless computing options?"
   - Verify: Returns Lambda-related content without exact keyword

3. **Complex Questions:**
   - Test: "How should we approach digital transformation?"
   - Verify: Query expansion finds diverse perspectives

4. **Quality Filtering:**
   - Test queries with mixed-quality results
   - Verify: Adaptive threshold removes low-quality matches

### Metrics to Monitor

- **Precision:** Are top results relevant?
- **Recall:** Are all relevant docs found?
- **MRR (Mean Reciprocal Rank):** How quickly do users find answers?
- **User Feedback:** Thumbs up/down on results

---

## Future Enhancements

### Potential Additions

1. **Cross-Encoder Re-ranking:**
   - Use dedicated re-ranker model for final ranking
   - Higher accuracy but slower

2. **Semantic Caching:**
   - Cache query embeddings for repeated searches
   - Reduce embedding API calls

3. **Multi-Vector Retrieval:**
   - Separate embeddings for title, content, metadata
   - More precise matching

4. **Learning to Rank:**
   - Train model on user feedback
   - Personalized ranking

5. **Query Understanding:**
   - Classify query intent (factual, comparison, how-to)
   - Adjust retrieval strategy accordingly

---

## References

- **BM25 Algorithm:** Robertson & Zaragoza, 2009
- **HyDE:** Gao et al., "Precise Zero-Shot Dense Retrieval", 2022
- **Hybrid Search:** Best practices from Pinecone, Weaviate documentation
- **Chunking Strategy:** LangChain best practices, 2024

---

## Configuration Summary

**Updated Constants:**
```typescript
const MAX_CHUNK_SIZE = 1024;        // ↓ from 8000
const CHUNK_OVERLAP = 128;          // ↓ from 200
const MIN_CHUNK_SIZE = 100;         // NEW
const DEFAULT_HYBRID_ALPHA = 0.7;   // NEW
const BM25_K1 = 1.2;               // NEW
const BM25_B = 0.75;               // NEW
```

**New Options:**
```typescript
interface SearchOptions {
  // ... existing options ...
  useHybridSearch?: boolean;
  hybridAlpha?: number;
  useQueryExpansion?: boolean;
  expandedQueries?: string[];
  useAdaptiveThreshold?: boolean;
}
```

---

## Support

For questions or issues with RAG optimizations:
1. Check this documentation
2. Review code comments in `embeddingService.ts`
3. Test with sample queries
4. Monitor metrics in RAG dashboard

Last Updated: 2025-12-12
