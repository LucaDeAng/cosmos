# Product Knowledge Layer - Potenziamenti Avanzati V2

**Stato Attuale**: 3-Source Implementation Complete
**Obiettivo**: Portare il sistema da 85% -> 98% accuracy con intelligence proattiva

---

## Gap Analysis

### Cosa FUNZIONA (Implementato):
- Company Catalogs RAG (70+ prodotti curati)
- Icecat MCP (45M+ prodotti tech)
- GS1 Taxonomy (classificazione standard)
- Company History Learning
- Few-shot Examples (30 esempi)
- Industry Templates (5 settori)

### Cosa MANCA (Opportunita):
- Fallback per prodotti non trovati in nessuna source
- Learning dalle correzioni utente (feedback loop)
- Rilevamento duplicati semantici
- Relazioni tra prodotti (dependencies, integrations)
- Competitor intelligence automatica
- Price benchmarking
- Multi-MCP sources (GitHub, Confluence, etc.)

---

## 7 Potenziamenti Prioritari

### 1. Real-Time Web Search Fallback
**Priority**: HIGH | **Impact**: +15% coverage | **Effort**: Medium

**Problema**: Prodotti non trovati in cataloghi ne Icecat restano senza enrichment.

**Soluzione**: Aggiungere 4th source con web search (Brave/Serper API).

```typescript
// backend/src/knowledge/sources/webSearchSource.ts

import { KnowledgeSource, EnrichedProduct } from '../types';

export class WebSearchSource implements KnowledgeSource {
  name = 'web_search';
  priority = 4; // Lower than Icecat/Catalogs, fallback only

  private braveApiKey: string;

  async enrich(item: { name: string; description?: string }): Promise<EnrichedProduct> {
    // Solo se altre sources non hanno trovato nulla
    const query = `${item.name} product specifications pricing`;

    const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
      headers: { 'X-Subscription-Token': this.braveApiKey },
      body: JSON.stringify({ q: query, count: 5 })
    });

    const results = await response.json();

    // Estrai info strutturate con LLM
    const extracted = await this.extractWithLLM(results.web.results, item.name);

    return {
      enriched_fields: extracted.fields,
      confidence: 0.6, // Lower confidence for web results
      source: 'web_search',
      url: results.web.results[0]?.url
    };
  }

  private async extractWithLLM(results: any[], productName: string) {
    const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });

    const prompt = `
Extract structured product info from these search results for "${productName}":

${results.map(r => `- ${r.title}: ${r.description}`).join('\n')}

Return JSON: { vendor, category, pricing_model, target_segment, features: [] }
`;

    return await llm.invoke(prompt);
  }
}
```

**ENV**: `BRAVE_API_KEY=your_key` (o `SERPER_API_KEY`)

---

### 2. Active Learning from User Corrections
**Priority**: HIGH | **Impact**: +10% accuracy over time | **Effort**: Medium

**Problema**: Quando l'utente corregge un campo, il sistema non impara.

**Soluzione**: Salvare correzioni -> Usarle per future estrazioni.

```typescript
// backend/src/knowledge/learning/correctionLearner.ts

interface Correction {
  tenant_id: string;
  original_item: Partial<NormalizedItem>;
  corrected_item: NormalizedItem;
  corrected_fields: string[];
  created_at: Date;
}

export class CorrectionLearner {

  // Chiamato quando user salva item editato
  async recordCorrection(
    tenantId: string,
    original: Partial<NormalizedItem>,
    corrected: NormalizedItem
  ): Promise<void> {
    const correctedFields = this.detectChanges(original, corrected);

    if (correctedFields.length === 0) return;

    // Salva in Supabase
    await supabase.from('ingestion_corrections').insert({
      tenant_id: tenantId,
      original_item: original,
      corrected_item: corrected,
      corrected_fields: correctedFields,
      item_name_embedding: await this.embedText(corrected.name)
    });

    console.log(`Learned ${correctedFields.length} corrections for "${corrected.name}"`);
  }

  // Chiamato durante enrichment per applicare correzioni simili
  async applyLearnedCorrections(
    tenantId: string,
    item: NormalizedItem
  ): Promise<Partial<NormalizedItem>> {
    const itemEmbedding = await this.embedText(item.name);

    // Trova correzioni simili
    const { data: similar } = await supabase.rpc('match_corrections', {
      tenant_id: tenantId,
      query_embedding: itemEmbedding,
      threshold: 0.85,
      limit: 3
    });

    if (!similar?.length) return {};

    // Applica pattern di correzione piu comune
    const patterns = this.analyzePatterns(similar);

    return {
      ...patterns.suggestedFields,
      _learned_from: similar.map(s => s.corrected_item.name)
    };
  }

  private analyzePatterns(corrections: Correction[]) {
    // Trova campi corretti piu frequentemente
    const fieldFrequency: Record<string, any[]> = {};

    for (const c of corrections) {
      for (const field of c.corrected_fields) {
        if (!fieldFrequency[field]) fieldFrequency[field] = [];
        fieldFrequency[field].push(c.corrected_item[field]);
      }
    }

    // Per ogni campo, prendi valore piu comune
    const suggestedFields: Record<string, any> = {};
    for (const [field, values] of Object.entries(fieldFrequency)) {
      suggestedFields[field] = this.mostCommon(values);
    }

    return { suggestedFields, confidence: 0.8 };
  }
}
```

**Database Migration**:
```sql
-- Supabase migration
CREATE TABLE ingestion_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  original_item JSONB,
  corrected_item JSONB NOT NULL,
  corrected_fields TEXT[] NOT NULL,
  item_name_embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON ingestion_corrections
  USING ivfflat (item_name_embedding vector_cosine_ops);
```

---

### 3. Product Relationship Graph
**Priority**: MEDIUM | **Impact**: Strategic insights | **Effort**: High

**Problema**: Non sappiamo quali prodotti si integrano, dipendono l'uno dall'altro, o competono.

**Soluzione**: Knowledge Graph con relazioni prodotto.

```typescript
// backend/src/knowledge/graph/productRelationshipGraph.ts

type RelationType =
  | 'integrates_with'    // M365 <-> Azure AD
  | 'depends_on'         // App -> Database -> Server
  | 'upgrades_to'        // M365 Business Basic -> Premium
  | 'competes_with'      // M365 <-> Google Workspace
  | 'bundles'            // M365 includes Teams, SharePoint
  | 'requires_license';  // Power BI Pro requires M365

interface ProductRelation {
  source_product: string;
  target_product: string;
  relation_type: RelationType;
  confidence: number;
  metadata?: {
    integration_level?: 'native' | 'api' | 'third_party';
    migration_effort?: 'low' | 'medium' | 'high';
  };
}

export class ProductRelationshipGraph {

  // Inferisci relazioni automaticamente
  async inferRelationships(
    products: NormalizedItem[]
  ): Promise<ProductRelation[]> {
    const llm = new ChatOpenAI({ model: 'gpt-4o' });

    const prompt = `
Analyze these IT products and identify relationships:

Products:
${products.map(p => `- ${p.name}: ${p.description || ''}`).join('\n')}

Identify relationships of these types:
- integrates_with: Products that work together
- depends_on: Product A requires Product B
- upgrades_to: Product A is upgraded version of B
- competes_with: Alternative/competitor products
- bundles: Product A includes Product B

Return JSON array: [
  { "source": "Product A", "target": "Product B", "relation": "integrates_with", "confidence": 0.9 }
]
`;

    const response = await llm.invoke(prompt);
    return JSON.parse(response.content);
  }

  // Query: "Cosa succede se rimuovo M365?"
  async impactAnalysis(productName: string): Promise<{
    direct_dependents: string[];
    integration_breaks: string[];
    suggested_replacements: string[];
  }> {
    // Query Neo4j o Supabase graph queries
  }

  // Query: "Quali prodotti si integrano con Salesforce?"
  async findIntegrations(productName: string): Promise<ProductRelation[]> {
    // ...
  }
}
```

**Use Cases**:
- **Portfolio Assessment**: "Se rimuoviamo Oracle DB, quali app si rompono?"
- **Migration Planning**: "Vogliamo passare da M365 a Google Workspace, cosa cambia?"
- **Bundle Optimization**: "Stiamo pagando 3 tool che fanno la stessa cosa?"

---

### 4. Semantic Deduplication
**Priority**: HIGH | **Impact**: Data quality | **Effort**: Low

**Problema**: Stesso prodotto con nomi diversi (es. "M365", "Microsoft 365", "Office 365").

**Soluzione**: Embedding-based deduplication.

```typescript
// backend/src/knowledge/deduplication/semanticDeduplicator.ts

interface DuplicateCluster {
  canonical_name: string;
  variants: string[];
  confidence: number;
}

export class SemanticDeduplicator {

  private knownAliases: Map<string, string> = new Map([
    // Hardcoded common aliases
    ['m365', 'Microsoft 365'],
    ['office 365', 'Microsoft 365'],
    ['o365', 'Microsoft 365'],
    ['aws', 'Amazon Web Services'],
    ['gcp', 'Google Cloud Platform'],
    ['k8s', 'Kubernetes'],
    ['postgres', 'PostgreSQL'],
    ['mongo', 'MongoDB'],
  ]);

  async findDuplicates(items: NormalizedItem[]): Promise<DuplicateCluster[]> {
    const clusters: DuplicateCluster[] = [];
    const processed = new Set<string>();

    for (const item of items) {
      if (processed.has(item.id)) continue;

      // Check hardcoded aliases first
      const canonical = this.checkKnownAliases(item.name);
      if (canonical) {
        const variants = items.filter(i =>
          this.checkKnownAliases(i.name) === canonical && i.id !== item.id
        );
        if (variants.length > 0) {
          clusters.push({
            canonical_name: canonical,
            variants: [item.name, ...variants.map(v => v.name)],
            confidence: 0.95
          });
          variants.forEach(v => processed.add(v.id));
        }
        continue;
      }

      // Semantic similarity check
      const similar = await this.findSemanticallySimilar(item, items);
      if (similar.length > 0) {
        clusters.push({
          canonical_name: item.name, // First item is canonical
          variants: similar.map(s => s.name),
          confidence: similar[0].similarity
        });
        similar.forEach(s => processed.add(s.id));
      }

      processed.add(item.id);
    }

    return clusters;
  }

  async mergeDuplicates(
    items: NormalizedItem[],
    clusters: DuplicateCluster[]
  ): Promise<NormalizedItem[]> {
    // Merge items in each cluster, keeping most complete data
    for (const cluster of clusters) {
      const canonical = items.find(i => i.name === cluster.canonical_name);
      const variants = items.filter(i => cluster.variants.includes(i.name));

      // Merge fields: keep non-null values from all variants
      for (const variant of variants) {
        for (const [key, value] of Object.entries(variant)) {
          if (value && !canonical[key]) {
            canonical[key] = value;
          }
        }
        // Add note about merge
        canonical.normalizationNotes.push(
          `Merged with duplicate: "${variant.name}"`
        );
      }

      // Remove variant items
      items = items.filter(i => !cluster.variants.includes(i.name) || i.name === cluster.canonical_name);
    }

    return items;
  }
}
```

---

### 5. Competitor Intelligence
**Priority**: MEDIUM | **Impact**: Strategic value | **Effort**: Medium

**Problema**: User deve ricercare manualmente alternative ai prodotti.

**Soluzione**: Auto-suggest competitors per ogni prodotto.

```typescript
// backend/src/knowledge/intelligence/competitorIntelligence.ts

interface CompetitorInfo {
  name: string;
  vendor: string;
  category: string;
  key_differentiators: string[];
  pricing_comparison: 'cheaper' | 'similar' | 'more_expensive' | 'unknown';
  market_position: 'leader' | 'challenger' | 'niche' | 'unknown';
}

export class CompetitorIntelligence {

  // Database di competitor noti (curato)
  private competitorMap: Record<string, string[]> = {
    'Microsoft 365': ['Google Workspace', 'Zoho Workplace', 'LibreOffice'],
    'Salesforce': ['HubSpot', 'Microsoft Dynamics 365', 'Zoho CRM', 'Pipedrive'],
    'AWS EC2': ['Azure Virtual Machines', 'Google Compute Engine', 'DigitalOcean Droplets'],
    'Slack': ['Microsoft Teams', 'Discord', 'Mattermost'],
    'Jira': ['Azure DevOps', 'Monday.com', 'Asana', 'Linear'],
    'Snowflake': ['Databricks', 'Google BigQuery', 'Amazon Redshift'],
    // ... 100+ mappings
  };

  async findCompetitors(productName: string): Promise<CompetitorInfo[]> {
    // 1. Check curated database
    const known = this.competitorMap[productName];
    if (known) {
      return await this.enrichCompetitors(known);
    }

    // 2. Use LLM for unknown products
    const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
    const response = await llm.invoke(`
      List 3-5 main competitors for "${productName}" in the enterprise software market.
      Return JSON: ["Competitor 1", "Competitor 2", ...]
    `);

    const competitors = JSON.parse(response.content);
    return await this.enrichCompetitors(competitors);
  }

  private async enrichCompetitors(names: string[]): Promise<CompetitorInfo[]> {
    // Enrich each competitor with Icecat/Catalogs/Web
    const orchestrator = getProductKnowledgeOrchestrator();

    return Promise.all(names.map(async name => {
      const enriched = await orchestrator.enrichItem({ name });
      return {
        name,
        vendor: enriched.vendor || 'Unknown',
        category: enriched.category || 'Unknown',
        key_differentiators: [], // Could be enriched with web search
        pricing_comparison: 'unknown',
        market_position: 'unknown'
      };
    }));
  }
}
```

---

### 6. Price Intelligence
**Priority**: LOW | **Impact**: Budget optimization | **Effort**: High

**Problema**: Non abbiamo storico prezzi ne benchmarking.

**Soluzione**: Tracking prezzi + confronto mercato.

```typescript
// backend/src/knowledge/intelligence/priceIntelligence.ts

interface PriceDataPoint {
  product_name: string;
  vendor: string;
  price: number;
  currency: string;
  pricing_model: 'per_user' | 'per_month' | 'per_year' | 'one_time';
  tier: string;
  recorded_at: Date;
  source: 'icecat' | 'catalog' | 'user_input' | 'web_scrape';
}

export class PriceIntelligence {

  async trackPrice(item: NormalizedItem): Promise<void> {
    if (!item.budget) return;

    await supabase.from('price_history').insert({
      product_name: item.name,
      vendor: item.vendor,
      price: item.budget,
      currency: 'EUR',
      pricing_model: item.pricing_model,
      tenant_id: item.tenant_id,
      recorded_at: new Date()
    });
  }

  async getPriceTrend(productName: string): Promise<{
    current: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    change_percent: number;
    history: PriceDataPoint[];
  }> {
    const { data: history } = await supabase
      .from('price_history')
      .select('*')
      .eq('product_name', productName)
      .order('recorded_at', { ascending: false })
      .limit(12);

    // Calculate trend
    const current = history[0]?.price || 0;
    const oldest = history[history.length - 1]?.price || current;
    const change = ((current - oldest) / oldest) * 100;

    return {
      current,
      trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
      change_percent: change,
      history
    };
  }

  async benchmarkVsMarket(
    productName: string,
    tenantPrice: number
  ): Promise<{
    market_average: number;
    percentile: number; // 0-100
    recommendation: string;
  }> {
    // Aggregate prices from all tenants (anonymized)
    const { data } = await supabase
      .from('price_history')
      .select('price')
      .eq('product_name', productName);

    const prices = data.map(d => d.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sorted = [...prices].sort((a, b) => a - b);
    const percentile = (sorted.indexOf(tenantPrice) / sorted.length) * 100;

    return {
      market_average: avg,
      percentile,
      recommendation: percentile > 75
        ? 'Warning: Stai pagando piu della media di mercato'
        : percentile < 25
        ? 'OK: Ottimo prezzo rispetto al mercato'
        : 'Prezzo nella media'
    };
  }
}
```

---

### 7. Multi-MCP Integration
**Priority**: MEDIUM | **Impact**: Coverage | **Effort**: Low per source

**Problema**: Solo Icecat come MCP source.

**Soluzione**: Integrare altri MCP servers.

```typescript
// backend/src/knowledge/sources/mcpSources.ts

// GitHub MCP - per software open source
export class GitHubMCPSource implements KnowledgeSource {
  name = 'github_mcp';
  priority = 5;

  async enrich(item: { name: string }): Promise<EnrichedProduct> {
    // Search GitHub repos
    const repos = await this.searchRepos(item.name);

    if (repos.length === 0) return { enriched_fields: {}, confidence: 0 };

    const topRepo = repos[0];
    return {
      enriched_fields: {
        vendor: topRepo.owner.login,
        category: 'Open Source Software',
        license: topRepo.license?.name,
        github_url: topRepo.html_url,
        stars: topRepo.stargazers_count,
        last_updated: topRepo.updated_at
      },
      confidence: 0.75,
      source: 'github'
    };
  }
}

// Confluence MCP - per documentazione interna
export class ConfluenceMCPSource implements KnowledgeSource {
  name = 'confluence_mcp';
  priority = 6;

  async enrich(item: { name: string }): Promise<EnrichedProduct> {
    // Search internal documentation
    const pages = await this.searchPages(item.name);

    return {
      enriched_fields: {
        internal_docs: pages.map(p => p.title),
        internal_owner: pages[0]?.author,
        last_review_date: pages[0]?.updated
      },
      confidence: 0.8,
      source: 'confluence'
    };
  }
}

// Notion MCP - per knowledge base
export class NotionMCPSource implements KnowledgeSource {
  name = 'notion_mcp';
  priority = 6;

  // Similar pattern...
}
```

---

## Prioritization Matrix

| Enhancement | Impact | Effort | Priority Score |
|-------------|--------|--------|---------------|
| Active Learning | +10% accuracy | Medium | 5/5 |
| Semantic Dedup | Data quality | Low | 5/5 |
| Web Search Fallback | +15% coverage | Medium | 4/5 |
| Product Relationships | Strategic | High | 3/5 |
| Competitor Intel | Strategic | Medium | 3/5 |
| Multi-MCP | Coverage | Low/each | 3/5 |
| Price Intelligence | Budget | High | 2/5 |

---

## Implementation Roadmap

### Phase 1: Foundation
1. Already done: 3-source implementation
2. Semantic Deduplication
3. Active Learning database schema

### Phase 2: Learning
4. Active Learning from corrections
5. Confidence calibration

### Phase 3: Intelligence
6. Web Search Fallback
7. Competitor Intelligence
8. Product Relationship Graph (basic)

### Phase 4: Advanced
9. Multi-MCP sources (GitHub, Confluence)
10. Price Intelligence

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Extraction Accuracy | ~85% | 95%+ | User corrections rate |
| Coverage | ~70% | 90%+ | Items with enrichment |
| Auto-accept Rate | ~40% | 70%+ | Confidence > 90% |
| Duplicate Detection | 0% | 95%+ | Manual audit |
| Time to First Value | ~30s | ~10s | Processing time |

---

**Created**: 2025-12-19
**Status**: Ready for Implementation
**Priority**: HIGH - Core Product Intelligence
