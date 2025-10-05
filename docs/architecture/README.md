# Architecture Documentation

**Purpose:** Conceptual models, mental frameworks, and design patterns used in the codebase.

---

## When to Use This Directory

Place documentation here when:
- 💡 Documenting a **mental model** (not a feature to build)
- 💡 Explaining a conceptual framework useful for reasoning
- 💡 Describing patterns that may have partial or no implementation
- 💡 Educational/reference material for understanding system design

**NOT for:** Specific features to implement (use `docs/features/` or `docs/research/`)

---

## Contents

### Codebase Architecture (Implementation Reality)

- **[CODEBASE_INVENTORY.md](./CODEBASE_INVENTORY.md)** - Complete inventory of existing infrastructure
  - 6 production panels with proven patterns
  - 9 MobX stores with working correlation examples
  - 7+ reusable UI components (Blueprint.js + styled-components)
  - Complete message passing architecture (Registry, Bridge)
  - **Last verified:** 2025-10-05 via 3-agent parallel scan
  - **Status:** Living document - reflects actual codebase state

### Data Flow Models (Conceptual)

- **[Four-Source Data Truth Model](./four-source-data-truth-model.md)** - Mental model for Meteor data flow
  - Conceptual framework: DDP → Minimongo → Subscriptions → DOM
  - Status: Partial implementation (3/4 sources tracked, no correlation)
  - Value: Useful for reasoning about bugs even if never fully implemented

---

## Document Template

Architecture documents should include:

1. **Purpose** - Why this model/concept is useful
2. **The Model** - Diagram and detailed explanation
3. **Implementation Status** - What exists vs what doesn't in the codebase
4. **Benefits** - How it helps thinking, design, or debugging
5. **Related Documents** - Links to features/research that use this model

---

## Relationship to Features

**Architecture docs are NOT features.** They are:
- **Reference material** - "Here's how to think about X"
- **Decision frameworks** - "When choosing Y, consider these sources"
- **Educational** - "This is how Meteor data flows"

If an architecture doc describes something that SHOULD be built, move it to:
- `docs/features/` if implementation is ready
- `docs/research/` if it needs investigation

---

## Examples of Good Architecture Docs

✅ **Four-Source Data Truth Model** - Mental model for data flow
- Concept is valuable even if never fully implemented
- Helps reason about where bugs occur
- Informs feature design decisions

✅ **Message Passing Architecture** (hypothetical) - How injector ↔ panel communication works
- Explains existing pattern
- Helps developers understand codebase
- Reference for building new features

❌ **Bad:** "Paint My Data Feature Architecture"
- This is a feature, not a concept
- Belongs in `docs/features/` or `docs/research/`

---

## Related

- [Documentation Strategy](../README.md#-documentation-strategy) - Organization principles
- [Speculative vs Implementation-Ready Features](../README.md#speculative-vs-implementation-ready-features) - Decision tree

---

**Last Updated:** 2025-10-05
