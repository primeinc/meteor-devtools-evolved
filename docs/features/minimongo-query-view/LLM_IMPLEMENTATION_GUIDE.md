# LLM Implementation Guide: Minimongo Query View

**Purpose:** This document helps LLMs (or developers) quickly understand the codebase context needed to implement the Minimongo Query View feature.

**Status:** Feature is 0% implemented. This is a complete feature addition.

**Estimated Effort:** 8-12 hours across 12 files (9 new, 3 modified)

---

## 🎯 Implementation Strategy

**Critical Success Factor:** Understand existing patterns BEFORE writing new code. This codebase has established patterns for:
- Message passing between injected scripts and devtools panel
- MobX observable stores with computed properties
- React components using Blueprint UI
- TypeScript interfaces for type safety

**Order of Operations:**
1. Read prerequisite files (understand what exists)
2. Study existing patterns (learn the "house style")
3. Implement backend first (data layer)
4. Build UI components (presentation layer)
5. Test integration (verify end-to-end)

---

## 📚 PHASE 0: Read These Files First (In Order)

**WHY THIS ORDER:** Each file builds on concepts from previous files. Reading out of order will cause confusion.

### 1. **Message Bridge Architecture** (20 minutes)

#### Read: `src/Browser/Inject.ts` (lines 1-50, focus on Registry pattern)
**Why:** Understand how injected scripts communicate with devtools panel.
**Key Concepts:**
- `Registry.register(messageName, handler)` - Registers message handlers
- `sendMessage(messageName, data)` - Sends messages to panel
- Content script ↔ Background ↔ DevTools panel communication flow

**Reasoning:** The feature requires intercepting Meteor methods and sending logs to the panel. You MUST understand how messages flow between contexts.

#### Read: `src/Utils/BridgeAdapter.ts` (entire file)
**Why:** This is the panel-side message handler.
**Key Concepts:**
- `BridgeAdapter.on(messageName, callback)` - Listen for messages from injected script
- `BridgeAdapter.post(messageName, data)` - Send messages to injected script
- Event-based pub/sub pattern

**Reasoning:** The MinimongoStore will need to listen for `MINIMONGO_METHOD` messages. This shows you the exact API.

---

### 2. **Current Minimongo Implementation** (30 minutes)

#### Read: `src/Injectors/MinimongoInjector.ts` (entire file - 101 lines)
**Why:** This is what you'll be EXTENDING. Understand current capabilities.
**Key Concepts:**
- `getCollections()` - Snapshots all Minimongo collections
- `cleanup()` - Serializes Meteor-specific objects (Date, ObjectID)
- `getDocs()` - Handles both Map and Object storage formats
- `throttle()` - Performance optimization pattern

**Reasoning:** You'll add `wrapMethod()` and `discoverCollections()` to THIS file. Understanding the existing `cleanup()` function is critical because you'll reuse it for serializing method arguments.

**Critical Insight:** Notice how it accesses `Meteor.connection._mongo_livedata_collections` - this is the entry point to the Meteor data layer.

#### Read: `src/Stores/Panel/MinimongoStore/index.ts` (entire file - 310 lines)
**Why:** This is the MobX store you'll extend with method log handling.
**Key Concepts:**
- `@observable` - MobX reactive properties
- `@computed` - Derived state (auto-updates when dependencies change)
- `@action` - Methods that modify observable state
- `flow()` - MobX async action handler (like async/await but reactive)
- Message handling pattern (see `BridgeAdapter.on('minimongo-get-collections')` usage in constructor area if exists, or where it's called)

**Reasoning:** You need to add `onMethodReceived(message)` handler here. Study the existing `setCollections()` action to understand the pattern.

**Critical Pattern:** See lines 105-113 - how raw data is transformed into wrapped documents with metadata. You'll apply similar pattern to method logs.

#### Read: `src/Stores/Panel/MinimongoStore/CollectionStore.ts` (entire file - 16 lines)
**Why:** This is the class you'll MASSIVELY expand (16 → ~140 lines).
**Key Concepts:**
- Extends `Searchable<IDocumentWrapper>` base class
- `filterFunction` - How search is implemented
- MobX `makeObservable(this)` requirement

**Reasoning:** Currently it's just a searchable collection wrapper. You'll add:
- `@observable methodLogs: IMethodLog[]`
- `@computed get queries()`
- `@computed get mutations()`
- `@computed get schema()`

---

### 3. **Understand Base Classes and Utilities** (20 minutes)

#### Read: `src/Stores/Common/Searchable.ts` (lines 1-100, focus on class structure)
**Why:** CollectionStore extends this. Understand what you inherit.
**Key Concepts:**
- `setCollection(collection)` - Updates the source data
- `@computed get filtered()` - Applies search filter
- `filterFunction` - Abstract method subclasses implement

**Reasoning:** When you add `methodLogs` to CollectionStore, they won't interfere with the existing `collection` (documents) because Searchable manages documents separately.

#### Read: `src/Utils/ObjectTreerinator/index.tsx` (lines 1-50, understand props)
**Why:** The MethodLogDisplay component will use this to render query arguments.
**Key Concepts:**
- `<ObjectTreerinator json={data} />` - Renders interactive JSON tree
- Handles nested objects, arrays, dates, etc.
- Already exists - don't reinvent

**Reasoning:** When displaying `{selector: {userId: 123}}`, pass it to ObjectTreerinator. Don't build a custom renderer.

#### Read: `src/Pages/Panel/Minimongo/services/CopyFormats.ts` (lines 1-100, focus on EJSON usage)
**Why:** Shows how to use EJSON for serialization.
**Key Concepts:**
- `EJSON.stringify()` - Handles Meteor types (ObjectID, Date, Binary)
- `EJSON.parse()` - Deserializes back to objects

**Reasoning:** In MinimongoInjector, you'll serialize method arguments with EJSON before sending. In CollectionStore, you'll parse them back. This file shows the pattern.

---

### 4. **UI Patterns and Components** (15 minutes)

#### Read: `src/Pages/Panel/Minimongo/Minimongo.tsx` (entire file - 128 lines)
**Why:** This is the main container you'll refactor to add tabs.
**Current Structure:**
- Sidebar navigation (collection list)
- Single view (MinimongoContainer)

**Your Changes:**
- Keep sidebar
- Add `<Tabs>` component inside container
- Tab 1: Documents (existing MinimongoContainer)
- Tab 2: Queries & Schema (new MinimongoQueryView)

**Reasoning:** Study the current layout structure before refactoring. Note the `isVisible` prop handling and `useStore()` hook usage.

#### Read: `src/Pages/Panel/Minimongo/components/ExportDialog.tsx` (lines 1-100, focus on MobX integration)
**Why:** Example of complex React component with MobX store integration.
**Key Concepts:**
- `observer` wrapper - Makes component reactive to MobX changes
- `useStore()` hook - Access to MobX stores
- `runInAction()` - Updating observable state from callbacks
- Blueprint Dialog, ProgressBar, Button components

**Reasoning:** Your new components will follow this pattern: `observer()` wrapper, `useStore()`, Blueprint components.

---

## 🏗️ PHASE 1: Understand Existing Patterns

### Pattern 1: Message Passing (Injected Script → Panel)

**Location:** `src/Injectors/MinimongoInjector.ts:88`

```typescript
// EXISTING PATTERN - sending collection snapshots
const response = requestPayload
  ? { ...requestPayload, ...collectionsData }
  : collectionsData

sendMessage('minimongo-get-collections', response as any)
```

**YOUR USAGE:**
```typescript
// NEW PATTERN - sending method logs
const methodLog = {
  collectionName: collection.name,
  method: methodName,
  args: EJSON.stringify(arguments),
  stack: new Error().stack,
  timestamp: Date.now()
}

sendMessage('MINIMONGO_METHOD', methodLog)
```

**Why This Pattern:** The existing code shows:
1. How to structure message payload (plain objects)
2. How to echo back request metadata (requestPayload pattern)
3. Use of `sendMessage()` from Inject.ts

---

### Pattern 2: MobX Observable Store Updates

**Location:** `src/Stores/Panel/MinimongoStore/index.ts:101-114`

```typescript
// EXISTING PATTERN
@action
setCollections(data: RawCollections | any) {
  const { requestId, ...collections } = data

  this.collections = mapValues(collections, (collection, collectionName) => {
    return collection.map(document =>
      MinimongoStore.wrapDocument(document, collectionName),
    )
  })

  this.computeCollectionSizes()
  this.syncDocuments()
}
```

**YOUR USAGE:**
```typescript
// NEW PATTERN - handling method logs
@action
onMethodReceived(message: IMethodMessage) {
  const collectionStore = this.getCollectionStore(message.collectionName)
  if (!collectionStore) return

  const methodLog: IMethodLog = {
    method: message.method,
    args: EJSON.parse(message.args),
    stack: message.stack,
    timestamp: message.timestamp
  }

  collectionStore.addMethodLog(methodLog)
}
```

**Why This Pattern:**
1. `@action` decorator for state mutations
2. Defensive checks (`if (!collectionStore)`)
3. Data transformation before storage (EJSON.parse)
4. Delegation to sub-stores (collectionStore.addMethodLog)

---

### Pattern 3: MobX Computed Properties

**Location:** `src/Stores/Panel/MinimongoStore/index.ts:34-40`

```typescript
// EXISTING PATTERN
@computed
get totalDocuments() {
  return Object.values(this.collections).reduce(
    (acc, cur) => acc + cur.length,
    0,
  )
}
```

**YOUR USAGE in CollectionStore:**
```typescript
// NEW PATTERN - filtering method logs
@computed
get queries(): IMethodLog[] {
  return this.methodLogs.filter(log =>
    log.method === 'find' || log.method === 'findOne'
  ).map(log => ({
    ...log,
    args: EJSON.parse(log.args) // Parse once, cache via computed
  }))
}

@computed
get mutations(): IMethodLog[] {
  return this.methodLogs.filter(log =>
    ['insert', 'update', 'upsert', 'remove'].includes(log.method)
  )
}
```

**Why This Pattern:**
1. `@computed` - Auto-recalculates when `methodLogs` changes
2. Memoization - Result is cached until dependencies change
3. Derived state - Don't store `queries` separately, compute from `methodLogs`

---

### Pattern 4: React Component with MobX

**Location:** `src/Pages/Panel/Minimongo/components/ExportDialog.tsx:12-20` (approximate)

```typescript
// EXISTING PATTERN
export const ExportDialog = observer(({ isOpen, onClose }) => {
  const { minimongoStore } = useStore()

  // Component automatically re-renders when minimongoStore observables change
  return (
    <Dialog isOpen={isOpen} onClose={onClose}>
      <ProgressBar value={minimongoStore.exportStatus.progress} />
    </Dialog>
  )
})
```

**YOUR USAGE:**
```typescript
// NEW PATTERN
export const MethodLogDisplay = observer(({ logs, type }: IProps) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (logs.length === 0) {
    return <NonIdealState icon="search" title="No logs" />
  }

  return (
    <div>
      {logs.map((log, index) => (
        <Card key={index}>
          <code>{log.method}()</code>
          <ObjectTreerinator json={log.args} />
        </Card>
      ))}
    </div>
  )
})
```

**Why This Pattern:**
1. `observer()` wrapper - Makes component reactive to MobX
2. Blueprint components - `<Card>`, `<NonIdealState>`
3. Local state (`useState`) for UI-only state (expanded/collapsed)
4. Props for data, store for global state

---

### Pattern 5: TypeScript Interfaces

**Location:** `src/types.d.ts` (likely) or inferred from code

```typescript
// EXISTING PATTERN (inferred from MinimongoStore.ts)
interface IDocumentWrapper {
  collectionName: string
  document: IDocument
  _string: string
  _size: number
}

interface IDocument {
  _id: string
  [key: string]: any
}
```

**YOUR NEW INTERFACES:**
```typescript
interface IMethodLog {
  method: string // 'find' | 'insert' | 'update' | 'remove' | etc
  args: any // Parsed EJSON
  stack?: string
  timestamp: number
}

interface ISchema {
  [fieldName: string]: ISchemaField
}

interface ISchemaField {
  type: string // 'string' | 'number' | 'array' | 'object' | 'mixed'
  optional: boolean
}

interface IMethodMessage {
  collectionName: string
  method: string
  args: string // EJSON-stringified
  stack: string
  timestamp: number
}
```

**Why This Pattern:**
1. Clear separation: `IMethodMessage` (wire format) vs `IMethodLog` (stored format)
2. `args: string` in message, `args: any` after parsing
3. `optional` field in ISchemaField mirrors MongoDB schema conventions

---

## 🔧 PHASE 2: Implementation Checklist

### Step 1: Add TypeScript Interfaces (15 min)

**File:** Create `src/types/MinimongoTypes.ts` or add to existing `src/types.d.ts`

**What to add:**
```typescript
interface IMethodLog {
  method: string
  args: any
  stack?: string
  timestamp: number
}

interface IMethodMessage {
  collectionName: string
  method: string
  args: string // EJSON stringified
  stack: string
  timestamp: number
}

interface ISchema {
  [fieldName: string]: ISchemaField
}

interface ISchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'mixed'
  optional: boolean
}
```

**Why First:** TypeScript will guide implementation. Define types before writing code.

---

### Step 2: Implement Schema Inference (1.5 hours)

**File:** Create `src/Stores/Panel/MinimongoStore/schema-inference.ts`

**Why This Order:** Standalone utility with no dependencies. Can test in isolation.

**Algorithm:**
```typescript
export function inferSchema(documents: any[]): ISchema {
  if (!documents.length) return {}

  const schema: ISchema = {}

  // 1. Collect all unique field names
  const allFields = new Set<string>()
  documents.forEach(doc => {
    Object.keys(doc).forEach(key => allFields.add(key))
  })

  // 2. For each field, infer type and optionality
  allFields.forEach(fieldName => {
    const values = documents
      .map(doc => doc[fieldName])
      .filter(val => val !== undefined)

    schema[fieldName] = {
      type: inferFieldType(values),
      optional: values.length < documents.length
    }
  })

  return schema
}

function inferFieldType(values: any[]): string {
  const types = new Set(values.map(v => {
    if (v === null) return 'null'
    if (Array.isArray(v)) return 'array'
    if (v instanceof Date) return 'date'
    return typeof v
  }))

  if (types.size > 1) return 'mixed'
  return Array.from(types)[0]
}
```

**Test Strategy:**
```typescript
// Create test file: src/Stores/Panel/MinimongoStore/__tests__/schema-inference.spec.ts
describe('inferSchema', () => {
  it('infers string type', () => {
    const docs = [{ name: 'Alice' }, { name: 'Bob' }]
    expect(inferSchema(docs)).toEqual({
      name: { type: 'string', optional: false }
    })
  })

  it('detects optional fields', () => {
    const docs = [{ name: 'Alice', age: 30 }, { name: 'Bob' }]
    expect(inferSchema(docs).age.optional).toBe(true)
  })

  it('detects mixed types', () => {
    const docs = [{ value: 'text' }, { value: 123 }]
    expect(inferSchema(docs).value.type).toBe('mixed')
  })
})
```

**Reasoning:** Schema inference is pure logic, no MobX or React. Build and test it first.

---

### Step 3: Expand CollectionStore (1.5 hours)

**File:** Modify `src/Stores/Panel/MinimongoStore/CollectionStore.ts`

**Current:** 16 lines
**After:** ~140 lines

**What to add:**
```typescript
import { Searchable } from '@/Stores/Common/Searchable'
import { computed, makeObservable, observable, action } from 'mobx'
import { inferSchema } from './schema-inference'
import EJSON from 'ejson' // Or wherever it's imported from

export class CollectionStore extends Searchable<IDocumentWrapper> {
  @observable methodLogs: IMethodLog[] = []

  constructor() {
    super()
    makeObservable(this)
  }

  @action
  addMethodLog(log: IMethodLog) {
    this.methodLogs.push(log)

    // Optional: Limit log size to prevent memory issues
    if (this.methodLogs.length > 1000) {
      this.methodLogs.shift() // Remove oldest
    }
  }

  @computed
  get queries(): IMethodLog[] {
    return this.methodLogs.filter(log =>
      log.method === 'find' || log.method === 'findOne'
    )
  }

  @computed
  get mutations(): IMethodLog[] {
    return this.methodLogs.filter(log =>
      ['insert', 'update', 'upsert', 'remove'].includes(log.method)
    )
  }

  @computed
  get schema(): ISchema {
    const docs = this.collection.map(wrapper => wrapper.document)
    return inferSchema(docs)
  }

  filterFunction = (collection: IDocumentWrapper[], search: string) =>
    collection.filter(
      document =>
        !search ||
        JSON.stringify(document).toLowerCase().includes(search.toLowerCase()),
    )
}
```

**Why This Order:** CollectionStore needs to exist before MinimongoStore can reference it.

**Critical Decision - Log Storage:**
- **Why `@observable methodLogs`:** MobX will auto-notify computed properties when logs are added
- **Why limit to 1000:** Prevent memory leaks in long-running apps
- **Why separate `queries` and `mutations`:** UI displays them differently (different tabs/cards)

---

### Step 4: Add Method Interception in MinimongoInjector (2 hours)

**File:** Modify `src/Injectors/MinimongoInjector.ts`

**Current:** 101 lines
**After:** ~250 lines

**What to add:**

```typescript
import { warning } from '@/Log'
import { Registry, sendMessage } from '@/Browser/Inject'
import throttle from 'lodash.throttle'
import EJSON from 'ejson'

// ... existing code ...

// NEW: Track wrapped methods to prevent double-wrapping
const wrappedMethods = new WeakMap<any, Set<string>>()

/**
 * Wraps a Minimongo collection method to intercept calls
 */
function wrapMethod(collection: any, methodName: string) {
  // Check if already wrapped
  if (!wrappedMethods.has(collection)) {
    wrappedMethods.set(collection, new Set())
  }

  const wrapped = wrappedMethods.get(collection)!
  if (wrapped.has(methodName)) {
    return // Already wrapped
  }
  wrapped.add(methodName)

  // Store original method
  const originalMethod = collection[methodName]

  // Replace with interceptor
  collection[methodName] = function(...args: any[]) {
    // Capture method call details
    const methodLog = {
      collectionName: collection.name,
      method: methodName,
      args: EJSON.stringify(args),
      stack: new Error().stack || '',
      timestamp: Date.now()
    }

    // Send to devtools panel (throttled to prevent spam)
    throttledSendMethodLog(methodLog)

    // Call original method
    return originalMethod.apply(this, args)
  }
}

// Throttle method logs to prevent flooding (max 10 per second)
const throttledSendMethodLog = throttle((log: any) => {
  sendMessage('MINIMONGO_METHOD', log)
}, 100, { leading: true, trailing: true })

/**
 * Discover and wrap all Minimongo collections
 */
function discoverCollections() {
  const collections = Meteor?.connection?._mongo_livedata_collections

  if (!collections) {
    warning('Minimongo collections not available yet')
    return
  }

  Object.values(collections).forEach((collection: any) => {
    // Wrap query methods
    wrapMethod(collection, 'find')
    wrapMethod(collection, 'findOne')

    // Wrap mutation methods
    wrapMethod(collection, 'insert')
    wrapMethod(collection, 'update')
    wrapMethod(collection, 'upsert')
    wrapMethod(collection, 'remove')
  })
}

// ... existing code ...

export const MinimongoInjector = () => {
  Registry.register('minimongo-get-collections', (message: Message<any>) => {
    getCollections(message.data)
  })

  // NEW: Start method interception
  Registry.register('minimongo-enable-method-tracking', () => {
    discoverCollections()
  })

  // Auto-enable on injection (optional - could wait for user to enable)
  // discoverCollections()
}
```

**Why This Order:** Injector must send messages before stores can receive them.

**Critical Decisions:**

1. **WeakMap for tracking:** Prevents memory leaks, auto-cleans when collection is garbage collected
2. **Throttling:** Without this, typing in a search box that queries on every keystroke will spam 100s of messages
3. **EJSON.stringify:** Meteor types (ObjectID, Date) won't serialize with JSON.stringify
4. **Stack trace:** `new Error().stack` captures call stack, shows WHERE in app code the query came from
5. **Apply original method:** CRITICAL - must not break the app. Call original after logging.

**Testing Strategy:**
- Manual: Open devtools, run `MyCollection.find()` in Meteor app console
- Check: Console should show MINIMONGO_METHOD messages
- Verify: App still works (original method still executes)

---

### Step 5: Add Message Handler in MinimongoStore (30 min)

**File:** Modify `src/Stores/Panel/MinimongoStore/index.ts`

**What to add:**

```typescript
// In constructor:
constructor() {
  makeObservable(this)

  // Existing listener
  BridgeAdapter.on('minimongo-get-collections', (data: any) => {
    this.setCollections(data)
  })

  // NEW: Listen for method logs
  BridgeAdapter.on('MINIMONGO_METHOD', (message: IMethodMessage) => {
    this.onMethodReceived(message)
  })

  // NEW: Request method tracking be enabled
  BridgeAdapter.post('minimongo-enable-method-tracking', {})
}

// NEW: Handle incoming method logs
@action
onMethodReceived(message: IMethodMessage) {
  // Get or create collection store
  let collectionStore = this.collections[message.collectionName]
  if (!collectionStore) {
    // Collection might not be in snapshot yet, ignore for now
    return
  }

  // Parse and store log
  const methodLog: IMethodLog = {
    method: message.method,
    args: EJSON.parse(message.args),
    stack: message.stack,
    timestamp: message.timestamp
  }

  // Note: this.collections[name] is an array of documents, not a CollectionStore
  // You'll need to refactor how collections are stored or add a separate methodLogs map

  // DESIGN DECISION NEEDED: How to store method logs?
  // Option A: Add methodLogs to main MinimongoStore
  // Option B: Create parallel data structure
  // Option C: Store in CollectionStore (requires refactor)
}
```

**WAIT - CRITICAL ISSUE DISCOVERED:**

Looking at `MinimongoStore.ts:17`:
```typescript
@observable collections: MinimongoCollections = {}
```

This is `Record<string, IDocumentWrapper[]>` (collection name → array of documents).

But we need `CollectionStore` instances (which have methodLogs).

**DESIGN DECISION REQUIRED:**

**Option A:** Add separate `collectionStores` map
```typescript
@observable collections: MinimongoCollections = {} // Documents
@observable collectionStores: Record<string, CollectionStore> = {} // Stores with logs
```

**Option B:** Change `collections` to be `Record<string, CollectionStore>`
```typescript
@observable collections: Record<string, CollectionStore> = {}
// Each CollectionStore has:
//  - collection: IDocumentWrapper[] (documents)
//  - methodLogs: IMethodLog[] (logs)
```

**RECOMMENDATION: Option B** - Cleaner architecture, CollectionStore becomes the single source of truth.

**Reasoning:** Current code has `activeCollectionDocuments = new CollectionStore()` but `collections` is separate. This creates confusion. Unify them.

**Refactor Required:**
- Change `collections` type to `Record<string, CollectionStore>`
- Update `setCollections()` to create CollectionStore instances
- Update all references to `this.collections[name]` throughout codebase

**This is a BREAKING CHANGE - requires careful refactoring.**

**Alternative (Lower Risk):** Keep current structure, add `collectionMethodLogs: Record<string, IMethodLog[]>` and implement schema inference in MinimongoStore instead of CollectionStore.

---

### Step 6: Create React Components (2-3 hours)

**Files:** Create 3 new components

#### 6a. SchemaDisplay.tsx (30 min)

**File:** `src/Pages/Panel/Minimongo/components/SchemaDisplay.tsx`

**Copy from:** `.temp-backup/MinimongoQueryView/SchemaDisplay.tsx`

**Modifications needed:**
- Import path for ISchema (adjust to your types location)
- Import Blueprint components from correct paths
- Test with actual schema data

**No major logic changes needed.**

---

#### 6b. MethodLogDisplay.tsx (1 hour)

**File:** `src/Pages/Panel/Minimongo/components/MethodLogDisplay.tsx`

**Copy from:** `.temp-backup/MinimongoQueryView/MethodLogDisplay.tsx`

**Modifications needed:**
- Import ObjectTreerinator from `@/Utils/ObjectTreerinator`
- Import Blueprint components
- Add stack trace truncation (first 5 lines only)
- Add timestamp formatting

**Example enhancement:**
```typescript
const formatTimestamp = (ts: number) => {
  return new Date(ts).toLocaleTimeString()
}

const truncateStack = (stack: string) => {
  return stack.split('\n').slice(0, 5).join('\n')
}
```

---

#### 6c. MinimongoQueryView.tsx (30 min)

**File:** `src/Pages/Panel/Minimongo/components/MinimongoQueryView.tsx`

**Copy from:** `.temp-backup/MinimongoQueryView/MinimongoQueryView.tsx`

**Modifications needed:**
- Import SchemaDisplay and MethodLogDisplay
- Connect to CollectionStore via props
- Handle empty states

**Props interface:**
```typescript
interface IProps {
  collectionStore: CollectionStore
}
```

---

#### 6d. Modify Minimongo.tsx for Tabs (1 hour)

**File:** `src/Pages/Panel/Minimongo/Minimongo.tsx`

**Changes:**
- Import `Tabs, Tab` from Blueprint
- Add local state for active tab
- Wrap existing content in Tab panel
- Add new MinimongoQueryView tab

**Example structure:**
```typescript
const [activeTab, setActiveTab] = useState<string>('documents')

return (
  <Hideable isVisible={isVisible}>
    <Wrapper>
      <div className='sidebar'>
        {/* Existing sidebar */}
      </div>
      <div className='container'>
        <Tabs selectedTabId={activeTab} onChange={setActiveTab}>
          <Tab id="documents" title="Documents" panel={
            <MinimongoContainer isVisible={isVisible} />
          } />
          <Tab id="queries" title="Queries & Schema" panel={
            <MinimongoQueryView collectionStore={???} />
          } />
        </Tabs>
      </div>
    </Wrapper>
  </Hideable>
)
```

**BLOCKER:** How to pass `collectionStore` to MinimongoQueryView?

**Answer:** Need to refactor MinimongoStore to expose CollectionStore instances (see Step 5 design decision).

---

## ⚠️ PHASE 3: Common Pitfalls

### Pitfall 1: Infinite Loop in Method Wrapping

**Problem:** Wrapping `find` method, then calling `find` inside wrapper → infinite recursion.

**Solution:** Use WeakMap to track wrapped methods (already in implementation above).

**Why WeakMap:** Automatically cleans up when collection is garbage collected.

---

### Pitfall 2: EJSON vs JSON

**Problem:** `JSON.stringify({_id: new Mongo.ObjectID()})` loses type information.

**Solution:** Use `EJSON.stringify()` from Meteor.

**Where:** In MinimongoInjector when serializing method arguments.

**Example:**
```typescript
// WRONG:
args: JSON.stringify([{_id: ObjectID()}]) // "{"_id": "abc123"}"

// RIGHT:
args: EJSON.stringify([{_id: ObjectID()}]) // "{"_id": {"$type": "oid", "$value": "abc123"}}"
```

---

### Pitfall 3: Performance - Too Many Logs

**Problem:** Active Meteor app might call `find()` 100s of times per second.

**Solution:** Throttle message sending (100ms delay, max 10/sec).

**Where:** `throttledSendMethodLog` in MinimongoInjector.

**Alternative:** Circular buffer with max 1000 logs per collection (already in CollectionStore.addMethodLog).

---

### Pitfall 4: Stack Traces Are Huge

**Problem:** Stack traces can be 50+ lines, 10KB+ of data.

**Solution:** Truncate to first 5-10 lines, or make collapsible in UI.

**Where:** MethodLogDisplay component.

**Example:**
```typescript
const stack = log.stack?.split('\n').slice(0, 5).join('\n')
```

---

### Pitfall 5: Collections Not Yet Initialized

**Problem:** Method interceptor runs before Meteor finishes loading.

**Solution:** Check `Meteor?.connection?._mongo_livedata_collections` exists.

**Where:** `discoverCollections()` in MinimongoInjector.

**Add:** Retry logic or wait for DOMContentLoaded.

---

### Pitfall 6: MobX Doesn't Detect Changes

**Problem:** Updating `methodLogs` array doesn't trigger re-render.

**Solution:** Use `@observable` and `@action` decorators, call `makeObservable(this)`.

**Where:** CollectionStore constructor.

**Common mistake:** Forgetting `makeObservable(this)` in constructor.

---

### Pitfall 7: Schema Inference on Large Collections

**Problem:** Collection with 10,000 documents, inferring schema loops through all of them.

**Solution:** Sample first 100-1000 documents only.

**Where:** `inferSchema()` function.

**Example:**
```typescript
export function inferSchema(documents: any[], sampleSize = 1000): ISchema {
  const sample = documents.slice(0, sampleSize)
  // ... rest of logic
}
```

---

## 🧪 PHASE 4: Testing Strategy

### Unit Tests

**File:** `src/Stores/Panel/MinimongoStore/__tests__/schema-inference.spec.ts`

**Coverage:**
- Empty collection → empty schema
- Single field → correct type
- Optional fields → optional: true
- Mixed types → type: 'mixed'
- Nested objects → type: 'object'
- Arrays → type: 'array'

---

### Integration Tests

**Manual Testing:**
1. Load Meteor app in browser
2. Open devtools
3. Run query: `MyCollection.find({userId: 123})`
4. Check: Devtools shows query in "Queries & Schema" tab
5. Verify: Args show `{userId: 123}`
6. Verify: Stack trace shows where `find()` was called

---

### Performance Tests

**Scenario:** High-frequency queries (e.g., search-as-you-type)

**Test:**
1. Type in search box that queries on every keystroke
2. Type 10 characters quickly
3. Check: DevTools receives ~10 messages (not 100)
4. Verify: Throttling is working

---

## 📋 PHASE 5: Implementation Order Summary

**Do in this exact order:**

1. ✅ Read prerequisite files (Phase 0)
2. ✅ Study existing patterns (Phase 1)
3. **Create TypeScript interfaces** (15 min)
4. **Implement schema-inference.ts** (1.5h) + tests
5. **Expand CollectionStore** (1.5h)
6. **DESIGN DECISION:** Refactor MinimongoStore collections structure
7. **Add method wrapping to MinimongoInjector** (2h)
8. **Add message handler to MinimongoStore** (30min)
9. **Create SchemaDisplay component** (30min)
10. **Create MethodLogDisplay component** (1h)
11. **Create MinimongoQueryView component** (30min)
12. **Modify Minimongo.tsx for tabs** (1h)
13. **Manual testing** (1h)
14. **Fix bugs** (1-2h buffer)

**Total: 10-12 hours**

---

## 🎓 Key Learnings for LLMs

### 1. Message Flow Architecture

```
Meteor App (Browser Tab)
  ↓ (Mongo.Collection.find called)
Injected Script (MinimongoInjector.ts)
  ↓ sendMessage('MINIMONGO_METHOD', log)
Background Script (routes message)
  ↓
DevTools Panel (BridgeAdapter receives)
  ↓ BridgeAdapter.on('MINIMONGO_METHOD')
MinimongoStore.onMethodReceived()
  ↓
CollectionStore.addMethodLog()
  ↓ (@observable update triggers)
MobX re-renders components
  ↓
MethodLogDisplay shows new log
```

### 2. MobX Reactive Pattern

**Core Concept:** Don't manually trigger updates. MobX watches observables.

```typescript
// BAD:
methodLogs.push(log)
this.forceUpdate() // ❌ Manual update

// GOOD:
@observable methodLogs = []

@action
addLog(log) {
  this.methodLogs.push(log) // ✅ MobX auto-detects
}
```

### 3. Method Interception Pattern

**Key:** Store original, call it last.

```typescript
const original = obj.method

obj.method = function(...args) {
  // 1. Log/intercept
  console.log('Called with:', args)

  // 2. Call original (MUST DO THIS)
  return original.apply(this, args)
}
```

---

## 📖 Additional Resources

### Files to Reference During Implementation

**Type Safety:**
- `src/types.d.ts` - See existing interfaces

**MobX Patterns:**
- `src/Stores/Panel/MinimongoStore/index.ts` - `@action`, `@computed` examples
- `src/Stores/Common/Searchable.ts` - Base class pattern

**React Components:**
- `src/Pages/Panel/Minimongo/components/ExportDialog.tsx` - `observer` pattern
- `src/Utils/ObjectTreerinator/index.tsx` - JSON rendering

**Message Passing:**
- `src/Browser/Inject.ts` - `sendMessage`, `Registry.register`
- `src/Utils/BridgeAdapter.ts` - `BridgeAdapter.on`, `.post`

---

## 🏁 Success Criteria

**When is the feature "done"?**

1. ✅ User can see live query logs in "Queries & Schema" tab
2. ✅ Each log shows method name, arguments (as JSON tree), and stack trace
3. ✅ Schema inference shows field names, types, and optionality
4. ✅ Queries and Mutations are displayed separately
5. ✅ Stack traces are collapsible (don't clutter UI)
6. ✅ Performance: No noticeable slowdown in Meteor app
7. ✅ Tests: schema-inference has >90% coverage
8. ✅ Documentation: This guide is updated with actual implementation details

---

## 🚨 Before You Start Coding

**Checklist:**

- [ ] Have you read ALL prerequisite files in order?
- [ ] Do you understand the message flow (injector → bridge → store)?
- [ ] Do you understand MobX reactivity (`@observable`, `@computed`, `@action`)?
- [ ] Have you decided on collections data structure refactor (Option A or B)?
- [ ] Have you planned how to test each component in isolation?
- [ ] Have you identified which existing patterns to copy?

**If you answered "no" to any of these, STOP. Go back to Phase 0.**

---

**Last Updated:** 2025-10-04
**Maintained By:** @primeinc
**Status:** Living Document (update as implementation progresses)
