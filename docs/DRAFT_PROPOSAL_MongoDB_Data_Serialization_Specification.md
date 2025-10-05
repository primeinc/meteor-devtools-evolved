# DRAFT PROPOSAL

**Status:** Under Review
**Proposed:** 2025-01-15
**Authors:** Engineering Team
**Review Period:** TBD

---

# MongoDB/Meteor Data Serialization & Schema Generation Specification

**Reference Documentation for Meteor DevTools Evolved**

**Version:** 1.0
**Date:** 2025-01-15
**Status:** Authoritative Reference (Proposed)
**Audience:** Engineering team, contributors, external integrators

---

## Table of Contents

* **Part I: Core Serialization Formats**
  * Section 1: Meteor EJSON (ejson@2.2.3)
  * Section 2: MongoDB Extended JSON v2
  * Section 3: Critical Incompatibilities
* **Part II: Data Interchange & Tooling**
  * Section 4: mongoimport Specification
  * Section 5: MongoDB Shell (mongosh) Scripts
* **Part III: Schema & Type Generation**
  * Section 6: JSON Schema (Draft 2020-12)
  * Section 7: TypeScript Interfaces
  * Section 8: Mongoose Schemas
* **Part IV: Implementation Strategy**
  * Section 9: Transformation Pipeline
  * Section 10: Implementation Checklist

---

## Part I: Core Serialization Formats

### Section 1: Meteor EJSON (ejson@2.2.3)

#### 1.1 Purpose & Philosophy

Meteor EJSON extends standard JSON to support types critical for full-stack Meteor applications:

* Date objects
* Binary data (Uint8Array)
* Special numbers (NaN, Infinity, -Infinity)
* RegExp objects
* User-defined types (via EJSON.addType())

**Design Goal:** All EJSON is valid JSON, ensuring compatibility with standard parsers.

#### 1.2 Type Serialization Format

| Type      | JavaScript     | EJSON Format                          | Example                              |
|-----------|----------------|---------------------------------------|--------------------------------------|
| Date      | Date           | `{"$date": <milliseconds>}`           | `{"$date": 1705318200000}`           |
| Binary    | Uint8Array     | `{"$binary": "<base64>"}`             | `{"$binary": "AQID"}`                |
| ObjectId  | Mongo.ObjectID | `{"$oid": "<hex>"}`                   | `{"$oid": "507f1f77bcf86cd799439011"}` |
| RegExp    | RegExp         | `{"$regexp": "...", "$options": "..."}` | `{"$regexp": "test", "$options": "i"}` |
| Undefined | undefined      | `{"$undefined": true}`                | `{"$undefined": true}`               |

#### 1.3 The $escape Pattern

**Purpose:** Distinguish between EJSON type annotations and literal objects with the same keys.

**Triggers when:**
1. Object has a single key
2. Key is a reserved EJSON type identifier ($date, $binary, $oid, etc.)
3. Value is NOT the corresponding special type

**Example:**

```javascript
// Literal object with $date key:
{$date: 10000}

// EJSON serialization:
{"$escape": {"$date": 10000}}

// Nested EJSON inside escaped object:
{"$escape": {"$date": {"$date": 32491}}}
// Represents: {$date: <actual Date object>}
```

#### 1.4 Round-Trip Guarantees

**Contract:**

```javascript
EJSON.equals(v, EJSON.parse(EJSON.stringify(v))) === true
```

For all EJSON-supported types, serialization is lossless.

#### 1.5 Version Stability

* **EJSON format:** Unchanged across Meteor 1.x, 2.x, 3.x
* **Package version:** ejson@2.2.3 (stable, no recent updates)
* **Location changes:** Meteor 3 moved EJSON to `window.Package.ejson.EJSON`

---

### Section 2: MongoDB Extended JSON v2

#### 2.1 Purpose

Official specification for representing BSON documents in JSON format while preserving type information.

#### 2.2 Version Evolution

| Version      | MongoDB | Description                                               |
|--------------|---------|-----------------------------------------------------------|
| v1 (legacy)  | < 4.2   | Strict mode (JSON-compliant) + Shell mode (JS-like)       |
| v2 (current) | ≥ 4.2   | Canonical mode (lossless) + Relaxed mode (human-readable) |

Modern tools (mongoimport, mongosh) default to v2.

#### 2.3 Canonical vs Relaxed Modes

| Aspect  | Canonical                                   | Relaxed                                    |
|---------|---------------------------------------------|--------------------------------------------|
| Purpose | Machine-to-machine, lossless                | Human-readable, web APIs                   |
| Date    | `{"$date": {"$numberLong": "1705318200000"}}` | `{"$date": "2024-01-15T10:30:00.000Z"}`    |
| Int32   | `{"$numberInt": "10"}`                      | `10`                                       |
| Int64   | `{"$numberLong": "9223372036854775807"}`    | `9223372036854775807` (or wrapped if unsafe) |
| Double  | `{"$numberDouble": "10.5"}`                 | `10.5`                                     |

**Why strings in Canonical?**
JavaScript number type (IEEE 754 double) cannot represent full 64-bit integers without precision loss. Strings guarantee lossless representation.

#### 2.4 Complete Type Mappings

| BSON Type     | Canonical                                                    | Relaxed                      |
|---------------|--------------------------------------------------------------|------------------------------|
| ObjectId      | `{"$oid": "507f..."}`                                        | `{"$oid": "507f..."}`        |
| Date          | `{"$date": {"$numberLong": "..."}}`                          | `{"$date": "ISO-8601"}`      |
| Int32         | `{"$numberInt": "123"}`                                      | `123`                        |
| Int64         | `{"$numberLong": "123"}`                                     | `123` (if safe)              |
| Double        | `{"$numberDouble": "10.5"}`                                  | `10.5`                       |
| Decimal128    | `{"$numberDecimal": "123.45"}`                               | `{"$numberDecimal": "123.45"}` |
| Binary        | `{"$binary": {"base64": "...", "subType": "00"}}`            | Same                         |
| RegExp        | `{"$regularExpression": {"pattern": "...", "options": "..."}}` | Same                       |
| Timestamp     | `{"$timestamp": {"t": N, "i": N}}`                           | Same                         |
| MinKey/MaxKey | `{"$minKey": 1}` / `{"$maxKey": 1}`                          | Same                         |

---

### Section 3: Critical Incompatibilities

#### 3.1 Does Meteor EJSON match MongoDB Extended JSON?

**NO.** They are distinct, incompatible specifications.

#### 3.2 Side-by-Side Comparison

| Type       | Meteor EJSON                          | MongoDB ExtJSON v2 Canonical                     | MongoDB ExtJSON v2 Relaxed            |
|------------|---------------------------------------|--------------------------------------------------|---------------------------------------|
| Date       | `{"$date": 1705318200000}`            | `{"$date": {"$numberLong": "1705318200000"}}`    | `{"$date": "2024-01-15T10:30:00.000Z"}` |
| ObjectId   | `{"$oid": "507f..."}` ✅              | `{"$oid": "507f..."}` ✅                         | `{"$oid": "507f..."}` ✅              |
| Binary     | `{"$binary": "AQID"}`                 | `{"$binary": {"base64": "AQID", "subType": "00"}}` | Same                                |
| RegExp     | `{"$regexp": "...", "$options": "..."}` | `{"$regularExpression": {...}}`                | Same                                  |
| Int32      | `10`                                  | `{"$numberInt": "10"}`                           | `10` ✅                               |
| Int64      | `9007199254740992` ⚠️                 | `{"$numberLong": "9007199254740992"}`            | `9007199254740992`                    |
| Decimal128 | ❌ Not supported                      | `{"$numberDecimal": "123.45"}`                   | Same                                  |
| Undefined  | `{"$undefined": true}`                | ❌ Not represented                               | ❌ Not represented                    |

#### 3.3 Critical Differences Explained

**Date Format:**
* EJSON: Direct numeric timestamp (efficient for JS)
* ExtJSON Canonical: Nested $numberLong (lossless for BSON)
* ExtJSON Relaxed: ISO 8601 string (human-readable)

**Large Integers (>2^53):**
* EJSON: Precision loss (uses JS number)
* ExtJSON: Preserved via string representation

**Binary Data:**
* EJSON: Ambiguous (no subType)
* ExtJSON: Explicit subType field

**RegExp Key Name:**
* EJSON: `$regexp`
* ExtJSON: `$regularExpression`

#### 3.4 Transformation Requirements

To use Meteor data with MongoDB tools, you MUST:

1. **Convert Date format:**

```javascript
// EJSON → ExtJSON Canonical
{"$date": 1705318200000}
→ {"$date": {"$numberLong": "1705318200000"}}

// EJSON → ExtJSON Relaxed
{"$date": 1705318200000}
→ {"$date": "2024-01-15T10:30:00.000Z"}
```

2. **Add Binary subType:**

```javascript
{"$binary": "AQID"}
→ {"$binary": {"base64": "AQID", "subType": "00"}}
```

3. **Rename RegExp key:**

```javascript
{"$regexp": "test", "$options": "i"}
→ {"$regularExpression": {"pattern": "test", "options": "i"}}
```

4. **Handle large integers:**
   * Detect numbers > Number.MAX_SAFE_INTEGER
   * Convert to string for $numberLong

---

## Part II: Data Interchange & Tooling

### Section 4: mongoimport Specification

#### 4.1 NDJSON Format Requirements

**Structure:**
* One JSON object per line
* Each line separated by `\n` (Line Feed, 0x0A)
* Trailing newline after last document: **RECOMMENDED to omit** (conservative approach, both work)

**Example:**

```
{"_id":"1","name":"Alice"}
{"_id":"2","name":"Bob"}
```

**Not:**

```
{"_id":"1","name":"Alice"}
{"_id":"2","name":"Bob"}
<-- Avoid empty line here
```

**Encoding:** UTF-8 only. Other encodings will fail.

**Line Endings:**
* Recommended: LF (`\n`) only
* Accepted: CRLF (`\r\n`) on Windows
* Why LF only: Maximum cross-platform compatibility

#### 4.2 Extended JSON Support

**Q: Does mongoimport support all Extended JSON types?**
A: Yes. It's the canonical tool for this format.

**Q: Does mongoimport validate Meteor EJSON?**
A: No. It only understands MongoDB Extended JSON v2 (or v1 with --legacy).

**Example of FAILURE:**

```bash
# This EJSON file:
{"createdAt": {"$date": 1705318200000}}

# Will cause:
$ mongoimport --db test --collection users --file export.ndjson
Failed: error unmarshaling document: $date value must be a string or object
```

**Correct for mongoimport (Canonical):**

```json
{"createdAt": {"$date": {"$numberLong": "1705318200000"}}}
```

**Correct for mongoimport (Relaxed):**

```json
{"createdAt": {"$date": "2024-01-15T10:30:00.000Z"}}
```

#### 4.3 Command-Line Options

**Format Control:**

```bash
# NDJSON (default):
mongoimport --db test --collection users --file data.ndjson

# JSON Array:
mongoimport --db test --collection users --file data.json --jsonArray

# Legacy Extended JSON v1:
mongoimport --db test --collection users --file legacy.json --legacy
```

**Conflict Handling (--mode):**

```bash
# insert (default): Skip duplicates, continue
mongoimport --mode insert

# upsert: Replace matching documents
mongoimport --mode upsert --upsertFields _id

# merge: Update only specified fields
mongoimport --mode merge --upsertFields _id
```

**Collection Behavior:**
* If collection doesn't exist: Created automatically
* If _id conflicts with --mode insert: Document skipped, error logged

---

### Section 5: MongoDB Shell (mongosh) Scripts

#### 5.1 BSON Type Constructors

**Critical:** mongosh uses string arguments for large numbers!

| Type       | Constructor                      | Example                              |
|------------|----------------------------------|--------------------------------------|
| ObjectId   | `ObjectId(<hex>)`                | `ObjectId("507f1f77bcf86cd799439011")` |
| Date       | `ISODate(<iso>)` or `new Date(<ms>)` | `ISODate("2024-01-15T10:30:00.000Z")` |
|            |                                  | `new Date(1705318200000)` ✅         |
| Binary     | `BinData(<subtype>, <base64>)`   | `BinData(0, "AQID")`                 |
| Int32      | `NumberInt(<string>)`            | `NumberInt("123")`                   |
| Int64      | `NumberLong(<string>)` ⚠️        | `NumberLong("9223372036854775807")`  |
| Decimal128 | `NumberDecimal(<string>)`        | `NumberDecimal("123.45")`            |

**Q: Does ISODate() accept milliseconds?**
A: Yes, via `new Date(ms)` which is wrapped by ISODate.

**Example:**

```javascript
// ✅ CORRECT:
db.users.insertOne({
  _id: ObjectId("507f1f77bcf86cd799439011"),
  createdAt: new Date(1705318200000),
  balance: NumberLong("9223372036854775807"),
  data: BinData(0, "AQID")
});

// ❌ WRONG (precision loss):
db.users.insertOne({
  balance: NumberLong(9223372036854775807)  // Passed as number!
});
```

#### 5.2 String Escaping

**Complete escape sequence list:**
* `\\` - Backslash (MUST escape first!)
* `\"` - Double quote
* `\'` - Single quote
* `\n` - Newline
* `\r` - Carriage return
* `\t` - Tab
* `\b` - Backspace
* `\f` - Form feed
* `\0` - Null character
* `\uXXXX` - Unicode (BMP)
* `\u{XXXXX}` - Unicode (supplementary planes)

**Critical: Escape order matters!**

```javascript
// ❌ WRONG ORDER:
str.replace(/"/g, '\\"').replace(/\\/g, '\\\\')
// Input: C:\test"
// Step 1: C:\test\"
// Step 2: C:\\test\\" (WRONG!)

// ✅ CORRECT ORDER:
str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
// Input: C:\test"
// Step 1: C:\\test"
// Step 2: C:\\test\" (CORRECT!)
```

#### 5.3 Collection Name Security

**Reserved characters:**
* Cannot contain `$` (except system.$ collections)
* Cannot contain null character (`\0`)
* Should not use `system.` prefix

**Q: Can collection names clash with reserved words?**
A: Yes! Examples: `version`, `stats`, `auth`, `collection`

**Solution: Always use db.getCollection()**

```javascript
// ❌ DANGEROUS (if collection named "version"):
db.version.insertOne({...})  // Calls db.version() method!

// ✅ SAFE:
db.getCollection("version").insertOne({...})

// ✅ SAFE for generated code:
db.getCollection("users; DROP DATABASE").insertOne({...})
// String is NOT evaluated as code
```

---

## Part III: Schema & Type Generation

### Section 6: JSON Schema (Draft 2020-12)

#### 6.1 Version Declaration

**Required first line:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {...}
}
```

**⚠️ MongoDB Incompatibility:**
* MongoDB's `$jsonSchema` uses Draft 4 only
* Generated Draft 2020-12 schemas CANNOT be used for server-side validation
* Use only for client-side validation, documentation, code generation

#### 6.2 BSON Type Representations

**Q: Is `format: "objectid"` a standard format?**
A: No! Not in any JSON Schema specification.

**Standard formats:** date-time, date, email, uuid, uri, hostname, etc.

**Correct ObjectId representation:**

```json
{
  "_id": {
    "type": "string",
    "pattern": "^[0-9a-fA-F]{24}$",
    "description": "MongoDB ObjectId (24-char hex string)"
  }
}
```

**Date representation:**

```json
{
  "createdAt": {
    "type": "string",
    "format": "date-time",
    "description": "ISO 8601 date-time"
  }
}
```

**Binary representation:**

```json
{
  "avatar": {
    "type": "string",
    "contentEncoding": "base64",
    "description": "Base64-encoded binary data"
  }
}
```

#### 6.3 Union Types

**Q: anyOf vs oneOf - which to use?**
A: Use `anyOf` for unions.

* **anyOf:** Valid if matches ≥1 subschemas (OR logic)
* **oneOf:** Valid if matches exactly 1 subschema (XOR logic)

**Example:**

```json
{
  "status": {
    "anyOf": [
      {"type": "string", "enum": ["active", "inactive"]},
      {"type": "null"}
    ]
  }
}
```

**Q: `{"type": ["string", "null"]}` vs `{"anyOf": [...]}`?**
A: Functionally equivalent for simple types.

```json
// Concise (preferred for simple nullable):
{"type": ["string", "null"]}

// Verbose (allows complex constraints):
{
  "anyOf": [
    {"type": "string", "maxLength": 100},
    {"type": "null"}
  ]
}
```

Use the array form for simple nullables, `anyOf` for complex unions.

---

### Section 7: TypeScript Interfaces

#### 7.1 Primitive Mappings

| JSON/BSON | TypeScript                       |
|-----------|----------------------------------|
| string    | string                           |
| number    | number                           |
| boolean   | boolean                          |
| null      | null                             |
| array     | T[] or Array<T>                  |
| object    | Record<string, any> or interface |

#### 7.2 MongoDB-Specific Types

**Q: How to represent ObjectId in TypeScript?**
A: Import from mongodb or mongoose package.

```typescript
// ✅ CORRECT (Node.js driver):
import { ObjectId } from 'mongodb';

interface User {
  _id: ObjectId;
  name: string;
}

// ✅ CORRECT (Mongoose):
import { Types } from 'mongoose';

interface User {
  _id: Types.ObjectId;
  name: string;
}

// ❌ WRONG:
interface User {
  _id: string;  // Loses type information!
}
```

**Other types:**

```typescript
import { ObjectId, Binary, Decimal128, Timestamp } from 'mongodb';

interface Document {
  _id: ObjectId;
  data: Binary;
  balance: Decimal128;
  created: Date;
}
```

#### 7.3 interface vs type

**Q: When to use interface vs type alias?**
A: Use `interface` for objects, `type` for unions/primitives.

```typescript
// ✅ Use interface for object shapes:
interface User {
  _id: ObjectId;
  name: string;
  age?: number;  // Optional
}

interface Admin extends User {
  permissions: string[];
}

// ✅ Use type for unions:
type Status = 'active' | 'inactive' | 'pending';
type ID = string | number;

// ✅ Use type for complex compositions:
type UserOrAdmin = User | Admin;
```

**Why interface for objects?**
* Better error messages
* Can be extended/merged
* More performant in TSC
* Familiar OOP syntax

#### 7.4 Untyped Fields

**Q: unknown vs any for dynamic data?**
A: Use `unknown` for type safety.

```typescript
// ✅ CORRECT (forces type checking):
interface DynamicDoc {
  metadata: unknown;
}

function processDoc(doc: DynamicDoc) {
  // Must check type before use:
  if (typeof doc.metadata === 'object' && doc.metadata !== null) {
    // Now safe to access
  }
}

// ❌ WRONG (disables type checking):
interface DynamicDoc {
  metadata: any;
}

function processDoc(doc: DynamicDoc) {
  doc.metadata.anything.goes;  // No errors, runtime crash!
}
```

**Rule:** Use `unknown` unless migrating legacy code or interfacing with truly untyped JS.

---

### Section 8: Mongoose Schemas

#### 8.1 SchemaType Mappings

| BSON Type  | Mongoose SchemaType       |
|------------|---------------------------|
| String     | String                    |
| Number     | Number                    |
| Date       | Date                      |
| Buffer     | Buffer                    |
| Boolean    | Boolean                   |
| ObjectId   | Schema.Types.ObjectId     |
| Decimal128 | Schema.Types.Decimal128   |
| Map        | Schema.Types.Map          |
| Mixed      | Schema.Types.Mixed        |
| Array      | [T] or [SchemaDefinition] |

**Example:**

```javascript
const UserSchema = new Schema({
  _id: Schema.Types.ObjectId,
  name: { type: String, required: true },
  age: { type: Number, min: 0 },
  createdAt: { type: Date, default: Date.now },
  balance: Schema.Types.Decimal128,
  metadata: Schema.Types.Mixed  // Untyped
});
```

#### 8.2 Mixed vs Nested Schema

**Q: When to use Schema.Types.Mixed vs nested schema?**
A: Use nested schema whenever structure is known.

```javascript
// ✅ CORRECT (known structure):
const UserSchema = new Schema({
  profile: {
    firstName: String,
    lastName: String,
    age: Number
  }
});

// ❌ WRONG (use only when truly unstructured):
const UserSchema = new Schema({
  profile: Schema.Types.Mixed
});
```

**Why avoid Mixed?**
* No validation
* No type casting
* No automatic change detection (requires markModified())
* Loses Mongoose benefits

**When to use Mixed:**
* Truly dynamic/arbitrary data
* Config blobs
* User-provided JSON

**Critical gotcha:**

```javascript
const user = await User.findOne({_id: userId});

// ❌ WRONG (change not saved):
user.metadata.someField = 'new value';
await user.save();  // Change ignored!

// ✅ CORRECT:
user.metadata.someField = 'new value';
user.markModified('metadata');  // Required!
await user.save();
```

#### 8.3 Union Types

**Q: Does Mongoose support union types?**
A: Not for primitives. Use Discriminators for object unions.

**Primitive unions (not supported):**

```javascript
// ❌ Cannot do this:
const schema = new Schema({
  value: String | Number  // No native support
});

// ✅ Workaround:
const schema = new Schema({
  value: Schema.Types.Mixed  // Accept anything
});
```

**Object unions (use Discriminators):**

```javascript
// Base schema:
const EventSchema = new Schema({
  eventType: String,
  timestamp: Date
}, { discriminatorKey: 'eventType' });

const Event = mongoose.model('Event', EventSchema);

// Specific event types:
const ClickEvent = Event.discriminator('click', new Schema({
  x: Number,
  y: Number
}));

const PageViewEvent = Event.discriminator('pageview', new Schema({
  url: String,
  referrer: String
}));

// All stored in same collection, differentiated by eventType
```

#### 8.4 Schema Options

**Q: Should we generate schemas with timestamps: true?**
A: YES! Highly recommended best practice.

```javascript
const schema = new Schema({
  // ... fields
}, {
  timestamps: true  // Adds createdAt & updatedAt
});

// Mongoose automatically manages:
// - createdAt: Set on insert
// - updatedAt: Updated on every save
```

**Other useful options:**

```javascript
{
  timestamps: true,
  versionKey: '__v',       // Optimistic locking
  strict: true,            // Ignore fields not in schema
  collection: 'users'      // Explicit collection name
}
```

---

## Part IV: Implementation Strategy

### Section 9: Transformation Pipeline

#### 9.1 Three-Stage Process

```
┌─────────────────────────────────────────────────────┐
│ Stage 1: EXTRACTION                                  │
│ - Fetch from Minimongo/MongoDB                      │
│ - Native JS objects (Date, ObjectId instances)      │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│ Stage 2: TRANSFORMATION                              │
│ - EJSON → MongoDB Extended JSON v2                  │
│ - Date: numeric → Canonical/Relaxed                 │
│ - ObjectId: ensure {"$oid": "..."}                  │
│ - Binary: add base64 wrapper + subType              │
│ - RegExp: $regexp → $regularExpression              │
│ - Handle $escape unwrapping                         │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│ Stage 3: SERIALIZATION                               │
│ - mongoimport: NDJSON (no trailing newline)         │
│ - mongosh: JavaScript with constructors             │
│ - CSV: Flatten + RFC 4180 quoting                   │
│ - JSON: Pretty-print with proper encoding           │
└─────────────────────────────────────────────────────┘
```

#### 9.2 Transformation Rules

**Date:**

```javascript
// Input (EJSON):
{createdAt: {$date: 1705318200000}}

// Output (Canonical):
{createdAt: {$date: {$numberLong: "1705318200000"}}}

// Output (Relaxed):
{createdAt: {$date: "2024-01-15T10:30:00.000Z"}}
```

**Large Integers:**

```javascript
// Detect:
if (Number.isSafeInteger(value)) {
  // Safe as number
} else {
  // Must convert to $numberLong string
}
```

**Binary:**

```javascript
// Input:
{data: {$binary: "AQID"}}

// Output:
{data: {$binary: {base64: "AQID", subType: "00"}}}
```

**RegExp:**

```javascript
// Input:
{pattern: {$regexp: "test", $options: "i"}}

// Output:
{pattern: {$regularExpression: {pattern: "test", options: "i"}}}
```

#### 9.3 Schema Generation Engine

**Single source of truth:**

```
Input Documents (sample) → Schema Analyzer
   │
   ├─→ TypeScript Interface
   ├─→ JSON Schema (Draft 2020-12)
   └─→ Mongoose Schema
```

**Inference logic:**

1. Collect all unique field names
2. For each field, analyze values:
   * All same type → Single type
   * Mixed types → Union (anyOf)
   * Sometimes absent → Optional
3. Detect BSON types:
   * `{$date: ...}` → Date
   * `{$oid: ...}` → ObjectId
   * `{$binary: ...}` → Binary
4. Generate format-specific output

---

### Section 10: Implementation Checklist

#### ✅ EJSON → Extended JSON

- [ ] Date: Convert numeric → Canonical `{$numberLong}` or Relaxed ISO string
- [ ] Binary: Add `{base64: ..., subType: "00"}` wrapper
- [ ] RegExp: Rename `$regexp` → `$regularExpression`
- [ ] Large integers: Detect > MAX_SAFE_INTEGER, convert to string
- [ ] $escape: Unwrap and treat as literal object

#### ✅ mongoimport Output

- [ ] Format: Valid NDJSON (one object per line)
- [ ] Line endings: LF (`\n`) only
- [ ] Trailing newline: Recommended to omit (conservative approach)
- [ ] Encoding: UTF-8
- [ ] Extended JSON: v2 Canonical or Relaxed (not EJSON!)
- [ ] Test: Actually run mongoimport on generated file

#### ✅ mongosh Script Generation

- [ ] Date: Use `ISODate()` or `new Date(milliseconds)`
- [ ] ObjectId: Use `ObjectId(hexString)`
- [ ] Binary: Use `BinData(subtype, base64String)`
- [ ] Large integers: Use `NumberLong(stringValue)` with STRING arg
- [ ] Collection names: Use `db.getCollection(name)` always
- [ ] String escaping: Backslashes first, then quotes, then special chars
- [ ] Test: Actually run `mongosh < script.js`

#### ✅ JSON Schema

- [ ] Declare: `"$schema": "https://json-schema.org/draft/2020-12/schema"`
- [ ] ObjectId: `type: "string"` + `pattern: "^[0-9a-fA-F]{24}$"`
- [ ] Date: `type: "string"` + `format: "date-time"`
- [ ] Binary: `type: "string"` + `contentEncoding: "base64"`
- [ ] Unions: Use `anyOf` not `oneOf`
- [ ] Document: NOT compatible with MongoDB $jsonSchema (Draft 4 only)

#### ✅ TypeScript

- [ ] Import types: `import { ObjectId } from 'mongodb'`
- [ ] Use `interface` for object shapes
- [ ] Use `type` for unions
- [ ] Untyped fields: Use `unknown` not `any`
- [ ] Optional fields: Use `field?: Type`
- [ ] Test: Run `tsc --noEmit` on generated file

#### ✅ Mongoose

- [ ] ObjectId: Use `Schema.Types.ObjectId`
- [ ] Mixed: Use `Schema.Types.Mixed` sparingly (document why)
- [ ] Nested objects: Use nested schema when structure known
- [ ] Options: Include `timestamps: true`
- [ ] Test: Require generated schema, validate with Mongoose

---

## Appendix: Quick Reference Tables

### A. Format Compatibility Matrix

| Source               | mongoimport | mongosh | JSON Schema | TypeScript | Mongoose |
|----------------------|-------------|---------|-------------|------------|----------|
| Meteor EJSON         | ❌          | ❌      | ⚠️          | ⚠️         | ⚠️       |
| ExtJSON v2 Canonical | ✅          | ✅      | ❌          | ⚠️         | ⚠️       |
| ExtJSON v2 Relaxed   | ✅          | ✅      | ❌          | ⚠️         | ⚠️       |

⚠️ = Requires transformation
❌ = Incompatible
✅ = Direct compatibility

### B. Critical Gotchas

| Issue                      | Problem                             | Solution                    |
|----------------------------|-------------------------------------|-----------------------------|
| EJSON Date in mongoimport  | Expects `{$numberLong}` or ISO string | Transform to ExtJSON format |
| Large integers             | JS number loses precision           | Use string representation   |
| String escaping order      | Wrong order corrupts data           | Escape backslashes FIRST    |
| Trailing newline in NDJSON | May cause parse errors (rare)       | Recommended: no trailing newline |
| Collection name "version"  | Clashes with `db.version()` method  | Use `db.getCollection()`    |
| NumberLong(number)         | Precision loss in mongosh           | Use `NumberLong(string)`    |
| Mongoose Mixed changes     | Not detected automatically          | Call `markModified()`       |
| TypeScript `any`           | Disables type checking              | Use `unknown`               |

### C. External Resources

**Official Specifications:**
* Meteor EJSON: https://docs.meteor.com/api/ejson.html
* MongoDB Extended JSON: https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/
* NDJSON: http://ndjson.org/
* JSON Schema: https://json-schema.org/draft/2020-12/schema
* TypeScript: https://www.typescriptlang.org/docs/handbook/

**Tools:**
* mongoimport: https://www.mongodb.com/docs/database-tools/mongoimport/
* mongosh: https://www.mongodb.com/docs/mongodb-shell/
* Mongoose: https://mongoosejs.com/docs/

---

## END OF SPECIFICATION

---
