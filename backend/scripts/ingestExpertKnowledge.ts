/**
 * Expert Knowledge Ingestion Script
 * 
 * Reads all expert knowledge documents from the knowledge directory,
 * chunks them appropriately, generates embeddings, and stores them
 * in the pgvector-enabled knowledge_embeddings table.
 * 
 * Usage: npx ts-node scripts/ingestExpertKnowledge.ts
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

import { 
  storeEmbeddings, 
  chunkText, 
  KnowledgeChunk,
  SourceType 
} from '../src/agents/utils/embeddingService';

// Knowledge directory structure
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'src', 'agents', 'knowledge');

// Mapping of directories to source types
const DIRECTORY_SOURCE_MAP: Record<string, SourceType> = {
  'frameworks': 'framework',
  'methodologies': 'methodology',
  'benchmarks': 'benchmark',
  'best-practices': 'best_practice',
  'catalogs': 'catalog',
};

// System company ID for shared expert knowledge
// Use a special UUID that represents system-wide knowledge
const SYSTEM_COMPANY_ID = '00000000-0000-0000-0000-000000000000';

interface KnowledgeDocument {
  filePath: string;
  fileName: string;
  sourceType: SourceType;
  content: string;
  metadata: {
    title: string;
    category: string;
    source?: string;
    tags?: string[];
  };
}

/**
 * Parse markdown document to extract metadata and content
 */
function parseMarkdownDocument(content: string, fileName: string): { 
  title: string; 
  metadata: Record<string, string>;
  body: string;
} {
  const lines = content.split('\n');
  let title = fileName.replace('.md', '').replace(/-/g, ' ');
  const metadata: Record<string, string> = {};
  let bodyStartIndex = 0;

  // Look for title (first H1)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      title = line.replace('# ', '');
      bodyStartIndex = i + 1;
      break;
    }
  }

  // Look for metadata in YAML-like format (- key: value) or **Key:** Value
  for (let i = bodyStartIndex; i < Math.min(bodyStartIndex + 20, lines.length); i++) {
    const line = lines[i].trim();
    
    // Match **Key:** Value format
    const metaMatch = line.match(/^\*\*([^:]+):\*\*\s*(.+)$/);
    if (metaMatch) {
      metadata[metaMatch[1].toLowerCase()] = metaMatch[2];
    }
    
    // Match - key: value format (YAML-like in markdown)
    const yamlMatch = line.match(/^-\s*(\w+):\s*(.+)$/);
    if (yamlMatch) {
      metadata[yamlMatch[1].toLowerCase()] = yamlMatch[2];
    }
  }

  const body = lines.slice(bodyStartIndex).join('\n').trim();

  return { title, metadata, body };
}

/**
 * Extract tags from document content
 */
function extractTags(content: string, sourceType: SourceType): string[] {
  const tags: string[] = [sourceType];
  
  // Common tag patterns to look for
  const tagPatterns: Record<string, string[]> = {
    consulting: ['mckinsey', 'bcg', 'gartner', 'forrester', 'deloitte', 'accenture'],
    framework: ['7s', 'horizon', 'matrix', 'hype cycle', 'pace', 'swot', 'porter'],
    methodology: ['wsjf', 'safe', 'agile', 'lean', 'scrum', 'prioritization'],
    domain: ['it budget', 'portfolio', 'transformation', 'digital', 'strategy'],
  };

  const lowerContent = content.toLowerCase();
  
  for (const [category, patterns] of Object.entries(tagPatterns)) {
    for (const pattern of patterns) {
      if (lowerContent.includes(pattern)) {
        tags.push(pattern.replace(/\s+/g, '-'));
      }
    }
  }

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Scan knowledge directory and collect all documents
 */
async function collectKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const documents: KnowledgeDocument[] = [];

  // Check if knowledge directory exists
  if (!fs.existsSync(KNOWLEDGE_BASE_DIR)) {
    console.error(`Knowledge directory not found: ${KNOWLEDGE_BASE_DIR}`);
    return documents;
  }

  // Scan each subdirectory
  for (const [dirName, defaultSourceType] of Object.entries(DIRECTORY_SOURCE_MAP)) {
    const dirPath = path.join(KNOWLEDGE_BASE_DIR, dirName);
    
    if (!fs.existsSync(dirPath)) {
      console.log(`Skipping non-existent directory: ${dirPath}`);
      continue;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    console.log(`Found ${files.length} files in ${dirName}/`);

    for (const fileName of files) {
      const filePath = path.join(dirPath, fileName);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const { title, metadata, body } = parseMarkdownDocument(content, fileName);
      
      // Use category from metadata if available (e.g., catalog_it_services)
      // Otherwise fall back to directory-based source type
      const sourceType = (metadata.category as SourceType) || defaultSourceType;
      
      const tags = extractTags(content, sourceType);

      documents.push({
        filePath,
        fileName,
        sourceType,
        content: body,
        metadata: {
          title,
          category: dirName,
          source: metadata.source || 'internal',
          tags,
        },
      });
    }
  }

  return documents;
}

/**
 * Generate a deterministic UUID from a string (for stable IDs across runs)
 */
function generateStableUuid(input: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(input).digest('hex');
  // Format as UUID v4-like: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Chunk and prepare documents for embedding
 */
function prepareChunks(documents: KnowledgeDocument[]): KnowledgeChunk[] {
  const allChunks: KnowledgeChunk[] = [];

  for (const doc of documents) {
    // Use smaller chunks for expert knowledge to maintain context precision
    const chunks = chunkText(doc.content, 2000, 200);
    
    // Generate a stable UUID based on the filename
    const stableSourceId = generateStableUuid(`expert-knowledge:${doc.fileName}`);
    
    console.log(`  ${doc.fileName}: ${chunks.length} chunks (ID: ${stableSourceId.slice(0, 8)}...)`);

    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        content: chunks[i],
        sourceType: doc.sourceType,
        sourceId: stableSourceId,  // Use stable UUID instead of filename
        metadata: {
          ...doc.metadata,
          chunkIndex: i,
          totalChunks: chunks.length,
          fileName: doc.fileName,
          originalId: doc.fileName.replace('.md', ''),  // Keep original ID in metadata
        },
        chunkIndex: i,
        totalChunks: chunks.length,
      });
    }
  }

  return allChunks;
}

/**
 * Main ingestion function
 */
async function ingestExpertKnowledge(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('THEMIS Expert Knowledge Ingestion');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Step 1: Collect documents
  console.log('📁 Scanning knowledge directory...');
  const documents = await collectKnowledgeDocuments();
  
  if (documents.length === 0) {
    console.error('No documents found to ingest.');
    return;
  }
  
  console.log(`\n✓ Found ${documents.length} knowledge documents\n`);

  // Step 2: Prepare chunks
  console.log('📄 Chunking documents...');
  const chunks = prepareChunks(documents);
  console.log(`\n✓ Created ${chunks.length} chunks for embedding\n`);

  // Step 3: Generate embeddings and store
  console.log('🔮 Generating embeddings and storing in pgvector...');
  console.log('  (This may take a few minutes)\n');

  try {
    const startTime = Date.now();
    const ids = await storeEmbeddings(SYSTEM_COMPANY_ID, chunks);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✓ Successfully stored ${ids.length} embeddings in ${duration}s`);
  } catch (error) {
    console.error('Error storing embeddings:', error);
    throw error;
  }

  // Step 4: Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('INGESTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const summary: Record<string, number> = {};
  for (const doc of documents) {
    summary[doc.sourceType] = (summary[doc.sourceType] || 0) + 1;
  }
  
  console.log('\nDocuments by type:');
  for (const [type, count] of Object.entries(summary)) {
    console.log(`  • ${type}: ${count} documents`);
  }
  
  console.log(`\nTotal chunks embedded: ${chunks.length}`);
  console.log('\nExpert knowledge is now available for RAG queries.');
  console.log('Agents can access frameworks, methodologies, benchmarks,');
  console.log('and best practices through semantic search.');
}

// Run if called directly
if (require.main === module) {
  ingestExpertKnowledge()
    .then(() => {
      console.log('\n✅ Ingestion completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Ingestion failed:', error);
      process.exit(1);
    });
}

export { ingestExpertKnowledge, collectKnowledgeDocuments };
