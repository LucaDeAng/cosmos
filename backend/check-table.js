// Check if external_knowledge_cache table exists
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkTable() {
  console.log('Checking external_knowledge_cache table...\n');

  const { data, error } = await supabase
    .from('external_knowledge_cache')
    .select('id, item_count, fetched_at')
    .eq('id', 'main-cache')
    .single();

  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.log('Table does NOT exist.');
      console.log('\nPlease run the migration in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/xtfrgfqgjfrnrfqmsbgk/sql/new\n');
      console.log('Copy the SQL from: supabase/migrations/20250119_external_knowledge_cache.sql');
    } else if (error.code === 'PGRST116') {
      console.log('Table exists but is empty (no main-cache row).');
      console.log('This is normal for first run - the cache will be populated on refresh.');
    } else {
      console.log('Error:', error.message);
      console.log('Code:', error.code);
    }
  } else {
    console.log('Table exists with data:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkTable().catch(console.error);
