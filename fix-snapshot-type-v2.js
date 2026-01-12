const fs = require('fs');

const NL = '\r\n';
const filePath = 'c:/Users/l.de.angelis/Setup/frontend/lib/types/assessmentSnapshot.ts';
let content = fs.readFileSync(filePath, 'utf8');

const oldEnd = `  confidenceOverall: "High" | "Medium" | "Low";${NL}  notes?: string;${NL}};`;

const newEnd = `  confidenceOverall: "High" | "Medium" | "Low";${NL}  notes?: string;${NL}  // NEW: Strategic Assessment Profile${NL}  strategic_profile?: {${NL}    company_identity: {${NL}      industry?: string;${NL}      industry_vertical?: string;${NL}      business_model?: string;${NL}      operational_scale?: string;${NL}      geographic_scope?: string;${NL}      value_proposition?: string;${NL}    };${NL}    portfolio_composition?: {${NL}      product_portfolio?: {${NL}        top_products?: { name: string; category: string; description: string }[];${NL}      };${NL}      service_portfolio?: {${NL}        top_services?: { name: string; service_type: string; description: string }[];${NL}      };${NL}    };${NL}    strategic_context?: {${NL}      goals_2025_2027?: { goal: string; priority: number }[];${NL}      prioritization_criteria?: {${NL}        strategic_alignment_weight?: number;${NL}        roi_weight?: number;${NL}        innovation_weight?: number;${NL}        customer_demand_weight?: number;${NL}        time_to_market_weight?: number;${NL}      };${NL}      primary_pain_point?: string;${NL}    };${NL}    rag_training_config?: {${NL}      reference_examples?: {${NL}        products?: { category: string }[];${NL}        services?: { service_type: string }[];${NL}      };${NL}    };${NL}    recommendations?: {${NL}      title: string;${NL}      category: string;${NL}      priority: string;${NL}    }[];${NL}  };${NL}};`;

if (content.includes(oldEnd)) {
  content = content.replace(oldEnd, newEnd);
  fs.writeFileSync(filePath, content);
  console.log('✅ Updated AssessmentSnapshot type with strategic_profile');
} else {
  console.log('❌ Could not find pattern');
}
