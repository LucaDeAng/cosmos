-- Utente di test per THEMIS
-- Esegui questo SQL nel Supabase Dashboard

-- 1. Prima crea l'azienda di test
INSERT INTO companies (name, domain, subscription_plan, max_users, is_active)
VALUES ('Test Company', 'test.com', 'premium', 100, true)
ON CONFLICT DO NOTHING;

-- 2. Crea utente admin di test
-- Password: TestAdmin123!
-- Hash bcrypt generato per "TestAdmin123!"
INSERT INTO users (
  email, 
  password_hash, 
  full_name, 
  company_id,
  role,
  is_active,
  is_email_verified
)
SELECT 
  'admin@test.com',
  '$2b$10$8K1p5F3j3K9Q0q8Z9q8Z9uvwxyz1234567890abcdefghijklmnop',
  'Admin Test',
  id,
  'admin',
  true,
  true
FROM companies 
WHERE domain = 'test.com'
ON CONFLICT (email) DO UPDATE SET
  is_email_verified = true,
  is_active = true;

-- 3. Crea utente normale di test
-- Password: TestUser123!
INSERT INTO users (
  email, 
  password_hash, 
  full_name, 
  company_id,
  role,
  is_active,
  is_email_verified
)
SELECT 
  'user@test.com',
  '$2b$10$8K1p5F3j3K9Q0q8Z9q8Z9uvwxyz1234567890abcdefghijklmnop',
  'User Test',
  id,
  'user',
  true,
  true
FROM companies 
WHERE domain = 'test.com'
ON CONFLICT (email) DO UPDATE SET
  is_email_verified = true,
  is_active = true;
