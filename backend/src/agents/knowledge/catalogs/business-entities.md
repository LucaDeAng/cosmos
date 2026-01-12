# Business Entities Catalog

- category: catalog_entities
- source: internal

Catalogo delle tipologie di entità business per portfolio management.

## Entity Types

### Products
Beni tangibili o intangibili che vengono venduti o forniti.

**Physical Products**
- **Consumer Goods**: Prodotti di consumo, FMCG
- **Industrial Goods**: Macchinari, attrezzature, componenti
- **Raw Materials**: Materie prime, semilavorati
- **Packaging**: Imballaggi, contenitori

**Digital Products**
- **Software**: Applicazioni, piattaforme, tool
- **Content**: Media, pubblicazioni, corsi
- **Data**: Dataset, analytics, insights
- **Digital Assets**: NFT, licenze digitali

**Detection Signals**:
- Ha un codice SKU, part number, codice articolo
- Ha specifiche tecniche (dimensioni, peso, capacità)
- Ha un prezzo unitario o listino
- È vendibile, ordinabile, spedibile
- Ha giacenza, stock, disponibilità

### Services
Attività erogate continuativamente che forniscono valore.

**Professional Services**
- **Consulting**: Consulenza strategica, tecnica, organizzativa
- **Training**: Formazione, coaching, mentoring
- **Audit**: Revisione, certificazione, assessment

**Operational Services**
- **Support**: Assistenza, help desk, manutenzione
- **Outsourcing**: BPO, ITO, facility management
- **Managed Services**: Gestione sistemi, infrastrutture

**Financial Services**
- **Leasing**: Noleggio, locazione operativa
- **Insurance**: Coperture assicurative
- **Financing**: Finanziamenti, factoring

**Detection Signals**:
- Ha un canone ricorrente (mensile, annuale)
- Prevede SLA, KPI, livelli di servizio
- È erogato continuativamente
- Richiede risorse dedicate
- Ha contratto di servizio, agreement

### Initiatives / Projects
Attività temporanee con obiettivi specifici.

**Strategic Initiatives**
- **Transformation**: Digital transformation, change management
- **Innovation**: R&D, new product development
- **Expansion**: Nuovi mercati, M&A, partnership

**Operational Projects**
- **Implementation**: Implementazione sistemi, rollout
- **Migration**: Migrazione dati, piattaforme
- **Integration**: System integration, API

**Improvement Projects**
- **Optimization**: Process improvement, lean, six sigma
- **Automation**: RPA, workflow automation
- **Modernization**: Legacy modernization, upgrade

**Detection Signals**:
- Ha data inizio e data fine prevista
- Ha un budget allocato
- Ha deliverable, milestone, obiettivi
- Ha un project manager o sponsor
- Termina quando l'obiettivo è raggiunto

## Entity Attributes

### Common Attributes
- **Name**: Nome identificativo
- **Description**: Descrizione dettagliata
- **Owner**: Responsabile, proprietario
- **Status**: Stato corrente (attivo, sospeso, completato)
- **Category**: Categoria di appartenenza

### Financial Attributes
- **Budget**: Budget allocato o previsto
- **Cost**: Costo effettivo o stimato
- **Revenue**: Ricavi generati
- **ROI**: Return on investment
- **TCO**: Total cost of ownership

### Temporal Attributes
- **Start Date**: Data inizio
- **End Date**: Data fine o scadenza
- **Duration**: Durata prevista
- **Milestone**: Tappe intermedie
- **Deadline**: Scadenze critiche

### Quality Attributes
- **Priority**: Priorità (critica, alta, media, bassa)
- **Risk Level**: Livello di rischio
- **Complexity**: Complessità
- **Strategic Value**: Valore strategico

## Status Definitions

### Active Statuses
- **Active**: In corso, operativo
- **In Progress**: In fase di sviluppo/implementazione
- **Live**: In produzione, disponibile
- **Running**: In esecuzione

### Inactive Statuses
- **Paused**: Sospeso temporaneamente
- **On Hold**: In attesa di decisioni
- **Blocked**: Bloccato da dipendenze

### Terminal Statuses
- **Completed**: Completato con successo
- **Cancelled**: Cancellato, abortito
- **Retired**: Dismesso, fine vita
- **Archived**: Archiviato

### Planning Statuses
- **Proposed**: Proposto, in valutazione
- **Planned**: Pianificato, approvato
- **Draft**: Bozza, in definizione

## Priority Definitions

### Critical Priority
- Impatto immediato sul business
- Rischio elevato se non gestito
- Richiede azione urgente
- Budget prioritario

### High Priority
- Importante per obiettivi strategici
- Scadenze ravvicinate
- Stakeholder senior coinvolti
- Visibilità elevata

### Medium Priority
- Contribuisce agli obiettivi
- Tempistiche normali
- Risorse standard
- Gestione ordinaria

### Low Priority
- Nice-to-have
- Nessuna urgenza
- Può essere posticipato
- Risorse se disponibili

## Type Detection Heuristics

### Product Indicators
```
product|prodotto|articolo|item|SKU|codice
prezzo|price|costo unitario|listino
stock|giacenza|disponibilità|magazzino
specifiche|specifications|dimensioni|peso
catalogo|catalog|scheda tecnica
```

### Service Indicators
```
servizio|service|supporto|assistenza
canone|subscription|abbonamento|fee
SLA|livello servizio|contratto
erogazione|delivery|fornitura
help desk|support|manutenzione
```

### Initiative/Project Indicators
```
progetto|project|iniziativa|initiative
budget|investimento|CAPEX
milestone|deliverable|obiettivo
data inizio|start date|kick-off
data fine|end date|deadline|scadenza
sponsor|project manager|PM
```
