# Minimongo Query View - Feature Documentation

**Status:** 🔴 Not Implemented (Design Phase)
**Priority:** P2 (Nice-to-have)
**Estimated Effort:** 8-12 hours
**Complexity:** Medium-High

---

## 📁 Directory Contents

This directory contains complete design documentation for implementing a "Deep Inspection" feature for Minimongo debugging.

### Core Documentation

| File | Purpose | Read Order | For |
|------|---------|------------|-----|
| **LLM_IMPLEMENTATION_GUIDE.md** | Comprehensive implementation guide optimized for AI assistants | ①  First | LLMs, New Developers |
| **ARCHITECTURE_DECISIONS.md** | Critical design decisions that must be made before coding | ② Second | LLMs, Architects |
| **FEATURE_SPEC.md** | Original feature specification and architecture overview | ③ Third | Product, Developers |
| **reference-components/** | Example React components showing desired UI | ④ Reference | Frontend Developers |

---

## 🎯 Quick Start for Implementers

**If you're a human developer:**
1. Read `FEATURE_SPEC.md` to understand WHAT we're building
2. Read `ARCHITECTURE_DECISIONS.md` to understand key technical choices
3. Read `LLM_IMPLEMENTATION_GUIDE.md` for step-by-step implementation
4. Refer to `reference-components/` for UI examples

**If you're an LLM:**
1. Read `LLM_IMPLEMENTATION_GUIDE.md` (optimized for you!)
2. Read prerequisite files listed in the guide (in order!)
3. Make decisions from `ARCHITECTURE_DECISIONS.md`
4. Follow the implementation checklist in the guide

---

## 🔍 Feature Overview

**Problem:** Current Minimongo viewer shows *what data exists*, but not:
- How that data got there (which queries created it)
- Where in the app code queries are being executed
- What the schema structure is

**Solution:** "Deep Inspection" mode that:
- ✅ Intercepts all Minimongo method calls (`find`, `insert`, `update`, etc.)
- ✅ Logs query selectors, options, and arguments
- ✅ Captures JavaScript stack traces showing WHERE queries originated
- ✅ Infers collection schemas automatically from documents
- ✅ Displays queries and mutations separately in organized UI

**User Value:**
- Debug slow queries by seeing exactly what selectors are being used
- Find unnecessary reactive queries (performance optimization)
- Understand data flow in unfamiliar Meteor apps
- Auto-generate schema documentation

---

## 🏗️ Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Meteor App (Browser Tab)                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Mongo.Collection.find({userId: 123})  ← USER CODE   │   │
│  └─────────────────────┬────────────────────────────────┘   │
│                        │ Intercepted by wrapped method      │
│  ┌─────────────────────▼────────────────────────────────┐   │
│  │  MinimongoInjector (Injected Script)                  │   │
│  │  - Captures: method name, arguments, stack trace      │   │
│  │  - Serializes with EJSON (preserves Meteor types)     │   │
│  │  - Sends: 'MINIMONGO_METHOD' message                  │   │
│  └─────────────────────┬────────────────────────────────┘   │
└────────────────────────┼──────────────────────────────────────┘
                         │ Message Bridge
┌────────────────────────▼──────────────────────────────────────┐
│  DevTools Panel                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  MinimongoStore (MobX Store)                          │    │
│  │  - Receives messages via BridgeAdapter                │    │
│  │  - Routes to appropriate CollectionStore              │    │
│  │  - Stores logs, computes schema                       │    │
│  └─────────────────────┬────────────────────────────────┘    │
│                        │ MobX reactivity                      │
│  ┌─────────────────────▼────────────────────────────────┐    │
│  │  UI Components (React + Blueprint)                    │    │
│  │  - Tabs: Documents | Queries & Schema                 │    │
│  │  - SchemaDisplay (inferred schema table)              │    │
│  │  - MethodLogDisplay (query/mutation logs + stacks)    │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

---

## 📊 Implementation Breakdown

### Phase 1: Backend Infrastructure (4-6 hours)

| Task | File | Lines | Complexity |
|------|------|-------|------------|
| Add method wrapping | `MinimongoInjector.ts` | +150 | Medium |
| Schema inference utility | `schema-inference.ts` (new) | +100 | Low |
| Expand CollectionStore | `CollectionStore.ts` | +120 | Medium |
| Add message handler | `MinimongoStore/index.ts` | +30 | Low |
| TypeScript interfaces | `types/` | +50 | Low |

### Phase 2: UI Components (3-5 hours)

| Task | File | Lines | Complexity |
|------|------|-------|------------|
| Schema table component | `SchemaDisplay.tsx` (new) | +45 | Low |
| Method log component | `MethodLogDisplay.tsx` (new) | +77 | Medium |
| Container component | `MinimongoQueryView.tsx` (new) | +54 | Low |
| Tab integration | `Minimongo.tsx` | refactor | Medium |

### Phase 3: Testing (1-2 hours)

- Unit tests for `schema-inference.ts`
- Manual testing in live Meteor app
- Performance testing with high-frequency queries

---

## ⚠️ Critical Decisions Required

Before implementing, you MUST decide:

### 🔴 ADR-001: Collections Data Structure (CRITICAL)

**Question:** How to store method logs alongside documents?

**Option A (Safe):** Parallel data structures
**Option B (Clean):** Unified CollectionStore architecture ← **Recommended**
**Option C (Hybrid):** On-demand store creation

**Impact:** Affects entire implementation architecture.
**Read:** `ARCHITECTURE_DECISIONS.md` for full analysis.

### 🟡 Other Decisions (Pre-decided, can revisit)

- ✅ Log storage: 1000-log circular buffer
- ✅ Throttling: 100ms, max 10 messages/sec
- ✅ Serialization: EJSON (preserves Meteor types)
- ✅ Stack traces: Capture full, truncate in UI
- ✅ UI layout: Tabs (not accordion or split pane)

---

## 🧪 Testing Strategy

### Unit Tests

**File:** `schema-inference.spec.ts`
- Empty collection → empty schema
- String/number/boolean type detection
- Optional field detection
- Mixed types → `type: 'mixed'`
- Array and object detection
- Edge cases (null, undefined, nested objects)

### Integration Tests (Manual)

1. **Basic Query Capture:**
   - Open Meteor app
   - Run `MyCollection.find({userId: 123})`
   - Verify: DevTools shows query in "Queries" section
   - Verify: Args display `{userId: 123}`

2. **Stack Trace Accuracy:**
   - Click query log
   - Expand stack trace
   - Verify: Top frame shows caller location in app code

3. **Schema Inference:**
   - View collection with documents
   - Check "Schema" section
   - Verify: All fields listed with correct types
   - Verify: Optional fields marked correctly

4. **Performance Under Load:**
   - Type in search box (queries on every keystroke)
   - Type 10 characters quickly
   - Verify: UI stays responsive
   - Verify: Logs appear (but throttled, not flooded)

---

## 🚧 Known Limitations

**Current Design:**
- ✅ Query interception works
- ✅ Schema inference is accurate
- ✅ Stack traces are helpful

**Future Enhancements:**
- ⚠️ No filtering/search within logs (future: filter by method, date range)
- ⚠️ No export of logs (future: save to JSON, CSV)
- ⚠️ No query performance metrics (future: track execution time)
- ⚠️ Limited to Minimongo (future: DDP method call tracking)

---

## 📚 Reference Components

Located in `reference-components/` - these are EXAMPLES, not production code.

### `SchemaDisplay.tsx`
Blueprint `<HTMLTable>` displaying inferred schema fields with types and optionality.

### `MethodLogDisplay.tsx`
Displays query/mutation logs with collapsible stack traces and JSON-rendered arguments.

### `MinimongoQueryView.tsx`
Container component combining SchemaDisplay + MethodLogDisplay in side-by-side cards.

### `Minimongo.tsx`
Example of how to integrate tabs into existing Minimongo panel.

**⚠️ Note:** These are reference implementations. Actual implementation may differ based on:
- Import path changes
- Type signature updates
- UI/UX refinements
- Performance optimizations

---

## 🎓 Learning Resources

**For understanding Meteor internals:**
- Meteor Docs: [Collections](https://docs.meteor.com/api/collections.html)
- Minimongo Source: `meteor/packages/minimongo`

**For understanding this codebase:**
- MobX Docs: [Observables, Actions, Computed](https://mobx.js.org)
- Blueprint Docs: [Components](https://blueprintjs.com/docs/)
- Read: `LLM_IMPLEMENTATION_GUIDE.md` → "Prerequisite Files" section

---

## 💡 Implementation Tips

### For LLMs

**DO:**
- ✅ Read LLM_IMPLEMENTATION_GUIDE.md first (optimized for you)
- ✅ Read prerequisite files in the exact order specified
- ✅ Make architecture decisions BEFORE coding
- ✅ Copy existing patterns from the codebase
- ✅ Test each component in isolation before integrating

**DON'T:**
- ❌ Skip prerequisite file reading (you'll make wrong assumptions)
- ❌ Implement without deciding ADR-001 (collections structure)
- ❌ Reinvent patterns (reuse existing MobX/React patterns)
- ❌ Implement all at once (do backend → UI → testing)

### For Humans

**DO:**
- ✅ Read FEATURE_SPEC.md for context and motivation
- ✅ Review ARCHITECTURE_DECISIONS.md before starting
- ✅ Consult reference-components/ for UI inspiration
- ✅ Test with real Meteor apps during development

**DON'T:**
- ❌ Copy reference components verbatim (they're examples, not final)
- ❌ Skip schema inference tests (critical for correctness)
- ❌ Forget throttling (will spam message channel)
- ❌ Break existing Minimongo functionality (regression test!)

---

## 📞 Questions or Feedback?

**This is unimplemented design documentation.** If you:
- Find errors or inconsistencies in the design
- Have suggestions for improvements
- Need clarification on architecture decisions
- Discover edge cases not covered

Please update the relevant documentation file and note changes in git commit.

---

## 📅 Status Timeline

| Date | Event | Status |
|------|-------|--------|
| 2025-10-04 | Feature design documented | 📝 Design Complete |
| TBD | Implementation started | ⏳ Awaiting |
| TBD | Backend complete (Phase 1) | ⏳ Awaiting |
| TBD | UI complete (Phase 2) | ⏳ Awaiting |
| TBD | Testing complete (Phase 3) | ⏳ Awaiting |
| TBD | Feature shipped in release | ⏳ Awaiting |

---

**Last Updated:** 2025-10-04
**Documentation Maintainer:** @primeinc
**Feature Champion:** TBD
**Implementation Status:** 🔴 Not Started (0%)
