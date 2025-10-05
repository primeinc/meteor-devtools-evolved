# Research Documentation

**Purpose:** Speculative or unproven feature ideas requiring investigation before implementation.

---

## When to Use This Directory

Place documentation here when:
- ⚠️ Technical approach is **unproven** (needs prototyping)
- ⚠️ Has **open questions** or **unknown complexity**
- ⚠️ Multiple risky assumptions
- ⚠️ Implementation estimate is "TBD" or has wide range (e.g., 40-200 hours)

**NOT for:** Features with proven approaches and concrete implementation steps (use `docs/features/` instead)

---

## Contents

### Active Research

- **[DOM Data Correlation](./dom-data-correlation.md)** - Correlating rendered DOM with Minimongo data
  - Status: Not Started
  - Approaches: Heuristic text matching vs framework instrumentation
  - Next step: Decide whether to fund Phase 1 prototype

---

## Document Template

Research documents should include:

1. **Problem Statement** - What are we trying to solve?
2. **Proposed Approaches** - 2-3 options with pros/cons
3. **Hard Problems** - Technical challenges, unknowns, risks
4. **Research Plan** - Phases with success criteria and time estimates
5. **Open Questions** - What needs answering before committing?
6. **Recommendation** - Pursue, prototype first, or abandon?

---

## Graduation Criteria

A research document graduates to `docs/features/` when:
- ✅ Prototype proves technical feasibility
- ✅ Open questions are answered
- ✅ Implementation approach is concrete (not "research how to...")
- ✅ Time estimate is realistic and bounded

**Process:**
1. Complete research phases (usually Phase 1-2)
2. Document findings in research doc
3. If feasible, create feature spec in `docs/features/`
4. Archive or delete research doc (decision recorded in feature spec)

---

## Related

- [Documentation Strategy](../README.md#-documentation-strategy) - Why research docs are separate
- [Speculative vs Implementation-Ready Features](../README.md#speculative-vs-implementation-ready-features) - Decision tree

---

**Last Updated:** 2025-10-05
