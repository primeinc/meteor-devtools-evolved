# Research: DOM-to-Data Correlation

**Status:** Unproven Research
**Goal:** Determine feasibility of correlating rendered DOM with Minimongo data
**Outcome:** TBD (requires prototyping)

---

## Problem Statement

Given a piece of text or UI element in the DOM, can we reliably determine:
1. Which Minimongo collection it came from?
2. Which document and field?
3. Which subscription owns that data?
4. Whether it's stale/zombie/orphaned?

**Current answer:** Unknown. Two approaches exist, both unproven in this codebase.

---

## Approach 1: Heuristic Text Matching

### Concept

Traverse DOM and match text content against Minimongo field values.

```javascript
// Pseudocode
for (const textNode of getAllTextNodes(document.body)) {
  for (const [collName, docs] of minimongoData) {
    for (const doc of docs) {
      for (const [field, value] of Object.entries(doc)) {
        if (textNode.textContent === String(value)) {
          // Found match!
          paintElement(textNode.parentElement, { collName, docId: doc._id, field })
        }
      }
    }
  }
}
```

### Hard Problems

#### Problem 1: False Positives

**Scenario:** User's name is "John"

```javascript
// Minimongo has:
users: [
  { _id: "1", name: "John" },
  { _id: "2", firstName: "John" }
]
posts: [
  { _id: "3", author: "John" }
]

// DOM shows:
<h1>Welcome, John</h1>

// Which document? Which field?
// Could be users.1.name, users.2.firstName, or posts.3.author
```

**Confidence scoring helps but can't eliminate ambiguity.**

#### Problem 2: Transformed Data

**Scenario:** Templates format data

```javascript
// Minimongo:
{ name: "John", age: 30 }

// DOM renders:
"John (age 30)"

// Text matching fails:
// - "John (age 30)" !== "John"
// - "John (age 30)" !== 30
```

**Solutions:**
- Fuzzy matching (partial text includes)
- Multiple heuristics (check parent class names, data attributes)
- **Confidence threshold** (only paint if > 70% confident)

**Problem:** Still unreliable for complex UIs.

#### Problem 3: Performance

**Naive complexity:** O(DOM nodes × documents × fields)

```
10,000 DOM text nodes
× 500 documents
× 20 fields per document
= 100,000,000 comparisons per paint operation
```

**Optimizations:**
- Index Minimongo values in Map for O(1) lookup
- Only traverse viewport (not entire DOM)
- Batch painting with requestAnimationFrame
- Cache matching results

**Best case:** O(n) where n = visible DOM nodes

**Still expensive** for large DOMs or frequent re-paints.

#### Problem 4: Shadow DOM

**Challenge:** Encapsulated subtrees

```html
<user-profile>
  #shadow-root (open)
    <div class="name">John</div>  <!-- Text hidden from parent DOM -->
  #shadow-root (closed)
    <div>Secret data</div>  <!-- Can't traverse at all -->
</user-profile>
```

**Solutions:**
- Recursively traverse open shadow roots
- **Can't access closed shadow roots** without browser hacks

**Impact:** May miss data in web components.

### Solution to False Positives: Honest Uncertainty Visualization

**Key insight:** Don't try to be 100% certain. Show probability distribution.

**Approach:**
- Green outline: High confidence (90%+) - unique value, single match
- Yellow outline: Medium confidence (60-89%) - multiple candidates shown
- Orange outline: Low confidence (30-59%) - many candidates, needs disambiguation
- Red outline: No Minimongo source found (hardcoded or external data)

**Example UI:**
```html
<span style="outline: 2px solid yellow">John</span>
<!-- Tooltip: -->
⚠️ Multiple possible sources (click to disambiguate):
 • users.abc123.name (65% - appears in 3 recent queries)
 • profiles.def456.firstName (30% - rendered nearby)
 • posts.xyz789.author (5% - low confidence)

Alt+Click: Jump to most likely source
Shift+Click: Show all candidates in DevTools
```

**Benefits:**
- ✅ Honest about limitations (builds trust)
- ✅ Narrows debugging from "anywhere" to "these 3 options"
- ✅ Educational (shows data flow)
- ✅ Useful even when uncertain

### Verdict on Heuristic Matching (UPDATED)

**Pros:**
- No framework coupling
- Works with any rendering library (Blaze, React, Vue)
- Simple to prototype
- **Uncertainty visualization makes false positives acceptable**

**Cons:**
- Performance intensive
- Can't handle transformed data without workflow tracking
- Shadow DOM limitations

**Recommendation:** ✅ **Worth prototyping with uncertainty visualization** (revised assessment)

---

## Approach 1.5: Workflow Mapping (HYBRID APPROACH)

### Concept

Instead of static text matching OR full framework hooks, **track the execution flow** from query → data → render.

```javascript
// Track the workflow timeline
class WorkflowTracker {
  timeline: Event[] = []

  onQueryExecuted(query: { collection: string, result: Document[] }) {
    this.timeline.push({
      type: 'query',
      timestamp: Date.now(),
      collection: query.collection,
      documentIds: query.result.map(d => d._id)
    })
  }

  onTemplateRendered(template: { name: string, data: any }) {
    this.timeline.push({
      type: 'render',
      timestamp: Date.now(),
      template: template.name,
      dataContext: template.data
    })
  }

  // When user clicks DOM element:
  findDataSource(domElement: HTMLElement, text: string) {
    // 1. Find recent renders near this element
    const recentRenders = this.timeline
      .filter(e => e.type === 'render')
      .filter(e => Date.now() - e.timestamp < 5000) // Last 5s

    // 2. Find queries that returned matching data
    const matchingQueries = this.timeline
      .filter(e => e.type === 'query')
      .filter(e => {
        // Check if query result contains this text
        return e.result?.some(doc =>
          Object.values(doc).some(val => String(val) === text)
        )
      })

    // 3. Correlate: Which query → which render → this DOM?
    // Much higher confidence than pure text matching!
    return this.correlateQueryToRender(matchingQueries, recentRenders)
  }
}
```

### Benefits Over Static Heuristics

**Static heuristics:**
```javascript
// Just searches Minimongo for "John"
// Could be any of 50 documents
```

**Workflow tracking:**
```javascript
// Knows:
// - Template "UserProfile" rendered 200ms ago
// - It used data from users.find() query
// - That query returned 1 document with name="John"
// - Confidence: 85% (traced execution path)
```

### Implementation Strategy

**Step 1: Enhance MinimongoInjector**
```typescript
// Already wraps Minimongo methods for performance
// Extend to track query results:

Mongo.Collection.prototype.find = function(selector, options) {
  const result = originalFind.apply(this, arguments)
  const docs = result.fetch()

  WorkflowTracker.recordQuery({
    collection: this._name,
    selector,
    documentIds: docs.map(d => d._id),
    timestamp: Date.now()
  })

  return result
}
```

**Step 2: Track Reactive Computations**
```typescript
// Hook Tracker.autorun to know WHEN queries re-run

const originalAutorun = Tracker.autorun
Tracker.autorun = function(fn) {
  return originalAutorun(function() {
    WorkflowTracker.startComputation()
    fn.apply(this, arguments)
    WorkflowTracker.endComputation()
  })
}
```

**Step 3: Lightweight Render Tracking**
```typescript
// Don't need full Blaze instrumentation
// Just observe DOM mutations and correlate with recent queries

const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      // New node added - check if recent query matches
      const text = node.textContent
      const recentQueries = WorkflowTracker.getRecent(1000) // Last 1s
      const candidates = findMatchingQueries(text, recentQueries)

      if (candidates.length === 1) {
        // High confidence! Only one recent query returned this data
        DOMtoDataMap.set(node, {
          source: candidates[0],
          confidence: 0.9
        })
      }
    })
  })
})
```

### Verdict on Workflow Mapping

**Pros:**
- ✅ Much higher confidence than static matching
- ✅ Lighter weight than full framework instrumentation
- ✅ Framework-agnostic (works with Blaze, React, Vue)
- ✅ Leverages timing correlation (queries → renders)

**Cons:**
- ⚠️ Still some uncertainty (but manageable with visualization)
- ⚠️ Requires MutationObserver (performance overhead)
- ⚠️ May miss renders that happen too fast

**Recommendation:** ✅ **This is the sweet spot** - better than heuristics, simpler than instrumentation

---

## Approach 2: Framework Instrumentation

### Concept

Hook into Blaze/React rendering to track data context definitively.

```javascript
// Blaze example
const originalAttach = Blaze._DOMRange.prototype.attach
Blaze._DOMRange.prototype.attach = function(parentElement) {
  const result = originalAttach.call(this, parentElement)

  // Get data context from view
  const dataContext = this.view.dataVar?.get()

  if (dataContext && dataContext._id) {
    // Definitive: This DOM subtree was rendered with this document
    recordBinding(parentElement, {
      collectionName: /* need to infer from subscription */,
      documentId: dataContext._id,
      confidence: 1.0  // 100% certain
    })
  }

  return result
}
```

### Hard Problems

#### Problem 1: Framework Internals Knowledge

**Challenge:** Requires deep understanding of:
- Blaze view hierarchy and data contexts
- React Fiber internals (for React Meteor apps)
- Vue reactivity system (for Vue Meteor apps)
- Different implementations per framework

**Example Blaze internals:**
```javascript
// Where is data context stored?
view.dataVar           // Template.currentData()
view.templateInstance  // Template.instance()
view.parentView        // Nested templates
view._domrange         // DOM range for this view

// How to traverse back from DOM to view?
// Need reverse mapping: DOMNode → Blaze.View
```

**Risk:** Undocumented APIs may change across Meteor versions.

#### Problem 2: Maintaining Compatibility

**Challenge:** Different Meteor versions have different internals

```javascript
// Meteor 1.x
Blaze._DOMRange.prototype.attach

// Meteor 2.x
// (same API so far)

// Meteor 3.x (future)
// May change entirely
```

**Solution:** Version detection and conditional hooks

**Cost:** High maintenance burden.

#### Problem 3: Collection Name Inference

**Challenge:** Data context has document but not collection name

```javascript
// Template receives:
{ _id: "abc123", name: "John" }

// But which collection?
// - users?
// - profiles?
// - adminUsers?
```

**Potential solutions:**
1. **Add `_collectionName` field** during MinimongoInjector serialization
2. **Reverse-lookup** in MinimongoStore (slow)
3. **Track subscription → collection mapping** (requires more instrumentation)

**Problem:** Each solution adds complexity.

#### Problem 4: Reactive Computations

**Challenge:** Data may be transformed by helpers

```javascript
Template.profile.helpers({
  displayName() {
    const user = Users.findOne(this.userId)
    return user ? `${user.firstName} ${user.lastName}` : 'Anonymous'
  }
})

// DOM shows: "John Smith"
// Data context: { userId: "abc123" }
// Actual data: Users.findOne("abc123") → { firstName: "John", lastName: "Smith" }
```

**To track this, need to instrument:**
- Tracker.autorun (all reactive computations)
- Collection.find/findOne (all queries)
- Helper invocations

**Complexity:** Massive instrumentation surface.

### Verdict on Framework Instrumentation

**Pros:**
- Definitive correlation (no guessing)
- Can track data transformations
- Handles complex UIs correctly

**Cons:**
- Framework-specific (need Blaze, React, Vue implementations)
- Requires deep internals knowledge
- High maintenance burden
- Large implementation scope (40-80 hours minimum)

**Recommendation:** ⚠️ Possible but requires significant R&D investment.

---

## Proposed Research Plan (UPDATED)

### Phase 1: Heuristic Matching + Uncertainty Visualization (8 hours)

**Goal:** Prove that uncertainty visualization provides value even with ambiguous matches

**Tasks:**
1. Implement basic DOM traversal with shadow root support
2. Implement text matching with confidence scoring
3. Build uncertainty visualization UI (color-coded outlines, multi-candidate tooltips)
4. Test on sample Meteor app with 50-100 documents
5. Measure: "no candidates found" rate and "useful disambiguation" rate

**Success criteria:**
- < 10% "no candidates found" (most data has at least one match)
- Disambiguation UI is useful (narrows from "anywhere" to "these 3 places")
- < 200ms paint time for typical page
- Works with shadow DOM

**If fails:** Move to workflow mapping (Phase 1.5) or abandon.

### Phase 1.5: Workflow Mapping (16 hours) ← NEW HYBRID APPROACH

**Goal:** Add timing correlation to dramatically improve confidence

**Tasks:**
1. Enhance MinimongoInjector to track query results + timestamps
2. Hook Tracker.autorun to track reactive computation boundaries
3. Implement MutationObserver to correlate DOM updates with recent queries
4. Build WorkflowTracker service with timeline correlation
5. Test on real app: measure confidence improvement over pure heuristics

**Success criteria:**
- 80%+ of matches have high confidence (single recent query returned this data)
- Timing correlation eliminates most ambiguity
- Performance acceptable (< 300ms for workflow correlation)
- Works across multiple reactive re-renders

**If succeeds:** Ship as production feature (may not need full framework instrumentation)
**If fails:** Proceed to Phase 2 (framework instrumentation)

### Phase 2: Framework Hooks Research (16 hours) ← RENAMED FROM "PHASE 2"

**Goal:** Understand feasibility of Blaze instrumentation

**Tasks:**
1. Study Blaze source code (view.js, domrange.js)
2. Map data context flow from Meteor.subscribe → Template → DOM
3. Prototype minimal hook (just log data contexts)
4. Test across Meteor 1.x, 2.x, 3.x compatibility

**Success criteria:**
- Can reliably access data context from DOM element
- Works across Meteor versions without breaking
- Can infer collection name from data context

**If fails:** Document why it's infeasible, close research.

### Phase 3: Minimal Viable Implementation (40 hours)

**Only if Phase 2 succeeds.**

**Goal:** Implement Blaze instrumentation for single collection

**Tasks:**
1. Hook Blaze rendering to capture data contexts
2. Create bidirectional map: DOMElement ↔ Document
3. Implement simple overlay painting
4. Write tests for edge cases

**Success criteria:**
- Can paint data on page with 100% accuracy for single collection
- Performance acceptable (< 200ms for 1000 elements)
- No breaking changes to app behavior

### Phase 4: Full Feature (80+ hours)

**Only if Phase 3 succeeds.**

- Multi-collection support
- React/Vue support
- Visual polish (tooltips, animations)
- Production-ready error handling

---

## Open Questions

### Question 1: Do We Need DOM Correlation?

**Alternative:** Three-source correlation (DDP + Minimongo + Subscriptions) already provides 80% of value without DOM complexity.

**Counter-argument:** Can't detect rendering bugs without DOM verification.

**Decision:** TBD (validate need with users before investing in R&D)

### Question 2: Heuristic vs Instrumentation Trade-offs?

**Heuristic:**
- Fast to prototype (1-2 days)
- Unreliable but "good enough" for 80% of cases?
- No framework coupling

**Instrumentation:**
- Slow to implement (weeks)
- 100% reliable
- High maintenance

**Decision:** TBD (Phase 1 prototype will inform)

### Question 3: Blaze-Only vs Multi-Framework?

**Blaze-only:**
- Most Meteor apps use Blaze
- Simpler implementation
- Ships faster

**Multi-framework:**
- Future-proof for React/Vue Meteor apps
- 3x implementation effort
- May not be worth it if Blaze covers 90% of users

**Decision:** TBD (measure Blaze vs React usage in community)

---

## Prior Art

### React DevTools

**Approach:** Framework instrumentation via React Fiber
**Pros:** Definitive component → data correlation
**Cons:** React-specific, requires Fiber internals knowledge

**Lesson:** Framework instrumentation is proven approach for React.

### Redux DevTools

**Approach:** Instruments Redux store, no DOM correlation
**Limitation:** Can't detect "component received data but didn't render"

**Lesson:** Three-source model (actions + store + subscriptions) may be sufficient.

### Vue DevTools

**Approach:** Instruments Vue reactivity system
**Similarity:** Similar to our Minimongo tracking

**Lesson:** Per-framework implementation is standard in DevTools space.

---

## Risk Assessment

**Technical Risks:**
- Heuristic approach may be too unreliable
- Framework instrumentation may break across Meteor versions
- Performance may be unacceptable for large apps

**Scope Risks:**
- Multi-framework support triples implementation effort
- Edge cases (portals, SSR, etc.) may be numerous

**Maintenance Risks:**
- Meteor internals may change
- Shadow DOM spec may evolve
- Need to support multiple Meteor versions

**Mitigation:**
- Prototype Phase 1 before committing
- Start Blaze-only, add React/Vue later if needed
- Document limitations clearly (e.g., "closed shadow roots not supported")

---

## Recommendation (UPDATED)

**Short-term (Next Sprint):**
- ✅ Build three-source correlation (DDP + Minimongo + Subscriptions) in Minimongo Query View
- This provides 80% of debugging value WITHOUT DOM complexity
- See: `docs/features/minimongo-query-view/`

**Medium-term (Research Investment):**
1. **Fund Phase 1 prototype** (8 hours) - Heuristics + Uncertainty Visualization
   - Low risk, high learning value
   - Proves whether "show all candidates" approach works

2. **If Phase 1 shows promise, fund Phase 1.5** (16 hours) - Workflow Mapping
   - This is the **sweet spot** approach
   - Much better than heuristics, much simpler than full instrumentation
   - May be good enough to ship as production feature

3. **Only pursue Phase 2 (framework instrumentation)** if:
   - Users actively request 95%+ accuracy
   - Phase 1.5 proves insufficient (< 80% confidence)
   - We have 40-80 hours to invest

**Key Insight from User Feedback:**

> "We can double color highlight something if we truly don't know"

This changes the game. **Uncertainty is acceptable if we're honest about it.**

**Do NOT create implementation guide until Phase 1.5 proves workflow mapping is viable.**

---

## Related Documents

- `docs/architecture/four-source-data-truth-model.md` - Conceptual model
- `docs/README.md` - Documentation rules for speculative vs implementation-ready

---

**Last Updated:** 2025-10-05
**Research Status:** Not Started
**Next Step:** Decide whether to fund Phase 1 prototype
