// Script per creare utente di test
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabaseUrl = 'https://xtfrgfqgjfrnrfqmsbgk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZnJnZnFnamZybnJmcW1zYmdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzYyNjk5MiwiZXhwIjoyMDc5MjAyOTkyfQ.GNjDKgaaO8PY6Fr1fVzkKXVZA0Tob370j343DBAMdJE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
  console.log('\n=== CREAZIONE UTENTE TEST PER THEMIS ===\n');

  try {
    // 1. Crea azienda test
    console.log('1. Creando azienda test...');
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .upsert({
        name: 'THEMIS Test Company',
        domain: 'themis-test.com',
        subscription_plan: 'premium',
        max_users: 100,
        is_active: true
      }, { onConflict: 'domain' })
      .select()
      .single();

    if (companyError) {
      // Prova a recuperare l'azienda esistente
      const { data: existingCompany } = await supabase
        .from('companies')
        .select()
        .eq('domain', 'themis-test.com')
        .single();
      
      if (existingCompany) {
        console.log('   Azienda esistente trovata:', existingCompany.name);
        var companyId = existingCompany.id;
      } else {
        throw companyError;
      }
    } else {
      console.log('   Azienda creata:', company.name);
      var companyId = company.id;
    }

    // 2. Hash password
    console.log('\n2. Generando hash password...');
    const password = 'TestAdmin123!';
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('   Password hash generato');

    // 3. Crea utente admin
    console.log('\n3. Creando utente admin...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        email: 'admin@themis-test.com',
        password_hash: passwordHash,
        full_name: 'Admin THEMIS',
        company_id: companyId,
        role: 'admin',
        is_active: true,
        is_email_verified: true
      }, { onConflict: 'email' })
      .select()
      .single();

    if (userError) {
      console.error('   Errore creazione utente:', userError.message);
      
      // Prova ad aggiornare utente esistente
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          is_email_verified: true,
          is_active: true
        })
        .eq('email', 'admin@themis-test.com')
        .select()
        .single();
      
      if (updateError) {
        throw updateError;
      }
      console.log('   Utente aggiornato:', updatedUser.email);
    } else {
      console.log('   Utente creato:', user.email);
    }

    console.log('\n' + '='.repeat(50));
    console.log('CREDENZIALI UTENTE TEST');
    console.log('='.repeat(50));
    console.log('Email:    admin@themis-test.com');
    console.log('Password: TestAdmin123!');
    console.log('Ruolo:    admin');
    console.log('='.repeat(50));
    console.log('\nOra puoi accedere a THEMIS con queste credenziali!\n');

  } catch (error) {
    console.error('\nErrore:', error.message);
    console.log('\nProvo metodo alternativo...\n');
    
    // Metodo alternativo: SQL diretto
    const { data, error: sqlError } = await supabase.rpc('exec_sql', {
      sql: `
        INSERT INTO companies (name, domain, subscription_plan, max_users, is_active)
        VALUES ('THEMIS Test', 'themis.test', 'premium', 100, true)
        ON CONFLICT (domain) DO NOTHING
        RETURNING id;
      `
    });
    
    if (sqlError) {
      console.log('SQL fallito. Esegui manualmente nel Supabase Dashboard:');
      console.log('\n--- COPIA QUESTO SQL ---\n');
      console.log(`
-- 1. Crea azienda
INSERT INTO companies (name, domain, subscription_plan, max_users, is_active)
VALUES ('THEMIS Test', 'themis.test', 'premium', 100, true);

-- 2. Crea utente (password: TestAdmin123!)
INSERT INTO users (email, password_hash, full_name, company_id, role, is_active, is_email_verified)
SELECT 
  'admin@themis.test',
  '${await bcrypt.hash('TestAdmin123!', 10)}',
  'Admin THEMIS',
  id,
  'admin',
  true,
  true
FROM companies WHERE domain = 'themis.test';
      `);
    }
  }
}

createTestUser();
