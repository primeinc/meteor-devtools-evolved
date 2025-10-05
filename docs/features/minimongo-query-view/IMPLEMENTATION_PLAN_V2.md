# Implementation Plan - Minimongo Query View + Enhanced DevTools

**Status:** ✅ Validated & Modularized (2025-10-05)
**Alignment:** 98% (TrackerInjector feasibility confirmed + 2 critical gotchas integrated)
**Total Effort:** 39-49 hours across 5 parallel workloads
**Parallelization:** 3 workloads can start immediately, 2 have dependencies

---

## Executive Summary

This plan implements the Minimongo Query View feature plus enhanced DDP inspection, reactivity analysis, performance auditing, and intelligent recommendations.

**Key Insight:** We CAN instrument Tracker.autorun because our injection timing (after Meteor core loads, before app bundles execute) allows reliable prototype wrapping—proven by existing MeteorAdapter.ts success with Minimongo methods.

**Architecture:** Client-side browser extension (Chrome MV3 / Firefox MV2) using passive observation patterns.

---

## Document Structure

This implementation plan is split into **7 focused documents** for parallel development:

```
docs/features/minimongo-query-view/implementation/
├── workload-a-minimongo-instrumentation.md   (8-12h, no dependencies)
├── workload-b-ddp-enhancements.md            (5-6h, no dependencies, START FIRST!)
├── workload-c-tracker-reactivity.md          (10-12h, depends on B)
├── workload-d-performance-monitoring.md      (5-6h, depends on B)
├── workload-e-auditor.md                     (8-10h, depends on ALL)
├── architecture-gotchas.md                   (critical patterns affecting B,D,E)
└── testing-strategy.md                       (unit + E2E test procedures)
```

**Why split?** Each file represents a distinct workload with minimal file overlap, enabling parallel development.

---

## Workload Overview

### Workload A: Minimongo Instrumentation & Correlation
**Owner:** Dev A
**Effort:** 8-12 hours
**Dependencies:** None
**Files:** [workload-a-minimongo-instrumentation.md](./implementation/workload-a-minimongo-instrumentation.md)

**Outputs:**
- Query logging with stack traces
- DDP correlation service
- Virtualized query list UI

**Key Pattern:** Extends existing `MeteorAdapter.ts:28-53` method wrapping.

---

### Workload B: DDP Inspector Enhancements ⭐ START FIRST
**Owner:** Dev B
**Effort:** 5-6 hours
**Dependencies:** None (fully independent)
**Files:** [workload-b-ddp-enhancements.md](./implementation/workload-b-ddp-enhancements.md)

**Outputs:**
- RPC latency metrics with timeline visualization
- Subscription data load tracking + update rate
- Byte size calculation for all DDP messages
- `EventEmitter` integration (enables Workload C)

**Why first?** Workload C (Tracker) depends on `DDPStore` emitting `ddp-changed` events.

**Key Pattern:** Extends `DDPStore` to use `eventemitter3`, adds computed correlation methods.

---

### Workload C: Tracker Reactivity Analysis
**Owner:** Dev C
**Effort:** 10-12 hours
**Dependencies:** Workload B (needs `DDPStore.emit('ddp-changed')`)
**Files:** [workload-c-tracker-reactivity.md](./implementation/workload-c-tracker-reactivity.md)

**Outputs:**
- `TrackerInjector.ts` wrapping `Tracker.autorun`
- `TrackerStore.ts` tracking computations and dependencies
- Phantom re-run detection via field intersection
- Leaked computation detection
- Reactivity panel UI

**Why viable?** Injection timing proven by `MeteorAdapter.ts` success. Global flag pattern (`window.__meteor_devtools_current_computation`) is clean and reliable.

**Key Pattern:** Wrap `Tracker.autorun`, track dependencies via global flag, correlate with DDP `changed` events.

---

### Workload D: Performance Monitoring
**Owner:** Dev D
**Effort:** 5-6 hours
**Dependencies:** Workload B (needs byte size tracking)
**Files:** [workload-d-performance-monitoring.md](./implementation/workload-d-performance-monitoring.md)

**Outputs:**
- `PerformanceObserver` integration for long tasks
- Memory leak detection workflow (snapshot comparison)
- DDP-performance correlation (link byte volumes to UI jank)

**Key Pattern:** Browser PerformanceObserver API + MobX computed correlation.

---

### Workload E: Intelligent Auditor
**Owner:** Dev E
**Effort:** 8-10 hours
**Dependencies:** ALL previous workloads (integrates everything)
**Files:** [workload-e-auditor.md](./implementation/workload-e-auditor.md)

**Outputs:**
- Heuristic anti-pattern detection (over-fetching, missing indexes, N+1, large payloads)
- Overlapping subscription detection + merge box field tracking
- Opt-in Proxy field access tracking
- Auditor panel UI with actionable recommendations

**Why last?** Reads from all stores created in Workloads A-D.

**Key Patterns:** MobX computed analysis across all stores, opt-in Proxy via feature flag.

---

## Critical Architecture Considerations

**See:** [architecture-gotchas.md](./implementation/architecture-gotchas.md)

### Gotcha 1: State Persistence on HMR/Page Refresh 🔴 CRITICAL

**Problem:** DevTools panel state is destroyed on HMR/refresh, losing all debugging context.

**Solution:** Background script as primary data owner. Panel stores become "views" of background data.

**Benefits:**
- ✅ Data survives HMR
- ✅ Data survives page refresh
- ✅ "Preserve log on navigation" feature (like Chrome Network tab)

**Implementation Timing:** Refactor after Workload B complete, OR build-in from start.

**Affected Workloads:** B, C, D (all stores)

---

### Gotcha 2: Merge Box Field Ambiguity 🟡 MEDIUM

**Problem:** Two subscriptions publishing same document with different fields causes merge confusion. Fields unexpectedly appear/disappear.

**Solution:** Enhanced overlapping subscription detection that tracks WHICH FIELDS each subscription provides.

**Benefits:**
- ✅ Flags dangerous overlaps (different field sets = HIGH severity)
- ✅ Safe overlaps (identical fields = LOW severity)
- ✅ Clear recommendation: "Ensure both publications provide the same fields"

**Implementation Timing:** Part of Workload E (Auditor).

**Affected Workloads:** E (Auditor), B (DDPStore field tracking)

---

## Testing Strategy

**See:** [testing-strategy.md](./implementation/testing-strategy.md)

**Testing Pyramid:**
- 70% Unit tests (Jest) - Pure logic, store methods
- 20% Integration tests - Store interactions
- 10% E2E tests (Manual + Cypress) - User-facing features

**Primary Test Environment:** `/devapp` Meteor application with special test routes.

**Key Test Scenarios:**
1. Minimongo query logging with stack traces
2. DDP correlation badges
3. RPC latency timeline visualization
4. Subscription update rate metrics
5. Tracker computation tracking
6. Phantom re-run detection
7. Performance-DDP correlation
8. Memory leak detection
9. Auditor anti-pattern detection
10. State persistence across HMR

**CI/CD:** Unit tests on every PR, E2E tests on merge to main.

---

## Parallelization Strategy

### Phase 1: Simultaneous Start (Week 1)
- ✅ **Workload B** (Dev B) - START FIRST (other workloads depend on this)
- ✅ **Workload A** (Dev A) - Fully independent
- ⏸️ **Workload C** (Dev C) - Can start immediately, waits for B's EventEmitter (small blocker)

**Critical Path:** B must expose `DDPStore.emit('ddp-changed')` early in week.

### Phase 2: Sequential (Week 2)
- ⏩ **Workload D** (Dev D) - Starts when B completes byte size tracking
- ⏩ **Workload C** (Dev C) - Continues when B completes EventEmitter

### Phase 3: Integration (Week 3)
- ⏩ **Workload E** (Dev E) - Starts when A, B, C, D complete

---

## Timeline Estimate

| Week | Workloads Active | Blockers | Output |
|------|------------------|----------|--------|
| **Week 1** | A, B, C (partial) | None | Minimongo logging, DDP enhancements, Tracker injection |
| **Week 2** | C (complete), D | B byte size | Reactivity analysis, Performance monitoring |
| **Week 3** | E | A+B+C+D complete | Auditor integration |
| **Week 4** | Testing + Polish | None | CI/CD, E2E tests, documentation |

**Total Calendar Time:** 4 weeks (with 3-5 developers working in parallel)

**Total Effort:** 39-49 hours (if done sequentially)

---

## File Impact Analysis

### Files Created (20 total)

**Workload A (6 files):**
1. `src/Stores/Panel/MinimongoStore/types.ts`
2. `src/Pages/Panel/Minimongo/components/QueryLogRow.tsx`
3. `src/Pages/Panel/Minimongo/components/QueryLogList.tsx`
4. `src/Services/MinimongoDDPCorrelator.ts`
5. `src/Stores/Panel/MinimongoStore/__tests__/MinimongoStore.test.ts`
6. `src/Services/__tests__/MinimongoDDPCorrelator.test.ts`

**Workload B (0 new files - only modifications)**

**Workload C (4 files):**
1. `src/Injectors/TrackerInjector.ts`
2. `src/Stores/Panel/TrackerStore.ts`
3. `src/Pages/Panel/Reactivity/index.tsx`
4. `src/Stores/Panel/__tests__/TrackerStore.test.ts`

**Workload D (3 files):**
1. `src/Services/PerformanceCorrelator.ts`
2. `src/Pages/Panel/Performance/MemoryLeakDetector.tsx`
3. `src/Pages/Panel/Performance/index.tsx`

**Workload E (2 files):**
1. `src/Services/Auditor.ts`
2. `src/Pages/Panel/Auditor/index.tsx`

**Testing (5 files):**
- Various `__tests__/*.test.ts` files per workload

---

### Files Modified (15 total)

**Workload A:**
- `src/Injectors/MeteorAdapter.ts`
- `src/Stores/Panel/MinimongoStore/index.ts`
- `src/Stores/Panel/SettingStore.ts`
- `src/Bridge.ts`
- `src/Pages/Panel/Minimongo/index.tsx`

**Workload B:**
- `src/Stores/Panel/DDPStore.ts` (EventEmitter + RPC methods)
- `src/Pages/Panel/DDP/components/DDPLogPreview.tsx`
- `src/Stores/Panel/SubscriptionStore.ts`
- `src/Pages/Panel/Subscriptions/Subscriptions.tsx`
- `src/Injectors/DDPInjector.ts`

**Workload C:**
- `src/Browser/Inject.ts` (call TrackerInjector)
- `src/Bridge.ts` (add 4 event receivers)
- `src/Stores/PanelStore.tsx` (instantiate TrackerStore)
- `src/Pages/Panel/index.tsx` (add Reactivity tab)

**Workload D:**
- `src/Browser/Inject.ts` (PerformanceObserver)
- `src/Stores/Panel/PerformanceStore.ts`
- `src/Stores/Panel/MinimongoStore/index.ts` (snapshots)

**Workload E:**
- `src/Stores/Panel/SettingStore.ts` (deep analysis flag)
- `src/Pages/Panel/Settings/index.tsx`
- `src/Injectors/MeteorAdapter.ts` (opt-in Proxy)

---

## Success Metrics

### Workload A Complete When:
- ✅ Minimongo queries logged with stack traces
- ✅ Query list UI renders with virtualization
- ✅ DDP correlation badges visible
- ✅ Tests passing (2 test files)

### Workload B Complete When:
- ✅ DDPStore extends EventEmitter
- ✅ RPC latency timeline renders
- ✅ Subscription columns show metrics
- ✅ Byte sizes tracked for all DDP messages
- ✅ Tests passing

### Workload C Complete When:
- ✅ TrackerInjector wraps Tracker.autorun
- ✅ Phantom re-runs detected
- ✅ Leaked computations flagged
- ✅ Reactivity panel renders
- ✅ Tests passing (1 test file)

### Workload D Complete When:
- ✅ Long tasks detected via PerformanceObserver
- ✅ Memory leak workflow functional
- ✅ DDP-performance correlation showing
- ✅ Tests passing

### Workload E Complete When:
- ✅ Auditor detects 6 types of issues
- ✅ Merge box conflicts flagged
- ✅ Opt-in Proxy field tracking available
- ✅ Tests passing (1 test file)

---

## Dependencies Management

**Package Additions:**
- `eventemitter3` (Workload B)

**Browser APIs Used:**
- `PerformanceObserver` (Workload D)
- `Proxy` (Workload E - opt-in)
- `TextEncoder` (Workload B - byte sizes)

**No Breaking Changes:** All features are additive enhancements.

---

## Risk Mitigation

### Risk 1: Stack Trace Performance Impact
**Mitigation:** Feature flag `isQueryStackTraceEnabled` (default: false). Workload A implements toggle in Settings.

### Risk 2: Proxy Breaking App Code
**Mitigation:** Opt-in via `isDeepFieldAnalysisEnabled` with clear warning in UI. Workload E implements.

### Risk 3: Message Queue Overflow
**Mitigation:** All stores limit arrays to 1000 entries max. Implemented across all workloads.

### Risk 4: TrackerInjector Timing Failure
**Mitigation:** Graceful fallback if `Tracker` not available. Warning logged, feature disabled. Workload C implements.

### Risk 5: Merge Queue Conflicts
**Mitigation:** Clean file boundaries. Each workload owns distinct files. Conflicts minimal.

---

## Documentation Updates

After implementation complete:

1. ✅ Update `README.md` with new features
2. ✅ Update `STATUS.md` with completion percentages
3. ✅ Add user guide for new panels (Reactivity, Auditor)
4. ✅ Update `ARCHITECTURE_DECISIONS.md` with new ADRs
5. ✅ Create demo videos for each major feature

---

## Next Steps

### For Project Manager:
1. Assign workloads to developers
2. Ensure Dev B starts first (critical path)
3. Set up weekly sync to track dependencies
4. Review architecture-gotchas.md with all devs

### For Developers:
1. Read your assigned workload document
2. Read architecture-gotchas.md (state persistence + merge box)
3. Read testing-strategy.md for test expectations
4. Clone repo, set up `/devapp` for testing

### For DevOps:
1. Set up CI/CD for unit tests (see testing-strategy.md)
2. Configure E2E test environment
3. Ensure `/devapp` available for manual testing

---

## Related Documentation

- **Feature Spec:** [FEATURE_SPEC.md](./FEATURE_SPEC.md) - Original requirements
- **Architecture Decisions:** [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) - ADRs
- **Codebase Inventory:** [../architecture/CODEBASE_INVENTORY.md](../architecture/CODEBASE_INVENTORY.md) - What exists
- **Meteor Patterns:** [../METEOR_PATTERNS_REFERENCE.md](../METEOR_PATTERNS_REFERENCE.md) - General patterns
- **Export Formats:** [EXPORT_FORMATS_SPEC.md](./EXPORT_FORMATS_SPEC.md) - Data export (100% complete)

---

**Document Status:** ✅ Ready for Implementation
**Date:** 2025-10-05
**Version:** 2.0 (Modularized + TrackerInjector + Gotchas Integrated)
**Confidence:** 98%

**Ready to rock and roll!** 🚀
