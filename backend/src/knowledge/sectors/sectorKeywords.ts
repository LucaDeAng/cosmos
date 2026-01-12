/**
 * Sector Keywords Configuration
 *
 * Keywords used for fast keyword-based sector detection.
 * Each keyword has a weight that affects the sector score.
 * Higher weight = stronger indicator for that sector.
 */

import type { SectorCode } from '../types';

export interface SectorKeyword {
  keyword: string;
  weight: number;
  language: 'en' | 'it';
}

/**
 * Keyword mappings for each sector
 * Weights: 1.0 = normal, 1.3 = strong indicator, 1.5 = very strong
 */
export const SECTOR_KEYWORDS: Record<SectorCode, SectorKeyword[]> = {
  it_software: [
    // English
    { keyword: 'software', weight: 1.5, language: 'en' },
    { keyword: 'saas', weight: 1.5, language: 'en' },
    { keyword: 'cloud', weight: 1.3, language: 'en' },
    { keyword: 'api', weight: 1.3, language: 'en' },
    { keyword: 'platform', weight: 1.2, language: 'en' },
    { keyword: 'database', weight: 1.2, language: 'en' },
    { keyword: 'erp', weight: 1.4, language: 'en' },
    { keyword: 'crm', weight: 1.4, language: 'en' },
    { keyword: 'microsoft', weight: 1.3, language: 'en' },
    { keyword: 'oracle', weight: 1.3, language: 'en' },
    { keyword: 'sap', weight: 1.4, language: 'en' },
    { keyword: 'aws', weight: 1.3, language: 'en' },
    { keyword: 'azure', weight: 1.3, language: 'en' },
    { keyword: 'server', weight: 1.1, language: 'en' },
    { keyword: 'application', weight: 1.0, language: 'en' },
    { keyword: 'cybersecurity', weight: 1.3, language: 'en' },
    { keyword: 'devops', weight: 1.3, language: 'en' },
    { keyword: 'kubernetes', weight: 1.4, language: 'en' },
    { keyword: 'docker', weight: 1.3, language: 'en' },
    { keyword: 'virtualization', weight: 1.2, language: 'en' },
    { keyword: 'automation', weight: 1.1, language: 'en' },
    { keyword: 'analytics', weight: 1.1, language: 'en' },
    { keyword: 'ai', weight: 1.2, language: 'en' },
    { keyword: 'machine learning', weight: 1.3, language: 'en' },
    { keyword: 'data warehouse', weight: 1.3, language: 'en' },
    { keyword: 'backup', weight: 1.1, language: 'en' },
    { keyword: 'monitoring', weight: 1.1, language: 'en' },
    // Italian
    { keyword: 'software', weight: 1.5, language: 'it' },
    { keyword: 'applicazione', weight: 1.0, language: 'it' },
    { keyword: 'piattaforma', weight: 1.2, language: 'it' },
  ],

  food_beverage: [
    // English
    { keyword: 'food', weight: 1.5, language: 'en' },
    { keyword: 'beverage', weight: 1.5, language: 'en' },
    { keyword: 'organic', weight: 1.2, language: 'en' },
    { keyword: 'calories', weight: 1.4, language: 'en' },
    { keyword: 'nutritional', weight: 1.4, language: 'en' },
    { keyword: 'ingredient', weight: 1.3, language: 'en' },
    { keyword: 'dairy', weight: 1.3, language: 'en' },
    { keyword: 'meat', weight: 1.2, language: 'en' },
    { keyword: 'vegetable', weight: 1.2, language: 'en' },
    { keyword: 'fruit', weight: 1.2, language: 'en' },
    { keyword: 'wine', weight: 1.3, language: 'en' },
    { keyword: 'beer', weight: 1.3, language: 'en' },
    { keyword: 'coffee', weight: 1.3, language: 'en' },
    { keyword: 'tea', weight: 1.2, language: 'en' },
    { keyword: 'snack', weight: 1.2, language: 'en' },
    { keyword: 'frozen', weight: 1.1, language: 'en' },
    { keyword: 'canned', weight: 1.1, language: 'en' },
    { keyword: 'cereal', weight: 1.2, language: 'en' },
    { keyword: 'bakery', weight: 1.3, language: 'en' },
    { keyword: 'confectionery', weight: 1.3, language: 'en' },
    { keyword: 'gluten-free', weight: 1.2, language: 'en' },
    { keyword: 'vegan', weight: 1.2, language: 'en' },
    { keyword: 'nutriscore', weight: 1.5, language: 'en' },
    // Italian
    { keyword: 'alimentare', weight: 1.5, language: 'it' },
    { keyword: 'cibo', weight: 1.5, language: 'it' },
    { keyword: 'bevanda', weight: 1.5, language: 'it' },
    { keyword: 'biologico', weight: 1.2, language: 'it' },
    { keyword: 'calorie', weight: 1.4, language: 'it' },
    { keyword: 'ingrediente', weight: 1.3, language: 'it' },
    { keyword: 'latticino', weight: 1.3, language: 'it' },
    { keyword: 'vino', weight: 1.3, language: 'it' },
    { keyword: 'birra', weight: 1.3, language: 'it' },
    { keyword: 'caffè', weight: 1.3, language: 'it' },
  ],

  consumer_goods: [
    // English
    { keyword: 'cosmetic', weight: 1.5, language: 'en' },
    { keyword: 'beauty', weight: 1.5, language: 'en' },
    { keyword: 'personal care', weight: 1.4, language: 'en' },
    { keyword: 'shampoo', weight: 1.4, language: 'en' },
    { keyword: 'soap', weight: 1.3, language: 'en' },
    { keyword: 'cream', weight: 1.3, language: 'en' },
    { keyword: 'skincare', weight: 1.4, language: 'en' },
    { keyword: 'makeup', weight: 1.4, language: 'en' },
    { keyword: 'lotion', weight: 1.3, language: 'en' },
    { keyword: 'perfume', weight: 1.3, language: 'en' },
    { keyword: 'fragrance', weight: 1.3, language: 'en' },
    { keyword: 'deodorant', weight: 1.3, language: 'en' },
    { keyword: 'hair care', weight: 1.3, language: 'en' },
    { keyword: 'conditioner', weight: 1.3, language: 'en' },
    { keyword: 'household', weight: 1.2, language: 'en' },
    { keyword: 'cleaning', weight: 1.2, language: 'en' },
    { keyword: 'detergent', weight: 1.3, language: 'en' },
    { keyword: 'laundry', weight: 1.2, language: 'en' },
    { keyword: 'inci', weight: 1.5, language: 'en' },
    // Italian
    { keyword: 'cosmetico', weight: 1.5, language: 'it' },
    { keyword: 'bellezza', weight: 1.5, language: 'it' },
    { keyword: 'cura personale', weight: 1.4, language: 'it' },
    { keyword: 'sapone', weight: 1.3, language: 'it' },
    { keyword: 'crema', weight: 1.3, language: 'it' },
    { keyword: 'profumo', weight: 1.3, language: 'it' },
    { keyword: 'detersivo', weight: 1.3, language: 'it' },
  ],

  healthcare_pharma: [
    // English
    { keyword: 'pharmaceutical', weight: 1.5, language: 'en' },
    { keyword: 'drug', weight: 1.5, language: 'en' },
    { keyword: 'medicine', weight: 1.5, language: 'en' },
    { keyword: 'medical', weight: 1.4, language: 'en' },
    { keyword: 'healthcare', weight: 1.4, language: 'en' },
    { keyword: 'therapy', weight: 1.3, language: 'en' },
    { keyword: 'therapeutic', weight: 1.3, language: 'en' },
    { keyword: 'diagnostic', weight: 1.3, language: 'en' },
    { keyword: 'clinical', weight: 1.3, language: 'en' },
    { keyword: 'patient', weight: 1.2, language: 'en' },
    { keyword: 'fda', weight: 1.4, language: 'en' },
    { keyword: 'prescription', weight: 1.4, language: 'en' },
    { keyword: 'vaccine', weight: 1.4, language: 'en' },
    { keyword: 'antibiotic', weight: 1.4, language: 'en' },
    { keyword: 'dosage', weight: 1.3, language: 'en' },
    { keyword: 'tablet', weight: 1.2, language: 'en' },
    { keyword: 'capsule', weight: 1.2, language: 'en' },
    { keyword: 'injection', weight: 1.3, language: 'en' },
    { keyword: 'medical device', weight: 1.4, language: 'en' },
    { keyword: 'hospital', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'farmaceutico', weight: 1.5, language: 'it' },
    { keyword: 'farmaco', weight: 1.5, language: 'it' },
    { keyword: 'medicinale', weight: 1.5, language: 'it' },
    { keyword: 'medico', weight: 1.4, language: 'it' },
    { keyword: 'sanitario', weight: 1.4, language: 'it' },
    { keyword: 'terapia', weight: 1.3, language: 'it' },
    { keyword: 'ospedale', weight: 1.2, language: 'it' },
  ],

  industrial: [
    // English
    { keyword: 'machinery', weight: 1.5, language: 'en' },
    { keyword: 'equipment', weight: 1.4, language: 'en' },
    { keyword: 'industrial', weight: 1.5, language: 'en' },
    { keyword: 'manufacturing', weight: 1.4, language: 'en' },
    { keyword: 'raw material', weight: 1.3, language: 'en' },
    { keyword: 'component', weight: 1.3, language: 'en' },
    { keyword: 'spare part', weight: 1.3, language: 'en' },
    { keyword: 'tool', weight: 1.2, language: 'en' },
    { keyword: 'instrument', weight: 1.2, language: 'en' },
    { keyword: 'hydraulic', weight: 1.3, language: 'en' },
    { keyword: 'pneumatic', weight: 1.3, language: 'en' },
    { keyword: 'valve', weight: 1.2, language: 'en' },
    { keyword: 'pump', weight: 1.2, language: 'en' },
    { keyword: 'motor', weight: 1.2, language: 'en' },
    { keyword: 'bearing', weight: 1.2, language: 'en' },
    { keyword: 'conveyor', weight: 1.3, language: 'en' },
    { keyword: 'forklift', weight: 1.3, language: 'en' },
    { keyword: 'welding', weight: 1.3, language: 'en' },
    // Italian
    { keyword: 'macchinario', weight: 1.5, language: 'it' },
    { keyword: 'industriale', weight: 1.5, language: 'it' },
    { keyword: 'attrezzatura', weight: 1.4, language: 'it' },
    { keyword: 'manifatturiero', weight: 1.4, language: 'it' },
    { keyword: 'componente', weight: 1.3, language: 'it' },
    { keyword: 'ricambio', weight: 1.3, language: 'it' },
  ],

  financial_services: [
    // English
    { keyword: 'bank', weight: 1.5, language: 'en' },
    { keyword: 'banking', weight: 1.5, language: 'en' },
    { keyword: 'insurance', weight: 1.5, language: 'en' },
    { keyword: 'investment', weight: 1.4, language: 'en' },
    { keyword: 'loan', weight: 1.4, language: 'en' },
    { keyword: 'credit', weight: 1.3, language: 'en' },
    { keyword: 'mortgage', weight: 1.4, language: 'en' },
    { keyword: 'payment', weight: 1.3, language: 'en' },
    { keyword: 'fintech', weight: 1.4, language: 'en' },
    { keyword: 'trading', weight: 1.3, language: 'en' },
    { keyword: 'asset', weight: 1.2, language: 'en' },
    { keyword: 'fund', weight: 1.2, language: 'en' },
    { keyword: 'portfolio', weight: 1.2, language: 'en' },
    { keyword: 'wealth', weight: 1.2, language: 'en' },
    { keyword: 'securities', weight: 1.3, language: 'en' },
    { keyword: 'compliance', weight: 1.1, language: 'en' },
    // Italian
    { keyword: 'banca', weight: 1.5, language: 'it' },
    { keyword: 'bancario', weight: 1.5, language: 'it' },
    { keyword: 'assicurazione', weight: 1.5, language: 'it' },
    { keyword: 'investimento', weight: 1.4, language: 'it' },
    { keyword: 'prestito', weight: 1.4, language: 'it' },
    { keyword: 'credito', weight: 1.3, language: 'it' },
    { keyword: 'mutuo', weight: 1.4, language: 'it' },
  ],

  professional_services: [
    // English
    { keyword: 'consulting', weight: 1.5, language: 'en' },
    { keyword: 'consultancy', weight: 1.5, language: 'en' },
    { keyword: 'advisory', weight: 1.4, language: 'en' },
    { keyword: 'audit', weight: 1.4, language: 'en' },
    { keyword: 'legal', weight: 1.3, language: 'en' },
    { keyword: 'law firm', weight: 1.4, language: 'en' },
    { keyword: 'accounting', weight: 1.3, language: 'en' },
    { keyword: 'marketing', weight: 1.2, language: 'en' },
    { keyword: 'recruitment', weight: 1.2, language: 'en' },
    { keyword: 'staffing', weight: 1.2, language: 'en' },
    { keyword: 'training', weight: 1.2, language: 'en' },
    { keyword: 'outsourcing', weight: 1.2, language: 'en' },
    { keyword: 'agency', weight: 1.1, language: 'en' },
    { keyword: 'professional', weight: 1.1, language: 'en' },
    // Italian
    { keyword: 'consulenza', weight: 1.5, language: 'it' },
    { keyword: 'revisione', weight: 1.4, language: 'it' },
    { keyword: 'legale', weight: 1.3, language: 'it' },
    { keyword: 'contabilità', weight: 1.3, language: 'it' },
    { keyword: 'formazione', weight: 1.2, language: 'it' },
    { keyword: 'agenzia', weight: 1.1, language: 'it' },
  ],

  automotive: [
    // English
    { keyword: 'vehicle', weight: 1.5, language: 'en' },
    { keyword: 'car', weight: 1.4, language: 'en' },
    { keyword: 'automotive', weight: 1.5, language: 'en' },
    { keyword: 'automobile', weight: 1.5, language: 'en' },
    { keyword: 'engine', weight: 1.3, language: 'en' },
    { keyword: 'ev', weight: 1.4, language: 'en' },
    { keyword: 'electric vehicle', weight: 1.4, language: 'en' },
    { keyword: 'powertrain', weight: 1.3, language: 'en' },
    { keyword: 'transmission', weight: 1.3, language: 'en' },
    { keyword: 'chassis', weight: 1.3, language: 'en' },
    { keyword: 'brakes', weight: 1.2, language: 'en' },
    { keyword: 'tire', weight: 1.2, language: 'en' },
    { keyword: 'tyre', weight: 1.2, language: 'en' },
    { keyword: 'battery', weight: 1.2, language: 'en' },
    { keyword: 'charging', weight: 1.2, language: 'en' },
    { keyword: 'hybrid', weight: 1.3, language: 'en' },
    { keyword: 'truck', weight: 1.3, language: 'en' },
    { keyword: 'fleet', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'automobile', weight: 1.5, language: 'it' },
    { keyword: 'veicolo', weight: 1.5, language: 'it' },
    { keyword: 'auto', weight: 1.4, language: 'it' },
    { keyword: 'motore', weight: 1.3, language: 'it' },
    { keyword: 'elettrico', weight: 1.2, language: 'it' },
    { keyword: 'batteria', weight: 1.2, language: 'it' },
    { keyword: 'pneumatico', weight: 1.2, language: 'it' },
  ],

  hr_payroll: [
    // English
    { keyword: 'payroll', weight: 1.5, language: 'en' },
    { keyword: 'hr', weight: 1.5, language: 'en' },
    { keyword: 'human resources', weight: 1.5, language: 'en' },
    { keyword: 'employee', weight: 1.3, language: 'en' },
    { keyword: 'salary', weight: 1.4, language: 'en' },
    { keyword: 'wage', weight: 1.3, language: 'en' },
    { keyword: 'benefit', weight: 1.3, language: 'en' },
    { keyword: 'attendance', weight: 1.3, language: 'en' },
    { keyword: 'recruitment', weight: 1.2, language: 'en' },
    { keyword: 'training', weight: 1.2, language: 'en' },
    { keyword: 'leave', weight: 1.2, language: 'en' },
    { keyword: 'tax', weight: 1.2, language: 'en' },
    { keyword: 'deduction', weight: 1.2, language: 'en' },
    { keyword: 'performance review', weight: 1.2, language: 'en' },
    { keyword: 'ats', weight: 1.3, language: 'en' },
    // Italian
    { keyword: 'buste paga', weight: 1.5, language: 'it' },
    { keyword: 'risorse umane', weight: 1.5, language: 'it' },
    { keyword: 'dipendente', weight: 1.3, language: 'it' },
    { keyword: 'stipendio', weight: 1.4, language: 'it' },
    { keyword: 'salario', weight: 1.3, language: 'it' },
    { keyword: 'benefit', weight: 1.3, language: 'it' },
    { keyword: 'presenze', weight: 1.3, language: 'it' },
  ],

  retail_ecommerce: [
    // English
    { keyword: 'retail', weight: 1.5, language: 'en' },
    { keyword: 'ecommerce', weight: 1.5, language: 'en' },
    { keyword: 'e-commerce', weight: 1.5, language: 'en' },
    { keyword: 'shop', weight: 1.3, language: 'en' },
    { keyword: 'store', weight: 1.3, language: 'en' },
    { keyword: 'product', weight: 1.2, language: 'en' },
    { keyword: 'inventory', weight: 1.3, language: 'en' },
    { keyword: 'stock', weight: 1.2, language: 'en' },
    { keyword: 'order', weight: 1.2, language: 'en' },
    { keyword: 'pos', weight: 1.3, language: 'en' },
    { keyword: 'point of sale', weight: 1.3, language: 'en' },
    { keyword: 'payment', weight: 1.2, language: 'en' },
    { keyword: 'shipping', weight: 1.2, language: 'en' },
    { keyword: 'warehouse', weight: 1.2, language: 'en' },
    { keyword: 'logistics', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'negozio', weight: 1.5, language: 'it' },
    { keyword: 'commercio', weight: 1.4, language: 'it' },
    { keyword: 'articolo', weight: 1.2, language: 'it' },
    { keyword: 'magazzino', weight: 1.2, language: 'it' },
    { keyword: 'ordine', weight: 1.2, language: 'it' },
  ],

  supply_chain_logistics: [
    // English
    { keyword: 'logistics', weight: 1.5, language: 'en' },
    { keyword: 'supply chain', weight: 1.5, language: 'en' },
    { keyword: 'warehouse', weight: 1.4, language: 'en' },
    { keyword: 'distribution', weight: 1.4, language: 'en' },
    { keyword: 'shipment', weight: 1.3, language: 'en' },
    { keyword: 'tracking', weight: 1.3, language: 'en' },
    { keyword: 'inventory', weight: 1.3, language: 'en' },
    { keyword: 'procurement', weight: 1.3, language: 'en' },
    { keyword: 'vendor', weight: 1.2, language: 'en' },
    { keyword: 'supplier', weight: 1.2, language: 'en' },
    { keyword: 'freight', weight: 1.2, language: 'en' },
    { keyword: 'customs', weight: 1.2, language: 'en' },
    { keyword: 'transport', weight: 1.3, language: 'en' },
    { keyword: 'routing', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'logistica', weight: 1.5, language: 'it' },
    { keyword: 'catena di fornitura', weight: 1.5, language: 'it' },
    { keyword: 'magazzino', weight: 1.4, language: 'it' },
    { keyword: 'distribuzione', weight: 1.4, language: 'it' },
    { keyword: 'spedizione', weight: 1.3, language: 'it' },
    { keyword: 'tracciamento', weight: 1.3, language: 'it' },
  ],

  real_estate: [
    // English
    { keyword: 'real estate', weight: 1.5, language: 'en' },
    { keyword: 'property', weight: 1.5, language: 'en' },
    { keyword: 'estate', weight: 1.4, language: 'en' },
    { keyword: 'building', weight: 1.3, language: 'en' },
    { keyword: 'lease', weight: 1.3, language: 'en' },
    { keyword: 'rent', weight: 1.3, language: 'en' },
    { keyword: 'mortgage', weight: 1.3, language: 'en' },
    { keyword: 'tenant', weight: 1.2, language: 'en' },
    { keyword: 'landlord', weight: 1.2, language: 'en' },
    { keyword: 'square meter', weight: 1.2, language: 'en' },
    { keyword: 'location', weight: 1.1, language: 'en' },
    { keyword: 'property management', weight: 1.3, language: 'en' },
    // Italian
    { keyword: 'immobiliare', weight: 1.5, language: 'it' },
    { keyword: 'proprietà', weight: 1.5, language: 'it' },
    { keyword: 'immobile', weight: 1.4, language: 'it' },
    { keyword: 'edificio', weight: 1.3, language: 'it' },
    { keyword: 'affitto', weight: 1.3, language: 'it' },
    { keyword: 'mutuo', weight: 1.3, language: 'it' },
    { keyword: 'inquilino', weight: 1.2, language: 'it' },
  ],

  banking: [
    // English
    { keyword: 'bank', weight: 1.5, language: 'en' },
    { keyword: 'banking', weight: 1.5, language: 'en' },
    { keyword: 'account', weight: 1.3, language: 'en' },
    { keyword: 'transaction', weight: 1.3, language: 'en' },
    { keyword: 'deposit', weight: 1.3, language: 'en' },
    { keyword: 'withdrawal', weight: 1.3, language: 'en' },
    { keyword: 'loan', weight: 1.3, language: 'en' },
    { keyword: 'credit', weight: 1.2, language: 'en' },
    { keyword: 'interest', weight: 1.2, language: 'en' },
    { keyword: 'teller', weight: 1.2, language: 'en' },
    { keyword: 'atm', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'banca', weight: 1.5, language: 'it' },
    { keyword: 'bancario', weight: 1.5, language: 'it' },
    { keyword: 'conto', weight: 1.3, language: 'it' },
    { keyword: 'transazione', weight: 1.3, language: 'it' },
    { keyword: 'deposito', weight: 1.3, language: 'it' },
    { keyword: 'prelievo', weight: 1.3, language: 'it' },
    { keyword: 'prestito', weight: 1.3, language: 'it' },
  ],

  insurance: [
    // English
    { keyword: 'insurance', weight: 1.5, language: 'en' },
    { keyword: 'policy', weight: 1.4, language: 'en' },
    { keyword: 'claim', weight: 1.3, language: 'en' },
    { keyword: 'coverage', weight: 1.3, language: 'en' },
    { keyword: 'premium', weight: 1.3, language: 'en' },
    { keyword: 'insured', weight: 1.2, language: 'en' },
    { keyword: 'underwriting', weight: 1.3, language: 'en' },
    { keyword: 'liability', weight: 1.2, language: 'en' },
    { keyword: 'risk', weight: 1.2, language: 'en' },
    { keyword: 'broker', weight: 1.2, language: 'en' },
    // Italian
    { keyword: 'assicurazione', weight: 1.5, language: 'it' },
    { keyword: 'polizza', weight: 1.4, language: 'it' },
    { keyword: 'sinistro', weight: 1.3, language: 'it' },
    { keyword: 'copertura', weight: 1.3, language: 'it' },
    { keyword: 'premio', weight: 1.3, language: 'it' },
    { keyword: 'rischio', weight: 1.2, language: 'it' },
  ],

  unknown: [],
};

/**
 * Get all keywords for a specific sector
 */
export function getSectorKeywords(sector: SectorCode): SectorKeyword[] {
  return SECTOR_KEYWORDS[sector] || [];
}

/**
 * Get all keywords across all sectors (for building a reverse index)
 */
export function getAllKeywords(): Map<string, { sector: SectorCode; weight: number }[]> {
  const keywordMap = new Map<string, { sector: SectorCode; weight: number }[]>();

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    for (const kw of keywords) {
      const key = kw.keyword.toLowerCase();
      if (!keywordMap.has(key)) {
        keywordMap.set(key, []);
      }
      keywordMap.get(key)!.push({
        sector: sector as SectorCode,
        weight: kw.weight,
      });
    }
  }

  return keywordMap;
}

/**
 * All valid sector codes
 */
export const ALL_SECTORS: SectorCode[] = [
  'it_software',
  'food_beverage',
  'consumer_goods',
  'healthcare_pharma',
  'industrial',
  'financial_services',
  'professional_services',
  'automotive',
  'hr_payroll',
  'retail_ecommerce',
  'supply_chain_logistics',
  'real_estate',
  'banking',
  'insurance',
  'unknown',
];
