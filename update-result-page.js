const fs = require('fs');

const NL = '\r\n';
const filePath = 'c:/Users/l.de.angelis/Setup/frontend/app/onboarding/result/page.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// 1. EXPAND THE COMPANY PROFILE INTERFACE
// ============================================================

const oldInterface = `// Tipo semplificato per il profilo aziendale (senza spoilerare strategia)${NL}interface CompanyProfile {${NL}  companyName: string;${NL}  cluster: string;${NL}  clusterLabel: string;${NL}  maturityLevel: number;${NL}  overallScore: number;${NL}  dimensions: {${NL}    name: string;${NL}    score: number;${NL}    icon: string;${NL}  }[];${NL}  highlights: string[];${NL}  readinessLevel: 'starter' | 'emerging' | 'ready' | 'advanced';${NL}}`;

const newInterface = `// Tipo esteso per il profilo aziendale con dettagli strategici
interface CompanyProfile {
  companyName: string;
  cluster: string;
  clusterLabel: string;
  maturityLevel: number;
  overallScore: number;
  dimensions: {
    name: string;
    score: number;
    icon: string;
  }[];
  highlights: string[];
  readinessLevel: 'starter' | 'emerging' | 'ready' | 'advanced';
  // NEW: Detailed company info
  industry?: string;
  businessModel?: string;
  operationalScale?: string;
  productTypes?: string[];
  serviceTypes?: string[];
  mainChallenge?: string;
  recommendations?: {
    title: string;
    category: string;
    priority: string;
  }[];
}`;

if (content.includes(oldInterface)) {
  content = content.replace(oldInterface, newInterface);
  console.log('✅ Updated CompanyProfile interface');
} else {
  console.log('❌ Could not find interface to update');
}

// ============================================================
// 2. ADD A COMPANY INFO CARD COMPONENT
// ============================================================

const afterHighlightCard = `// Card per gli highlights${NL}function HighlightCard({ text, index }: { text: string; index: number }) {${NL}  const icons = ['💡', '🎯', '📈', '🔑', '⚡'];${NL}${NL}  return (${NL}    <motion.div${NL}      className="p-4 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all"${NL}      initial={{ opacity: 0, y: 20 }}${NL}      animate={{ opacity: 1, y: 0 }}${NL}      transition={{ duration: 0.4, delay: index * 0.1 }}${NL}    >${NL}      <div className="flex items-start gap-3">${NL}        <span className="text-xl">{icons[index % icons.length]}</span>${NL}        <p className="text-sm text-[#697982] leading-relaxed">{text}</p>${NL}      </div>${NL}    </motion.div>${NL}  );${NL}}`;

const newCompanyInfoCard = `// Card per gli highlights
function HighlightCard({ text, index }: { text: string; index: number }) {
  const icons = ['💡', '🎯', '📈', '🔑', '⚡'];

  return (
    <motion.div
      className="p-4 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{icons[index % icons.length]}</span>
        <p className="text-sm text-[#697982] leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}

// Card per informazioni aziendali
function InfoBadge({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-xs text-[#697982]">{label}</div>
        <div className="text-sm font-medium text-[#202223]">{value}</div>
      </div>
    </div>
  );
}

// Tags per product/service types
function TypeTags({ types, color = 'blue' }: { types: string[]; color?: 'blue' | 'green' }) {
  if (!types || types.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {types.map((type, idx) => (
        <span
          key={idx}
          className={\`px-3 py-1 text-xs rounded-full \${
            color === 'green'
              ? 'bg-[#E1FF89]/30 text-[#202223]'
              : 'bg-blue-100 text-blue-700'
          }\`}
        >
          {type.replace(' / ', ' ')}
        </span>
      ))}
    </div>
  );
}`;

if (content.includes(afterHighlightCard)) {
  content = content.replace(afterHighlightCard, newCompanyInfoCard);
  console.log('✅ Added InfoBadge and TypeTags components');
} else {
  console.log('❌ Could not add new components');
}

// ============================================================
// 3. UPDATE SETPROFILE TO INCLUDE NEW FIELDS
// ============================================================

const oldSetProfile = `            setProfile({${NL}              companyName: snapshot.companyName || 'La tua azienda',${NL}              cluster: companyIdentity?.industry || snapshot.cluster || 'emerging',${NL}              clusterLabel: companyIdentity?.industry_vertical || companyIdentity?.industry || getClusterLabel(snapshot.cluster || 'emerging'),${NL}              maturityLevel: Math.min(5, Math.round(overallScore / 20)),${NL}              overallScore: overallScore,${NL}              dimensions: dimensions.length > 0 ? dimensions : getDefaultDimensions(),${NL}              highlights: highlights.length > 0 ? highlights : getDefaultHighlights(),${NL}              readinessLevel: getReadinessLevel(overallScore)${NL}            });`;

const newSetProfile = `            // Extract product/service types from RAG config or answers
            const ragConfig = strategicProfile.rag_training_config;
            const productTypes = ragConfig?.reference_examples?.products?.map((p: any) => p.category) || [];
            const serviceTypes = ragConfig?.reference_examples?.services?.map((s: any) => s.service_type) || [];

            setProfile({
              companyName: snapshot.companyName || 'La tua azienda',
              cluster: companyIdentity?.industry || snapshot.cluster || 'emerging',
              clusterLabel: companyIdentity?.industry_vertical || companyIdentity?.industry || getClusterLabel(snapshot.cluster || 'emerging'),
              maturityLevel: Math.min(5, Math.round(overallScore / 20)),
              overallScore: overallScore,
              dimensions: dimensions.length > 0 ? dimensions : getDefaultDimensions(),
              highlights: highlights.length > 0 ? highlights : getDefaultHighlights(),
              readinessLevel: getReadinessLevel(overallScore),
              // NEW: Additional company details
              industry: companyIdentity?.industry,
              businessModel: formatBusinessModel(companyIdentity?.business_model),
              operationalScale: formatScale(companyIdentity?.operational_scale),
              productTypes: [...new Set(productTypes)].slice(0, 4),
              serviceTypes: [...new Set(serviceTypes)].slice(0, 4),
              mainChallenge: strategicContext?.primary_pain_point,
              recommendations: strategicProfile.recommendations?.slice(0, 3).map((r: any) => ({
                title: r.title,
                category: r.category,
                priority: r.priority
              }))
            });`;

if (content.includes(oldSetProfile)) {
  content = content.replace(oldSetProfile, newSetProfile);
  console.log('✅ Updated setProfile with new fields');
} else {
  console.log('❌ Could not update setProfile');
}

// ============================================================
// 4. ADD HELPER FUNCTIONS FOR FORMATTING
// ============================================================

const afterGetDefaultProfile = `  function getDefaultProfile(): CompanyProfile {${NL}    return {${NL}      companyName: 'La tua azienda',${NL}      cluster: 'emerging',${NL}      clusterLabel: 'Profilo Emergente',${NL}      maturityLevel: 2,${NL}      overallScore: 42,${NL}      dimensions: getDefaultDimensions(),${NL}      highlights: getDefaultHighlights(),${NL}      readinessLevel: 'emerging'${NL}    };${NL}  }`;

const newFormatFunctions = `  function getDefaultProfile(): CompanyProfile {
    return {
      companyName: 'La tua azienda',
      cluster: 'emerging',
      clusterLabel: 'Profilo Emergente',
      maturityLevel: 2,
      overallScore: 42,
      dimensions: getDefaultDimensions(),
      highlights: getDefaultHighlights(),
      readinessLevel: 'emerging'
    };
  }

  function formatBusinessModel(model?: string): string {
    const models: Record<string, string> = {
      'b2b_enterprise': 'B2B Enterprise',
      'b2b_smb': 'B2B PMI',
      'b2c': 'B2C Consumer',
      'b2g': 'B2G Government',
      'marketplace': 'Marketplace',
      'hybrid': 'Modello Ibrido',
      'platform_marketplace': 'Piattaforma',
      'freemium_saas': 'Freemium SaaS'
    };
    return models[model || ''] || model || 'Non specificato';
  }

  function formatScale(scale?: string): string {
    const scales: Record<string, string> = {
      'startup': 'Startup',
      'scaleup': 'Scale-up',
      'mid_market': 'Mid-Market',
      'enterprise': 'Enterprise',
      'conglomerate': 'Conglomerate'
    };
    return scales[scale || ''] || scale || 'Non specificato';
  }`;

if (content.includes(afterGetDefaultProfile)) {
  content = content.replace(afterGetDefaultProfile, newFormatFunctions);
  console.log('✅ Added format helper functions');
} else {
  console.log('❌ Could not add format functions');
}

// ============================================================
// 5. ADD COMPANY PROFILE SECTION TO THE UI
// ============================================================

const afterScoreSection = `        {/* Score Overview */}${NL}        <motion.section${NL}          className="mb-16"${NL}          initial={{ opacity: 0 }}${NL}          animate={{ opacity: 1 }}${NL}          transition={{ delay: 0.2 }}${NL}        >`;

const newCompanyProfileSection = `        {/* Company Profile Overview */}
        {(profile?.industry || profile?.businessModel || profile?.operationalScale) && (
          <motion.section
            className="mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <h2 className="text-lg font-semibold text-[#202223] mb-4">Profilo Aziendale</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {profile?.industry && (
                <InfoBadge icon="🏢" label="Settore" value={profile.industry} />
              )}
              {profile?.businessModel && (
                <InfoBadge icon="💼" label="Modello Business" value={profile.businessModel} />
              )}
              {profile?.operationalScale && (
                <InfoBadge icon="📊" label="Scala Operativa" value={profile.operationalScale} />
              )}
              {profile?.mainChallenge && (
                <InfoBadge icon="🎯" label="Sfida Principale" value={profile.mainChallenge.substring(0, 30) + (profile.mainChallenge.length > 30 ? '...' : '')} />
              )}
            </div>
          </motion.section>
        )}

        {/* Portfolio Types */}
        {((profile?.productTypes && profile.productTypes.length > 0) || (profile?.serviceTypes && profile.serviceTypes.length > 0)) && (
          <motion.section
            className="mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18 }}
          >
            <h2 className="text-lg font-semibold text-[#202223] mb-4">Portfolio Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {profile?.productTypes && profile.productTypes.length > 0 && (
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">📦</span>
                    <span className="text-sm font-medium text-[#202223]">Prodotti</span>
                  </div>
                  <TypeTags types={profile.productTypes} color="blue" />
                </div>
              )}
              {profile?.serviceTypes && profile.serviceTypes.length > 0 && (
                <div className="p-4 rounded-xl bg-white border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">🎯</span>
                    <span className="text-sm font-medium text-[#202223]">Servizi</span>
                  </div>
                  <TypeTags types={profile.serviceTypes} color="green" />
                </div>
              )}
            </div>
          </motion.section>
        )}

        {/* Score Overview */}
        <motion.section
          className="mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >`;

if (content.includes(afterScoreSection)) {
  content = content.replace(afterScoreSection, newCompanyProfileSection);
  console.log('✅ Added Company Profile and Portfolio Overview sections');
} else {
  console.log('❌ Could not add new UI sections');
}

// ============================================================
// SAVE THE FILE
// ============================================================

fs.writeFileSync(filePath, content);
console.log('\n✅ Result page updated successfully!');
