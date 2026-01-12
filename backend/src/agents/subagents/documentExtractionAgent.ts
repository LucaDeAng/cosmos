/**
 * Document Extraction Agent
 * 
 * Agente AI specializzato nell'estrazione di iniziative, prodotti e servizi
 * da documenti caricati (PDF, Excel, CSV, testo).
 * 
 * Utilizza LLM per comprendere il contenuto non strutturato e estrarre
 * informazioni strutturate in formato PortfolioItem.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import type { PortfolioItem } from '../schemas/portfolioAssessmentSchema';

// ==================== Types ====================

export interface DocumentExtractionInput {
  /** Contenuto del documento (testo estratto) */
  content: string;
  /** Tipo di documento originale */
  documentType: 'pdf' | 'excel' | 'csv' | 'json' | 'text';
  /** Tipo di items da estrarre */
  targetType: 'products' | 'services' | 'mixed';
  /** Nome del file originale */
  fileName?: string;
  /** Contesto aggiuntivo dall'utente */
  userContext?: string;
  /** Lingua preferita per l'output */
  language?: 'it' | 'en';
}

export interface ExtractionResult {
  success: boolean;
  items: PortfolioItem[];
  summary: {
    totalExtracted: number;
    byType: {
      products: number;
      services: number;
    };
    confidence: 'high' | 'medium' | 'low';
    warnings: string[];
  };
  metadata: {
    processingTime: number;
    modelUsed: string;
    documentLength: number;
  };
}

// ==================== System Prompt ====================

const EXTRACTION_SYSTEM_PROMPT = `Sei un esperto analista di documenti aziendali specializzato nell'estrazione di informazioni su iniziative strategiche, prodotti e servizi IT.

## IL TUO COMPITO
Analizza il contenuto del documento fornito ed estrai TUTTE le iniziative, prodotti o servizi menzionati, strutturandoli in formato JSON.

## COSA CERCARE

### Iniziative (type: "initiative")
- Progetti strategici, trasformazioni digitali
- Programmi di cambiamento organizzativo
- Investimenti IT pianificati o in corso
- Modernizzazione sistemi
- Implementazioni ERP, CRM, cloud migration
- Progetti di innovazione

### Prodotti (type: "product")
- Software e applicazioni
- Piattaforme tecnologiche
- Sistemi e tool interni
- Prodotti commercializzati

### Servizi (type: "service")
- Servizi IT erogati
- Supporto e manutenzione
- Consulenza e formazione
- Managed services

## FORMATO OUTPUT
Rispondi SOLO con un JSON valido nel seguente formato:

{
  "items": [
    {
      "name": "Nome dell'iniziativa/prodotto/servizio",
      "description": "Descrizione dettagliata",
      "type": "initiative" | "product" | "service",
      "status": "planned" | "active" | "on-hold" | "completed" | "cancelled",
      "priority": "critical" | "high" | "medium" | "low",
      "category": "Categoria (es: Digital Transformation, Cloud, Security, ERP)",
      "owner": "Responsabile se menzionato",
      "budget": numero o null,
      "businessValue": numero stimato o null,
      "riskLevel": "low" | "medium" | "high" | "critical",
      "startDate": "YYYY-MM-DD" o null,
      "endDate": "YYYY-MM-DD" o null,
      "expectedROI": numero percentuale o null,
      "strategicFit": "Obiettivo strategico collegato",
      "dependencies": ["eventuali dipendenze"],
      "tags": ["tag", "rilevanti"]
    }
  ],
  "confidence": "high" | "medium" | "low",
  "warnings": ["eventuali avvisi o incertezze"]
}

## REGOLE IMPORTANTI
1. Estrai TUTTE le iniziative/prodotti/servizi trovati, anche se parzialmente descritti
2. Se un campo non è esplicitamente menzionato, usa null o un valore ragionevole basato sul contesto
3. Mantieni i nomi originali dal documento
4. Se trovi importi in valuta, convertili in numeri (es: "€500K" -> 500000)
5. Inferisci lo status dal contesto (es: "lanceremo" = planned, "stiamo implementando" = active)
6. Se il documento è generico, indica confidence: "low"
7. NON inventare informazioni non presenti nel documento

## GESTIONE DOCUMENTI DIFFICILI
- Se il documento è una tabella, estrai ogni riga come item separato
- Se il documento è narrativo, identifica ogni progetto/prodotto/servizio menzionato
- Se il documento contiene elenchi puntati, trattali come items separati
- Se il documento è in italiano, mantieni i testi in italiano
`;

// ==================== Agent Class ====================

export class DocumentExtractionAgent {
  private model: ChatOpenAI;
  private modelName: string;

  constructor() {
    this.modelName = 'gpt-4o-mini';
    this.model = new ChatOpenAI({
      modelName: this.modelName,
      temperature: 0.1, // Bassa temperatura per output più deterministico
      maxTokens: 4000,
    });
  }

  /**
   * Estrae items da un documento usando AI
   */
  async extractFromDocument(input: DocumentExtractionInput): Promise<ExtractionResult> {
    const startTime = Date.now();
    console.log(`📄 Document Extraction Agent - Processing ${input.documentType} document`);

    try {
      // Prepara il prompt
      const userPrompt = this.buildUserPrompt(input);

      // Chiama il modello
      const response = await this.model.invoke([
        new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ]);

      const responseText = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);

      // Parse della risposta
      const parsed = this.parseResponse(responseText);
      
      // Aggiungi ID e normalizza gli items
      const items = parsed.items.map((item: Record<string, unknown>) => this.normalizeItem(item, input.targetType));

      const processingTime = Date.now() - startTime;
      console.log(`✅ Extracted ${items.length} items in ${processingTime}ms`);

      return {
        success: true,
        items,
        summary: {
          totalExtracted: items.length,
          byType: this.countByType(items),
          confidence: parsed.confidence || 'medium',
          warnings: parsed.warnings || [],
        },
        metadata: {
          processingTime,
          modelUsed: this.modelName,
          documentLength: input.content.length,
        },
      };

    } catch (error) {
      console.error('❌ Document extraction error:', error);
      
      // Fallback: prova estrazione basica
      const fallbackItems = this.fallbackExtraction(input);
      
      return {
        success: fallbackItems.length > 0,
        items: fallbackItems,
        summary: {
          totalExtracted: fallbackItems.length,
          byType: this.countByType(fallbackItems),
          confidence: 'low',
          warnings: ['AI extraction failed, using basic pattern matching'],
        },
        metadata: {
          processingTime: Date.now() - startTime,
          modelUsed: 'fallback',
          documentLength: input.content.length,
        },
      };
    }
  }

  /**
   * Estrae da file Excel
   */
  async extractFromExcel(filePath: string, targetType: string): Promise<ExtractionResult> {
    const workbook = XLSX.readFile(filePath);
    const allItems: PortfolioItem[] = [];
    const warnings: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

      if (data.length === 0) continue;

      // Se sembra una tabella strutturata, mappa direttamente
      if (this.isStructuredTable(data)) {
        const items = data.map(row => this.mapExcelRow(row, targetType));
        allItems.push(...items);
      } else {
        // Altrimenti usa AI per interpretare
        const textContent = XLSX.utils.sheet_to_csv(worksheet);
        const result = await this.extractFromDocument({
          content: textContent,
          documentType: 'excel',
          targetType: targetType as 'products' | 'services' | 'mixed',
        });
        allItems.push(...result.items);
        warnings.push(...result.summary.warnings);
      }
    }

    return {
      success: allItems.length > 0,
      items: allItems,
      summary: {
        totalExtracted: allItems.length,
        byType: this.countByType(allItems),
        confidence: allItems.length > 0 ? 'high' : 'low',
        warnings,
      },
      metadata: {
        processingTime: 0,
        modelUsed: 'excel-parser',
        documentLength: 0,
      },
    };
  }

  /**
   * Estrae da file PDF (richiede testo già estratto)
   */
  async extractFromPDFText(pdfText: string, targetType: string, fileName?: string): Promise<ExtractionResult> {
    return this.extractFromDocument({
      content: pdfText,
      documentType: 'pdf',
      targetType: targetType as 'products' | 'services' | 'mixed',
      fileName,
    });
  }

  // ==================== Private Methods ====================

  private buildUserPrompt(input: DocumentExtractionInput): string {
    let prompt = `DOCUMENTO DA ANALIZZARE (${input.documentType.toUpperCase()})`;
    
    if (input.fileName) {
      prompt += `\nNome file: ${input.fileName}`;
    }
    
    prompt += `\nTipo items da estrarre: ${input.targetType}`;
    
    if (input.userContext) {
      prompt += `\nContesto utente: ${input.userContext}`;
    }
    
    prompt += `\n\n--- CONTENUTO DOCUMENTO ---\n${input.content}\n--- FINE DOCUMENTO ---`;
    
    prompt += `\n\nEstrai tutti gli items (${input.targetType}) dal documento sopra. Rispondi SOLO con JSON valido.`;
    
    return prompt;
  }

  private parseResponse(response: string): { items: Record<string, unknown>[]; confidence: 'high' | 'medium' | 'low'; warnings: string[] } {
    // Trova il JSON nella risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        items: parsed.items || [],
        confidence: parsed.confidence || 'medium',
        warnings: parsed.warnings || [],
      };
    } catch (e) {
      // Prova a estrarre array diretto
      const arrayMatch = response.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return {
          items: JSON.parse(arrayMatch[0]),
          confidence: 'medium',
          warnings: ['Parsed as array only'],
        };
      }
      throw new Error('Failed to parse JSON response');
    }
  }

  private normalizeItem(item: Record<string, unknown>, targetType: string): PortfolioItem {
    const typeMap: Record<string, 'product' | 'service'> = {
      'products': 'product',
      'services': 'service',
      'mixed': (item.type as 'product' | 'service') || 'product',
    };

    const normalized: PortfolioItem = {
      id: uuidv4(),
      name: (item.name as string) || 'Unnamed Item',
      description: (item.description as string) || '',
      type: (item.type as 'product' | 'service') || typeMap[targetType] || 'product',
      status: (item.status as 'active' | 'paused' | 'completed' | 'cancelled' | 'proposed') || 'active',
      category: (item.category as string) || 'General',
      owner: item.owner as string | undefined,
      budget: typeof item.budget === 'number' ? item.budget : undefined,
      businessValue: typeof item.businessValue === 'number' ? item.businessValue : undefined,
      riskLevel: (item.riskLevel as 'low' | 'medium' | 'high' | 'critical') || 'medium',
      startDate: item.startDate as string | undefined,
      endDate: item.endDate as string | undefined,
      roi: typeof item.roi === 'number' || typeof item.expectedROI === 'number' 
        ? (item.roi as number) || (item.expectedROI as number) 
        : undefined,
      strategicAlignment: typeof item.strategicAlignment === 'number' || typeof item.strategicFit === 'number'
        ? (item.strategicAlignment as number) || (item.strategicFit as number)
        : undefined,
      dependencies: (item.dependencies as string[]) || [],
      tags: (item.tags as string[]) || [],
      kpis: [],
    };

    return normalized;
  }

  private countByType(items: PortfolioItem[]): { products: number; services: number } {
    return {
      products: items.filter(i => i.type === 'product').length,
      services: items.filter(i => i.type === 'service').length,
    };
  }

  private isStructuredTable(data: Record<string, unknown>[]): boolean {
    if (data.length === 0) return false;
    
    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    const expectedHeaders = ['name', 'nome', 'description', 'descrizione', 'status', 'stato', 'budget', 'project', 'progetto'];
    
    return expectedHeaders.some(h => headers.includes(h));
  }

  private mapExcelRow(row: Record<string, unknown>, targetType: string): PortfolioItem {
    const fieldMap: Record<string, string> = {
      'nome': 'name',
      'descrizione': 'description',
      'stato': 'status',
      'proprietario': 'owner',
      'responsabile': 'owner',
      'budget': 'budget',
      'valore': 'businessValue',
      'rischio': 'riskLevel',
      'categoria': 'category',
      'priorita': 'priority',
      'priorità': 'priority',
    };

    const mapped: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim();
      const targetKey = fieldMap[normalizedKey] || normalizedKey;
      mapped[targetKey] = value;
    }

    return this.normalizeItem(mapped, targetType);
  }

  private fallbackExtraction(input: DocumentExtractionInput): PortfolioItem[] {
    const items: PortfolioItem[] = [];
    const lines = input.content.split('\n').filter(l => l.trim());
    
    // Pattern per identificare potenziali items
    const patterns = [
      /^(?:progetto|project|iniziativa|initiative)\s*[:\-]?\s*(.+)/i,
      /^(?:\d+[\.\)])\s*(.+)/,  // Elenchi numerati
      /^[\-\*•]\s*(.+)/,        // Elenchi puntati
      /^([A-Z][A-Za-z\s]+(?:Project|Sistema|Platform|App|Tool))/,
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match && match[1] && match[1].length > 5 && match[1].length < 200) {
          items.push(this.normalizeItem({
            name: match[1].trim(),
            description: '',
          }, input.targetType));
          break;
        }
      }
    }

    // Deduplica per nome
    const unique = items.filter((item, index, self) => 
      index === self.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase())
    );

    return unique.slice(0, 50); // Limita a 50 items
  }
}

// ==================== Export Singleton ====================

export const documentExtractionAgent = new DocumentExtractionAgent();
