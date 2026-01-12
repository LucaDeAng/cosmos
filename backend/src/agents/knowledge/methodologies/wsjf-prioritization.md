# WSJF (Weighted Shortest Job First) - Complete Guide

## Overview
WSJF (Weighted Shortest Job First) is a prioritization model used in the Scaled Agile Framework (SAFe) to sequence jobs (features, capabilities, or epics) for maximum economic benefit. It calculates the cost of delay relative to job size to optimize value delivery.

## The Formula

```
WSJF = Cost of Delay / Job Size
```

Where **Cost of Delay** is the sum of three components:

```
Cost of Delay = Business Value + Time Criticality + Risk Reduction/Opportunity Enablement
```

## Component Definitions

### 1. Business Value
**Question:** How much business value does this deliver to the customer or business?

**Scoring Guide (Fibonacci: 1, 2, 3, 5, 8, 13, 20):**

| Score | Description |
|-------|-------------|
| 1 | Minimal value, nice to have |
| 2 | Minor value, small improvement |
| 3 | Moderate value, noticeable improvement |
| 5 | Significant value, important benefit |
| 8 | High value, major business impact |
| 13 | Very high value, critical capability |
| 20 | Transformational value, game-changer |

**Assessment Questions:**
- What revenue does this generate or protect?
- What costs does this reduce?
- How many customers/users benefit?
- How significant is the improvement?

### 2. Time Criticality
**Question:** How does the value change over time? Is there a deadline or window of opportunity?

**Scoring Guide:**

| Score | Description |
|-------|-------------|
| 1 | No time pressure, value stable over time |
| 2 | Slight time preference, minimal degradation |
| 3 | Moderate time pressure, value decays slowly |
| 5 | Time-sensitive, clear deadline approaching |
| 8 | Urgent, significant value loss if delayed |
| 13 | Critical deadline, major penalty for delay |
| 20 | Fixed date, value drops to zero if missed |

**Assessment Questions:**
- Is there a market window that will close?
- Are there regulatory deadlines?
- Will competitors capture the opportunity?
- Does delay create customer risk?

### 3. Risk Reduction / Opportunity Enablement (RR/OE)
**Question:** Does this reduce risk or enable future opportunities?

**Scoring Guide:**

| Score | Description |
|-------|-------------|
| 1 | Minimal risk reduction, no dependencies |
| 2 | Minor risk reduction, few dependencies |
| 3 | Moderate risk/opportunity impact |
| 5 | Significant risk reduction or enabler |
| 8 | Major risk mitigation, key enabler |
| 13 | Critical risk, many dependencies |
| 20 | Existential risk or transformational enabler |

**Assessment Questions:**
- Does this mitigate business/technical risks?
- Does this enable other valuable work?
- Are there dependencies waiting on this?
- Does this unlock new capabilities?

### Job Size (Effort)
**Question:** What is the relative effort to complete this job?

**Scoring Guide:**

| Score | Description |
|-------|-------------|
| 1 | Trivial effort, hours |
| 2 | Very small, 1-2 days |
| 3 | Small, 3-5 days |
| 5 | Medium, 1-2 weeks |
| 8 | Large, 2-4 weeks |
| 13 | Very large, 1-2 months |
| 20 | Huge, 2-3 months or more |

**Assessment Questions:**
- How much development effort?
- What testing is required?
- How complex is deployment?
- What dependencies must be coordinated?

## Calculation Example

### Initiative: "Customer Self-Service Portal"

| Component | Score | Justification |
|-----------|-------|---------------|
| Business Value | 8 | Reduces support costs 30%, improves CX |
| Time Criticality | 5 | Competitor launching similar Q2 |
| Risk Reduction/OE | 5 | Enables future digital features |
| **Cost of Delay** | **18** | (8 + 5 + 5) |
| Job Size | 8 | ~1 month development |
| **WSJF Score** | **2.25** | (18 / 8) |

### Initiative: "Security Compliance Update"

| Component | Score | Justification |
|-----------|-------|---------------|
| Business Value | 3 | No revenue, operational necessity |
| Time Criticality | 13 | Regulatory deadline in 8 weeks |
| Risk Reduction/OE | 8 | Avoids €500K penalty, audit risk |
| **Cost of Delay** | **24** | (3 + 13 + 8) |
| Job Size | 5 | ~2 weeks development |
| **WSJF Score** | **4.80** | (24 / 5) |

**Result:** Security Compliance Update (4.80) should be prioritized over Customer Portal (2.25)

## WSJF Prioritization Process

### Step 1: Gather Items
Collect all features, initiatives, or epics to be prioritized.

### Step 2: Relative Estimation Session
- Bring together stakeholders (business, product, tech)
- Use planning poker or similar technique
- Score each component relatively (compare items to each other)
- Start with a baseline item as reference

### Step 3: Calculate WSJF
For each item:
1. Sum Business Value + Time Criticality + RR/OE = Cost of Delay
2. Divide by Job Size = WSJF Score

### Step 4: Rank and Sequence
- Sort items by WSJF score (highest first)
- Consider capacity and dependencies
- Create sequenced backlog

### Step 5: Regular Review
- Re-estimate as information changes
- Time Criticality often changes
- New items may reprioritize the list

## Best Practices

### Do's ✓
1. **Use relative scoring** - Don't try to calculate absolute values
2. **Compare items to each other** - "Is this more valuable than that?"
3. **Include diverse perspectives** - Business, tech, and customer views
4. **Re-prioritize regularly** - At least quarterly, or when context changes
5. **Document assumptions** - Record why scores were assigned
6. **Consider job splitting** - Can a large job be broken down?
7. **Use Fibonacci scale** - Forces relative sizing decisions

### Don'ts ✗
1. **Don't average scores** - Use consensus or discussion
2. **Don't score in isolation** - Always compare to other items
3. **Don't ignore RR/OE** - It's often undervalued
4. **Don't lock scores forever** - Time Criticality especially changes
5. **Don't use WSJF for tiny items** - Overhead isn't worth it
6. **Don't let politics override math** - Trust the process
7. **Don't force artificial precision** - Ranges are acceptable

## Common Pitfalls

### Pitfall 1: Inflating Scores
**Problem:** Teams inflate all scores, defeating relative comparison
**Solution:** Anchor to a baseline item, enforce distribution

### Pitfall 2: Ignoring Time Criticality
**Problem:** Important but not urgent items never get done
**Solution:** Explicitly ask "what happens if we wait 6 months?"

### Pitfall 3: Underestimating Job Size
**Problem:** Optimistic sizing distorts WSJF
**Solution:** Include all work (testing, deployment, training)

### Pitfall 4: Analysis Paralysis
**Problem:** Spending more time prioritizing than delivering
**Solution:** Time-box estimation, accept "good enough"

### Pitfall 5: Treating WSJF as Absolute
**Problem:** Blind execution of ranked list
**Solution:** Use WSJF as input to decision-making, not the decision

## Integration with Portfolio Management

### At Epic Level
- Score major initiatives
- Inform roadmap sequencing
- Allocate budget to highest WSJF items

### At Feature Level
- Prioritize within releases
- Guide sprint planning
- Balance competing requests

### At Story Level
- Generally too granular for full WSJF
- Use simplified T-shirt sizing
- Focus on value within feature context

## WSJF vs. Other Methods

| Method | Best For | Limitation |
|--------|----------|------------|
| WSJF | Economic prioritization | Requires estimation effort |
| ICE | Quick scoring | Less rigorous on delay cost |
| MoSCoW | Binary decisions | No relative comparison |
| Stack Ranking | Simple ordering | Doesn't consider effort |
| Value vs. Effort | Visual communication | Misses time component |

## Templates

### WSJF Scoring Template

| Initiative | BV | TC | RR/OE | CoD | Size | WSJF | Rank |
|------------|----|----|-------|-----|------|------|------|
| Initiative A | 8 | 5 | 3 | 16 | 8 | 2.0 | 3 |
| Initiative B | 5 | 8 | 8 | 21 | 5 | 4.2 | 1 |
| Initiative C | 13 | 3 | 2 | 18 | 13 | 1.4 | 4 |
| Initiative D | 8 | 5 | 5 | 18 | 5 | 3.6 | 2 |

### Decision Record Template

```
Initiative: [Name]
Date: [Date]
Participants: [Names]

Business Value: [Score]
Rationale: [Why this score]

Time Criticality: [Score]
Rationale: [Why this score, any deadlines]

Risk Reduction/OE: [Score]
Rationale: [Risks mitigated, opportunities enabled]

Job Size: [Score]
Rationale: [Effort breakdown]

WSJF Score: [Calculated]
Priority Rank: [Position in queue]

Notes: [Any special considerations]
```

## References
- Reinertsen, D. G. (2009). The Principles of Product Development Flow
- Scaled Agile Framework (SAFe) - WSJF Article
- Leffingwell, D. (2018). SAFe Reference Guide
