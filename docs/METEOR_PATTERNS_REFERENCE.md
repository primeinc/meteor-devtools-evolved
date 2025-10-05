# Meteor.js + MobX Architectural Patterns Reference

**Purpose:** Reference document containing production-proven patterns from large-scale Meteor.js applications, adapted for DevTools development context.

**Source:** Analysis of architectural best practices from real-time Meteor.js applications using MobX state management.

**Audience:** Developers implementing features in meteor-devtools-evolved.

**Last Updated:** 2025-10-05

---

## 📋 Document Structure

This reference is organized into sections matching the architecture of a full-stack Meteor application, with annotations indicating **applicability to DevTools development** (where we have no server access).

| Section | Applicability | Reason |
|---------|--------------|--------|
| **I. Backend (Publications & Methods)** | 🔮 **Future/Diagnostic** | We observe but don't control the host app's backend |
| **II. Frontend (MobX State)** | ✅ **Immediately Applicable** | We ARE building a MobX application |
| **III. DDP Integration** | ✅ **Core Patterns** | We intercept and react to DDP |
| **IV. Testing Strategy** | ✅ **Directly Applicable** | Standard testing pyramid applies |
| **V. Monitoring & Analytics** | 🔮 **Future/Diagnostic** | Could analyze host app performance |

---

## I. Backend Patterns: Publications & Methods

**⚠️ DevTools Context:** We cannot control the host application's server. However, these patterns are documented because:
1. **Diagnostic Features:** We could analyze the host app's publications/methods and surface recommendations
2. **Future SSR Support:** If we add server-side rendering for report generation
3. **Understanding Host Behavior:** Helps us interpret DDP traffic correctly

### 1.1 The Principle of Least Privilege: Publication Strategy

**Pattern:** Publish only the exact data required for a UI view, for a specific authenticated user.

#### Anti-Pattern: Over-Publishing
```javascript
// BAD: Leaks all document fields, inefficient
Meteor.publish('tasks.all', function() {
  return Tasks.find({ ownerId: this.userId });
});
```

**Problems:**
- Sends sensitive fields to client (e.g., `internalNotes`, `adminFlags`)
- Large DDP payload size → network latency
- High memory consumption on client (Minimongo caches everything)

#### Recommended Pattern: Field Projections
```javascript
// GOOD: Exposes only UI-required fields
Meteor.publish('tasks.list.view', function() {
  if (!this.userId) {
    return this.ready();
  }

  return Tasks.find({ ownerId: this.userId }, {
    fields: {
      text: 1,
      createdAt: 1,
      isChecked: 1,
      // ownerId excluded (already filtered, not needed on client)
    }
  });
});
```

**Benefits:**
- **Security:** Prevents accidental data leakage
- **Performance:** Reduces DDP payload by 40-70% (typical)
- **Memory:** Less data in client-side Minimongo cache

---

### 🔮 DevTools Application: Publication Analysis Feature

**Future Enhancement Concept:**

```typescript
// src/Stores/Panel/PublicationAnalyzer.ts
export class PublicationAnalyzer {
  constructor(private ddpStore: DDPStore) {}

  @computed
  get publicationMetrics() {
    const subMessages = this.ddpStore.collection.filter(
      log => log.parsedContent.msg === 'added' || log.parsedContent.msg === 'changed'
    );

    const bySubscription = groupBy(subMessages, 'parsedContent.subs[0]');

    return Object.entries(bySubscription).map(([subId, messages]) => {
      const totalBytes = sum(messages.map(m => m.size));
      const fieldCount = uniq(flatten(messages.map(m => Object.keys(m.parsedContent.fields)))).length;
      const docCount = messages.length;

      return {
        subscriptionId: subId,
        totalPayloadSize: totalBytes,
        averageDocSize: totalBytes / docCount,
        uniqueFieldCount: fieldCount,
        recommendation: this.generateRecommendation(totalBytes, fieldCount)
      };
    });
  }

  private generateRecommendation(bytes: number, fields: number) {
    if (bytes > 1024 * 1024) { // > 1MB
      return "⚠️ Large payload detected. Consider field projections to reduce bandwidth.";
    }
    if (fields > 30) {
      return "ℹ️ Publishing many fields. Verify all are needed by the UI.";
    }
    return "✅ Payload size within acceptable range.";
  }
}
```

**UI Display:**
```
┌─ Subscription Analysis ─────────────────────────────┐
│ Subscription: tasks.list.view                       │
│ Payload Size: 847 KB                                │
│ Avg Doc Size: 12.3 KB                               │
│ Fields Published: 47                                │
│                                                      │
│ ⚠️ Large payload detected. Consider field           │
│    projections to reduce bandwidth.                 │
│                                                      │
│ Suggested fields to remove:                         │
│ • internalNotes (3.2 KB avg, likely admin-only)     │
│ • auditLog (8.1 KB avg, probably not needed in UI)  │
└─────────────────────────────────────────────────────┘
```

---

### 1.2 Server-Side Filtering and Pagination

**Pattern:** Never trust client for filtering/sorting/pagination. Execute on server.

#### Anti-Pattern: Client-Side Filtering of Large Datasets
```javascript
// BAD: Server sends all tasks, client filters
Meteor.publish('tasks.all', function() {
  return Tasks.find({ ownerId: this.userId }); // Could be 10,000+ docs
});

// Client does the filtering
const activeTasks = Tasks.find({ isActive: true }).fetch();
```

**Problems:**
- Sends unnecessary data over network
- High memory usage on client
- Insecure (client could modify filter to see hidden data)

#### Recommended Pattern: Parameterized Publications
```javascript
// GOOD: Server filters based on client arguments
Meteor.publish('tasks.filtered', function(filters, page = 0, limit = 50) {
  check(filters, {
    status: Match.Optional(String),
    search: Match.Optional(String)
  });
  check(page, Number);
  check(limit, Number);

  if (!this.userId) {
    return this.ready();
  }

  const query = { ownerId: this.userId };
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.search) {
    query.text = { $regex: filters.search, $options: 'i' };
  }

  return Tasks.find(query, {
    fields: { text: 1, status: 1, createdAt: 1 },
    sort: { createdAt: -1 },
    limit: limit,
    skip: page * limit
  });
});
```

---

### 🔮 DevTools Application: Pagination Detection

**Future Enhancement Concept:**

```typescript
// Detect if host app is using pagination patterns
export class PaginationDetector {
  detectPaginationPattern(ddpLogs: DDPLog[]) {
    const subMessages = ddpLogs.filter(log => log.parsedContent.msg === 'sub');

    for (const sub of subMessages) {
      const params = sub.parsedContent.params || [];
      const hasPaginationParams = params.some(p =>
        (p.limit !== undefined && p.skip !== undefined) ||
        (p.page !== undefined && p.perPage !== undefined)
      );

      if (!hasPaginationParams) {
        return {
          subscriptionName: sub.parsedContent.name,
          recommendation: "⚠️ No pagination detected. May send large datasets unnecessarily."
        };
      }
    }

    return { status: "✅ Pagination patterns detected" };
  }
}
```

---

### 1.3 Reactive vs. One-Time Data Fetching

**Pattern:** Reserve reactivity for data that genuinely needs to be "live". Use Methods for static data.

#### When to Use Publications (Reactive)
- User's task list (updates in real-time)
- Chat messages (needs live updates)
- Dashboard metrics (live monitoring)

#### When to Use Methods (One-Time)
- User settings (fetched once on login)
- Static configuration (app version, feature flags)
- Historical reports (snapshot, not live)

**Performance Impact:**
- Publications maintain server-side observers (CPU/memory cost)
- Methods are stateless, one-shot operations (cheaper)

---

### 🔮 DevTools Application: Reactivity Analysis

**Future Enhancement Concept:**

```typescript
export class ReactivityAnalyzer {
  @computed
  get subscriptionUpdateFrequency() {
    const changedMessages = this.ddpStore.collection.filter(
      log => log.parsedContent.msg === 'changed'
    );

    const bySub = groupBy(changedMessages, 'parsedContent.subs[0]');

    return Object.entries(bySub).map(([subId, messages]) => {
      const timeSpan = last(messages).timestamp - first(messages).timestamp;
      const changesPerSecond = messages.length / (timeSpan / 1000);

      return {
        subscriptionId: subId,
        totalChanges: messages.length,
        changesPerSecond,
        recommendation: changesPerSecond < 0.01
          ? "ℹ️ Low update frequency. Consider using a Method instead of a Publication."
          : "✅ Active reactivity justified."
      };
    });
  }
}
```

**Diagnostic Output:**
```
┌─ Reactivity Analysis ───────────────────────────────┐
│ Subscription: userSettings                          │
│ Updates: 1 change in 45 minutes                     │
│ Frequency: 0.0004 changes/sec                       │
│                                                      │
│ ℹ️ Low update frequency. Consider using a Method    │
│    instead of a Publication to reduce server load.  │
└─────────────────────────────────────────────────────┘
```

---

### 1.4 Secure Meteor Methods: Zero-Trust Architecture

**Pattern:** Treat all client input as untrusted. Validate everything.

#### Critical Rules

1. **One Method = One Action**
   - ❌ Generic `update` methods accepting arbitrary MongoDB operators
   - ✅ Specific methods like `tasks.updateText`, `tasks.toggleChecked`

2. **Rigorous Argument Validation**
   - Use `check()` for primitives
   - Use schema validation (`aldeed:simple-schema`) for objects

3. **Server-Side Authorization**
   - Never trust `userId` passed as argument
   - Always use `this.userId` from method context

#### Anti-Pattern: Trusting Client User ID
```javascript
// VULNERABLE: Client can pass any userId
Meteor.methods({
  'tasks.updateText'(taskId, newText, userId) {
    Tasks.update({ _id: taskId, ownerId: userId }, { $set: { text: newText } });
  }
});

// Malicious client call:
Meteor.call('tasks.updateText', 'someTaskId', 'hacked', 'victimUserId');
```

#### Secure Pattern: Server-Side Authorization
```javascript
import { check } from 'meteor/check';

Meteor.methods({
  'tasks.updateText'(taskId, newText) {
    check(taskId, String);
    check(newText, String);

    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in.');
    }

    const task = Tasks.findOne({ _id: taskId, ownerId: this.userId });
    if (!task) {
      throw new Meteor.Error('access-denied', 'You do not own this task.');
    }

    Tasks.update(taskId, { $set: { text: newText } });
  }
});
```

---

### 🔮 DevTools Application: Method Security Audit

**Future Enhancement Concept:**

```typescript
export class MethodSecurityAuditor {
  auditMethodCall(ddpLog: DDPLog) {
    const methodName = ddpLog.parsedContent.method;
    const params = ddpLog.parsedContent.params || [];

    const securityFlags = [];

    // Check for suspicious patterns
    if (params.some(p => p.userId || p.user_id)) {
      securityFlags.push({
        severity: 'HIGH',
        issue: 'userId passed as parameter',
        recommendation: 'Use this.userId on server instead'
      });
    }

    if (params.some(p => p.$set || p.$push || p.$pull)) {
      securityFlags.push({
        severity: 'MEDIUM',
        issue: 'MongoDB operator passed from client',
        recommendation: 'Use specific methods instead of generic update'
      });
    }

    return {
      methodName,
      securityFlags,
      riskLevel: securityFlags.length > 0 ? 'HIGH' : 'LOW'
    };
  }
}
```

**Diagnostic Output:**
```
┌─ Method Security Audit ─────────────────────────────┐
│ Method: tasks.update                                │
│                                                      │
│ 🔴 HIGH RISK: userId passed as parameter            │
│    Recommendation: Use this.userId on server        │
│                                                      │
│ 🟡 MEDIUM RISK: MongoDB operator from client        │
│    Recommendation: Use specific methods             │
│                                                      │
│ Detected in 47 calls over last 5 minutes.           │
└─────────────────────────────────────────────────────┘
```

---

### 1.5 Rate Limiting and DoS Prevention

**Pattern:** Protect methods from abuse and accidental overload.

```javascript
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// Protect authentication endpoints
DDPRateLimiter.addRule({
  type: 'method',
  name: 'login',
  connectionId() { return true; }
}, 5, 60000); // 5 attempts per minute

// Protect resource-intensive operations
DDPRateLimiter.addRule({
  type: 'method',
  name: 'reports.generate',
  userId(userId) { return !!userId; }
}, 2, 300000); // 2 calls per 5 minutes
```

---

### 🔮 DevTools Application: Rate Limit Violation Detection

**Future Enhancement Concept:**

```typescript
export class RateLimitDetector {
  detectRateLimitViolations(ddpLogs: DDPLog[], windowMs: number = 60000) {
    const methodCalls = ddpLogs.filter(log => log.parsedContent.msg === 'method');

    const callsByMethod = groupBy(methodCalls, 'parsedContent.method');

    return Object.entries(callsByMethod).map(([method, calls]) => {
      const now = Date.now();
      const recentCalls = calls.filter(c => now - c.timestamp < windowMs);

      const callsPerMinute = (recentCalls.length / windowMs) * 60000;

      return {
        methodName: method,
        callsPerMinute,
        recommendation: callsPerMinute > 60
          ? `⚠️ ${method} called ${callsPerMinute.toFixed(0)}/min. May indicate abuse or runaway code.`
          : null
      };
    }).filter(r => r.recommendation);
  }
}
```

---

## II. Frontend Patterns: MobX State Management

**✅ DevTools Context:** Immediately applicable. We ARE building a MobX application (the DevTools panel).

### 2.1 The MobX Philosophy: Unidirectional Data Flow

**Core Principle:** Application state is like a spreadsheet.

```
State (observable) → Derivations (computed, reactions) → UI (observer)
        ↑                                                      ↓
        └──────────────── Actions (user events) ──────────────┘
```

**Rules:**
1. **All state is observable:** Mark with `@observable`
2. **All mutations are actions:** Mark with `@action`
3. **All derived values are computed:** Mark with `@computed`
4. **UI components are observers:** Wrap with `observer()`

---

### 2.2 Store Architecture: Domain vs. UI Stores

**Pattern:** Strict separation of concerns.

#### Domain Stores
**Responsibility:** Business logic and core data.

**Example: TasksStore**
```typescript
import { makeAutoObservable } from 'mobx';
import { Task } from '../models/Task';

export class TasksStore {
  tasks: Task[] = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  @computed
  get completedTasks() {
    return this.tasks.filter(t => t.isCompleted);
  }

  @computed
  get activeTasks() {
    return this.tasks.filter(t => !t.isCompleted);
  }

  @action
  addTask(text: string) {
    const task = new Task({ text });
    this.tasks.push(task);
  }

  @action
  toggleTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) task.toggle();
  }
}
```

**Characteristics:**
- Can be tested in isolation (no UI dependencies)
- Universally applicable (could run on server)
- Manages data that persists to backend

#### UI Stores
**Responsibility:** View-specific, transient state.

**Example: UIStore**
```typescript
export class UIStore {
  @observable isSidebarOpen = false;
  @observable currentTheme: 'light' | 'dark' = 'light';
  @observable activeModal: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  @action
  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  @action
  openModal(modalId: string) {
    this.activeModal = modalId;
  }

  @action
  closeModal() {
    this.activeModal = null;
  }
}
```

**Characteristics:**
- Not persisted to backend
- Specific to user's current session
- Affects multiple unrelated components (avoids prop-drilling)

---

### ✅ DevTools Application: Verify Existing Architecture

**Our Current Architecture (from comprehensive scan):**

| Store | Type | Responsibilities | Matches Pattern? |
|-------|------|------------------|------------------|
| **DDPStore** | Domain | DDP messages, correlation methods | ✅ Yes |
| **MinimongoStore** | Domain | Collections, documents, export | ✅ Yes |
| **SubscriptionStore** | Domain | Active subscriptions + metadata | ✅ Yes |
| **PerformanceStore** | Domain | Method performance metrics | ✅ Yes |
| **BookmarkStore** | Domain | Saved DDP messages | ✅ Yes |
| **SettingStore** | UI | Filters, blacklist, theme | ✅ Yes |
| **PanelStore** | UI | selectedTabId, activeObject, UI state | ✅ Yes |

**Verdict:** ✅ Our architecture already follows industry best practices.

---

### 2.3 High-Performance React Integration

**Pattern:** Fine-grained reactivity via `observer()` and "dereference late".

#### Critical Performance Rule: Dereference Values Late

**Anti-Pattern: Dereference Early (Bad Performance)**
```typescript
// BAD: Owner component re-renders when ANY task.text changes
const TaskRow = ({ text }) => <li>{text}</li>; // Not an observer

const TaskList = observer(({ tasks }) => (
  <ul>
    {/* text is read HERE, in the large component */}
    {tasks.map(task => <TaskRow key={task.id} text={task.text} />)}
  </ul>
));
```

**Problem:** When `task[3].text` changes, the entire `TaskList` must re-render because it's the component that dereferenced `task.text`.

#### Recommended Pattern: Dereference Late (Optimal Performance)
```typescript
// GOOD: Only the specific TaskItem re-renders
const TaskItem = observer(({ task }) => {
  // text is read HERE, in the smallest possible component
  return <li>{task.text}</li>;
});

const TaskList = observer(({ tasks }) => (
  <ul>
    {/* whole task object is passed down */}
    {tasks.map(task => <TaskItem key={task.id} task={task} />)}
  </ul>
));
```

**Result:** When `task[3].text` changes, only `TaskItem[3]` re-renders. React never even sees the other 99 items.

---

### ✅ DevTools Application: Apply to Query View

**NEW ADR-009: MobX Performance Patterns**

**Decision:** All list components in MinimongoDDPCorrelator must follow "dereference late" pattern.

**Implementation:**

```typescript
// src/Pages/Panel/Minimongo/QueryView/QueryLogRow.tsx
export const QueryLogRow = observer(({ queryLog }: { queryLog: IMethodLog }) => {
  // Dereference properties HERE, in smallest component
  return (
    <Row>
      <Cell>{queryLog.method}</Cell>
      <Cell>{queryLog.collection}</Cell>
      <Cell>{queryLog.timestamp}</Cell>
      <CorrelationBadge queryLog={queryLog} />
    </Row>
  );
});

// src/Pages/Panel/Minimongo/QueryView/QueryLogList.tsx
export const QueryLogList = observer(({ queryLogs }: { queryLogs: IMethodLog[] }) => {
  // Pass whole object down
  return (
    <FixedSizeList
      height={height}
      width={width}
      itemCount={queryLogs.length}
      itemSize={28}
    >
      {({ index, style }) => (
        <div style={style}>
          <QueryLogRow queryLog={queryLogs[index]} />
        </div>
      )}
    </FixedSizeList>
  );
});
```

**Performance Impact:**
- When 1 query log's `timestamp` updates → only 1 row re-renders
- Without pattern → entire list (100+ rows) would reconcile

---

### 2.4 Render Lists in Dedicated Components

**Pattern:** Components that `.map()` over arrays should do nothing else.

#### Anti-Pattern: Mixed Responsibilities
```typescript
// BAD: When title changes, entire list reconciles
const TaskView = observer(({ taskStore }) => (
  <div>
    <h1>{taskStore.projectName}</h1> {/* Dereferenced here */}
    <ul>
      {taskStore.tasks.map(task => (
        <TaskItem key={task.id} task={task} />
      ))}
    </ul>
  </div>
));
```

#### Recommended Pattern: Isolated List Component
```typescript
// GOOD: List is isolated
const TaskListView = observer(({ tasks }) => (
  <ul>
    {tasks.map(task => <TaskItem key={task.id} task={task} />)}
  </ul>
));

const TaskView = observer(({ taskStore }) => (
  <div>
    <h1>{taskStore.projectName}</h1>
    <TaskListView tasks={taskStore.tasks} />
  </div>
));
```

**Result:** When `projectName` changes, only the `<h1>` re-renders. List is untouched.

---

### ✅ DevTools Application: NEW ADR-010

**ADR-010: List Component Isolation**

**Decision:** All virtualized list containers (DDPContainer, MinimongoContainer, QueryLogContainer) must ONLY map over the collection. No other observables.

**Enforcement:** Code review checklist item:
- ✅ Component body contains only `<FixedSizeList>` and row mapping
- ❌ Component reads any observables other than the list itself

---

### 2.5 Local Observable State for Complex Components

**Pattern:** Not all state belongs in global stores. Use local observables for encapsulated complexity.

**Use Case:** Multi-step form with interdependent validation.

```typescript
import { makeAutoObservable } from 'mobx';
import { observer } from 'mobx-react-lite';

class ExportFormState {
  @observable format: ExportFormat = 'json';
  @observable includeMetadata = true;
  @observable isExporting = false;
  @observable progress = 0;

  constructor() {
    makeAutoObservable(this);
  }

  @computed
  get isValid() {
    return this.format !== null && this.progress < 100;
  }

  @action
  setFormat(format: ExportFormat) {
    this.format = format;
  }

  @action
  async startExport() {
    this.isExporting = true;
    this.progress = 0;

    // Simulated progress
    for (let i = 0; i <= 100; i += 10) {
      this.progress = i;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isExporting = false;
  }
}

export const ExportDialog = observer(() => {
  const [formState] = useState(() => new ExportFormState());

  return (
    <Dialog isOpen={true}>
      <select value={formState.format} onChange={e => formState.setFormat(e.target.value)}>
        <option value="json">JSON</option>
        <option value="csv">CSV</option>
      </select>

      <ProgressBar value={formState.progress} />

      <Button
        onClick={() => formState.startExport()}
        disabled={!formState.isValid || formState.isExporting}
      >
        Export
      </Button>
    </Dialog>
  );
});
```

**Benefits:**
- All form logic is encapsulated
- Component is highly reusable
- Easy to test (just instantiate `ExportFormState` and call methods)
- No pollution of global stores

---

### ✅ DevTools Application: Existing Usage

**Verification:** We already use this pattern in `ExportDialog.tsx` (PR #23).

**Current Implementation:**
```typescript
// src/Pages/Panel/Minimongo/components/ExportDialog.tsx
// Uses MinimongoStore.exportStatus observable for progress tracking
// This is acceptable because export is a domain operation

// If we add a multi-step filter UI, use local observable:
class QueryFilterFormState {
  @observable selectedMethods: string[] = [];
  @observable dateRange: [Date, Date] | null = null;
  @observable collectionFilter = '';

  @computed
  get isValid() {
    return this.selectedMethods.length > 0 || this.dateRange !== null;
  }
}
```

---

## III. DDP Integration Patterns

**✅ DevTools Context:** Core to our functionality. We intercept and react to DDP.

### 3.1 Minimongo as High-Speed Read Cache

**Pattern:** Treat Minimongo as a client-side cache, not a data source.

**Key Principles:**
1. Minimongo content is a **subset** of server database
2. Content is managed **exclusively** by publications/subscriptions
3. Client-side queries (`.find()`) are **synchronous** and **instant**
4. Direct manipulation (outside DDP) is an anti-pattern

#### Client-Side Query Pattern
```javascript
// This reads from local cache (Minimongo), NOT the server
const tasks = Tasks.find({ ownerId: userId }).fetch(); // Instant, synchronous
```

**Behind the scenes:**
1. Server publication sends DDP `added` messages
2. Meteor's DDP client stores documents in Minimongo
3. Client query reads from local cache
4. No network roundtrip

---

### ✅ DevTools Application: Our Read-Only Approach

**Current Implementation (Validated):**

```typescript
// src/Injectors/MinimongoInjector.ts:175-197
export function getCollections(requestId?: string) {
  const collections = Meteor.connection._mongo_livedata_collections;

  const data = mapValues(collections, (collection, collectionName) => {
    const docs = getDocs(collection); // Reads from _docs._map
    return Array.from(docs).map(doc => serializeEJSON(doc));
  });

  sendMessage('minimongo-get-collections', { requestId, ...data });
}
```

**Validation:** ✅ We treat Minimongo as **read-only cache**. We never write to it directly.

**Article Quote:**
> "Directly manipulating Minimongo for state that does not exist on the server is an anti-pattern."

**Our Compliance:** Perfect. We only READ from Minimongo, never mutate it.

---

### 3.2 Reactive Synchronization: Tracker.autorun vs. observeChanges

**Pattern:** Sync Minimongo (reactive) → MobX stores (reactive).

#### Default Strategy: Tracker.autorun + .fetch()

**Recommended for:** 95% of use cases.

```typescript
import { Tracker } from 'meteor/tracker';
import { Tasks } from '/imports/db/TasksCollection';
import { runInAction } from 'mobx';

Tracker.autorun(() => {
  const cursor = Tasks.find({}, { sort: { createdAt: -1 } });
  const data = cursor.fetch(); // Synchronous read from Minimongo

  runInAction(() => {
    tasksStore.setTasks(data);
  });
});
```

**How it works:**
1. `Tracker.autorun` creates a reactive computation
2. Whenever cursor data changes (via DDP), computation re-runs
3. `.fetch()` retrieves complete array
4. MobX store is updated via `runInAction`

**Pros:**
- ✅ Simple and predictable
- ✅ Safe (no memory leaks)
- ✅ Works for 99% of use cases

**Cons:**
- ⚠️ Replaces entire array on every change (can be inefficient for large collections)

---

#### Advanced Strategy: cursor.observeChanges (High-Risk Optimization)

**Use ONLY when:** Profiling proves `.fetch()` overhead is a bottleneck.

```typescript
import { runInAction } from 'mobx';

const cursor = Tasks.find({}, { sort: { createdAt: -1 } });

const handle = cursor.observeChanges({
  added(id, fields) {
    runInAction(() => {
      tasksStore.addTask({ _id: id, ...fields });
    });
  },
  changed(id, fields) {
    runInAction(() => {
      tasksStore.updateTask(id, fields);
    });
  },
  removed(id) {
    runInAction(() => {
      tasksStore.removeTask(id);
    });
  }
});

// CRITICAL: Must call handle.stop() when component unmounts
// Failure to do so causes memory leaks
```

**Pros:**
- ✅ Granular updates (add/change/remove individual items)
- ✅ Avoids array replacement overhead

**Cons:**
- 🔴 **Memory leak risk** if not stopped properly
- 🔴 More complex (3 callbacks vs 1 fetch)
- 🔴 Requires profiling to justify

---

### ✅ DevTools Application: NEW ADR-011

**ADR-011: Reactive vs. Snapshot Correlation**

**Context:**
MinimongoDDPCorrelator needs to keep document origin index updated.

**Options:**

**Option A: Snapshot-based (Current Pattern)**
```typescript
// User opens Minimongo tab → fetch once
Bridge.sendContentMessage('minimongo-get-collections');
// → One-time sync to MinimongoStore
// → Correlator builds index from snapshot
```

**Option B: Reactive (Tracker.autorun)**
```typescript
// Continuously sync Minimongo → MobX
Tracker.autorun(() => {
  const collections = Object.keys(Meteor.connection._mongo_livedata_collections);

  collections.forEach(name => {
    const cursor = Meteor.connection._mongo_livedata_collections[name].find();
    const docs = cursor.fetch();

    runInAction(() => {
      correlatorStore.updateDocumentIndex(name, docs);
    });
  });
});
```

**Option C: Reactive with observeChanges (High-Risk)**
```typescript
// Only if profiling shows fetch() is too slow
observeChanges({
  added(id, fields) { correlatorStore.addDocument(id, fields); },
  changed(id, fields) { correlatorStore.updateDocument(id, fields); },
  removed(id) { correlatorStore.removeDocument(id); }
});
```

**Decision:** **Option A (Snapshot)** for initial implementation.

**Rationale:**
1. **Performance:** DevTools already injects into host page, don't add continuous overhead
2. **User Experience:** User opens tab → sees current state (sufficient)
3. **Safety:** No memory leak risk
4. **Simplicity:** Proven pattern from existing MinimongoInjector

**Future Enhancement:** Add Option B as toggle in Settings:
```
[ ] Live Correlation (updates in real-time, higher CPU usage)
```

---

### 3.3 Optimistic UI Pattern

**Pattern:** Update UI immediately, sync with server later.

**Full Cycle:**
1. User action triggers MobX action
2. Action performs optimistic local update (instant UI feedback)
3. Action calls `Meteor.call()` to server
4. Server processes and updates database
5. Server publication sends DDP `changed` message
6. Client receives update, merges into Minimongo
7. Reactive sync updates MobX store (replaces optimistic data)

**Implementation:**

```typescript
import { makeAutoObservable, runInAction } from 'mobx';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

class TasksStore {
  @observable tasks: Task[] = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  @action
  addTask(text: string) {
    const tempId = Random.id();
    const optimisticTask = new Task({
      _id: tempId,
      text,
      isOptimistic: true,
      createdAt: new Date()
    });

    // 1. Optimistic update (instant UI)
    this.tasks.push(optimisticTask);

    // 2. Call server
    Meteor.call('tasks.insert', text, (error, serverId) => {
      if (error) {
        console.error('Failed to add task:', error.reason);

        // 3. Revert on failure
        runInAction(() => {
          this.tasks = this.tasks.filter(t => t._id !== tempId);
        });

        // Show error notification to user
      }
      // On success: DDP will send the real document,
      // Tracker.autorun will update the store,
      // replacing the optimistic version
    });
  }
}
```

---

### ⚠️ DevTools Application: Not Applicable

**Our Context:** We're **read-only observers**. We don't call Meteor methods or mutate data.

**However:** The pattern teaches us about **async state management**, which we DO use:

**Our Async Pattern (Export):**
```typescript
// MinimongoStore.ts:154-298
exportActiveCollection = flow(function* (
  this: MinimongoStore,
  exportType: ExportFormatKey,
  signal: AbortSignal
) {
  // 1. Optimistic UI update
  this.isExportBusy = true;
  this.exportStatus = { progress: 0, message: 'Starting export...' };

  try {
    // 2. Long-running operation
    const result = yield performExport(data, exportType);

    // 3. Success update
    runInAction(() => {
      this.exportStatus = { progress: 100, message: 'Complete' };
    });
  } catch (error) {
    // 4. Revert on failure
    runInAction(() => {
      this.isExportBusy = false;
      this.exportStatus = { progress: 0, message: `Error: ${error.message}` };
    });
  }
});
```

**Validation:** ✅ We already follow the optimistic UI mental model for async operations.

---

## IV. Testing Strategy

**✅ DevTools Context:** Directly applicable. Standard testing pyramid applies.

### 4.1 The Testing Pyramid

```
        E2E (Cypress)
       /              \
      /   Integration   \
     /     (E2E-like)     \
    /                      \
   /   Unit + Component     \
  /        (Jest + RTL)      \
 /____________________________\
```

**Investment Distribution:**
- **70% Unit/Component** - Fast, cheap, high coverage
- **20% Integration** - Critical user flows
- **10% E2E** - Smoke tests, happy paths

---

### 4.2 Unit Testing: MobX Stores

**Pattern:** Test stores in isolation with mocked dependencies.

```typescript
// __tests__/MinimongoDDPCorrelator.spec.ts
import { MinimongoDDPCorrelator } from '../MinimongoDDPCorrelator';
import { DDPStore } from '../DDPStore';
import { MinimongoStore } from '../MinimongoStore';

describe('MinimongoDDPCorrelator', () => {
  let correlator: MinimongoDDPCorrelator;
  let mockDDPStore: DDPStore;
  let mockMinimongoStore: MinimongoStore;

  beforeEach(() => {
    mockDDPStore = new DDPStore();
    mockMinimongoStore = new MinimongoStore();
    correlator = new MinimongoDDPCorrelator(mockDDPStore, mockMinimongoStore);
  });

  it('matches document to DDP added message', () => {
    // Setup: Add DDP message to mock store
    mockDDPStore.pushItem({
      id: 'msg-1',
      parsedContent: {
        msg: 'added',
        collection: 'users',
        id: 'abc123',
        fields: { name: 'Alice' }
      },
      timestamp: 1000
    });

    // Test: Find origin for document
    const doc = { _id: 'abc123', name: 'Alice' };
    const origin = correlator.findDocumentOrigin(doc, 'users');

    // Assert
    expect(origin).not.toBeNull();
    expect(origin!.ddpMessage.parsedContent.msg).toBe('added');
    expect(origin!.ddpMessage.parsedContent.id).toBe('abc123');
  });

  it('returns null for document without DDP origin', () => {
    const doc = { _id: 'orphan-123', name: 'Bob' };
    const origin = correlator.findDocumentOrigin(doc, 'users');

    expect(origin).toBeNull();
  });

  it('calculates data freshness correctly', () => {
    mockDDPStore.pushItem({
      id: 'msg-2',
      parsedContent: {
        msg: 'changed',
        collection: 'users',
        id: 'abc123',
        fields: { name: 'Alice Updated' }
      },
      timestamp: Date.now() - 5000 // 5 seconds ago
    });

    const doc = { _id: 'abc123' };
    const freshness = correlator.getDataFreshness(doc, 'users');

    expect(freshness.age).toBeGreaterThanOrEqual(4900);
    expect(freshness.age).toBeLessThan(5100);
  });
});
```

---

### 4.3 Component Testing: React + MobX

**Pattern:** Test components with mocked stores via React Context.

```typescript
// __tests__/QueryLogRow.spec.tsx
import { render, screen } from '@testing-library/react';
import { QueryLogRow } from '../QueryLogRow';
import { PanelStoreProvider } from '@/Stores/PanelStore';

describe('QueryLogRow', () => {
  const mockQueryLog = {
    id: 'log-1',
    method: 'find',
    collection: 'users',
    args: { selector: { status: 'active' } },
    timestamp: Date.now(),
    hasOrigin: true
  };

  it('renders method and collection name', () => {
    render(
      <PanelStoreProvider value={mockPanelStore}>
        <QueryLogRow queryLog={mockQueryLog} />
      </PanelStoreProvider>
    );

    expect(screen.getByText('find')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
  });

  it('shows correlation badge when origin exists', () => {
    render(
      <PanelStoreProvider value={mockPanelStore}>
        <QueryLogRow queryLog={{ ...mockQueryLog, hasOrigin: true }} />
      </PanelStoreProvider>
    );

    expect(screen.getByText(/via subscription/i)).toBeInTheDocument();
  });

  it('shows warning badge when no origin', () => {
    render(
      <PanelStoreProvider value={mockPanelStore}>
        <QueryLogRow queryLog={{ ...mockQueryLog, hasOrigin: false }} />
      </PanelStoreProvider>
    );

    expect(screen.getByText(/no server data/i)).toBeInTheDocument();
  });
});
```

---

### 4.4 E2E Testing: Cypress

**Pattern:** Test complete user workflows against a real Meteor app.

```typescript
// cypress/e2e/minimongo-correlation.cy.ts
describe('Minimongo DDP Correlation', () => {
  beforeEach(() => {
    // Reset test database
    cy.task('db:reset');

    // Login test user
    cy.login('testuser@example.com', 'password123');

    // Visit app with DevTools
    cy.visit('http://localhost:3000');
  });

  it('shows correlation for newly added document', () => {
    // 1. User action: Add a task in the host app
    cy.get('[data-test=new-task-input]').type('Buy milk{enter}');

    // 2. Wait for DDP message to arrive
    cy.wait(100);

    // 3. Open DevTools panel
    cy.get('[data-test=devtools-toggle]').click();
    cy.get('[data-test=minimongo-tab]').click();

    // 4. Open query view
    cy.get('[data-test=queries-tab]').click();

    // 5. Find the insert query log
    cy.contains('insert on tasks').click();

    // 6. Verify correlation badge is shown
    cy.get('[data-test=correlation-badge]')
      .should('be.visible')
      .and('contain', 'via subscription: tasks.list');

    // 7. Verify freshness indicator
    cy.get('[data-test=freshness-indicator]')
      .should('contain', 'ms old')
      .and('have.class', 'fresh');
  });

  it('detects stale data after server update', () => {
    // 1. Initial state: Task exists
    cy.createTask('Original text');

    // 2. Simulate server-side update (bypass client)
    cy.task('db:updateTask', { text: 'Updated text' });

    // 3. Open DevTools
    cy.get('[data-test=devtools-toggle]').click();
    cy.get('[data-test=minimongo-tab]').click();

    // 4. Check correlation shows staleness
    cy.get('[data-test=stale-warning]')
      .should('be.visible')
      .and('contain', 'Data may be stale');
  });
});
```

**Key Cypress Features for DDP Testing:**

1. **Automatic Waiting:** `cy.contains()` automatically retries until element appears
2. **DDP Propagation:** Built-in retry handles async DDP message delivery
3. **No Flaky Tests:** Avoids `cy.wait(arbitrary)` in favor of assertions

---

### ✅ DevTools Application: NEW Testing Requirements

**Add to STATUS.md:**

```markdown
## Testing Requirements

### Unit Tests (Jest)
- [ ] MinimongoDDPCorrelator.findDocumentOrigin()
- [ ] MinimongoDDPCorrelator.getDataFreshness()
- [ ] MinimongoDDPCorrelator.validateQuery()
- [ ] Schema inference (inferSchema utility)

### Component Tests (RTL)
- [ ] QueryLogRow renders correctly
- [ ] CorrelationBadge shows correct status
- [ ] QueryLogList handles large datasets
- [ ] Virtualized scrolling works

### E2E Tests (Cypress)
- [ ] Open DevTools → Navigate to Minimongo tab
- [ ] Create task in host app → See correlation in DevTools
- [ ] Update task → Freshness indicator updates
- [ ] Delete task → Correlation shows removal

### CI/CD Integration
- [ ] Jest runs on `yarn test`
- [ ] Cypress runs in GitHub Actions
- [ ] Single test failure blocks deployment
```

---

## V. Monitoring & Operational Excellence

**🔮 DevTools Context:** Future diagnostic features. We could analyze the host app's performance.

### 5.1 Application Performance Monitoring (APM)

**Pattern:** Continuous monitoring of critical metrics.

**Key Metrics:**
- **P95 Method Response Time:** 95th percentile (worst 5% of calls)
- **P99 Method Response Time:** 99th percentile (worst 1% of calls)
- **DDP Latency:** Time between client send and server response
- **WebSocket Reconnects:** Indicator of server instability
- **CPU/Memory Usage:** Resource constraints

---

### 🔮 DevTools Application: Performance Analysis Dashboard

**Future Enhancement Concept:**

```typescript
// src/Stores/Panel/PerformanceAnalysisStore.ts
export class PerformanceAnalysisStore {
  constructor(
    private ddpStore: DDPStore,
    private performanceStore: PerformanceStore
  ) {}

  @computed
  get methodPerformanceMetrics() {
    const methodCalls = this.performanceStore.callMap;

    return Array.from(methodCalls.entries()).map(([key, data]) => {
      const times = data.runtimes || [];
      const sorted = times.slice().sort((a, b) => a - b);

      const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

      return {
        methodName: key,
        callCount: data.count,
        avgTime: data.totalTime / data.count,
        p50,
        p95,
        p99,
        recommendation: this.generateRecommendation(p95, p99)
      };
    });
  }

  private generateRecommendation(p95: number, p99: number) {
    if (p99 > 2000) {
      return "🔴 CRITICAL: P99 exceeds 2s. Investigate database queries and indexes.";
    }
    if (p95 > 500) {
      return "🟡 WARNING: P95 exceeds 500ms. Consider optimization.";
    }
    return "✅ Performance within acceptable range.";
  }
}
```

**UI Display:**
```
┌─ Method Performance Analysis ───────────────────────┐
│ Method: tasks.update                                │
│                                                      │
│ Calls: 1,247                                        │
│ Avg: 234ms                                          │
│ P50: 180ms                                          │
│ P95: 890ms  🟡                                      │
│ P99: 1,450ms 🔴                                     │
│                                                      │
│ 🟡 WARNING: P95 exceeds 500ms.                      │
│    Consider optimization.                           │
│                                                      │
│ Slowest 5 calls:                                    │
│ • 1,890ms at 14:23:45 (selector: {status: "active"})│
│ • 1,654ms at 14:18:12 (selector: {assignee: "xyz"}) │
│ • 1,450ms at 14:15:03 (selector: {priority: 1})     │
│                                                      │
│ 💡 Recommendation: Add index on frequently queried  │
│    fields (status, assignee, priority).             │
└─────────────────────────────────────────────────────┘
```

---

### 5.2 Proactive Alerting

**Pattern:** Define thresholds and alert before users are impacted.

**KPI Table:**

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|-------------------|---------|
| P95 Method Response Time | > 500ms | > 1500ms | Profile method, check DB queries |
| WebSocket Reconnects | > 5/min | > 20/min | Check server logs, verify proxy config |
| CPU Utilization | > 70% (sustained) | > 90% (sustained) | CPU profile, consider scaling |
| Error Rate | > 1/hr | > 5/hr | Triage errors, plan hotfix |

---

### 🔮 DevTools Application: Real-Time Performance Alerts

**Future Enhancement Concept:**

```typescript
export class PerformanceAlertsStore {
  @observable alerts: Alert[] = [];

  constructor(private performanceStore: PerformanceStore) {
    // React to performance degradation
    reaction(
      () => this.performanceStore.renderData,
      (data) => {
        data.forEach(callData => {
          if (callData.avgTime > 500) {
            this.createAlert({
              severity: 'WARNING',
              metric: 'P95 Response Time',
              value: `${callData.avgTime}ms`,
              threshold: '500ms',
              recommendation: `Method ${callData.key} is slow. Check database indexes.`
            });
          }
        });
      }
    );
  }

  @action
  createAlert(alert: Alert) {
    // Deduplicate alerts (don't spam)
    const exists = this.alerts.some(a =>
      a.metric === alert.metric && a.value === alert.value
    );

    if (!exists) {
      this.alerts.push(alert);

      // Auto-dismiss after 5 minutes
      setTimeout(() => {
        runInAction(() => {
          this.alerts = this.alerts.filter(a => a !== alert);
        });
      }, 300000);
    }
  }
}
```

**UI Display:**
```
┌─ Performance Alerts ─────────────────────────────────┐
│ 🟡 WARNING: P95 Response Time                        │
│    Method: tasks.update                              │
│    Value: 890ms (threshold: 500ms)                   │
│    Recommendation: Check database indexes.           │
│    Detected: 2 minutes ago                           │
│    [Dismiss] [Investigate]                           │
└──────────────────────────────────────────────────────┘
```

---

### 5.3 User Behavior Analytics

**Pattern:** Track feature usage and user engagement.

**Integration Point:** Trigger analytics from MobX actions.

```typescript
// src/stores/TasksStore.ts
import { mixpanel } from '../services/analytics';

class TasksStore {
  @action
  addTask(text: string) {
    // Business logic...
    this.tasks.push(new Task({ text }));

    // Analytics event
    mixpanel.track('Task Created', {
      taskId: task.id,
      textLength: text.length,
      source: 'WebApp'
    });
  }

  @action
  deleteTask(taskId: string) {
    const task = this.tasks.find(t => t.id === taskId);
    this.tasks = this.tasks.filter(t => t.id !== taskId);

    mixpanel.track('Task Deleted', {
      taskId,
      ageInMinutes: (Date.now() - task.createdAt) / 60000
    });
  }
}
```

---

### 🔮 DevTools Application: Feature Usage Tracking

**Future Enhancement Concept:**

```typescript
// Track DevTools feature usage (not host app usage)
export class DevToolsAnalytics {
  trackPanelOpened(panelName: string) {
    mixpanel.track('DevTools Panel Opened', {
      panelName,
      timestamp: Date.now()
    });
  }

  trackExportInitiated(format: ExportFormat, docCount: number) {
    mixpanel.track('Export Initiated', {
      format,
      documentCount: docCount,
      collectionName: PanelStore.minimongoStore.activeCollection
    });
  }

  trackCorrelationViewed(hasOrigin: boolean) {
    mixpanel.track('Correlation Viewed', {
      hasServerOrigin: hasOrigin,
      timeSinceCreation: '...'
    });
  }
}
```

**Use Case:** Understand which DevTools features users actually use, prioritize development accordingly.

---

## VI. Decision Matrices & Checklists

### Store Responsibility Matrix

| Store Type | Core Responsibility | Typical Contents | Persistence | Lifespan |
|------------|---------------------|------------------|-------------|----------|
| **Domain Store** | Business logic & data models | Task objects, User profiles, API logic | Persisted to backend | Application lifespan |
| **UI Store** | View & session state | isSidebarOpen, currentTheme, isLoading | Not persisted | Session lifespan |
| **Local Observable** | Encapsulated component logic | Form values, validation errors, wizard step | Not persisted | Component instance |

---

### Testing Strategy Matrix

| Scenario | Primary Tool | Key Objective | Example |
|----------|-------------|---------------|---------|
| Business Logic | Jest Unit Test | Verify state transitions in isolation | "taskStore.archiveTask() moves task to archive" |
| Simple Rendering | RTL Component Test | Verify component renders based on props | "TaskItem with isChecked=true has strikethrough" |
| UI Interaction | RTL Component Test | Verify component calls correct actions | "Clicking checkbox calls task.toggleChecked()" |
| Full User Workflow | Cypress E2E | Verify complete end-to-end experience | "User logs in, creates task, sees it in list" |
| Real-Time Updates | Cypress E2E | Verify reactive data loop | "User A updates project, User B sees change" |

---

### Publication Security & Performance Checklist

| Checkpoint | Requirement |
|------------|-------------|
| User Authentication | Publication returns `this.ready()` if `!this.userId` for protected data |
| Argument Validation | All client arguments validated with `check()` or schema validator |
| Mandatory Field Projection | Query includes `fields` specifier to explicitly list published fields |
| Server-Side Filtering | All filtering performed on server; no sensitive data sent for client filtering |
| Pagination | `limit` and `skip` options used for any publication returning large datasets |
| Supporting Index | Query filter/sort criteria supported by MongoDB index (verify via `explain()`) |
| Rate Limiting | Publication included in DDP rate-limiting rules if resource-intensive |

---

## VII. Appendix: Future Enhancement Roadmap

### Phase 1: Diagnostic Features (No Server Access Required)

**Estimated Effort:** 10-15 hours

1. **Publication Analysis Dashboard**
   - Detect over-publishing (large payloads)
   - Suggest field projections
   - Identify missing pagination

2. **Method Security Audit**
   - Detect userId passed as parameter
   - Detect MongoDB operators from client
   - Flag high-risk patterns

3. **Performance Alerts**
   - Real-time P95/P99 monitoring
   - Threshold-based warnings
   - Slowest query identification

4. **Reactivity Analysis**
   - Detect low-frequency subscriptions
   - Recommend Method vs Publication
   - Visualize update frequency

---

### Phase 2: Server-Side Integration (Requires Host App Modification)

**Estimated Effort:** 20-30 hours

**Prerequisite:** Host app must install `meteor-devtools-evolved-server` package.

1. **Server-Side Method Profiling**
   - Capture server-side execution time
   - Database query timing
   - Publication observer overhead

2. **Database Query Analysis**
   - Capture actual MongoDB queries
   - Verify index usage via `explain()`
   - Suggest missing indexes

3. **Real-Time Recommendations**
   - Server sends optimization hints to DevTools
   - "This query is slow because index missing on field X"
   - "This publication could use field projections"

---

### Phase 3: SSR & Report Generation

**Estimated Effort:** 15-20 hours

**Use Case:** Generate shareable performance audit reports.

1. **Server-Side Rendering (SSR)**
   - Meteor server package renders performance reports
   - Generate PDF/HTML reports
   - Email reports to stakeholders

2. **Historical Tracking**
   - Store performance metrics over time
   - Trend analysis ("P95 increased 30% this week")
   - Regression detection

---

## VIII. Summary & Key Takeaways

### Immediately Applicable Patterns

✅ **Apply Now:**
1. MobX "dereference late" pattern → NEW ADR-009
2. List component isolation → NEW ADR-010
3. Store responsibility validation (Domain vs UI)
4. Testing pyramid (Jest + RTL + Cypress)
5. Minimongo read-only philosophy (already doing this)

### Future Enhancements

🔮 **Document for Later:**
1. Publication analysis diagnostic features
2. Method security audit features
3. Performance alert system
4. Server-side integration (Phase 2)
5. SSR report generation (Phase 3)

### Validation of Existing Architecture

✅ **Confirmed Best Practices:**
- PanelStore architecture (Domain + UI separation)
- SubscriptionStore correlation pattern (proven in production)
- MeteorAdapter method wrapping (extends for query logging)
- Export via MobX `flow()` (async state management)
- Snapshot-based Minimongo sync (appropriate for DevTools)

---

**Last Updated:** 2025-10-05
**Maintainer:** @primeinc
**Source:** Production Meteor.js + MobX architectural patterns
**Applicability:** 40% immediate, 60% future enhancements
