# Frontend Design System - Regole Obbligatorie

**IMPORTANTE**: Tutte le modifiche al frontend DEVONO seguire queste regole.

## Icon System (MANDATORY)

### Libreria Icone
- **USA SOLO** Lucide icons (https://lucide.dev/icons)
- **NON USARE** altre librerie (Heroicons, react-icons, Font Awesome, Material Icons, custom SVG)
- Import: `import { IconName } from 'lucide-react'`

### Style Constraints
Tutte le icone devono rispettare questi parametri:

```typescript
// Parametri obbligatori
strokeWidth={1.5}          // SEMPRE 1.5
color="#202223"            // Default monochrome (importa ICON_COLOR da @/components/ui/Icon)
size={24}                  // Default 24px

// Size presets disponibili
xs: 14px
sm: 16px
md: 20px
lg: 24px (DEFAULT)
xl: 32px
```

### Esempi Corretti

```tsx
// ✅ CORRETTO - Con Icon wrapper component
import { Icon, ICON_COLOR } from '@/components/ui/Icon';
import { Search } from 'lucide-react';

<Icon icon={Search} size="lg" />
<Icon icon={Settings} size="sm" />

// ✅ CORRETTO - Uso diretto Lucide
import { Package } from 'lucide-react';
import { ICON_COLOR } from '@/components/ui/Icon';

<Package size={24} strokeWidth={1.5} color={ICON_COLOR} />
<FileText size={16} strokeWidth={1.5} color="#202223" />
```

### Esempi ERRATI

```tsx
// ❌ ERRATO - Libreria sbagliata
import { SearchIcon } from '@heroicons/react/outline';

// ❌ ERRATO - strokeWidth mancante o sbagliato
<Search size={24} />
<Search size={24} strokeWidth={2} />

// ❌ ERRATO - Colori non monocromatici
<Loader2 className="text-blue-600" />
<Search className="text-purple-500" />

// ❌ ERRATO - Custom SVG invece di Lucide
<svg>...</svg>

// ❌ ERRATO - Fill icons
<Search fill="currentColor" />
```

## Loading States (MANDATORY)

### Loader Component
Usa `SmartLoader` per loading states complessi:

```tsx
import { SmartLoader } from '@/components/ui/SmartLoader';

<SmartLoader
  operation="assessment"
  progress={45}
  currentPhase="Analyzing data..."
/>
```

### Spinner Semplice
Usa `SpinnerIcon` o `LoadingSpinner` per spinner inline:

```tsx
import { SpinnerIcon, LoadingSpinner, ICON_COLOR } from '@/components/ui/Icon';

// Spinner Lucide
<SpinnerIcon className="animate-spin" size={24} />

// Custom spinner component
<LoadingSpinner size="md" color={ICON_COLOR} />
```

### Regole Loader
- ✅ Usa SEMPRE `color={ICON_COLOR}` o `text-[#202223]`
- ❌ NON usare `text-blue-600`, `text-purple-500`, ecc.
- ❌ NON usare gradienti (`from-blue-500 to-purple-600`)
- ✅ Progress bar: `bg-[#202223]` (non gradient)

## Color System

### Colori Icone
```typescript
// Default monochrome
ICON_COLOR = '#202223'  // Background bianco

// Context colors (usa con parsimonia)
text-white          // Dark backgrounds
text-gray-400       // Disabled/muted
text-red-500        // Error states
text-green-500      // Success states
text-yellow-600     // Warning states
```

### Backgrounds
```css
/* Light backgrounds */
bg-white
bg-gray-50
bg-gray-100

/* Dark backgrounds (solo per componenti specifici come sidebar) */
bg-slate-900
bg-slate-800
bg-gray-800
```

## Consistency Rule

**Tutte le icone devono essere intercambiabili e visualmente consistenti in tutta la UI.**

Se un'icona non esiste su Lucide:
1. Cerca l'equivalente più vicino su https://lucide.dev/icons
2. Usa quello invece di creare custom SVG

## File di Riferimento

Consulta questi file per esempi corretti:
- `frontend/components/ui/Icon.tsx` - Sistema centralizzato icone
- `frontend/components/ui/SmartLoader.tsx` - Loader monocromatici
- `frontend/components/ui/Button.tsx` - Integrazione icone nei bottoni

## Checklist Pre-Commit

Prima di committare modifiche al frontend, verifica:
- [ ] Tutte le icone sono da Lucide
- [ ] Tutti gli icon hanno `strokeWidth={1.5}`
- [ ] Nessun colore blu/viola/indigo sui loader (usa `#202223`)
- [ ] Nessun gradiente multicolore su componenti UI
- [ ] Nessun custom SVG per icone (usa Lucide)
- [ ] Size degli icon rispetta i preset (14/16/20/24/32px)
