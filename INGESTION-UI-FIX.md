# 🔧 Ingestion Page - UI Fixes

## Problems Identified

### 1. ❌ Wrong Numbers in Type Distribution
**Symptom**: La distribuzione tra Prodotti/Servizi/Iniziative mostrava numeri sbagliati o non aggiornati.

**Root Cause**:
- Il `normalizerAgent` ora restituisce solo `{ products, services }` nel `byType` (le iniziative sono state rimosse dal sistema)
- Il frontend si aspettava anche `initiatives` nella risposta
- Mismatch tra backend e frontend causava numeri inconsistenti

**Fix Applied**:
```typescript
// backend/src/routes/portfolio.routes.ts:1508-1512
byType: {
  initiatives: 0, // Initiatives removed from system
  products: result.normalization.stats.byType.products,
  services: result.normalization.stats.byType.services,
}
```

### 2. ⚠️ Empty Fields in Item Cards
**Symptom**: Alcuni campi apparivano vuoti nelle card degli item estratti.

**Root Cause**:
- Campi opzionali (`priority`, `budget`, `owner`, `category`, `subcategory`) non sempre vengono estratti dall'AI
- Il normalizer Agent li marca come `.optional()` nello schema Zod
- La UI mostra solo i campi presenti, ma alcuni potrebbero essere `null` o `undefined`

**Current Behavior**:
```tsx
// frontend/components/portfolio/AdvancedIngestionUploader.tsx:812-826
{item.status && (
  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
    {item.status}
  </span>
)}
{item.priority && (
  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
    {item.priority}
  </span>
)}
{item.budget && (
  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
    €{item.budget.toLocaleString()}
  </span>
)}
```

**Recommendation**: La logica attuale è corretta - mostra solo i campi presenti. Per migliorare l'esperienza:
1. ✅ Mantenere il comportamento attuale (mostra solo campi valorizzati)
2. ✅ Gli utenti possono aggiungere i campi mancanti tramite il pulsante "Modifica" (già implementato)
3. ✅ Il modal di edit ha valori di default per status='active' e priority='medium'

---

## Files Modified

### Backend
1. **`backend/src/routes/portfolio.routes.ts`** (lines 1508-1512)
   - Aggiunto `initiatives: 0` al `byType` per compatibilità frontend
   - Mantiene `products` e `services` dal normalizer
   - Fix applicato alla response dell'endpoint `/api/portfolio/ingest`

### Normalizer Agent (context)
- **`backend/src/agents/subagents/ingestion/normalizerAgent.ts`**
  - byType contiene solo `{ products, services }` (lines 82, 790-793)
  - Initiatives rimosse dal sistema
  - Schema fields: status (required), priority/budget/owner/category (optional)

### Frontend (no changes needed)
- **`frontend/components/portfolio/AdvancedIngestionUploader.tsx`**
  - Già gestisce correttamente i campi opzionali con conditional rendering
  - Edit modal fornisce defaults per campi vuoti
  - Type distribution mostra correttamente tutti e tre i tipi (initiatives sarà sempre 0)

---

## Verification Checklist

✅ **Backend rebuilt** successfully
✅ **byType structure** now includes initiatives: 0
✅ **Products count** mapped from normalizer
✅ **Services count** mapped from normalizer
⏳ **Frontend UI** - testare upload e verifica numeri corretti
⏳ **Empty fields** - verificare che campi opzionali vuoti non causino errori

---

## Testing Recommendations

1. **Test Type Distribution Display**:
   - Upload un documento con solo prodotti → verifica che "Prodotti" mostri il numero giusto, "Iniziative" = 0
   - Upload un documento con solo servizi → verifica che "Servizi" mostri il numero giusto
   - Upload un documento misto → verifica che entrambi i numeri siano corretti

2. **Test Empty Fields Handling**:
   - Upload documento minimalista (solo nomi) → verifica che le card mostrino solo nome e tipo
   - Upload documento completo → verifica che tutti i campi siano mostrati
   - Click "Modifica" su item con campi vuoti → verifica che il modal abbia defaults appropriati

3. **Test Edit Functionality**:
   - Modifica un item aggiungendo campi mancanti (budget, owner, ecc.)
   - Verifica che i campi aggiunti appaiano nella card dopo il save
   - Verifica che il salvataggio finale includa tutti i campi editati

---

## Known Behavior (Not a Bug)

### Initiatives Count Always = 0
**Why**: Il sistema non supporta più le "iniziative" come tipo separato. Tutto viene classificato come Product o Service.

**Impact**: La UI mostrerà sempre "🚀 0 Iniziative" - questo è corretto.

**Future**: Se le iniziative tornano nel sistema, il normalizer deve essere aggiornato per includerle nuovamente.

### Optional Fields Empty
**Why**: L'AI non riesce sempre ad estrarre tutti i campi da documenti non strutturati.

**Impact**: Alcuni item potrebbero avere solo nome e descrizione.

**Workaround**: Gli utenti possono:
1. Cliccare "Modifica" sull'item
2. Aggiungere manualmente i campi mancanti
3. Salvare le modifiche

---

**Status**: ✅ FIXED - byType numbers
**Status**: ℹ️ WORKING AS DESIGNED - optional fields
**Date**: 2025-12-16
**Build**: Successful
