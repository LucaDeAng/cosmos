# Prioritization Frameworks - Framework di Prioritizzazione

## Metadata
- type: catalog
- category: catalog_prioritization
- version: 1.0
- language: it/en

---

## 1. WSJF (Weighted Shortest Job First)

### Formula
```
WSJF = Cost of Delay / Job Duration (Size)

Cost of Delay = User-Business Value + Time Criticality + Risk Reduction/Opportunity Enablement
```

### Scale (Fibonacci: 1, 2, 3, 5, 8, 13, 21)

| Component | 1-3 | 5-8 | 13-21 |
|-----------|-----|-----|-------|
| **User-Business Value** | Nice to have, limited users | Important, significant users | Critical, broad impact |
| **Time Criticality** | No deadline | Some time pressure | Urgent, regulatory |
| **Risk Reduction/OE** | No risk reduction | Moderate mitigation | Major risk or enabler |
| **Job Size** | >6 months | 1-6 months | <1 month |

### WSJF Interpretation
| WSJF Score | Priority | Action |
|------------|----------|--------|
| ≥20 | Critical | Do immediately |
| 13-19 | High | Plan for next quarter |
| 7-12 | Medium | Backlog, consider |
| 1-6 | Low | Defer or eliminate |

### Example Calculation
```
Initiative: Cloud Migration
- User-Business Value: 13 (major efficiency gain)
- Time Criticality: 8 (datacenter contract expiring)
- Risk Reduction: 8 (reduces operational risk)
- Cost of Delay = 13 + 8 + 8 = 29

- Job Size: 8 (6-9 months effort)

WSJF = 29 / 8 = 3.6 → Normalize to scale
```

---

## 2. RICE Scoring

### Formula
```
RICE Score = (Reach × Impact × Confidence) / Effort
```

### Components

| Component | Description | Scale |
|-----------|-------------|-------|
| **Reach** | Number of users/customers impacted per quarter | Actual number |
| **Impact** | Degree of impact per user | 0.25 (minimal), 0.5 (low), 1 (medium), 2 (high), 3 (massive) |
| **Confidence** | How sure are we of estimates | 100%, 80%, 50% |
| **Effort** | Person-months to complete | Actual estimate |

### Impact Scale Details
| Score | Impact Level | Description |
|-------|--------------|-------------|
| 3 | Massive | Complete game-changer |
| 2 | High | Major improvement |
| 1 | Medium | Notable improvement |
| 0.5 | Low | Minor improvement |
| 0.25 | Minimal | Barely noticeable |

### Example
```
Feature: Self-service password reset
- Reach: 5000 users/quarter
- Impact: 1 (medium - saves time)
- Confidence: 80%
- Effort: 2 person-months

RICE = (5000 × 1 × 0.80) / 2 = 2000
```

---

## 3. MoSCoW Method

### Categories

| Priority | Description | Budget Allocation |
|----------|-------------|-------------------|
| **Must Have** | Critical, non-negotiable requirements | ~60% |
| **Should Have** | Important but not vital | ~20% |
| **Could Have** | Desirable if resources permit | ~15% |
| **Won't Have** | Explicitly excluded from scope | ~5% (contingency) |

### Decision Criteria

**Must Have**:
- Without it, the solution doesn't work
- Regulatory/legal requirement
- Core business function
- No workaround exists

**Should Have**:
- Important for user satisfaction
- Has workaround but painful
- Significant business value
- Expected by stakeholders

**Could Have**:
- Nice to have
- Improves UX but not critical
- Can be delivered later
- Low impact if missing

**Won't Have (this time)**:
- Out of scope explicitly
- Can be reconsidered later
- Too expensive/complex now
- Not aligned with objectives

---

## 4. ICE Scoring

### Formula
```
ICE Score = Impact × Confidence × Ease
```

### Scale (1-10 for each)

| Component | 1-3 | 4-6 | 7-10 |
|-----------|-----|-----|------|
| **Impact** | Minimal effect | Moderate effect | Significant effect |
| **Confidence** | Just a guess | Some evidence | Strong evidence |
| **Ease** | Very hard (>6mo) | Moderate (1-6mo) | Easy (<1mo) |

### Example
```
Initiative: CRM Data Cleanup
- Impact: 7 (better sales conversion)
- Confidence: 8 (clear data quality issues)
- Ease: 9 (known scope, simple tools)

ICE = 7 × 8 × 9 = 504
```

---

## 5. Value vs Effort Matrix (2x2)

### Quadrants
```
        High Value
             │
    Quick    │    Strategic
     Wins    │    Projects
             │
────────────────────────────
             │
    Fill-Ins │    Avoid/
    (maybe)  │    Rethink
             │
        Low Value

  Low Effort ───────── High Effort
```

### Quadrant Actions
| Quadrant | Value | Effort | Action |
|----------|-------|--------|--------|
| Quick Wins | High | Low | Do first, immediate ROI |
| Strategic | High | High | Plan carefully, major investment |
| Fill-Ins | Low | Low | Do if capacity allows |
| Avoid | Low | High | Don't do, waste of resources |

---

## 6. Kano Model

### Categories

| Category | Description | Satisfaction Impact |
|----------|-------------|---------------------|
| **Must-Be** | Expected, causes dissatisfaction if absent | Prevents negative |
| **One-Dimensional** | More is better, linear relationship | Proportional |
| **Attractive** | Unexpected delighters | Exponential positive |
| **Indifferent** | No impact either way | None |
| **Reverse** | Some users dislike it | Negative |

### Application to IT Portfolio
| Kano Type | IT Example |
|-----------|------------|
| Must-Be | System stability, security, compliance |
| One-Dimensional | Performance, features, support |
| Attractive | Innovative UX, AI features |
| Indifferent | Backend refactoring (invisible) |

---

## 7. Cost of Delay (CoD)

### Types of Cost of Delay

| Type | Pattern | Example |
|------|---------|---------|
| **Standard** | Linear loss over time | Market share erosion |
| **Urgent** | High initial, then drops | Regulatory deadline |
| **Fixed Date** | Zero before, high after | Product launch |
| **Intangible** | Hard to quantify | Brand damage |

### Quantifying CoD
```
Weekly CoD = (Annual Value / 52) + Opportunity Cost + Risk Cost

Example:
- Annual Value: €500K
- Weekly revenue at risk: €500K/52 = €9,615/week
- Opportunity cost: €2,000/week (competitor advantage)
- Risk cost: €1,000/week (compliance risk)

Total Weekly CoD = €12,615
```

---

## 8. Portfolio Balancing

### Three Horizons Model (McKinsey)
| Horizon | Focus | Time | Budget % |
|---------|-------|------|----------|
| H1 | Core business | Now-2 years | 70% |
| H2 | Emerging opportunities | 2-5 years | 20% |
| H3 | Future options | 5+ years | 10% |

### Run/Grow/Transform (Gartner)
| Type | Focus | Budget % |
|------|-------|----------|
| Run | Keep lights on | 60-70% |
| Grow | Improve existing | 20-30% |
| Transform | New capabilities | 10-20% |

---

## 9. Priority Normalization Rules

### Input → Normalized Priority Mapping

| Input (IT) | Input (EN) | Normalized | WSJF Equivalent |
|------------|------------|------------|-----------------|
| critico, urgente | critical, urgent | critical | 20+ |
| priorità 0, P0 | priority 0, P0 | critical | 20+ |
| must-have | must-have | critical | 20+ |
| alto, importante | high, important | high | 13-19 |
| priorità 1, P1 | priority 1, P1 | high | 13-19 |
| should-have | should-have | high | 13-19 |
| medio, normale | medium, normal | medium | 7-12 |
| priorità 2, P2 | priority 2, P2 | medium | 7-12 |
| could-have | could-have | medium | 7-12 |
| basso | low | low | 1-6 |
| priorità 3, P3 | priority 3, P3 | low | 1-6 |
| nice-to-have | nice-to-have | low | 1-6 |
| won't-have | won't-have | none | 0 |

---

## 10. Scoring Extraction Heuristics

### Keywords → Priority Indicators

| Keywords | Likely Priority | Confidence |
|----------|-----------------|------------|
| urgente, ASAP, critico, bloccante | critical | high |
| importante, strategico, chiave | high | high |
| normale, standard, pianificato | medium | medium |
| opzionale, se possibile, nice | low | high |
| rimandare, posticipare, later | low/none | medium |

### Budget → Effort Correlation
| Budget Range | Typical Effort | Duration |
|--------------|----------------|----------|
| <€50K | Low | <3 months |
| €50K-€200K | Medium | 3-6 months |
| €200K-€500K | High | 6-12 months |
| >€500K | Very High | >12 months |

### Stakeholder Count → Complexity
| Stakeholders | Complexity |
|--------------|------------|
| 1-2 | Low |
| 3-5 | Medium |
| 6+ | High |

---

## 11. Automated Priority Calculation

### Default Scoring Algorithm
```typescript
function calculatePriority(item: {
  businessValue?: number;      // 1-10
  urgency?: number;            // 1-10
  riskReduction?: number;      // 1-10
  effort?: 'low' | 'medium' | 'high';
  budget?: number;
}): 'critical' | 'high' | 'medium' | 'low' {
  
  // Map effort to divisor
  const effortDivisor = {
    low: 2,
    medium: 5,
    high: 8
  };
  
  // Calculate WSJF-like score
  const costOfDelay = 
    (item.businessValue || 5) + 
    (item.urgency || 5) + 
    (item.riskReduction || 3);
  
  const effort = effortDivisor[item.effort || 'medium'];
  const score = costOfDelay / effort;
  
  // Map to priority
  if (score >= 6) return 'critical';
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}
```

---

## 12. Framework Selection Guide

| Situation | Recommended Framework |
|-----------|----------------------|
| Product backlog with many items | WSJF or RICE |
| Binary scope decisions | MoSCoW |
| Quick team alignment | ICE |
| Strategy discussion | Value/Effort Matrix |
| Customer-facing features | Kano Model |
| Portfolio balancing | Three Horizons |
| Understanding delays | Cost of Delay |
