-- Migration: Company Assessment & Categories
-- Per clustering AI e personalizzazione esperienza utente

-- 1. Tabella per memorizzare le risposte dell'assessment
CREATE TABLE IF NOT EXISTS company_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Risposte assessment (JSONB per flessibilità)
  answers JSONB NOT NULL DEFAULT '{}',
  
  -- Profilo calcolato dall'AI
  ai_cluster VARCHAR(100),           -- es: 'tech_startup', 'enterprise_traditional', 'digital_native'
  ai_profile JSONB DEFAULT '{}',      -- profilo dettagliato generato dall'AI
  ai_recommendations JSONB DEFAULT '[]', -- raccomandazioni personalizzate
  
  -- Metadata
  completed_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,          -- versione del questionario
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabella per le categorie selezionate dall'azienda
CREATE TABLE IF NOT EXISTS company_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Categoria: 'services', 'products', 'ventures'
  category VARCHAR(50) NOT NULL,
  
  -- Configurazione specifica per categoria
  settings JSONB DEFAULT '{}',
  
  -- Stato
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Una categoria per azienda
  UNIQUE(company_id, category)
);

-- 3. Aggiorna tabella companies con flag onboarding
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(50) DEFAULT 'assessment';

-- 4. Indici per performance
CREATE INDEX IF NOT EXISTS idx_company_assessments_company ON company_assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_assessments_cluster ON company_assessments(ai_cluster);
CREATE INDEX IF NOT EXISTS idx_company_categories_company ON company_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_company_categories_category ON company_categories(category);

-- 5. Trigger per updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_company_assessments_updated_at ON company_assessments;
CREATE TRIGGER update_company_assessments_updated_at
  BEFORE UPDATE ON company_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_categories_updated_at ON company_categories;
CREATE TRIGGER update_company_categories_updated_at
  BEFORE UPDATE ON company_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS Policies
ALTER TABLE company_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Gli utenti possono vedere solo i dati della propria azienda
CREATE POLICY company_assessments_company_policy ON company_assessments
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY company_categories_company_policy ON company_categories
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- 7. Cluster AI predefiniti (riferimento)
COMMENT ON COLUMN company_assessments.ai_cluster IS 
'Cluster AI possibili:
- tech_startup: Startup tecnologica, alta innovazione, risorse limitate
- tech_scaleup: Scaleup tech, crescita rapida, focus su scalabilità
- enterprise_digital: Enterprise in trasformazione digitale
- enterprise_traditional: Enterprise tradizionale, approccio conservativo
- smb_innovative: PMI innovativa, flessibile
- smb_traditional: PMI tradizionale
- consulting_boutique: Boutique di consulenza specializzata
- consulting_large: Grande società di consulenza
- manufacturing_smart: Manifatturiero Industry 4.0
- manufacturing_traditional: Manifatturiero tradizionale
- retail_omnichannel: Retail omnicanale
- retail_traditional: Retail tradizionale';
