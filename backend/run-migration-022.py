#!/usr/bin/env python3
"""
Migration Runner for 022_ingestion_cache.sql
Executes the SQL migration to set up L2 cache table via Supabase REST API
"""

import os
import sys
import json
import requests
from pathlib import Path

# Load environment
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Read migration file
migration_path = Path(__file__).parent / 'migrations' / '022_ingestion_cache.sql'

if not migration_path.exists():
    print(f"❌ Migration file not found: {migration_path}")
    sys.exit(1)

sql_content = migration_path.read_text()
print(f"📄 Read migration file ({len(sql_content)} bytes)")

# Parse SQL statements (simple split on ;)
statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('--')]

print(f"\n📝 Found {len(statements)} SQL statements\n")

# Set up headers
headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'apikey': SUPABASE_SERVICE_KEY,
}

# Execute each statement via pg_trgm or direct connection
# Since Supabase doesn't expose raw SQL execution via REST by default,
# we'll use the query endpoint with the postgres rpc function if available

success_count = 0
failed_count = 0

for i, statement in enumerate(statements, 1):
    preview = statement[:80].replace('\n', ' ')
    if len(statement) > 80:
        preview += '...'
    
    print(f"[{i}/{len(statements)}] Executing: {preview}")
    
    # Try using the SQL query execution endpoint
    # Note: This assumes pgAdmin or similar is available
    # For production, you might want to use Supabase Studio directly
    
    try:
        # Attempt 1: Use RPC if available
        rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
        payload = {
            'sql_content': statement
        }
        
        response = requests.post(rpc_url, json=payload, headers=headers, timeout=10)
        
        if response.status_code in [200, 201]:
            print(f"   ✅ Success")
            success_count += 1
        elif response.status_code == 404:
            # RPC not available, will need manual execution
            print(f"   ⚠️  RPC endpoint not available (404)")
            print(f"   ℹ️  Run manually in Supabase Studio or pgAdmin")
            failed_count += 1
        else:
            print(f"   ❌ Error: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            failed_count += 1
            
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        failed_count += 1

print(f"\n{'='*60}")
print(f"📊 Migration Summary:")
print(f"   ✅ Successful: {success_count}")
print(f"   ❌ Failed: {failed_count}")
print(f"   📋 Total: {len(statements)}")
print(f"{'='*60}")

if failed_count == len(statements):
    print("\n⚠️  WARNING: All statements failed - RPC endpoint may not be available")
    print("\n📌 MANUAL EXECUTION:")
    print("   1. Go to: https://app.supabase.com/project/*/sql/new")
    print("   2. Copy & paste the SQL from: backend/migrations/022_ingestion_cache.sql")
    print("   3. Click 'Run' to execute\n")
    sys.exit(0)  # Don't fail - user can run manually
elif failed_count > 0:
    print(f"\n⚠️  {failed_count} statements need manual review")
    sys.exit(0)
else:
    print("\n✅ All migrations executed successfully!")
    sys.exit(0)
