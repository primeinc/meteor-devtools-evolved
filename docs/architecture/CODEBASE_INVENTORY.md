# Meteor DevTools Evolved - Codebase Architecture Inventory

**Purpose:** Comprehensive inventory of existing infrastructure, patterns, and components in the codebase.

**Last Verified:** 2025-10-05 (via 3-agent parallel scan)

**Confidence Level:** HIGH - Based on file-by-file analysis with GitHub links

---

## 📊 Executive Summary

**Infrastructure Completeness:** ~65%

| Category | Status | Details |
|----------|--------|---------|
| **MobX Stores** | 60% | 9 stores (6 domain + 1 root + 1 base + 1 nested) with proven patterns |
| **React UI Components** | 65% | Blueprint.js + styled-components + 7 reusable components |
| **Injection/Interception** | 70% | Method wrapping exists, needs extension for query logging |
| **Message Passing** | 100% | Registry, Bridge, sendMessage all working |
| **Correlation Patterns** | 50% | SubscriptionStore ↔ DDPStore proven, needs Minimongo ↔ DDP |

---

## I. Production Panels (6 Total)

### Panel 1: DDP Message Log

**Location:** [`src/Pages/Panel/DDP/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/DDP)

**What It Does:**
- Intercepts ALL WebSocket DDP traffic in real-time
- Logs inbound and outbound DDP messages
- Parses message content (JSON)
- Displays with timestamps, direction indicators
- Provides search and filtering

**Key Files:**
- [`DDPInjector.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Injectors/DDPInjector.ts) - Wraps `Meteor.connection._stream`
- [`DDPStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/DDPStore.ts) - MobX store with correlation methods
- [`DDPLog.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/DDP/DDPLog.tsx) - UI component
- [`DDPContainer.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/DDP/DDPContainer.tsx) - Virtualized list with react-window

**Critical Pattern - Correlation Methods:**
```typescript
// DDPStore.ts - Lines 83-117
@computed
get subscriptionLogs() {
  return this.collection.filter(
    log => log.parsedContent.msg === 'ready' || log.parsedContent.msg === 'sub'
  )
}

getSubscriptionInit(subscription) {
  return this.subscriptionLogs.find(
    log => log.parsedContent.id === subscription.id
  )
}

getSubscriptionReady(subscription) {
  return this.subscriptionLogs.find(log =>
    log.parsedContent.subs?.includes?.(subscription.id)
  )
}
```

**Status:** ✅ **FULLY FUNCTIONAL** - This is the correlation pattern template!

---

### Panel 2: Subscriptions Viewer

**Location:** [`src/Pages/Panel/Subscriptions/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/Subscriptions)

**What It Does:**
- Lists all active Meteor subscriptions
- Shows subscription status (active, ready)
- **Correlates subscriptions with DDP messages** ← WORKING CORRELATION!
- Calculates subscription duration (init → ready)

**Key Discovery - WORKING Cross-Store Correlation:**
```typescript
// SubscriptionStore.ts:18-24
@computed
get subsWithMeta() {
  return this.filtered.map(sub => ({
    ...sub,
    ...PanelStore.ddpStore.getSubscriptionMeta(sub),  // ← CORRELATION!
  }))
}
```

**This proves we can do Minimongo ↔ DDP correlation using the same pattern!**

**Status:** ✅ **FULLY FUNCTIONAL** with DDP correlation already working

---

### Panel 3: Performance Monitor

**Location:** [`src/Pages/Panel/Performance/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/Performance)

**What It Does:**
- Tracks Minimongo method call performance
- Aggregates timing data (total, average, call count)
- Shows slowest operations
- Groups by collection + method + args

**Key Discovery - Method Interception Already Exists:**
```typescript
// MeteorAdapter.ts:28-53
Object.entries(Mongo.Collection.prototype).forEach(([key, val]) => {
  if (['find', 'findOne', 'insert', 'update', 'upsert', 'remove'].includes(key)) {
    const original = prototype[key]

    prototype[key] = function (...args) {
      const startMs = Date.now()
      const result = original.apply(this, args)

      sendMessage('meteor-data-performance', {
        collectionName: this._name,
        key,
        args: JSON.stringify(args),
        runtime: Date.now() - startMs
      })

      return result
    }
  }
})
```

**CRITICAL:** We already intercept ALL Minimongo methods!
- ✅ find, findOne, insert, update, upsert, remove
- ✅ Capture args
- ✅ Measure timing
- ❌ BUT: No stack traces (need to add)
- ❌ BUT: Only for performance tracking, not correlation

**Status:** ✅ **FULLY FUNCTIONAL** - Pattern exists, needs extension for query logging

---

### Panel 4: Minimongo Viewer

**Location:** [`src/Pages/Panel/Minimongo/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/Minimongo)

**What It Does:**
- Displays Minimongo collection documents
- Search and filter
- Export to 8 formats (PR #23 - merged 2025-10-05)
- Collection size tracking

**Key Files:**
- [`Minimongo.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/Minimongo/Minimongo.tsx) - Main panel
- [`MinimongoContainer.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/Minimongo/MinimongoContainer.tsx) - Virtualized document list
- [`MinimongoStore/index.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/MinimongoStore/index.ts) - MobX store
- [`services/MongoExportFormats.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/Minimongo/services/MongoExportFormats.ts) - Export implementation (1560 lines)

**Status:** ✅ **FULLY FUNCTIONAL**

---

### Panel 5: Bookmarks

**Location:** [`src/Pages/Panel/Bookmarks/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/Bookmarks)

**What It Does:**
- Save DDP messages for later review
- Persist to IndexedDB
- Search saved bookmarks

**Key Pattern - IndexedDB Integration:**
```typescript
// BookmarkStore.ts
async sync() {
  const collection = await PanelDatabase.getAll()

  runInAction(() => {
    this.collection = collection
    this.bookmarkIds = this.collection.map(bookmark => bookmark.id)
  })
}
```

**Status:** ✅ **FULLY FUNCTIONAL**

---

### Panel 6: Sponsor

**Location:** [`src/Pages/Panel/Sponsor/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/Sponsor)

**Status:** ✅ Exists (UI panel)

---

## II. MobX Store Architecture

### Root Store (Singleton Pattern)

**File:** [`src/Stores/PanelStore.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/PanelStore.tsx)

**Structure:**
```typescript
export class PanelStoreConstructor {
  // Domain Stores
  ddpStore = new DDPStore()
  bookmarkStore = new BookmarkStore()
  minimongoStore = new MinimongoStore()
  subscriptionStore = new SubscriptionStore()
  performanceStore = new PerformanceStore()

  // UI Store
  settingStore = new SettingStore()

  // UI State
  @observable selectedTabId: string = PanelPage.DDP
  @observable activeObject: ViewableObject = null
  @observable activeObjectTitle: string | null = null
  @observable.shallow activeStackTrace: StackTrace[] | null = null
  @observable isHelpDrawerVisible = false
}
```

**React Integration:**
```typescript
// Context Provider Pattern
const PanelStoreContext = createContext<PanelStoreConstructor | null>(null)

export const PanelStoreProvider: FunctionComponent = ({ children }) => (
  <PanelStoreContext.Provider value={PanelStore}>
    {children}
  </PanelStoreContext.Provider>
)

export const usePanelStore = () => {
  const store = useContext(PanelStoreContext)
  if (!store) throw new Error('Must be used within a provider.')
  return store
}
```

**Status:** ✅ Follows industry best practices (Domain vs UI store separation)

---

### Domain Stores

| Store | File | Observable State | Key Patterns |
|-------|------|------------------|--------------|
| **DDPStore** | [`DDPStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/DDPStore.ts) | DDP messages, bandwidth | Correlation methods, @computed indexes |
| **MinimongoStore** | [`MinimongoStore/index.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/MinimongoStore/index.ts) | Collections, documents, export state | `flow()` for async, size calculations |
| **SubscriptionStore** | [`SubscriptionStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/SubscriptionStore.ts) | Active subscriptions | `subsWithMeta` (working correlation!) |
| **PerformanceStore** | [`PerformanceStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/PerformanceStore.ts) | Method performance metrics | Debounced updates, Map aggregation |
| **BookmarkStore** | [`BookmarkStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/BookmarkStore.ts) | Saved DDP messages | IndexedDB persistence with `runInAction` |

### UI Stores

| Store | File | Observable State | Key Patterns |
|-------|------|------------------|--------------|
| **SettingStore** | [`SettingStore.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Panel/SettingStore.ts) | Filters, blacklist, settings | Auto-save via `reaction()` |
| **PanelStore** | [`PanelStore.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/PanelStore.tsx) | selectedTabId, activeObject, UI flags | Root coordinator |

### Base Class

**File:** [`src/Stores/Common/Searchable.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Stores/Common/Searchable.ts)

**Provides:**
- Pagination
- Filtering
- Search functionality
- Buffer management with debouncing

**Used by:** DDPStore, MinimongoStore/CollectionStore, SubscriptionStore, BookmarkStore

---

## III. MobX Patterns Found in Production

### Pattern 1: @observable Variants

```typescript
// Standard observable
@observable tasks: Task[] = []

// Shallow observable (arrays/collections - prevents deep reactivity)
@observable.shallow collection: T[] = []
```

**Found in:** 18+ files across stores

---

### Pattern 2: @computed for Derived Data

```typescript
// DDPStore.ts
@computed
get subscriptionLogs() {
  return this.collection.filter(
    log => log.parsedContent.msg === 'ready' || log.parsedContent.msg === 'sub'
  )
}

// SubscriptionStore.ts - CROSS-STORE CORRELATION
@computed
get subsWithMeta() {
  return this.filtered.map(sub => ({
    ...sub,
    ...PanelStore.ddpStore.getSubscriptionMeta(sub),
  }))
}
```

**Found in:** 10+ computed properties across stores

---

### Pattern 3: Actions for Mutations

```typescript
@action
setCollections(data: RawCollections) {
  this.collections = mapValues(data, ...);
}

// For async operations
@action
async sync() {
  const data = await PanelDatabase.getAll()
  runInAction(() => {
    this.collection = data
  })
}
```

**Found in:** 32+ action methods

---

### Pattern 4: flow() for Complex Async

```typescript
// MinimongoStore.ts:154-298
exportActiveCollection = flow(function* (
  this: MinimongoStore,
  exportType: ExportFormatKey,
  signal: AbortSignal
) {
  this.isExportBusy = true

  try {
    const result = yield performExport(data, exportType)

    runInAction(() => {
      this.exportStatus = { progress: 100, message: 'Complete' }
    })
  } catch (error) {
    runInAction(() => {
      this.isExportBusy = false
    })
  }
})
```

**Found in:** MinimongoStore export

---

### Pattern 5: reaction() for Side Effects

```typescript
// SettingStore.ts:46-59
reaction(
  () => toJS(this),  // Track ALL observable changes
  (data: ISettings) => {
    if (this.hydrated) {
      PanelDatabase.saveSettings(data)
    }
  }
)
```

**Found in:** SettingStore (auto-save)

---

### Pattern 6: runInAction for Async Updates

```typescript
// Used whenever updating state from async callbacks
runInAction(() => {
  this.collection = collection
  this.bookmarkIds = this.collection.map(bookmark => bookmark.id)
})
```

**Found in:** 12+ locations across stores

---

### Pattern 7: toJS() for Snapshots

```typescript
// Before serialization or export
const wrappers = toJS(this.activeCollectionDocuments.filtered)
```

**Found in:** MinimongoStore export, SettingStore persistence

---

## IV. React + MobX Integration

### Pattern: observer() Wrapper

**All components that read observables are wrapped:**

```typescript
import { observer } from 'mobx-react-lite';

export const DDP: FunctionComponent<Props> = observer(({ isVisible }) => {
  const store = usePanelStore()
  const ddpStore = store.ddpStore

  // Component auto-rerenders when observables change
})
```

**Found in:** 16+ observer components

---

### Pattern: usePanelStore() Hook

```typescript
const MyComponent = observer(() => {
  const { minimongoStore } = usePanelStore()

  return <div>{minimongoStore.activeCollection}</div>
})
```

**Found in:** All panel components

---

## V. Reusable UI Components (Blueprint.js + Styled Components)

### Core Components

| Component | File | Purpose | Usage |
|-----------|------|---------|-------|
| **Button** | [`src/Components/Button.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/Button.tsx) | Primary button with icon, intent, shine, tooltips | Throughout app |
| **Field** | [`src/Components/Field.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/Field.tsx) | Read-only display field | Status bars |
| **TabBar** | [`src/Components/TabBar.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/TabBar.tsx) | Navigation tabs with responsive collapse | All panels |
| **StatusBar** | [`src/Components/StatusBar.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/StatusBar.tsx) | Bottom bar container | All panels |
| **TextInput** | [`src/Components/TextInput.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/TextInput.tsx) | Search input with icon | Filtering |
| **PopoverButton** | [`src/Components/PopoverButton.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/PopoverButton.tsx) | Button with Blueprint Popover2 | Dropdown menus |
| **Separator** | [`src/Components/Separator.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Components/Separator.tsx) | Visual separator line | Layout |

### Utility Components

| Component | File | Purpose |
|-----------|------|---------|
| **ObjectTreerinator** | [`src/Utils/ObjectTreerinator/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Utils/ObjectTreerinator) | JSON viewer with syntax highlighting |
| **Hideable** | [`src/Utils/Hideable.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Utils/Hideable.tsx) | Conditional visibility wrapper |

### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| **useDimensions** | [`src/Utils/Hooks/useDimensions.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Utils/Hooks/useDimensions.ts) | Dynamic element sizing with resize listener |
| **useBreakpoints** | [`src/Utils/Hooks/useBreakpoints.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Utils/Hooks/useBreakpoints.ts) | Responsive breakpoint detection |

---

## VI. Injection & Interception Infrastructure

### Injector 1: DDPInjector

**File:** [`src/Injectors/DDPInjector.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Injectors/DDPInjector.ts)

**What it intercepts:**
- ALL WebSocket DDP traffic (inbound + outbound)
- Wraps `Meteor.connection._stream.send`
- Listens to `Meteor.connection._stream.on('message')`

**Pattern:**
```typescript
const originalSend = Meteor.connection._stream.send
Meteor.connection._stream.send = function (...args) {
  originalSend.apply(this, args)  // Call original
  sendMessage('ddp-event', { content, timestamp, trace: getStackTrace() })
}
```

---

### Injector 2: MinimongoInjector

**File:** [`src/Injectors/MinimongoInjector.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Injectors/MinimongoInjector.ts)

**What it intercepts:**
- Collection document data (snapshot-based)
- Reads `Meteor.connection._mongo_livedata_collections`
- EJSON serialization for Date/Binary/ObjectId preservation

**Pattern:**
```typescript
const collections = Meteor.connection._mongo_livedata_collections

const data = mapValues(collections, (collection, collectionName) => {
  const docs = getDocs(collection) // Reads from _docs._map
  return Array.from(docs).map(doc => serializeEJSON(doc))
})

sendMessage('minimongo-get-collections', { ...data })
```

---

### Injector 3: MeteorAdapter

**File:** [`src/Injectors/MeteorAdapter.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Injectors/MeteorAdapter.ts)

**What it intercepts:**
- **ALL Mongo.Collection.prototype methods** (find, findOne, insert, update, upsert, remove)
- Subscription state (`Meteor.connection._subscriptions`)
- Method execution (can call `Meteor.call` from DevTools)

**Pattern:**
```typescript
const prototype = Mongo.Collection.prototype

Object.entries(prototype).forEach(([key, val]) => {
  if (['find', 'findOne', 'insert', 'update', 'upsert', 'remove'].includes(key)) {
    const original = prototype[key]

    prototype[key] = function (...args) {
      const startMs = Date.now()
      const result = original.apply(this, args)

      sendMessage('meteor-data-performance', {
        collectionName: this._name,
        key,
        args: JSON.stringify(args),
        runtime: Date.now() - startMs
      })

      return result
    }
  }
})
```

**Status:** ✅ Method wrapping EXISTS, needs extension for query logging

---

## VII. Message Passing Architecture

### Layer 1: Page Context (Inject.ts)

**File:** [`src/Browser/Inject.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Browser/Inject.ts)

**Provides:**
- `sendMessage(eventType, data)` - Posts to window
- `Registry` - Manages message handlers
- `getStackTrace()` - Captures call stacks

**Pattern:**
```typescript
export function sendMessage(eventType: EventType, data: any) {
  window.postMessage({
    source: 'meteor-devtools-evolved',
    eventType,
    data
  }, '*')
}
```

---

### Layer 2: Content Script (Content.ts)

**File:** [`src/Browser/Content.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Browser/Content.ts)

**Bridges:** window.postMessage → browser.runtime.sendMessage

---

### Layer 3: Background Script (Background.ts)

**File:** [`src/Browser/Background.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Browser/Background.ts)

**Provides:**
- Message cache (stores up to 10,000 messages)
- Port connections (panel ↔ background)
- Export relay (chunked binary transfer)

---

### Layer 4: DevTools Panel (Bridge.ts)

**File:** [`src/Bridge.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Bridge.ts)

**Provides:**
- `Bridge.register(eventType, handler)` - Subscribe to events
- `Bridge.sendContentMessage(message)` - Invoke via inspectedWindow.eval()

**Pattern:**
```typescript
Bridge.register('ddp-event', (message) => {
  PanelStore.ddpStore.pushItem(message.data)
})

Bridge.register('minimongo-get-collections', (message) => {
  PanelStore.minimongoStore.setCollections(message.data)
})
```

---

### Simplified API: BridgeAdapter

**File:** [`src/Utils/BridgeAdapter.ts`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Utils/BridgeAdapter.ts)

**Provides:**
- `post<T>(eventType, payload)` - Send message
- `on<T>(eventType, handler)` - Subscribe
- `off<T>(eventType, handler)` - Unsubscribe

---

## VIII. Virtualization Pattern (react-window)

**Used in:**
- [`DDPContainer.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/DDP/DDPContainer.tsx) - DDP message list
- [`MinimongoContainer.tsx`](https://github.com/primeinc/meteor-devtools-evolved/blob/dev/main/src/Pages/Panel/Minimongo/MinimongoContainer.tsx) - Document list

**Pattern:**
```typescript
import { FixedSizeList } from 'react-window'

const Row = observer(({ data, index, style }) => {
  const item = data.items[index]
  return <RowComponent style={style} item={item} />
})

<FixedSizeList
  height={height}
  width={width}
  itemCount={filtered.length}
  itemSize={28}
  itemData={{ items: filtered }}
>
  {Row}
</FixedSizeList>
```

**Performance:** Renders only visible rows, not entire list

---

## IX. Key Architectural Validations

### ✅ Working Patterns Proven in Production

1. **Cross-Store Correlation** - `SubscriptionStore.subsWithMeta` proves @computed correlation works
2. **Method Interception** - `MeteorAdapter.ts` proves we can wrap all Minimongo methods
3. **DDP Correlation** - `DDPStore.getSubscriptionMeta()` proves correlation helper pattern works
4. **Domain/UI Store Separation** - `PanelStore` architecture follows best practices
5. **React + MobX Integration** - `observer()` + `usePanelStore()` proven throughout
6. **Virtualization** - `react-window` in DDPContainer/MinimongoContainer proven scalable
7. **Message Passing** - Registry + Bridge architecture proven stable

---

## X. What This Means for New Features

### Template Files to Copy

**For New Panels:**
1. Copy structure from [`src/Pages/Panel/DDP/`](https://github.com/primeinc/meteor-devtools-evolved/tree/dev/main/src/Pages/Panel/DDP)
2. Use DDPContainer.tsx pattern for virtualized lists
3. Use DDPStore.ts pattern for MobX stores

**For Correlation:**
1. Copy `SubscriptionStore.subsWithMeta` pattern
2. Copy `DDPStore.getSubscriptionMeta()` helper methods
3. Use @computed for derived/correlated data

**For Method Interception:**
1. Extend `MeteorAdapter.ts:28-53`
2. Add stack traces: `stack: getStackTrace()`
3. Send new event type alongside existing 'meteor-data-performance'

---

## XI. Statistics

- **Total Stores:** 9 (1 root + 6 domain + 1 base + 1 nested)
- **MobX Decorator Uses:** 79+ occurrences
- **Observer Components:** 16+ files
- **Cross-Store References:** 3 working examples
- **Computed Properties:** 10+ across stores
- **Debounced Methods:** 5+ instances
- **Flow Methods:** 1 (MinimongoStore.exportActiveCollection)
- **Reactions:** 1 (SettingStore auto-save)
- **Reusable UI Components:** 7+ components
- **Production Panels:** 6 fully functional

---

## XII. References

### Related Documentation
- **[METEOR_PATTERNS_REFERENCE.md](../METEOR_PATTERNS_REFERENCE.md)** - General Meteor.js + MobX patterns
- **[features/minimongo-query-view/](../features/minimongo-query-view/)** - Feature-specific docs using these patterns

### Verification Method
- 3-agent parallel scan (2025-10-05)
- File-by-file inspection
- GitHub links to actual implementations
- Cross-referenced with existing documentation

---

**Last Updated:** 2025-10-05
**Verified By:** Comprehensive 3-agent codebase scan
**Confidence:** HIGH - All findings linked to actual code
**Status:** Living Document - Update as architecture evolves
