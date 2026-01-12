/**
 * Backfill Strategic Alignment and Business Value for Existing Portfolio Items
 *
 * This script updates existing portfolio_products and portfolio_services records
 * that have NULL strategic_alignment or business_value with calculated defaults.
 *
 * Calculation logic:
 * - Strategic Alignment: 5 (default medium value)
 * - Business Value: 5 (default medium value)
 *
 * In a real scenario, these would be calculated from:
 * - Strategic profile goal matching
 * - Budget analysis
 * - Category importance
 * - Status (active items higher than proposed)
 */

import { supabase } from '../config/supabase';

interface PortfolioItem {
  id: string;
  name: string;
  status: string;
  budget?: number;
  category?: string;
  strategic_alignment?: number | null;
  business_value?: number | null;
}

async function backfillStrategicValues() {
  console.log('\n🔄 Starting backfill of strategic_alignment and business_value...\n');

  try {
    // Backfill products
    console.log('📦 Processing portfolio_products...');
    const { data: products, error: prodError } = await supabase
      .from('portfolio_products')
      .select('id, name, status, budget, category, strategic_alignment, business_value')
      .or('strategic_alignment.is.null,business_value.is.null');

    if (prodError) {
      console.error('❌ Error fetching products:', prodError);
    } else if (products && products.length > 0) {
      console.log(`   Found ${products.length} products needing backfill`);

      for (const product of products) {
        const updates = calculateStrategicValues(product);

        const { error: updateError } = await supabase
          .from('portfolio_products')
          .update(updates)
          .eq('id', product.id);

        if (updateError) {
          console.error(`   ❌ Failed to update product ${product.name}:`, updateError);
        } else {
          console.log(`   ✅ Updated "${product.name}": SA=${updates.strategic_alignment}, BV=${updates.business_value}`);
        }
      }
    } else {
      console.log('   ✅ All products already have strategic values');
    }

    // Backfill services
    console.log('\n📋 Processing portfolio_services...');
    const { data: services, error: servError } = await supabase
      .from('portfolio_services')
      .select('id, name, status, budget, category, strategic_alignment, business_value')
      .or('strategic_alignment.is.null,business_value.is.null');

    if (servError) {
      console.error('❌ Error fetching services:', servError);
    } else if (services && services.length > 0) {
      console.log(`   Found ${services.length} services needing backfill`);

      for (const service of services) {
        const updates = calculateStrategicValues(service);

        const { error: updateError } = await supabase
          .from('portfolio_services')
          .update(updates)
          .eq('id', service.id);

        if (updateError) {
          console.error(`   ❌ Failed to update service ${service.name}:`, updateError);
        } else {
          console.log(`   ✅ Updated "${service.name}": SA=${updates.strategic_alignment}, BV=${updates.business_value}`);
        }
      }
    } else {
      console.log('   ✅ All services already have strategic values');
    }

    console.log('\n✅ Backfill completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    throw error;
  }
}

/**
 * Calculate strategic_alignment and business_value for an item
 * This uses simple heuristics - in production, this would query the strategic profile
 */
function calculateStrategicValues(item: PortfolioItem): {
  strategic_alignment: number;
  business_value: number;
} {
  let strategicAlignment = 5; // Default medium
  let businessValue = 5; // Default medium

  // Adjust based on status
  if (item.status === 'active') {
    strategicAlignment += 1;
    businessValue += 1;
  } else if (item.status === 'proposed') {
    strategicAlignment -= 1;
    businessValue -= 1;
  } else if (item.status === 'completed') {
    strategicAlignment += 2;
    businessValue += 2;
  }

  // Adjust based on budget (if available)
  if (item.budget) {
    if (item.budget > 100000) {
      businessValue += 2; // High budget = high business value
      strategicAlignment += 1;
    } else if (item.budget > 50000) {
      businessValue += 1;
    }
  }

  // Clamp to 1-10 range
  strategicAlignment = Math.max(1, Math.min(10, strategicAlignment));
  businessValue = Math.max(1, Math.min(10, businessValue));

  return { strategic_alignment: strategicAlignment, business_value: businessValue };
}

// Run if executed directly
if (require.main === module) {
  backfillStrategicValues()
    .then(() => {
      console.log('Script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { backfillStrategicValues };
