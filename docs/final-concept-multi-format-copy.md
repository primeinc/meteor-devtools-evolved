# Final Concept: Multi-Format Copy Operations for Document Detail Drawer

**Status:** Design Document
**Version:** 1.0
**Last Updated:** 2025-10-03
**Author:** will@4pp.dev

---

## Executive Summary

Replace the single "Copy" button in the document detail drawer with a comprehensive multi-format copy system that supports developer workflows including MongoDB operations, schema generation, TypeScript interfaces, and complete DDP protocol message reconstruction with client-side ID resolution tracking.

---

## Table of Contents

1. [Current State](#current-state)
2. [Proposed Copy Formats](#proposed-copy-formats)
3. [DDP Message Reconstruction](#ddp-message-reconstruction)
4. [Client-Side ID Resolution Tracking](#client-side-id-resolution-tracking)
5. [Implementation Architecture](#implementation-architecture)
6. [Phased Rollout](#phased-rollout)
7. [Technical Challenges](#technical-challenges)
8. [Future Enhancements](#future-enhancements)

---

## Current State

### Existing Behavior
- Single "Copy" button in document detail drawer footer
- Copies raw JSON representation of document to clipboard
- No format options or customization
- No context about document origin or lifecycle

### User Pain Points
- Manual formatting required for common use cases (Mongo shell, TypeScript)
- No visibility into DDP message history
- Cannot reconstruct how document was created/modified
- Missing tools for debugging optimistic UI and ID resolution
- Context switching between devtools and code editor

---

## Proposed Copy Formats

### Format 1: Raw JSON
**Pretty-printed JSON with 2-space indentation**

**Use Cases:**
- General purpose documentation
- API testing
- Human-readable inspection

**Example:**
```json
{
  "_id": "9mzXj3qYhfXgyPYhw",
  "emails": [
    {
      "address": "user@example.com",
      "verified": true
    }
  ],
  "user_profile": {
    "first_name": "Chris",
    "last_name": "Ciotti"
  }
}
```

**Implementation:** `JSON.stringify(document, null, 2)`

---

### Format 2: Compact JSON
**Minified single-line JSON**

**Use Cases:**
- curl commands
- Inline test data
- Minimizing payload size
- Command-line arguments

**Example:**
```json
{"_id":"9mzXj3qYhfXgyPYhw","emails":[{"address":"user@example.com","verified":true}],"user_profile":{"first_name":"Chris","last_name":"Ciotti"}}
```

**Implementation:** `JSON.stringify(document)`

---

### Format 3: MongoDB Shell - Insert
**Ready-to-paste `insertOne()` command with collection context**

**Use Cases:**
- Local database testing
- Data seeding scripts
- Bug reproduction
- Documentation examples

**Example:**
```javascript
db.users.insertOne({
  "_id": "9mzXj3qYhfXgyPYhw",
  "emails": [
    {
      "address": "user@example.com",
      "verified": true
    }
  ],
  "user_profile": {
    "first_name": "Chris",
    "last_name": "Ciotti"
  }
})
```

**Implementation:**
```typescript
export function toMongoInsert(collectionName: string, document: any): string {
  const json = JSON.stringify(document, null, 2)
  return `db.${collectionName}.insertOne(${json})`
}
```

---

### Format 4: MongoDB Shell - Query
**Generates query to retrieve this specific document by `_id`**

**Use Cases:**
- Testing find operations
- Debugging queries
- Quick lookups
- Documentation

**Example:**
```javascript
db.users.findOne({ _id: "9mzXj3qYhfXgyPYhw" })
```

**Implementation:**
```typescript
export function toMongoQuery(collectionName: string, document: any): string {
  return `db.${collectionName}.findOne({ _id: "${document._id}" })`
}
```

---

### Format 5: Inferred JSON Schema
**JSON Schema (draft 2020-12) inferred from document structure**

**Use Cases:**
- API documentation generation
- Validation setup
- Schema design
- Contract definitions

**Example:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": true,
  "properties": {
    "_id": { "type": "string" },
    "emails": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "address": { "type": "string" },
          "verified": { "type": "boolean" }
        },
        "required": ["address", "verified"]
      }
    },
    "user_profile": {
      "type": "object",
      "properties": {
        "first_name": { "type": "string" },
        "last_name": { "type": "string" }
      },
      "required": ["first_name", "last_name"]
    }
  },
  "required": ["_id", "emails", "user_profile"]
}
```

**Implementation:** Leverage existing `inferSchema()` from `src/Pages/Panel/Minimongo/services/ExportService.ts`

```typescript
export function toJSONSchema(document: any): string {
  const schema = inferSchema([document], () => {}, new AbortController().signal)
  return JSON.stringify(schema, null, 2)
}
```

---

### Format 6: TypeScript Interface
**Auto-generated TypeScript interface from document structure**

**Use Cases:**
- Quick type definition creation
- Client-side development
- Code generation
- Type safety

**Example:**
```typescript
interface User {
  _id: string;
  emails: Array<{
    address: string;
    verified: boolean;
  }>;
  user_profile: {
    first_name: string;
    last_name: string;
  };
  commission_schedules?: any[];
  feed_id?: string;
  presence?: {
    online: boolean;
    last_active: string;
  };
  assigned_branches?: string[];
  st_license_ids?: any[];
  role_id?: string;
  archived?: boolean;
  company_job_title?: string;
  phone?: string;
  profile_image?: Record<string, unknown>;
  profile_image_thumb?: Record<string, unknown>;
  email_types?: any[];
}
```

**Implementation:**
```typescript
export function toTypeScriptInterface(
  collectionName: string,
  document: any
): string {
  const interfaceName = capitalize(collectionName.replace(/s$/, ''))
  const fields = Object.entries(document).map(([key, value]) => {
    const type = inferTypeScriptType(value)
    return `  ${key}: ${type};`
  })

  return `interface ${interfaceName} {\n${fields.join('\n')}\n}`
}

function inferTypeScriptType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'
    const itemType = inferTypeScriptType(value[0])
    return `Array<${itemType}>`
  }
  const t = typeof value
  if (t === 'object') {
    const props = Object.entries(value).map(([k, v]) => {
      return `${k}: ${inferTypeScriptType(v)}`
    }).join('; ')
    return `{ ${props} }`
  }
  return t // 'string' | 'number' | 'boolean'
}
```

---

### Format 7: DDP Message Reconstruction
**Reconstructs the DDP protocol message(s) representing this document's lifecycle**

**Use Cases:**
- DDP protocol debugging
- Understanding data flow
- Testing subscriptions
- Learning Meteor internals
- Debugging optimistic UI
- ID resolution troubleshooting

See [DDP Message Reconstruction](#ddp-message-reconstruction) section for complete specification.

---

## DDP Message Reconstruction

### Architecture Overview

DDP message reconstruction requires tracking **three message categories**:

1. **Subscription Messages** - Track `sub`/`ready`/`nosub` lifecycle
2. **Data Messages** - Track `added`/`changed`/`removed` with provenance
3. **Method Messages** - Track `method`/`result`/`updated` with ID resolution

### Tier 1: Synthetic Reconstruction (No Tracking)

**Immediate implementation, zero memory overhead**

Generate what the DDP `added` message **would look like** based on current document state.

**Limitations:**
- No historical context
- Cannot show modifications
- Missing subscription/method correlation
- No ID resolution information

**Example Output:**
```json
{
  "msg": "added",
  "collection": "users",
  "id": "9mzXj3qYhfXgyPYhw",
  "fields": {
    "emails": [
      {
        "address": "user@example.com",
        "verified": true
      }
    ],
    "user_profile": {
      "first_name": "Chris",
      "last_name": "Ciotti"
    },
    "archived": true,
    "company_job_title": "Marketer"
  },
  "_meta": {
    "note": "Reconstructed from current state. May not reflect original message."
  }
}
```

**Implementation:**
```typescript
export function toDDPMessage(collectionName: string, document: any): string {
  const { _id, ...fields } = document

  const ddpMessage = {
    msg: "added",
    collection: collectionName,
    id: _id,
    fields,
    _meta: {
      note: "Reconstructed from current state. May not reflect original message."
    }
  }

  return JSON.stringify(ddpMessage, null, 2)
}
```

---

### Tier 2: Enhanced Historical Tracking

**Complete document lifecycle reconstruction with full provenance**

#### A) Subscription Message Tracking

**Data Structure:**
```typescript
interface SubscriptionTracking {
  subscriptionId: string        // Client-generated sub ID
  name: string                  // Subscription name (e.g., 'users.active')
  params: any[]                 // Subscription parameters
  status: 'pending' | 'ready' | 'stopped'

  timestamps: {
    subscribed: number          // When 'sub' was sent
    ready?: number              // When 'ready' was received
    stopped?: number            // When 'nosub' was received
  }

  documentsAdded: Set<string>   // Collection:ID pairs added by this sub
  error?: {                     // If subscription failed
    error: string
    reason?: string
    message?: string
  }
}
```

**Tracking Points:**
- `DDPInjector` intercepts outgoing `sub` messages → create tracking entry
- Intercepts incoming `ready` messages → mark subscription ready
- Intercepts incoming `nosub` messages → mark stopped, capture error
- When `added` arrives, correlate with active subscriptions

**Use Cases:**
- Show which subscription(s) provided this document
- Debug overlapping subscriptions
- Understand why document disappeared (subscription stopped)

---

#### B) Data Message Tracking

**Data Structure:**
```typescript
interface DataMessageTracking {
  collection: string
  id: string

  lifecycle: {
    added?: {
      timestamp: number
      fields: Record<string, any>
      subscriptionId?: string   // Which sub caused this
      methodId?: string         // Or which method created it
      message: any              // Original DDP message
    }

    changes: Array<{
      timestamp: number
      fields?: Record<string, any>
      cleared?: string[]
      subscriptionId?: string
      methodId?: string
      message: any
    }>

    removed?: {
      timestamp: number
      subscriptionId?: string
      methodId?: string
      message: any
    }
  }

  currentState?: any            // Current document (if still exists)
}
```

**Tracking Points:**
- Intercept `added` → create lifecycle.added entry
- Intercept `changed` → append to lifecycle.changes
- Intercept `removed` → set lifecycle.removed
- Correlate with active subscriptions/methods to determine provenance

**Storage Strategy:**
```typescript
class DataMessageIndex {
  private index = new Map<string, DataMessageTracking>()

  // Key format: "collection:id"
  private key(collection: string, id: string): string {
    return `${collection}:${id}`
  }

  trackAdded(msg: DDPAddedMessage, source?: SourceInfo) {
    const k = this.key(msg.collection, msg.id)
    this.index.set(k, {
      collection: msg.collection,
      id: msg.id,
      lifecycle: {
        added: {
          timestamp: Date.now(),
          fields: msg.fields,
          subscriptionId: source?.subscriptionId,
          methodId: source?.methodId,
          message: msg
        },
        changes: []
      }
    })
  }

  trackChanged(msg: DDPChangedMessage, source?: SourceInfo) {
    const k = this.key(msg.collection, msg.id)
    const tracking = this.index.get(k)

    if (tracking) {
      tracking.lifecycle.changes.push({
        timestamp: Date.now(),
        fields: msg.fields,
        cleared: msg.cleared,
        subscriptionId: source?.subscriptionId,
        methodId: source?.methodId,
        message: msg
      })
    }
  }

  getHistory(collection: string, id: string): DataMessageTracking | undefined {
    return this.index.get(this.key(collection, id))
  }
}
```

**Memory Management:**
- LRU cache with configurable size (default: 10,000 documents)
- Clear entries for removed documents after 5 minutes
- Persist to IndexedDB for cross-session debugging (optional)

---

#### C) Method Message Tracking & ID Resolution

**The Critical Missing Piece**

**Data Structure:**
```typescript
interface MethodTracking {
  // Request
  methodId: string              // Client-generated method call ID
  methodName: string            // e.g., 'users.insert'
  params: any[]
  randomSeed?: string           // Used for client-side ID generation

  timestamps: {
    called: number              // When 'method' was sent
    stubExecuted?: number       // When client stub completed
    resultReceived?: number     // When 'result' was received
    updatesComplete?: number    // When 'updated' was received
  }

  // Client-side stub execution
  stubResults?: {
    documentsCreated: Array<{
      collection: string
      clientId: string          // ID generated by stub (temporary)
      document: any
      timestamp: number
    }>

    documentsModified: Array<{
      collection: string
      id: string
      changes: {
        fields?: Record<string, any>
        cleared?: string[]
      }
      timestamp: number
    }>

    documentsRemoved: Array<{
      collection: string
      id: string
      timestamp: number
    }>
  }

  // Server response
  result?: {
    timestamp: number
    returnValue?: any
    error?: {
      error: string
      reason?: string
      message?: string
    }
  }

  // ID reconciliation
  idResolution?: Array<{
    collection: string
    clientId: string            // Temporary ID from stub
    serverId: string            // Real ID from server
    resolvedAt: number
    confidence: 'exact' | 'fuzzy'  // How we matched them
  }>

  // Confirmation of writes
  updated?: {
    timestamp: number
  }
}
```

---

### Client-Side ID Resolution Tracking

**The Problem:**

When a method creates a document:
1. Client stub generates temporary ID (e.g., `"client_abc123"`)
2. Document appears in Minimongo with client ID
3. Server executes method, generates real ID (e.g., `"9mzXj3qYhfXgyPYhw"`)
4. Server sends `added` message with real ID
5. Meteor **silently replaces** client ID with server ID in Minimongo
6. **We lose track of the fact that these are the same document**

**The Solution: Multi-Stage Correlation**

#### Stage 1: Capture Stub Execution

Hook into Minimongo to snapshot changes during stub execution:

```typescript
class StubExecutionCapture {
  private beforeSnapshot: MinimongoSnapshot
  private afterSnapshot: MinimongoSnapshot

  captureStub(methodCall: MethodMessage): StubResults {
    // Snapshot Minimongo state before stub
    this.beforeSnapshot = this.snapshotMinimongo()

    // Meteor automatically executes stub (we don't control this)
    // But we can hook into Minimongo's internal observers
    const changes = new StubChangeTracker()
    const handle = Meteor.connection._mongo_livedata_collections.forEach(coll => {
      coll._docs.observe({
        added: (doc) => changes.trackAdded(coll.name, doc),
        changed: (newDoc, oldDoc) => changes.trackChanged(coll.name, newDoc, oldDoc),
        removed: (doc) => changes.trackRemoved(coll.name, doc)
      })
    })

    // Wait for stub to complete (synchronous in Meteor)
    // Then clean up observers
    handle.stop()

    return {
      documentsCreated: changes.added,
      documentsModified: changes.changed,
      documentsRemoved: changes.removed
    }
  }

  private snapshotMinimongo(): MinimongoSnapshot {
    const collections = Meteor.connection._mongo_livedata_collections
    const snapshot = new Map<string, Map<string, any>>()

    Object.keys(collections).forEach(collName => {
      const coll = collections[collName]
      const docs = new Map<string, any>()

      coll.find({}).forEach(doc => {
        docs.set(doc._id, cloneDeep(doc))
      })

      snapshot.set(collName, docs)
    })

    return snapshot
  }
}
```

#### Stage 2: Correlate Server Messages

When `added` message arrives from server, correlate with pending stub documents:

```typescript
class IDResolutionTracker {
  private pendingMethods = new Map<string, MethodTracking>()

  trackMethodCall(msg: MethodMessage) {
    const tracking: MethodTracking = {
      methodId: msg.id,
      methodName: msg.method,
      params: msg.params,
      randomSeed: msg.randomSeed,
      timestamps: { called: Date.now() },
      stubResults: this.captureStubExecution(msg)
    }

    this.pendingMethods.set(msg.id, tracking)
  }

  trackAddedMessage(msg: DDPAddedMessage): SourceInfo {
    // Check all pending methods for matching stub documents
    for (const [methodId, method] of this.pendingMethods) {
      if (!method.stubResults) continue

      for (const stubDoc of method.stubResults.documentsCreated) {
        if (stubDoc.collection !== msg.collection) continue

        // Attempt correlation
        const match = this.correlateDocuments(stubDoc.document, msg.fields)

        if (match.confidence === 'exact' || match.confidence === 'fuzzy') {
          // Found ID resolution!
          method.idResolution = method.idResolution || []
          method.idResolution.push({
            collection: msg.collection,
            clientId: stubDoc.clientId,
            serverId: msg.id,
            resolvedAt: Date.now(),
            confidence: match.confidence
          })

          return {
            type: 'method',
            methodId,
            methodName: method.methodName
          }
        }
      }
    }

    // No method correlation found - must be from subscription
    return { type: 'subscription', subscriptionId: this.inferSubscription(msg) }
  }

  private correlateDocuments(
    clientDoc: any,
    serverFields: any
  ): { confidence: 'exact' | 'fuzzy' | 'none' } {
    // Exact match: All fields identical except _id and server-added fields
    const clientFields = { ...clientDoc }
    delete clientFields._id

    const serverFieldsFiltered = { ...serverFields }
    // Remove common server-added fields
    delete serverFieldsFiltered.createdAt
    delete serverFieldsFiltered.updatedAt

    if (deepEqual(clientFields, serverFieldsFiltered)) {
      return { confidence: 'exact' }
    }

    // Fuzzy match: 80%+ field overlap with identical values
    const commonKeys = intersection(
      Object.keys(clientFields),
      Object.keys(serverFieldsFiltered)
    )

    const matchingValues = commonKeys.filter(key =>
      deepEqual(clientFields[key], serverFieldsFiltered[key])
    ).length

    const overlapRatio = matchingValues / Math.max(
      Object.keys(clientFields).length,
      Object.keys(serverFieldsFiltered).length
    )

    if (overlapRatio >= 0.8) {
      return { confidence: 'fuzzy' }
    }

    return { confidence: 'none' }
  }
}
```

#### Stage 3: Track Result & Updated

Complete the method lifecycle:

```typescript
trackResultMessage(msg: DDPResultMessage) {
  const method = this.pendingMethods.get(msg.id)
  if (!method) return

  method.result = {
    timestamp: Date.now(),
    returnValue: msg.result,
    error: msg.error
  }
  method.timestamps.resultReceived = Date.now()
}

trackUpdatedMessage(msg: DDPUpdatedMessage) {
  msg.methods.forEach(methodId => {
    const method = this.pendingMethods.get(methodId)
    if (!method) return

    method.updated = { timestamp: Date.now() }
    method.timestamps.updatesComplete = Date.now()

    // Method lifecycle complete - can move to archive or keep in memory
  })
}
```

---

### Complete Reconstruction Output Example

**For a document created via method call with ID resolution:**

```json
{
  "documentId": "9mzXj3qYhfXgyPYhw",
  "collection": "users",

  "lifecycle": {
    "origin": "method",

    "method": {
      "msg": "method",
      "id": "method_1",
      "method": "users.insert",
      "params": [{"name": "Chris", "email": "user@example.com"}],
      "randomSeed": "abc123def456",
      "timestamp": "2025-10-03T08:52:11.234Z"
    },

    "clientStub": {
      "msg": "added",
      "collection": "users",
      "id": "client_temp_xyz",
      "fields": {
        "name": "Chris",
        "email": "user@example.com"
      },
      "timestamp": "2025-10-03T08:52:11.245Z",
      "note": "Client-side optimistic UI - temporary ID"
    },

    "serverResponse": {
      "msg": "added",
      "collection": "users",
      "id": "9mzXj3qYhfXgyPYhw",
      "fields": {
        "name": "Chris",
        "email": "user@example.com",
        "createdAt": "2025-10-03T08:52:11.340Z"
      },
      "timestamp": "2025-10-03T08:52:11.456Z",
      "note": "Real server ID - replaced client ID in Minimongo"
    },

    "idResolution": {
      "clientId": "client_temp_xyz",
      "serverId": "9mzXj3qYhfXgyPYhw",
      "resolvedAt": "2025-10-03T08:52:11.456Z",
      "confidence": "exact",
      "timeDelta": "211ms"
    },

    "methodResult": {
      "msg": "result",
      "id": "method_1",
      "result": "9mzXj3qYhfXgyPYhw",
      "timestamp": "2025-10-03T08:52:11.478Z"
    },

    "writesComplete": {
      "msg": "updated",
      "methods": ["method_1"],
      "timestamp": "2025-10-03T08:52:11.502Z",
      "note": "Server confirms all database writes from this method are complete"
    }
  },

  "modifications": [
    {
      "msg": "changed",
      "collection": "users",
      "id": "9mzXj3qYhfXgyPYhw",
      "fields": {"archived": true},
      "timestamp": "2025-10-03T09:15:22.103Z",
      "source": {
        "type": "subscription",
        "subscriptionId": "sub_users_all",
        "subscriptionName": "users.all"
      }
    }
  ],

  "currentState": {
    "_id": "9mzXj3qYhfXgyPYhw",
    "name": "Chris",
    "email": "user@example.com",
    "archived": true,
    "createdAt": "2025-10-03T08:52:11.340Z"
  },

  "activeSubscriptions": [
    {
      "id": "sub_users_all",
      "name": "users.all",
      "params": [],
      "status": "ready",
      "providesThisDocument": true
    }
  ]
}
```

---

## Implementation Architecture

### File Structure

```
src/Pages/Panel/Minimongo/
├── components/
│   ├── DocumentDetailDrawer.tsx      # UI component (existing)
│   └── CopyFormatMenu.tsx            # NEW: Button group/dropdown
│
├── services/
│   ├── CopyFormats.ts                # NEW: All format generators
│   │   ├── toRawJSON()
│   │   ├── toCompactJSON()
│   │   ├── toMongoInsert()
│   │   ├── toMongoQuery()
│   │   ├── toJSONSchema()
│   │   ├── toTypeScript()
│   │   └── toDDPMessage()
│   │
│   ├── ClipboardService.ts           # NEW: Clipboard + toast
│   │
│   └── ExportService.ts              # Existing (reuse inferSchema)
│
├── tracking/                          # NEW: DDP tracking system
│   ├── SubscriptionTracker.ts        # Track sub/ready/nosub
│   ├── DataMessageIndex.ts           # Track added/changed/removed
│   ├── MethodTracker.ts              # Track method/result/updated
│   ├── IDResolutionTracker.ts        # Correlate client/server IDs
│   └── DDPReconstructionService.ts   # Assemble complete lifecycle
│
src/Injectors/
└── DDPInjector.ts                     # MODIFY: Hook into tracking
```

### Core Services

#### `CopyFormats.ts`
```typescript
export interface CopyFormat {
  id: string
  label: string
  icon: IconName
  description: string
  handler: (collection: string, document: any) => string
}

export const COPY_FORMATS: CopyFormat[] = [
  {
    id: 'raw-json',
    label: 'Raw JSON',
    icon: 'code',
    description: 'Pretty-printed JSON',
    handler: toRawJSON
  },
  {
    id: 'compact-json',
    label: 'Compact JSON',
    icon: 'compressed',
    description: 'Minified single-line JSON',
    handler: toCompactJSON
  },
  {
    id: 'mongo-insert',
    label: 'MongoDB Insert',
    icon: 'database',
    description: 'db.collection.insertOne(...)',
    handler: toMongoInsert
  },
  {
    id: 'mongo-query',
    label: 'MongoDB Query',
    icon: 'search',
    description: 'db.collection.findOne(...)',
    handler: toMongoQuery
  },
  {
    id: 'json-schema',
    label: 'JSON Schema',
    icon: 'diagram-tree',
    description: 'Inferred schema (draft 2020-12)',
    handler: toJSONSchema
  },
  {
    id: 'typescript',
    label: 'TypeScript Interface',
    icon: 'code-block',
    description: 'Auto-generated TS interface',
    handler: toTypeScript
  },
  {
    id: 'ddp-message',
    label: 'DDP Message',
    icon: 'exchange',
    description: 'Protocol message reconstruction',
    handler: toDDPMessage
  }
]
```

#### `ClipboardService.ts`
```typescript
export class ClipboardService {
  static async copy(text: string, formatLabel: string) {
    try {
      await navigator.clipboard.writeText(text)
      this.showToast(`Copied as ${formatLabel}`)
    } catch (e) {
      this.showErrorToast('Failed to copy to clipboard')
    }
  }

  private static showToast(message: string) {
    AppToaster.show({
      message,
      intent: 'success',
      icon: 'tick',
      timeout: 2000
    })
  }
}
```

#### `CopyFormatMenu.tsx`
```tsx
export const CopyFormatMenu: React.FC<{
  collection: string
  document: any
}> = ({ collection, document }) => {
  const [lastUsed, setLastUsed] = useLocalStorage('copy-format', 'raw-json')

  const handleCopy = async (format: CopyFormat) => {
    const text = format.handler(collection, document)
    await ClipboardService.copy(text, format.label)
    setLastUsed(format.id)
  }

  const defaultFormat = COPY_FORMATS.find(f => f.id === lastUsed) || COPY_FORMATS[0]

  return (
    <ButtonGroup>
      <Button
        icon={defaultFormat.icon}
        text={defaultFormat.label}
        onClick={() => handleCopy(defaultFormat)}
      />
      <Popover
        content={
          <Menu>
            {COPY_FORMATS.map(format => (
              <MenuItem
                key={format.id}
                icon={format.icon}
                text={format.label}
                label={format.description}
                onClick={() => handleCopy(format)}
              />
            ))}
          </Menu>
        }
      >
        <Button icon="caret-down" />
      </Popover>
    </ButtonGroup>
  )
}
```

---

## Phased Rollout

### Phase 0: MVP (Week 1)
**Goal:** Replace single copy button with multi-format menu

**Deliverables:**
- ✅ `CopyFormats.ts` with basic formats (Raw, Compact, Mongo Insert, Mongo Query)
- ✅ `ClipboardService.ts` with toast notifications
- ✅ `CopyFormatMenu.tsx` component
- ✅ Integration into `DocumentDetailDrawer.tsx`
- ✅ User preference persistence (localStorage)

**No tracking required** - all formats work with current document state

---

### Phase 1: Schema Generation (Week 2)
**Goal:** Add schema-based copy formats

**Deliverables:**
- ✅ JSON Schema format (leverage `inferSchema`)
- ✅ TypeScript Interface format
- ✅ Unit tests for type inference
- ✅ Documentation

**No tracking required**

---

### Phase 2: Subscription Tracking (Week 3-4)
**Goal:** Track which subscriptions provide each document

**Deliverables:**
- ✅ `SubscriptionTracker.ts` - Track sub/ready/nosub lifecycle
- ✅ Modify `DDPInjector.ts` to call tracker on subscription messages
- ✅ Store subscription metadata in `DataMessageIndex`
- ✅ Show subscription info in document detail drawer
- ✅ DDP Message format shows subscription source (if available)

**Memory impact:** ~100 bytes per active subscription (~10KB for 100 subs)

---

### Phase 3: Data Message History (Week 5-6)
**Goal:** Track document lifecycle (added/changed/removed)

**Deliverables:**
- ✅ `DataMessageIndex.ts` - Index all data messages by collection:id
- ✅ Modify `DDPInjector.ts` to call index on data messages
- ✅ Implement LRU cache (10,000 document limit)
- ✅ Show modification history in document detail drawer
- ✅ DDP Message format shows complete history

**Memory impact:** ~1KB per tracked document (10MB for 10,000 docs)

---

### Phase 4: Method Tracking (Week 7-10)
**Goal:** Track method calls and basic correlation

**Deliverables:**
- ✅ `MethodTracker.ts` - Track method/result/updated
- ✅ Modify `DDPInjector.ts` to intercept method messages
- ✅ Basic method→document correlation (without ID resolution)
- ✅ Show method info in document detail drawer

**Memory impact:** ~500 bytes per method call

---

### Phase 5: ID Resolution (Week 11-14)
**Goal:** Full client-side ID resolution tracking

**Deliverables:**
- ✅ `IDResolutionTracker.ts` - Correlate client/server IDs
- ✅ Stub execution capture via Minimongo observers
- ✅ Fuzzy matching algorithm for document correlation
- ✅ Complete lifecycle reconstruction in DDP Message format
- ✅ Visual timeline view in document detail drawer

**Memory impact:** +200 bytes per method that creates documents

---

### Phase 6: Polish & Optimization (Week 15-16)
**Goal:** Production-ready

**Deliverables:**
- ✅ Performance optimization (lazy loading, pagination)
- ✅ IndexedDB persistence (optional, user-configurable)
- ✅ Export history to JSON
- ✅ Settings panel for tracking configuration
- ✅ Comprehensive documentation
- ✅ User guide / tutorial

---

## Technical Challenges

### Challenge 1: Stub Execution Capture
**Problem:** Meteor stubs execute synchronously before we can set up observers

**Solution:** Use `Meteor.connection._stream.on('message')` to intercept method calls BEFORE stub execution, set up observers, wait for stub, tear down observers

**Risk:** Fragile - relies on Meteor internals

---

### Challenge 2: Document Correlation
**Problem:** How to match client stub document with server's `added` message when IDs differ?

**Solutions:**
1. **Exact match:** All fields identical (except _id, createdAt, updatedAt)
2. **Fuzzy match:** 80%+ field overlap with same values
3. **Timing heuristic:** Server `added` arrives within 500ms of method call
4. **randomSeed correlation:** If same seed used, IDs should match (verify)

**Risk:** False positives/negatives in fuzzy matching

---

### Challenge 3: Memory Management
**Problem:** Tracking everything forever = memory leak

**Solutions:**
- LRU cache with configurable size limits
- Clear removed documents after 5 minutes
- User-configurable tracking toggle (disable for production)
- Periodic garbage collection (every 60 seconds)
- IndexedDB offloading for cold data

**Risk:** Missing important historical data if evicted too soon

---

### Challenge 4: Performance Impact
**Problem:** Tracking every message adds overhead to DDP processing

**Solutions:**
- Debounce/throttle index updates
- Use Web Workers for heavy correlation logic
- Lazy initialization (only track when devtools open)
- Sampling mode (track 1 in N messages for high-volume apps)

**Risk:** Slowing down user's app in development

---

### Challenge 5: Cross-Session Persistence
**Problem:** Tracking data lost on page reload

**Solutions:**
- Optional IndexedDB persistence
- Export/import tracking data as JSON
- Session recovery from DDP message replay (if server supports)

**Risk:** Stale data from previous session causing confusion

---

## Future Enhancements

### Enhancement 1: Visual Timeline View
Interactive timeline showing document lifecycle with method calls, subscriptions, and state changes over time

### Enhancement 2: Diff View
Show side-by-side diff of document state at different points in time

### Enhancement 3: Replay Mode
Replay DDP messages to reconstruct exact state at any point

### Enhancement 4: Export to Test Case
Generate Jest/Mocha test cases from actual DDP message sequences

### Enhancement 5: GraphQL Converter
Convert Minimongo documents to GraphQL queries/mutations

### Enhancement 6: Custom Format Templates
Allow users to define custom copy formats via templates

---

## Success Metrics

### Adoption
- % of users who use non-default copy format (target: 40%)
- Most popular formats (track usage)
- Feature discovery rate (% who find dropdown within 1 week)

### Performance
- DDP message processing overhead < 5ms per message
- Memory usage < 20MB for typical app with tracking enabled
- No user-reported slowdowns in development

### Quality
- Zero false positives in ID resolution correlation
- < 5% false negatives (missed correlations)
- 100% test coverage for all format generators

---

## Open Questions

1. Should we track DDP messages from before devtools was opened? (Requires message buffering in content script)
2. How long to keep method tracking data? (Cleanup policy)
3. Should tracking be opt-in or opt-out? (Privacy concern for production debugging)
4. Persist to IndexedDB by default or only on user request?
5. Should we support exporting tracking data for sharing with team?
6. How to handle very large documents (>1MB) in copy operations?

---

## Conclusion

This multi-format copy system transforms the document detail drawer from a simple JSON viewer into a comprehensive debugging and development tool. The phased approach allows us to deliver immediate value (Phase 0-1) while building toward advanced features (Phase 4-5) that provide unprecedented visibility into Meteor's DDP protocol and optimistic UI behavior.

The ID resolution tracking in particular solves a long-standing pain point for Meteor developers: understanding why optimistic UI sometimes shows incorrect data before correcting itself, and debugging race conditions in method calls.

**Total estimated effort:** 16 weeks (1 developer)
**MVP delivery:** 2 weeks
**Full feature set:** 16 weeks
