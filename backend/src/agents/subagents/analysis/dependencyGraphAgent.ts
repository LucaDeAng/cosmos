/**
 * Dependency Graph Agent
 *
 * Analyzes portfolio items to detect relationships and dependencies:
 * - Text-based detection (mentions in descriptions)
 * - Category-based inference (common integration patterns)
 * - Generates Mermaid diagrams for visualization
 * - Detects conflicts and redundancies
 */

// Types
interface PortfolioItem {
  id: string;
  name: string;
  type: 'product' | 'service';
  category?: string;
  subcategory?: string;
  vendor?: string;
  description?: string;
  strategic_importance?: string;
  strategicAlignment?: number;
}

interface ProductDependency {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  type: 'requires' | 'integrates_with' | 'replaces' | 'extends' | 'conflicts_with';
  confidence: number;
  reason: string;
  detected_by: 'text_analysis' | 'category_inference' | 'vendor_match';
}

interface GraphNode {
  id: string;
  name: string;
  type: 'product' | 'service';
  category: string;
  strategic_importance: string;
  connectionCount: number;
}

interface GraphCluster {
  name: string;
  nodeIds: string[];
}

interface DependencyGraph {
  nodes: GraphNode[];
  edges: ProductDependency[];
  clusters: GraphCluster[];
}

// Common integration patterns between categories
const INTEGRATION_PATTERNS: Record<string, string[]> = {
  'crm': ['data_analytics', 'erp', 'collaboration', 'integration'],
  'erp': ['crm', 'data_analytics', 'infrastructure', 'integration'],
  'cloud_platform': ['infrastructure', 'security', 'development', 'data_analytics'],
  'security': ['cloud_platform', 'infrastructure', 'networking', 'development'],
  'data_analytics': ['cloud_platform', 'erp', 'crm', 'infrastructure'],
  'infrastructure': ['cloud_platform', 'security', 'networking', 'development'],
  'development': ['cloud_platform', 'integration', 'infrastructure', 'collaboration'],
  'integration': ['erp', 'crm', 'cloud_platform', 'data_analytics'],
  'collaboration': ['crm', 'development', 'security'],
  'networking': ['infrastructure', 'security', 'cloud_platform'],
};

// Keywords that suggest dependencies
const DEPENDENCY_KEYWORDS = {
  requires: ['requires', 'depends on', 'needs', 'prerequisite', 'must have', 'built on'],
  integrates_with: ['integrates with', 'connects to', 'syncs with', 'works with', 'compatible with', 'interface to'],
  replaces: ['replaces', 'supersedes', 'migrating from', 'replacing', 'successor to', 'instead of'],
  extends: ['extends', 'plugin for', 'add-on for', 'module for', 'extension of', 'enhances'],
  conflicts_with: ['conflicts with', 'incompatible with', 'not compatible', 'cannot use with'],
};

/**
 * Normalize category name
 */
function normalizeCategory(category: string | undefined): string {
  if (!category) return 'other';
  return category.toLowerCase().replace(/[^a-z]/g, '_').replace(/_+/g, '_');
}

/**
 * Check if text contains mentions of another item
 */
function findTextMentions(text: string, targetName: string): boolean {
  if (!text || !targetName) return false;

  const normalizedText = text.toLowerCase();
  const normalizedTarget = targetName.toLowerCase();

  // Check exact match or word boundary match
  const words = normalizedTarget.split(/\s+/);
  if (words.length === 1) {
    // Single word - check word boundary
    const regex = new RegExp(`\\b${normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(normalizedText);
  }

  // Multi-word - check if all significant words are present
  const significantWords = words.filter(w => w.length > 3);
  if (significantWords.length >= 2) {
    return significantWords.every(word => normalizedText.includes(word));
  }

  return normalizedText.includes(normalizedTarget);
}

/**
 * Detect dependency type from text
 */
function detectDependencyType(text: string): { type: ProductDependency['type']; keyword: string } | null {
  const normalizedText = text.toLowerCase();

  for (const [depType, keywords] of Object.entries(DEPENDENCY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return { type: depType as ProductDependency['type'], keyword };
      }
    }
  }

  return null;
}

/**
 * Analyze dependencies between portfolio items
 */
export async function analyzeDependencies(items: PortfolioItem[]): Promise<DependencyGraph> {
  console.log(`\n🔗 Analyzing dependencies for ${items.length} items...`);

  const edges: ProductDependency[] = [];
  const nodeMap = new Map<string, GraphNode>();

  // Initialize nodes
  for (const item of items) {
    nodeMap.set(item.id, {
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category || 'Other',
      strategic_importance: item.strategic_importance || 'support',
      connectionCount: 0,
    });
  }

  // 1. Text-based detection
  for (const source of items) {
    const sourceText = `${source.name} ${source.description || ''}`.toLowerCase();

    for (const target of items) {
      if (source.id === target.id) continue;

      // Check if source mentions target
      if (findTextMentions(source.description || '', target.name)) {
        // Try to detect specific relationship type
        const detected = detectDependencyType(source.description || '');
        const depType = detected?.type || 'integrates_with';

        // Avoid duplicates
        const existingEdge = edges.find(e =>
          (e.sourceId === source.id && e.targetId === target.id) ||
          (e.sourceId === target.id && e.targetId === source.id && e.type === 'integrates_with')
        );

        if (!existingEdge) {
          edges.push({
            sourceId: source.id,
            sourceName: source.name,
            targetId: target.id,
            targetName: target.name,
            type: depType,
            confidence: 0.8,
            reason: detected
              ? `Found "${detected.keyword}" in description`
              : `"${target.name}" mentioned in description`,
            detected_by: 'text_analysis',
          });

          // Update connection counts
          nodeMap.get(source.id)!.connectionCount++;
          nodeMap.get(target.id)!.connectionCount++;
        }
      }
    }
  }

  // 2. Category-based inference
  for (const source of items) {
    const sourceCategory = normalizeCategory(source.category);
    const relatedCategories = INTEGRATION_PATTERNS[sourceCategory] || [];

    for (const target of items) {
      if (source.id === target.id) continue;

      const targetCategory = normalizeCategory(target.category);

      if (relatedCategories.includes(targetCategory)) {
        // Check if edge already exists
        const existingEdge = edges.find(e =>
          (e.sourceId === source.id && e.targetId === target.id) ||
          (e.sourceId === target.id && e.targetId === source.id)
        );

        if (!existingEdge) {
          edges.push({
            sourceId: source.id,
            sourceName: source.name,
            targetId: target.id,
            targetName: target.name,
            type: 'integrates_with',
            confidence: 0.5,
            reason: `${sourceCategory} typically integrates with ${targetCategory}`,
            detected_by: 'category_inference',
          });

          nodeMap.get(source.id)!.connectionCount++;
          nodeMap.get(target.id)!.connectionCount++;
        }
      }
    }
  }

  // 3. Vendor-based relationships (same vendor = potential integration)
  const vendorItems: Record<string, PortfolioItem[]> = {};
  for (const item of items) {
    if (item.vendor) {
      const vendor = item.vendor.toLowerCase();
      if (!vendorItems[vendor]) vendorItems[vendor] = [];
      vendorItems[vendor].push(item);
    }
  }

  for (const [vendor, vendorItemList] of Object.entries(vendorItems)) {
    if (vendorItemList.length >= 2) {
      for (let i = 0; i < vendorItemList.length; i++) {
        for (let j = i + 1; j < vendorItemList.length; j++) {
          const source = vendorItemList[i];
          const target = vendorItemList[j];

          // Check if edge already exists
          const existingEdge = edges.find(e =>
            (e.sourceId === source.id && e.targetId === target.id) ||
            (e.sourceId === target.id && e.targetId === source.id)
          );

          if (!existingEdge) {
            edges.push({
              sourceId: source.id,
              sourceName: source.name,
              targetId: target.id,
              targetName: target.name,
              type: 'integrates_with',
              confidence: 0.6,
              reason: `Same vendor (${vendor}) - likely native integration`,
              detected_by: 'vendor_match',
            });

            nodeMap.get(source.id)!.connectionCount++;
            nodeMap.get(target.id)!.connectionCount++;
          }
        }
      }
    }
  }

  // Build clusters by category
  const categoryGroups: Record<string, string[]> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(item.id);
  }

  const clusters: GraphCluster[] = Object.entries(categoryGroups)
    .filter(([_, ids]) => ids.length >= 2)
    .map(([name, nodeIds]) => ({ name, nodeIds }));

  console.log(`   Found ${edges.length} dependencies across ${items.length} items`);
  console.log(`   Clusters: ${clusters.length}`);

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    clusters,
  };
}

/**
 * Generate Mermaid diagram from dependency graph
 */
export function generateMermaidDiagram(graph: DependencyGraph): string {
  const lines: string[] = ['flowchart LR'];

  // Add subgraphs for clusters
  for (const cluster of graph.clusters) {
    lines.push(`    subgraph ${cluster.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
    for (const nodeId of cluster.nodeIds) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (node) {
        const shape = node.type === 'product' ? '([' : '{{';
        const shapeEnd = node.type === 'product' ? '])' : '}}';
        const label = node.name.replace(/"/g, "'").substring(0, 30);
        lines.push(`        ${nodeId.replace(/-/g, '_')}${shape}"${label}"${shapeEnd}`);
      }
    }
    lines.push('    end');
  }

  // Add unclustered nodes
  const clusteredIds = new Set(graph.clusters.flatMap(c => c.nodeIds));
  for (const node of graph.nodes) {
    if (!clusteredIds.has(node.id)) {
      const shape = node.type === 'product' ? '([' : '{{';
      const shapeEnd = node.type === 'product' ? '])' : '}}';
      const label = node.name.replace(/"/g, "'").substring(0, 30);
      lines.push(`    ${node.id.replace(/-/g, '_')}${shape}"${label}"${shapeEnd}`);
    }
  }

  // Add edges
  for (const edge of graph.edges) {
    const sourceId = edge.sourceId.replace(/-/g, '_');
    const targetId = edge.targetId.replace(/-/g, '_');

    let arrow = '-->';
    let style = '';

    switch (edge.type) {
      case 'requires':
        arrow = '==>';
        break;
      case 'integrates_with':
        arrow = '---';
        break;
      case 'replaces':
        arrow = '-.->';
        break;
      case 'extends':
        arrow = '-->';
        break;
      case 'conflicts_with':
        arrow = 'x--x';
        style = `style ${sourceId} stroke:#f00`;
        break;
    }

    lines.push(`    ${sourceId} ${arrow} ${targetId}`);
    if (style) lines.push(`    ${style}`);
  }

  // Style conflict edges in red
  const conflicts = graph.edges.filter(e => e.type === 'conflicts_with');
  if (conflicts.length > 0) {
    lines.push('    linkStyle ' + graph.edges.findIndex(e => e.type === 'conflicts_with') + ' stroke:#ff0000,stroke-width:2px');
  }

  return lines.join('\n');
}

/**
 * Detect conflicts from graph
 */
export function detectConflicts(graph: DependencyGraph): ProductDependency[] {
  return graph.edges.filter(e => e.type === 'conflicts_with');
}

/**
 * Get dependency statistics
 */
export function getDependencyStats(graph: DependencyGraph): {
  totalConnections: number;
  avgConnectionsPerNode: number;
  mostConnectedNodes: GraphNode[];
  isolatedNodes: GraphNode[];
  byType: Record<string, number>;
  byDetectionMethod: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const byDetectionMethod: Record<string, number> = {};

  for (const edge of graph.edges) {
    byType[edge.type] = (byType[edge.type] || 0) + 1;
    byDetectionMethod[edge.detected_by] = (byDetectionMethod[edge.detected_by] || 0) + 1;
  }

  const sortedNodes = [...graph.nodes].sort((a, b) => b.connectionCount - a.connectionCount);

  return {
    totalConnections: graph.edges.length,
    avgConnectionsPerNode: graph.nodes.length > 0
      ? graph.edges.length / graph.nodes.length
      : 0,
    mostConnectedNodes: sortedNodes.slice(0, 5),
    isolatedNodes: graph.nodes.filter(n => n.connectionCount === 0),
    byType,
    byDetectionMethod,
  };
}

export default analyzeDependencies;
