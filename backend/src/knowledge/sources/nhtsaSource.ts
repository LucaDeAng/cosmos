/**
 * NHTSA Source - National Highway Traffic Safety Administration
 *
 * Provides vehicle information from NHTSA's vPIC (Vehicle Product Information Catalog).
 * NHTSA maintains the official US database of vehicle manufacturers, makes, and models.
 *
 * Features:
 * - VIN decoding for vehicle identification
 * - Vehicle make/model/year lookup
 * - Manufacturer information
 * - Vehicle type classification
 * - Safety recall information
 *
 * API: https://vpic.nhtsa.dot.gov/api/
 * Rate limit: No official limit, but be respectful (~10 req/sec recommended)
 */

import type {
  EnrichmentResult,
  EnrichmentContext,
  SectorCode,
  KnowledgeSourceType,
} from '../types';
import type { EnrichmentSource } from '../registry/sourceRegistry';
import type { ExtractedItem } from '../ProductKnowledgeOrchestrator';

// NHTSA API response types
interface NHTSAVehicle {
  Make: string;
  Model: string;
  ModelYear: string;
  VehicleType: string;
  BodyClass?: string;
  DriveType?: string;
  FuelTypePrimary?: string;
  EngineConfiguration?: string;
  EngineCylinders?: string;
  DisplacementL?: string;
  Manufacturer?: string;
  PlantCountry?: string;
  PlantCity?: string;
  ErrorCode?: string;
}

interface NHTSAMake {
  Make_ID: number;
  Make_Name: string;
}

interface NHTSAManufacturer {
  Mfr_ID: number;
  Mfr_Name: string;
  Mfr_CommonName?: string;
  Country?: string;
}

// Vehicle type mapping
const VEHICLE_TYPES: Record<string, string> = {
  'PASSENGER CAR': 'Passenger Car',
  'TRUCK': 'Truck',
  'MULTIPURPOSE PASSENGER VEHICLE (MPV)': 'SUV/Crossover',
  'BUS': 'Bus',
  'MOTORCYCLE': 'Motorcycle',
  'TRAILER': 'Trailer',
  'LOW SPEED VEHICLE (LSV)': 'Low Speed Vehicle',
  'INCOMPLETE VEHICLE': 'Incomplete Vehicle',
  'OFF ROAD VEHICLE': 'Off-Road Vehicle',
};

// Common vehicle makes for quick matching
const KNOWN_MAKES: Record<string, string> = {
  'audi': 'AUDI',
  'bmw': 'BMW',
  'chevrolet': 'CHEVROLET',
  'chevy': 'CHEVROLET',
  'chrysler': 'CHRYSLER',
  'dodge': 'DODGE',
  'fiat': 'FIAT',
  'ford': 'FORD',
  'gmc': 'GMC',
  'honda': 'HONDA',
  'hyundai': 'HYUNDAI',
  'jeep': 'JEEP',
  'kia': 'KIA',
  'lexus': 'LEXUS',
  'mazda': 'MAZDA',
  'mercedes': 'MERCEDES-BENZ',
  'mercedes-benz': 'MERCEDES-BENZ',
  'mini': 'MINI',
  'nissan': 'NISSAN',
  'porsche': 'PORSCHE',
  'ram': 'RAM',
  'subaru': 'SUBARU',
  'tesla': 'TESLA',
  'toyota': 'TOYOTA',
  'volkswagen': 'VOLKSWAGEN',
  'vw': 'VOLKSWAGEN',
  'volvo': 'VOLVO',
  'alfa romeo': 'ALFA ROMEO',
  'ferrari': 'FERRARI',
  'lamborghini': 'LAMBORGHINI',
  'maserati': 'MASERATI',
  'aston martin': 'ASTON MARTIN',
  'bentley': 'BENTLEY',
  'rolls-royce': 'ROLLS ROYCE',
  'land rover': 'LAND ROVER',
  'jaguar': 'JAGUAR',
  'renault': 'RENAULT',
  'peugeot': 'PEUGEOT',
  'citroen': 'CITROEN',
  'opel': 'OPEL',
  'seat': 'SEAT',
  'skoda': 'SKODA',
  'iveco': 'IVECO',
  'scania': 'SCANIA',
  'man': 'MAN',
  'daf': 'DAF',
  'piaggio': 'PIAGGIO',
  'ducati': 'DUCATI',
  'aprilia': 'APRILIA',
  'vespa': 'PIAGGIO',
};

export class NHTSASource implements EnrichmentSource {
  name: KnowledgeSourceType = 'nhtsa';
  supportedSectors: SectorCode[] = ['automotive'];
  priority = 2;
  confidenceWeight = 0.9;
  cacheTTLSeconds = 86400; // 24 hours

  private baseUrl = 'https://vpic.nhtsa.dot.gov/api/vehicles';
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();

  isEnabled(): boolean {
    return true; // Always enabled - no API key required
  }

  async initialize(): Promise<void> {
    console.log('🚗 Initializing NHTSA Source...');
    console.log('   ✅ NHTSA vPIC API ready');
  }

  async enrich(item: ExtractedItem, context: EnrichmentContext): Promise<EnrichmentResult> {
    const fieldsEnriched: string[] = [];
    const reasoning: string[] = [];
    const enrichedFields: Record<string, unknown> = {};

    // Build search text from item
    const searchText = [
      item.name,
      item.description,
      item.category,
      item.vendor,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    // Check if this looks like a vehicle
    if (!this.isLikelyVehicle(searchText)) {
      return {
        source: this.name,
        confidence: 0.1,
        fields_enriched: [],
        reasoning: ['Item does not appear to be a vehicle'],
        enrichedFields: {},
      };
    }

    // Try to extract VIN if present
    const vin = this.extractVIN(searchText);
    if (vin) {
      try {
        const vinData = await this.decodeVIN(vin);
        if (vinData && !vinData.ErrorCode) {
          enrichedFields.vehicle_vin = vin;
          enrichedFields.vehicle_make = vinData.Make;
          enrichedFields.vehicle_model = vinData.Model;
          enrichedFields.vehicle_year = vinData.ModelYear;
          enrichedFields.vehicle_type = VEHICLE_TYPES[vinData.VehicleType?.toUpperCase()] || vinData.VehicleType;
          if (vinData.BodyClass) enrichedFields.vehicle_body = vinData.BodyClass;
          if (vinData.DriveType) enrichedFields.vehicle_drive = vinData.DriveType;
          if (vinData.FuelTypePrimary) enrichedFields.vehicle_fuel = vinData.FuelTypePrimary;
          if (vinData.Manufacturer) enrichedFields.vehicle_manufacturer = vinData.Manufacturer;

          fieldsEnriched.push('vehicle_vin', 'vehicle_make', 'vehicle_model', 'vehicle_year', 'vehicle_type');
          reasoning.push(`Decoded VIN: ${vin} -> ${vinData.ModelYear} ${vinData.Make} ${vinData.Model}`);

          return {
            source: this.name,
            confidence: 0.95,
            fields_enriched: fieldsEnriched,
            reasoning,
            enrichedFields,
          };
        }
      } catch (error) {
        console.warn('   ⚠️  VIN decode failed:', error);
      }
    }

    // Try to identify make/model from text
    const makeMatch = this.identifyMake(searchText);
    if (makeMatch) {
      enrichedFields.vehicle_make = makeMatch;
      fieldsEnriched.push('vehicle_make');
      reasoning.push(`Identified vehicle make: ${makeMatch}`);

      // Try to identify model
      const modelMatch = this.identifyModel(searchText, makeMatch);
      if (modelMatch) {
        enrichedFields.vehicle_model = modelMatch;
        fieldsEnriched.push('vehicle_model');
        reasoning.push(`Identified vehicle model: ${modelMatch}`);
      }

      // Try to identify year
      const yearMatch = searchText.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        enrichedFields.vehicle_year = yearMatch[0];
        fieldsEnriched.push('vehicle_year');
        reasoning.push(`Identified vehicle year: ${yearMatch[0]}`);
      }

      // Try to identify vehicle type
      const typeMatch = this.identifyVehicleType(searchText);
      if (typeMatch) {
        enrichedFields.vehicle_type = typeMatch;
        fieldsEnriched.push('vehicle_type');
        reasoning.push(`Identified vehicle type: ${typeMatch}`);
      }
    }

    // Check for vehicle parts
    if (this.isVehiclePart(searchText)) {
      enrichedFields.is_vehicle_part = true;
      enrichedFields.part_category = this.identifyPartCategory(searchText);
      fieldsEnriched.push('is_vehicle_part', 'part_category');
      reasoning.push(`Identified as vehicle part: ${enrichedFields.part_category}`);
    }

    const confidence = fieldsEnriched.length > 0 ?
      Math.min(0.5 + (fieldsEnriched.length * 0.1), 0.85) : 0.2;

    return {
      source: this.name,
      confidence,
      fields_enriched: fieldsEnriched,
      reasoning,
      enrichedFields,
    };
  }

  private isLikelyVehicle(text: string): boolean {
    const vehicleKeywords = [
      'car', 'auto', 'vehicle', 'truck', 'suv', 'sedan', 'coupe', 'wagon',
      'hatchback', 'motorcycle', 'moto', 'scooter', 'van', 'bus', 'trailer',
      'automobile', 'autoveicolo', 'veicolo', 'macchina', 'furgone', 'camion',
      'engine', 'motor', 'wheel', 'tire', 'brake', 'suspension', 'transmission',
      'motore', 'ruota', 'pneumatico', 'freno', 'sospensione', 'cambio',
    ];

    // Check for known makes
    for (const make of Object.keys(KNOWN_MAKES)) {
      if (text.includes(make)) return true;
    }

    // Check for vehicle keywords
    return vehicleKeywords.some(kw => text.includes(kw));
  }

  private extractVIN(text: string): string | null {
    // VIN is 17 characters, alphanumeric (no I, O, Q)
    const vinRegex = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
    const match = text.match(vinRegex);
    return match ? match[0].toUpperCase() : null;
  }

  private async decodeVIN(vin: string): Promise<NHTSAVehicle | null> {
    const cacheKey = `vin:${vin}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTLSeconds * 1000) {
      return cached.data as NHTSAVehicle;
    }

    try {
      const url = `${this.baseUrl}/DecodeVinValues/${vin}?format=json`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as { Results?: NHTSAVehicle[] };
      const result = data.Results?.[0];

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result || null;
    } catch {
      return null;
    }
  }

  private identifyMake(text: string): string | null {
    for (const [keyword, make] of Object.entries(KNOWN_MAKES)) {
      if (text.includes(keyword)) {
        return make;
      }
    }
    return null;
  }

  private identifyModel(text: string, make: string): string | null {
    // Common models by make
    const modelPatterns: Record<string, string[]> = {
      'AUDI': ['a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'q3', 'q5', 'q7', 'q8', 'e-tron', 'tt', 'r8'],
      'BMW': ['serie 1', 'serie 2', 'serie 3', 'serie 4', 'serie 5', 'serie 6', 'serie 7', 'serie 8', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'i3', 'i4', 'i7', 'ix', 'm3', 'm4', 'm5'],
      'FIAT': ['500', '500x', '500l', 'panda', 'tipo', 'punto', 'bravo', 'ducato', 'doblo', 'fiorino'],
      'FORD': ['fiesta', 'focus', 'mondeo', 'kuga', 'puma', 'mustang', 'ranger', 'transit', 'f-150', 'explorer', 'escape'],
      'MERCEDES-BENZ': ['classe a', 'classe b', 'classe c', 'classe e', 'classe s', 'gla', 'glb', 'glc', 'gle', 'gls', 'amg', 'eqc', 'eqs', 'eqe', 'sprinter', 'vito'],
      'VOLKSWAGEN': ['golf', 'polo', 'passat', 'tiguan', 'touareg', 't-roc', 't-cross', 'arteon', 'id.3', 'id.4', 'transporter', 'crafter', 'caddy'],
      'TOYOTA': ['yaris', 'corolla', 'camry', 'rav4', 'c-hr', 'land cruiser', 'hilux', 'prius', 'supra', 'aygo'],
      'ALFA ROMEO': ['giulia', 'stelvio', 'giulietta', 'tonale', '4c', 'spider'],
      'FERRARI': ['roma', 'portofino', 'sf90', 'f8', '296', '812', 'purosangue'],
      'LAMBORGHINI': ['huracan', 'urus', 'aventador', 'revuelto'],
      'TESLA': ['model s', 'model 3', 'model x', 'model y', 'cybertruck', 'roadster'],
    };

    const patterns = modelPatterns[make];
    if (!patterns) return null;

    for (const model of patterns) {
      if (text.includes(model.toLowerCase())) {
        return model.toUpperCase();
      }
    }
    return null;
  }

  private identifyVehicleType(text: string): string | null {
    const typeKeywords: Record<string, string[]> = {
      'Sedan': ['sedan', 'berlina', 'saloon'],
      'SUV/Crossover': ['suv', 'crossover', 'fuoristrada', '4x4'],
      'Hatchback': ['hatchback', 'utilitaria'],
      'Station Wagon': ['wagon', 'station', 'touring', 'estate', 'familiare'],
      'Coupe': ['coupe', 'coupé', 'sportiva'],
      'Convertible': ['convertible', 'cabrio', 'spider', 'roadster', 'cabriolet'],
      'Van': ['van', 'furgone', 'minivan', 'monovolume'],
      'Truck': ['truck', 'pickup', 'camion', 'autocarro'],
      'Motorcycle': ['moto', 'motorcycle', 'scooter', 'motocicletta'],
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        return type;
      }
    }
    return null;
  }

  private isVehiclePart(text: string): boolean {
    const partKeywords = [
      'part', 'spare', 'component', 'accessory', 'ricambio', 'componente',
      'brake', 'filter', 'belt', 'pump', 'sensor', 'valve', 'bearing',
      'freno', 'filtro', 'cinghia', 'pompa', 'sensore', 'valvola', 'cuscinetto',
      'battery', 'alternator', 'starter', 'radiator', 'exhaust', 'muffler',
      'batteria', 'alternatore', 'motorino', 'radiatore', 'scarico', 'marmitta',
    ];
    return partKeywords.some(kw => text.includes(kw));
  }

  private identifyPartCategory(text: string): string {
    const categories: Record<string, string[]> = {
      'Engine': ['engine', 'motor', 'piston', 'cylinder', 'motore', 'pistone', 'cilindro', 'valvola', 'turbo'],
      'Transmission': ['transmission', 'gearbox', 'clutch', 'cambio', 'trasmissione', 'frizione'],
      'Brakes': ['brake', 'disc', 'pad', 'caliper', 'freno', 'disco', 'pastiglie', 'pinza'],
      'Suspension': ['suspension', 'shock', 'strut', 'spring', 'sospensione', 'ammortizzatore', 'molla'],
      'Electrical': ['battery', 'alternator', 'starter', 'sensor', 'batteria', 'alternatore', 'sensore', 'faro', 'lampada'],
      'Cooling': ['radiator', 'thermostat', 'fan', 'coolant', 'radiatore', 'termostato', 'ventola'],
      'Exhaust': ['exhaust', 'muffler', 'catalyst', 'scarico', 'marmitta', 'catalizzatore'],
      'Filters': ['filter', 'air', 'oil', 'fuel', 'filtro', 'aria', 'olio', 'carburante'],
      'Body': ['bumper', 'fender', 'door', 'mirror', 'paraurti', 'parafango', 'porta', 'specchio'],
      'Interior': ['seat', 'dashboard', 'steering', 'sedile', 'cruscotto', 'volante'],
      'Wheels/Tires': ['wheel', 'tire', 'rim', 'ruota', 'pneumatico', 'cerchio', 'gomma'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => text.includes(kw))) {
        return category;
      }
    }
    return 'General Parts';
  }

  getStats(): { enabled: boolean; cachedItems: number } {
    return {
      enabled: true,
      cachedItems: this.cache.size,
    };
  }
}

// Singleton
let instance: NHTSASource | null = null;

export function getNHTSASource(): NHTSASource {
  if (!instance) {
    instance = new NHTSASource();
  }
  return instance;
}

export default NHTSASource;
