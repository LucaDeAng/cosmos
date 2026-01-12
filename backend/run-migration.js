/**
 * CLI script to run Product/Service data migration
 *
 * Usage:
 *   node run-migration.js [options]
 *
 * Options:
 *   --dry-run        Run migration without saving changes (default)
 *   --live           Run migration and save changes to database
 *   --batch-size N   Process N items at a time (default: 50)
 *   --tenant-id ID   Only migrate data for specific tenant
 *
 * Examples:
 *   node run-migration.js --dry-run
 *   node run-migration.js --live --batch-size 100
 *   node run-migration.js --live --tenant-id abc123
 */

require('dotenv').config();

async function runMigration() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    dryRun: !args.includes('--live'),
    batchSize: 50,
    tenantId: undefined,
  };

  // Parse batch size
  const batchSizeIndex = args.indexOf('--batch-size');
  if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
    options.batchSize = parseInt(args[batchSizeIndex + 1], 10);
  }

  // Parse tenant ID
  const tenantIdIndex = args.indexOf('--tenant-id');
  if (tenantIdIndex !== -1 && args[tenantIdIndex + 1]) {
    options.tenantId = args[tenantIdIndex + 1];
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║      PRODUCT/SERVICE DATA MIGRATION UTILITY                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (options.dryRun) {
    console.log('⚠️  Running in DRY RUN mode. No changes will be saved.');
    console.log('   Use --live flag to apply changes to database.\n');
  } else {
    console.log('⚠️  Running in LIVE mode. Changes will be saved to database.');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Import and run migration
  const { migrateProductServiceData } = require('./dist/migrations/migrateProductServiceData');

  try {
    const stats = await migrateProductServiceData(options);

    // Exit with appropriate code
    process.exit(stats.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Migration failed with error:', error);
    process.exit(1);
  }
}

runMigration();
