import { config } from "dotenv";
import {
  initializeKGClient,
  testKGConnection,
  validateKGEnvironment,
} from "../../src/lib/supabase-kg";

// Load environment variables from .env file
config();

async function runDBConnectionTest() {
  console.log("=".repeat(60));
  console.log("🔍 DATABASE CONNECTION TEST");
  console.log("=".repeat(60));

  // Step 1: Validate environment variables
  console.log("\n📋 Step 1: Environment Variables Validation");
  const envCheck = validateKGEnvironment();

  if (!envCheck.valid) {
    console.error("💥 Environment validation failed!");
    console.error("Missing variables:", envCheck.missing);
    console.log("\n💡 Fix: Ensure these variables are set in your .env file:");
    envCheck.missing.forEach((key) => {
      console.log(`   ${key}=your_value_here`);
    });
    process.exit(1);
  }

  // Step 2: Initialize KG client
  console.log("\n🔧 Step 2: Initialize Database Client");
  try {
    initializeKGClient();
    console.log("✅ Database Client initialized successfully");
  } catch (error) {
    console.error("💥 Failed to initialize database client:", error);
    process.exit(1);
  }

  // Step 3: Test database connection
  console.log("\n🔗 Step 3: Database Connection Test");
  const connectionResult = await testKGConnection();

  if (!connectionResult.success) {
    console.error("💥 Connection test failed!");
    console.error("Error:", connectionResult.error);
    console.log("\n🔧 Troubleshooting Tips:");
    console.log(
      "1. Verify KG_SUPABASE_URL points to your Supabase instance",
    );
    console.log("2. Check KG_SUPABASE_SERVICE_ROLE_KEY is correct");
    console.log("3. Ensure your Supabase project is active");
    console.log("4. Verify network connectivity to Supabase");
    process.exit(1);
  }

  // Step 4: Report success
  console.log("\n🎉 SUCCESS SUMMARY");
  console.log("─".repeat(40));
  console.log(`✅ Environment Variables: Valid`);
  console.log(`✅ Database Client: Initialized`);
  console.log(`✅ Database Connection: Working`);
  console.log(`📊 Tables Available: ${connectionResult.tableCount}`);

  if (connectionResult.tableCount === 0) {
    console.log("\n💡 Next Steps:");
    console.log("• Your database is empty (expected for new setup)");
    console.log("• Run setup scripts to create database schema");
  } else {
    console.log(`📋 Tables: ${connectionResult.tables?.join(", ")}`);
    console.log("\n💡 Database is ready!");
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 DATABASE CONNECTION TEST COMPLETED SUCCESSFULLY");
  console.log("=".repeat(60));
}

// Run the test
runDBConnectionTest().catch((error) => {
  console.error("\n💥 CRITICAL ERROR during connection test:");
  console.error(error);
  process.exit(1);
});
