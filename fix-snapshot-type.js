const fs = require('fs');

const filePath = 'c:/Users/l.de.angelis/Setup/frontend/lib/types/assessmentSnapshot.ts';
let content = fs.readFileSync(filePath, 'utf8');

const oldEnd = `  confidenceOverall: "High" | "Medium" | "Low";
  notes?: string;
};`;

const newEnd = `  confidenceOverall: "High" | "Medium" | "Low";
  notes?: string;
  // NEW: Strategic Assessment Profile
  strategic_profile?: {
    company_identity: {
      industry?: string;
      industry_vertical?: string;
      business_model?: string;
      operational_scale?: string;
      geographic_scope?: string;
      value_proposition?: string;
    };
    portfolio_composition?: {
      product_portfolio?: {
        top_products?: { name: string; category: string; description: string }[];
      };
      service_portfolio?: {
        top_services?: { name: string; service_type: string; description: string }[];
      };
    };
    strategic_context?: {
      goals_2025_2027?: { goal: string; priority: number }[];
      prioritization_criteria?: {
        strategic_alignment_weight?: number;
        roi_weight?: number;
        innovation_weight?: number;
        customer_demand_weight?: number;
        time_to_market_weight?: number;
      };
      primary_pain_point?: string;
    };
    rag_training_config?: {
      reference_examples?: {
        products?: { category: string }[];
        services?: { service_type: string }[];
      };
    };
    recommendations?: {
      title: string;
      category: string;
      priority: string;
    }[];
  };
};`;

if (content.includes(oldEnd)) {
  content = content.replace(oldEnd, newEnd);
  fs.writeFileSync(filePath, content);
  console.log('✅ Updated AssessmentSnapshot type with strategic_profile');
} else {
  console.log('❌ Could not find pattern');
}
