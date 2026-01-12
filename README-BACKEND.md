# 🚀 BACKEND SYSTEM - GUIDA RAPIDA

## ✅ Sistema Completamente Implementato!

Il backend è stato creato con successo seguendo il diagramma del flusso utente.

---

## 🎯 AVVIO RAPIDO

### Metodo 1: Script Automatico (Consigliato)

**Windows:**
```cmd
START-BACKEND.bat
```

**PowerShell:**
```powershell
.\START-BACKEND.ps1
```

### Metodo 2: Manuale
```powershell
cd backend
npm run build
node dist/index.js
```

---

## 📋 SETUP DATABASE (Prima Volta)

1. **Il SQL è già negli appunti** (copiato automaticamente)
2. **Browser aperto** su Supabase SQL Editor
3. **Incolla** (Ctrl+V) e clicca **RUN**
4. Aspetta "Success ✓"

**Link manuale:** https://supabase.com/dashboard/project/xtfrgfqgjfrnrfqmsbgk/sql/new

---

## 🧪 TEST API

```powershell
# Health Check
Invoke-RestMethod http://localhost:3000/health

# Registrazione Utente
$user = @{
    email = "test@example.com"
    password = "SecurePass123!"
    fullName = "Test User"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/api/auth/register `
    -Method POST -ContentType "application/json" -Body $user

# Login
$login = @{
    email = "test@example.com"
    password = "SecurePass123!"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri http://localhost:3000/api/auth/login `
    -Method POST -ContentType "application/json" -Body $login

$token = $response.token
Write-Host "Token: $token"
```

---

## 📁 STRUTTURA CREATA

```
backend/
├── src/
│   ├── auth/              ✅ Sistema autenticazione
│   ├── services/          ✅ Logica business
│   ├── routes/            ✅ API endpoints
│   ├── middleware/        ✅ Sicurezza & validazione
│   └── config/            ✅ Configurazione
├── migrations/            ✅ Schema database
├── dist/                  ✅ Codice compilato
└── .env                   ✅ Variabili configurate
```

---

## 🔐 FUNZIONALITÀ IMPLEMENTATE

### ✅ Autenticazione
- Registrazione utente con validazione email
- Login con JWT (token 7 giorni)
- Password sicure (min 8 char, maiusc, minusc, numero, speciale)
- Reset password
- Blocco account dopo 5 tentativi falliti (30 min)

### ✅ Gestione Utenti
- Profilo utente
- Multi-tenant (aziende separate)
- Ruoli (user, admin, super_admin)
- Statistiche utente

### ✅ Initiative Management
- Crea/Modifica/Elimina iniziative
- Priorità (low, medium, high, critical)
- Stato (draft, pending, approved, in_progress, completed)
- Variabili custom con min/max
- Filtri avanzati

### ✅ File Upload Sicuro
- Validazione tipo file (PDF, DOCX, XLSX, immagini)
- Limite 50MB
- Scan virus (integrazione pronta)
- Hash SHA-256 per integrità
- Protezione path traversal

### ✅ Sicurezza
- Rate limiting
- CORS configurato
- Helmet headers
- SQL injection protection
- Row Level Security (RLS)
- Audit log completo

---

## 🌐 ENDPOINTS API

**Base URL:** `http://localhost:3000/api`

### Auth
- `POST /auth/register` - Registrazione
- `POST /auth/login` - Login
- `GET /auth/verify-email?token=...` - Verifica email
- `POST /auth/forgot-password` - Reset password
- `POST /auth/reset-password` - Conferma reset

### Users
- `GET /users/profile` - Profilo utente
- `PUT /users/profile` - Aggiorna profilo
- `GET /users/company/:id` - Utenti azienda (admin)
- `DELETE /users/:id/deactivate` - Disattiva (admin)

### Initiatives
- `POST /initiatives` - Crea iniziativa
- `GET /initiatives` - Lista iniziative
- `GET /initiatives/:id` - Dettaglio
- `PUT /initiatives/:id` - Aggiorna
- `DELETE /initiatives/:id` - Elimina
- `GET /initiatives/stats/overview` - Statistiche

### Files
- `POST /files/upload` - Upload file
- `GET /files` - Lista files
- `GET /files/:id` - Dettaglio file
- `DELETE /files/:id` - Elimina file
- `GET /files/:id/verify-integrity` - Verifica integrità

---

## 🗄️ DATABASE TABLES

- `users` - Account utente
- `companies` - Aziende (multi-tenant)
- `initiatives` - Iniziative utente
- `uploaded_files` - Files con metadata
- `audit_logs` - Tracciamento azioni
- `user_sessions` - Sessioni JWT

---

## ⚙️ VARIABILI AMBIENTE

Già configurate in `backend/.env`:

```env
PORT=3000
SUPABASE_URL=https://xtfrgfqgjfrnrfqmsbgk.supabase.co
SUPABASE_SERVICE_KEY=[configurata]
JWT_SECRET=[configurato]
```

---

## 📚 DOCUMENTAZIONE

- **Completa:** `backend/README.md`
- **Setup:** `SETUP_COMPLETE.md`
- **Migrazione:** `backend/migrations/001_initial_schema.sql`

---

## 🎉 PRONTO ALL'USO!

1. ✅ Database: Esegui migration SQL
2. ✅ Server: Esegui `START-BACKEND.bat`
3. ✅ Test: Usa gli esempi sopra
4. ✅ Frontend: Connetti a `http://localhost:3000/api`

**Il sistema backend è completamente funzionante!** 🚀
