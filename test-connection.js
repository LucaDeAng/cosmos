// Simple Database Connection Test
// Run with: node test-connection.js

require('dotenv').config();

async function testDatabaseConnection() {
  console.log("=".repeat(60));
  console.log("🔍 DATABASE CONNECTION TEST");
  console.log("=".repeat(60));

  // Step 1: Check environment variables
  console.log("\n📋 Step 1: Environment Variables Validation");
  
  const requiredVars = ['KG_SUPABASE_URL', 'KG_SUPABASE_SERVICE_ROLE_KEY'];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error("💥 Missing environment variables:", missing.join(", "));
    console.log("\n💡 Add these to your .env file:");
    missing.forEach(key => console.log(`   ${key}=your_value_here`));
    process.exit(1);
  }

  console.log("✅ All required environment variables present");
  console.log(`   KG_SUPABASE_URL: ${process.env.KG_SUPABASE_URL}`);
  console.log(`   KG_SUPABASE_SERVICE_ROLE_KEY: ${process.env.KG_SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...`);

  // Step 2: Test connection
  console.log("\n🔗 Step 2: Testing Database Connection");
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabase = createClient(
      process.env.KG_SUPABASE_URL,
      process.env.KG_SUPABASE_SERVICE_ROLE_KEY
    );

    console.log("✅ Supabase client created");

    // Try to query the database using RPC
    const { data, error } = await supabase.rpc('get_tables', {}, { count: 'exact' });

    if (error && error.code !== 'PGRST202') {
      // If RPC doesn't exist, try a simple query
      const { data: healthData, error: healthError } = await supabase
        .from('_health_check_dummy_')
        .select('*')
        .limit(1);
      
      // Even if table doesn't exist, if we get a proper error response, connection is working
      if (healthError && !healthError.message.includes('relation "_health_check_dummy_" does not exist') && !healthError.message.includes('Could not find')) {
        console.error("💥 Connection test failed:", healthError.message);
        process.exit(1);
      }
    }

    console.log("✅ Database connection successful!");
    console.log("📊 Connection verified");

    // Success summary
    console.log("\n🎉 SUCCESS SUMMARY");
    console.log("─".repeat(40));
    console.log("✅ Environment Variables: Valid");
    console.log("✅ Database Client: Initialized");
    console.log("✅ Database Connection: Working");

    console.log("\n" + "=".repeat(60));
    console.log("🚀 DATABASE CONNECTION TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));

  } catch (error) {
    console.error("💥 Error:", error.message);
    
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log("\n💡 Required packages not installed. Run:");
      console.log("   npm install dotenv @supabase/supabase-js");
    }
    
    process.exit(1);
  }
}

// Run the test
testDatabaseConnection().catch(error => {
  console.error("\n💥 CRITICAL ERROR:", error.message);
  process.exit(1);
});
