# MongoDB Export Formats - Design Specification

**Feature:** MongoDB Export Formats with EJSON Support
**Status:** 🔴 Implementation In Progress (Critical Issues)
**Priority:** P1 (Core Feature)
**Last Updated:** 2025-10-04

---

## Executive Summary

This feature provides 8 production-ready export formats for Minimongo data with proper MongoDB type preservation (EJSON). The goal is **zero-manual-fix** workflows where exported data can be directly imported into MongoDB or used to generate production code.

**Critical Requirements:**
1. ✅ EJSON type preservation (Date, ObjectID, Binary)
2. ❌ **BROKEN:** Nested object handling in schema formats
3. ❌ **MISSING:** Comprehensive test suite
4. ⚠️ Partial: Error handling and validation

---

## The 8 Export Formats

### 1. MongoDB Import NDJSON (`mongo-import-ndjson`)

**Purpose:** Line-delimited JSON for `mongoimport` command
**Extension:** `.ndjson`
**MIME Type:** `application/x-ndjson`

**Specification:**
- One JSON document per line (newline-delimited)
- Uses `EJSON.stringify()` to preserve MongoDB types
- NO pretty formatting (compact for file size)
- NO trailing newline after last document

**Expected Output:**
```ndjson
{"_id":{"$oid":"507f1f77bcf86cd799439011"},"name":"John","createdAt":{"$date":"2024-01-15T10:30:00.000Z"},"score":95}
{"_id":{"$oid":"507f1f77bcf86cd799439012"},"name":"Jane","createdAt":{"$date":"2024-01-16T14:20:00.000Z"},"score":87}
```

**Import Command:**
```bash
mongoimport --db mydb --collection users --file export.ndjson
```

**Edge Cases:**
- Empty collection → empty file (0 bytes)
- Single document → single line, no trailing newline
- Documents with newlines in strings → EJSON escapes them

---

### 2. MongoDB Import Array (`mongo-import-array`)

**Purpose:** JSON array for `mongoimport --jsonArray`
**Extension:** `.json`
**MIME Type:** `application/json`

**Specification:**
- Valid JSON array: `[doc1, doc2, ...]`
- Uses `EJSON.stringify()` with optional pretty formatting
- Proper comma separation between documents

**Expected Output (Pretty):**
```json
[
  {
    "_id": {"$oid": "507f1f77bcf86cd799439011"},
    "name": "John",
    "createdAt": {"$date": "2024-01-15T10:30:00.000Z"},
    "nested": {
      "field": "value"
    }
  },
  {
    "_id": {"$oid": "507f1f77bcf86cd799439012"},
    "name": "Jane",
    "createdAt": {"$date": "2024-01-16T14:20:00.000Z"}
  }
]
```

**Expected Output (Compact):**
```json
[{"_id":{"$oid":"507f1f77bcf86cd799439011"},"name":"John"},{"_id":{"$oid":"507f1f77bcf86cd799439012"},"name":"Jane"}]
```

**Import Command:**
```bash
mongoimport --db mydb --collection users --file export.json --jsonArray
```

---

### 3. MongoDB Compass (`mongo-compass`)

**Purpose:** Pretty JSON for MongoDB Compass GUI import
**Extension:** `.json`
**MIME Type:** `application/json`

**Specification:**
- Identical to `mongo-import-array` but ALWAYS pretty-printed
- 2-space indentation
- Optimized for human readability

---

### 4. MongoDB Shell (`mongo-shell`)

**Purpose:** Executable JavaScript for MongoDB shell
**Extension:** `.js`
**MIME Type:** `application/javascript`

**Specification:**
- Generates `db.collectionName.insertMany([...])` statement
- Converts EJSON to MongoDB shell constructors:
  - `{"$oid": "..."}` → `ObjectId("...")`
  - `{"$date": "..."}` → `ISODate("...")`
  - `{"$binary": "..."}` → `BinData(0, "...")`
- Proper JavaScript string escaping (quotes, newlines, **backslashes**)
- Collection name sanitization (no shell injection)

**Expected Output:**
```javascript
db.users.insertMany([
  {
    _id: ObjectId("507f1f77bcf86cd799439011"),
    name: "John",
    createdAt: ISODate("2024-01-15T10:30:00.000Z"),
    path: "C:\\Users\\john",  // ✅ Backslashes escaped
    nested: {
      field: "value"
    },
    tags: ["tag1", "tag2"]
  },
  {
    _id: ObjectId("507f1f77bcf86cd799439012"),
    name: "Jane",
    bio: "Line 1\nLine 2"  // ✅ Newlines escaped
  }
]);
```

**String Escaping Rules:**
```javascript
// MUST escape in order:
1. Backslashes: \ → \\
2. Quotes: " → \"
3. Newlines: \n → \\n
4. Tabs: \t → \\t

// Example:
value = 'C:\Users\test\nfile.txt'
escaped = 'C:\\Users\\test\\nfile.txt'
```

**Security:**
- Collection name MUST be validated (alphanumeric + underscore only)
- OR use bracket notation: `db['collection-name'].insertMany([...])`

**Execution:**
```bash
mongosh mydb < export.js
```

---

### 5. TypeScript Interfaces (`typescript`)

**Purpose:** Auto-generated TypeScript type definitions
**Extension:** `.ts`
**MIME Type:** `text/typescript`

**Specification:**

#### 🔴 CRITICAL: Nested Object Handling

**Current (BROKEN):**
```typescript
// ❌ INVALID TypeScript - dot notation in keys
export interface User {
  user.name: string;      // Syntax error!
  user.age: number;       // Syntax error!
  profile.bio: string;    // Syntax error!
}
```

**Expected (CORRECT):**
```typescript
// ✅ VALID TypeScript - nested structure
export interface User {
  user: {
    name: string;
    age: number;
  };
  profile: {
    bio: string;
  };
}
```

#### Type Detection Rules

```typescript
// EJSON Patterns
{"$oid": "..."}      → string           // ObjectID as string in TS
{"$date": "..."}     → Date             // Date object
{"$binary": "..."}   → Buffer           // Binary data

// JavaScript Types
instanceof Date      → Date
typeof x === 'string' → string
typeof x === 'number' → number
typeof x === 'boolean' → boolean
x === null           → null
Array.isArray(x)     → Array<T>
typeof x === 'object' → Record<string, any> | nested interface
```

#### Optional vs Required Fields

```typescript
// Analysis across all documents:
// - Field present in ALL docs → required
// - Field present in SOME docs → optional (?)
// - Field has multiple types → union type (string | number)

// Example with 3 documents:
// doc1: { name: "John", age: 30 }
// doc2: { name: "Jane", age: 25, email: "jane@example.com" }
// doc3: { name: "Bob", age: "unknown" }

export interface User {
  name: string;              // Required (100% presence)
  age: string | number;      // Required (100% presence, mixed types)
  email?: string;            // Optional (33% presence)
}
```

#### Nested Array Handling

```typescript
// Nested arrays should infer item type from samples
tags: string[]                    // All strings
scores: number[]                  // All numbers
mixed: (string | number)[]        // Mixed types
users: Array<{name: string}>      // Array of objects
```

#### Collection Name → Interface Name

```typescript
// PascalCase conversion with validation
'users'          → 'Users'
'user-profiles'  → 'UserProfiles'
'user_profiles'  → 'UserProfiles'
'123invalid'     → '_123invalid'    // ✅ Prepend _ for numeric start
''               → 'Document'        // Default fallback
```

**Full Example Output:**
```typescript
/**
 * Auto-generated TypeScript interfaces
 * Source: users collection (247 documents)
 * Generated: 2024-01-15T10:30:00.000Z
 */

export interface Users {
  _id: string;                    // ObjectID
  name: string;
  email?: string;
  createdAt: Date;
  profile: {
    bio: string;
    age: number;
    settings: {
      theme: 'dark' | 'light';    // Enum inference from values
      notifications: boolean;
    };
  };
  tags: string[];
  metadata: Record<string, any>;  // Arbitrary object
}
```

---

### 6. Mongoose Schema (`mongoose`)

**Purpose:** Auto-generated Mongoose schema code
**Extension:** `.js`
**MIME Type:** `application/javascript`

**Specification:**

#### 🔴 CRITICAL: Nested Object Handling

**Current (BROKEN):**
```javascript
// ❌ INVALID Mongoose - dot notation not supported
const UserSchema = new mongoose.Schema({
  'user.name': { type: String },     // Mongoose doesn't support this!
  'user.age': { type: Number }
});
```

**Expected (CORRECT):**
```javascript
// ✅ VALID Mongoose - nested structure
const UserSchema = new mongoose.Schema({
  user: {
    name: { type: String, required: true },
    age: { type: Number, required: true }
  }
});
```

#### Type Mapping

```typescript
// EJSON → Mongoose Types
{"$oid": "..."}      → mongoose.Schema.Types.ObjectId
{"$date": "..."}     → Date
{"$binary": "..."}   → Buffer

// JavaScript → Mongoose Types
string               → String
number (integer)     → Number
number (float)       → Number
boolean              → Boolean
Date                 → Date
Array<T>             → [T]
object (arbitrary)   → mongoose.Schema.Types.Mixed
```

#### Integer vs Float Distinction

```javascript
// Unlike TypeScript, Mongoose CAN distinguish (via options):
age: { type: Number, integer: true }     // Optional: enforce integer
price: { type: Number }                   // Float allowed

// But by default, just use Number for both
```

#### Required vs Optional

```javascript
// Same logic as TypeScript:
// - 100% presence → required: true
// - <100% presence → required: false (or omit)

email: { type: String }                   // Optional (default)
email: { type: String, required: true }   // Required
email: { type: String, required: false }  // Explicit optional
```

#### Mixed Type Handling

```javascript
// If field has multiple types across documents:
// → Use Schema.Types.Mixed

// Example: age is sometimes number, sometimes string
age: { type: mongoose.Schema.Types.Mixed }  // Allows any type
```

**Full Example Output:**
```javascript
/**
 * Auto-generated Mongoose schema
 * Source: users collection (247 documents)
 * Generated: 2024-01-15T10:30:00.000Z
 */

const mongoose = require('mongoose');

const UsersSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  email: { type: String, required: false },
  createdAt: { type: Date, required: true },
  profile: {
    bio: { type: String, required: true },
    age: { type: Number, required: true },
    settings: {
      theme: { type: String, required: true },
      notifications: { type: Boolean, required: true }
    }
  },
  tags: [{ type: String }],
  metadata: { type: mongoose.Schema.Types.Mixed }
}, {
  collection: 'users',
  timestamps: false  // Disable auto timestamps since we have createdAt
});

module.exports = mongoose.model('Users', UsersSchema);
```

---

### 7. JSON Schema (`json-schema`)

**Purpose:** JSON Schema Draft 2020-12 specification
**Extension:** `.schema.json`
**MIME Type:** `application/schema+json`

**Specification:**

#### Type Mapping

```typescript
// EJSON → JSON Schema
{"$oid": "..."}      → { "type": "string", "format": "objectid" }
{"$date": "..."}     → { "type": "string", "format": "date-time" }
{"$binary": "..."}   → { "type": "string", "format": "binary" }

// JavaScript → JSON Schema
string               → { "type": "string" }
number (integer)     → { "type": "integer" }      // ✅ Distinguish from float
number (float)       → { "type": "number" }
boolean              → { "type": "boolean" }
null                 → { "type": "null" }
Array<T>             → { "type": "array", "items": {...} }
object               → { "type": "object", "properties": {...} }
```

#### Integer Detection

```javascript
// MUST differentiate integer vs float for JSON Schema
function isInteger(value: number): boolean {
  return Number.isInteger(value) && !Number.isNaN(value);
}

// Example:
42      → { "type": "integer" }
42.0    → { "type": "integer" }  // Same as 42
42.5    → { "type": "number" }
```

#### additionalProperties

```typescript
// Current: additionalProperties: true (too permissive)
// Should be: additionalProperties: false (strict validation)
// OR: Make it configurable via options

{
  "type": "object",
  "additionalProperties": false,  // ✅ Reject unknown fields
  "properties": {...}
}
```

**Full Example Output:**
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/users.schema.json",
  "title": "Users",
  "description": "Auto-generated from 247 document(s)",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "_id": {
      "type": "string",
      "format": "objectid"
    },
    "name": {
      "type": "string"
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "profile": {
      "type": "object",
      "properties": {
        "bio": { "type": "string" },
        "age": { "type": "integer" },
        "settings": {
          "type": "object",
          "properties": {
            "theme": {
              "type": "string",
              "enum": ["dark", "light"]
            },
            "notifications": { "type": "boolean" }
          },
          "required": ["theme", "notifications"]
        }
      },
      "required": ["bio", "age", "settings"]
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["_id", "name", "createdAt", "profile", "tags"]
}
```

---

### 8. CSV Export (`csv`)

**Purpose:** Flattened CSV for spreadsheet import
**Extension:** `.csv`
**MIME Type:** `text/csv`

**Specification:**

#### Flattening Rules

```typescript
// Nested objects → dot notation columns
{
  name: "John",
  profile: {
    bio: "Developer",
    age: 30
  }
}

// → CSV columns:
name,profile.bio,profile.age
John,Developer,30
```

#### Type Conversion

```typescript
// EJSON → CSV strings
{"$oid": "507f..."}      → "507f..."              // Just the ID
{"$date": "2024-01-15"}  → "2024-01-15T10:30:00.000Z"  // ISO string
{"$binary": "base64..."}  → "base64..."          // Base64 string

// Arrays → JSON string
["tag1", "tag2"]         → "[""tag1"",""tag2""]"  // Escaped JSON

// Objects → JSON string (⚠️ MUST use EJSON.stringify to preserve types)
{nested: "data"}         → "{""nested"":""data""}"
```

#### CSV Escaping Rules

```typescript
// RFC 4180 compliant escaping:
1. Values with commas → wrap in quotes
2. Values with quotes → escape quotes by doubling ("")
3. Values with newlines → wrap in quotes
4. Empty values → empty string (not "null")

// Examples:
"Hello, World"       → """Hello, World"""
"Say ""Hi"""         → """Say """"Hi""""""
"Line 1\nLine 2"     → """Line 1\nLine 2"""
null                 → ""
undefined            → ""
```

#### 🔴 BUG: EJSON in Objects

**Current (BROKEN):**
```typescript
// Objects are JSON.stringify'd, losing EJSON types
metadata: {createdAt: {"$date": "..."}}

// Becomes:
'"{""createdAt"":{""$date"":""...""}"'  // ❌ Lost EJSON pattern
```

**Expected (CORRECT):**
```typescript
// Use EJSON.stringify for nested objects
metadata: {createdAt: {"$date": "..."}}

// Should become:
'"{""createdAt"":{""$date"":{""$numberLong"":""1705315800000""}}}"'
```

**Full Example Output:**
```csv
_id,name,email,createdAt,profile.bio,profile.age,tags
507f1f77bcf86cd799439011,John,john@example.com,2024-01-15T10:30:00.000Z,Developer,30,"[""js"",""ts""]"
507f1f77bcf86cd799439012,Jane,jane@example.com,2024-01-16T14:20:00.000Z,"Designer, UX",25,"[""design"",""ux""]"
```

---

## EJSON Type Detection Specification

### Detection Priority Order

```typescript
// MUST check in this order to avoid false positives:

1. Check for null/undefined first
2. Check for EJSON patterns ($oid, $date, $binary)
3. Check for instanceof Date (before typeof object)
4. Check for Array.isArray (before typeof object)
5. Check primitives (string, number, boolean)
6. Finally check typeof object (nested objects)
```

### EJSON Pattern Recognition

```typescript
// ObjectID
function isObjectId(value: any): boolean {
  return value && typeof value === 'object' &&
         typeof value.$oid === 'string' &&
         /^[0-9a-f]{24}$/i.test(value.$oid);
}

// Date
function isEJSONDate(value: any): boolean {
  return value && typeof value === 'object' &&
         (typeof value.$date === 'string' ||
          typeof value.$date === 'number');
}

// Binary
function isEJSONBinary(value: any): boolean {
  return value && typeof value === 'object' &&
         typeof value.$binary === 'string';
}
```

### Type Detection Functions

Each format needs its own type detection:

```typescript
// TypeScript
function detectTypeScriptType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (isObjectId(value)) return 'string';        // ObjectID → string
  if (isEJSONDate(value)) return 'Date';
  if (value instanceof Date) return 'Date';
  if (isEJSONBinary(value)) return 'Buffer';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    const itemType = detectArrayItemType(value);
    return `${itemType}[]`;
  }
  return 'Record<string, any>';  // Nested object
}

// Mongoose
function detectMongooseType(value: any): string {
  if (isObjectId(value)) return 'mongoose.Schema.Types.ObjectId';
  if (isEJSONDate(value) || value instanceof Date) return 'Date';
  if (isEJSONBinary(value)) return 'Buffer';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'boolean') return 'Boolean';
  if (Array.isArray(value)) {
    const itemType = detectArrayItemType(value);
    return `[${itemType}]`;
  }
  return 'mongoose.Schema.Types.Mixed';
}

// JSON Schema
function detectJSONSchemaType(value: any): object {
  if (isObjectId(value)) return { type: 'string', format: 'objectid' };
  if (isEJSONDate(value) || value instanceof Date) {
    return { type: 'string', format: 'date-time' };
  }
  if (isEJSONBinary(value)) return { type: 'string', format: 'binary' };
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { type: 'integer' }
      : { type: 'number' };
  }
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: detectJSONSchemaType(value[0])
    };
  }
  return { type: 'object' };
}
```

---

## Nested Object Handling Specification

### 🔴 CRITICAL BUG: getAllFields() Implementation

**Current (BROKEN):**
```typescript
function getAllFields(obj: any, prefix = ''): Record<string, any> {
  const fields: Record<string, any> = {}

  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    fields[path] = value  // ❌ ADDS PARENT OBJECT

    if (isNestedObject(value)) {
      Object.assign(fields, getAllFields(value, path))  // ❌ ALSO ADDS CHILDREN
    }
  })

  return fields
}

// Result for { user: { name: 'John' } }:
{
  'user': { name: 'John' },  // ❌ Parent
  'user.name': 'John'        // ❌ Child
}
// → Generates invalid TypeScript/Mongoose!
```

**Expected (CORRECT):**
```typescript
function getAllFields(obj: any, prefix = ''): Record<string, any> {
  const fields: Record<string, any> = {}

  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key

    if (isNestedObject(value)) {
      // Recurse into nested objects, DON'T add parent
      Object.assign(fields, getAllFields(value, path))
    } else {
      // Only add leaf values
      fields[path] = value
    }
  })

  return fields
}

// Result for { user: { name: 'John' } }:
{
  'user.name': 'John'  // ✅ Only leaf
}
```

### Schema Generation Algorithm

For TypeScript and Mongoose, we need **hierarchical** schema, not flat dot notation.

**Correct Approach:**

```typescript
interface SchemaNode {
  type: string;
  required: boolean;
  children?: Record<string, SchemaNode>;  // For nested objects
  itemType?: string;                       // For arrays
}

function buildSchemaTree(docs: any[]): SchemaNode {
  const root: SchemaNode = {
    type: 'object',
    required: true,
    children: {}
  };

  // Analyze all documents
  docs.forEach(doc => {
    analyzeObject(doc, root.children!, docs.length);
  });

  return root;
}

function analyzeObject(
  obj: any,
  schema: Record<string, SchemaNode>,
  totalDocs: number
) {
  Object.entries(obj).forEach(([key, value]) => {
    if (!schema[key]) {
      schema[key] = {
        type: detectType(value),
        required: false,
        count: 0
      };
    }

    schema[key].count++;

    // Handle nested objects recursively
    if (isNestedObject(value)) {
      if (!schema[key].children) {
        schema[key].children = {};
      }
      analyzeObject(value, schema[key].children!, totalDocs);
    }
  });

  // Determine required fields (100% presence)
  Object.values(schema).forEach(node => {
    node.required = node.count === totalDocs;
  });
}

function generateTypeScript(schema: SchemaNode, name: string): string {
  let output = `export interface ${name} {\n`;

  Object.entries(schema.children!).forEach(([key, node]) => {
    const optional = node.required ? '' : '?';

    if (node.children) {
      // Nested object → inline interface
      output += `  ${key}${optional}: {\n`;
      output += generateNestedFields(node.children, 2);
      output += `  };\n`;
    } else {
      output += `  ${key}${optional}: ${node.type};\n`;
    }
  });

  output += `}`;
  return output;
}
```

---

## Error Handling & Validation

### Input Validation

```typescript
// MUST validate before processing
function validateExportInput(
  data: ExportData,
  format: ExportFormat
): void {
  // 1. Check documents array
  if (!Array.isArray(data.documents)) {
    throw new Error('Export data must contain a documents array');
  }

  // 2. Check collection name
  if (!data.collectionName || typeof data.collectionName !== 'string') {
    throw new Error('Collection name is required');
  }

  // 3. Validate collection name (prevent injection)
  if (format.key === 'mongo-shell') {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.collectionName)) {
      // Use bracket notation for invalid names
      data.collectionName = sanitizeCollectionName(data.collectionName);
    }
  }

  // 4. Check for circular references
  try {
    JSON.stringify(data.documents[0]);
  } catch (e) {
    throw new Error('Documents contain circular references');
  }
}
```

### Shell Injection Prevention

```typescript
// For mongo-shell format:
function generateMongoShellScript(
  collectionName: string,
  docs: any[]
): string {
  // Option 1: Strict validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(collectionName)) {
    throw new Error(`Invalid collection name: ${collectionName}`);
  }

  return `db.${collectionName}.insertMany([...]);`;

  // Option 2: Bracket notation (safer)
  const safeName = JSON.stringify(collectionName);
  return `db[${safeName}].insertMany([...]);`;
}

// Dangerous inputs to test:
'users; db.dropDatabase(); //'   // Command injection
'users`whoami`'                   // Command substitution
'users$(rm -rf /)'                // Command substitution
```

### Memory Safety

```typescript
// For large exports, warn or chunk
function checkExportSize(docs: any[]): void {
  const sample = docs.slice(0, 100).map(d => JSON.stringify(d));
  const avgSize = sample.reduce((a, s) => a + s.length, 0) / sample.length;
  const estimatedSize = avgSize * docs.length;
  const estimatedMB = estimatedSize / (1024 * 1024);

  if (estimatedMB > 250) {
    console.warn(`Large export: ~${estimatedMB}MB. May cause browser freeze.`);
  }

  if (estimatedMB > 500) {
    throw new Error(`Export too large: ~${estimatedMB}MB exceeds 500MB limit`);
  }
}
```

---

## Test Specification

### Test Data Fixtures

```typescript
// fixtures/export-test-data.ts
export const SIMPLE_DOCS = [
  { _id: 'doc1', name: 'John', age: 30 },
  { _id: 'doc2', name: 'Jane', age: 25 }
];

export const EJSON_DOCS = [
  {
    _id: { $oid: '507f1f77bcf86cd799439011' },
    name: 'John',
    createdAt: { $date: '2024-01-15T10:30:00.000Z' },
    avatar: { $binary: 'base64encodeddata==' }
  }
];

export const NESTED_DOCS = [
  {
    _id: 'doc1',
    user: {
      name: 'John',
      profile: {
        bio: 'Developer',
        settings: {
          theme: 'dark'
        }
      }
    }
  }
];

export const MIXED_TYPES_DOCS = [
  { _id: 'doc1', age: 30, score: 95.5 },
  { _id: 'doc2', age: '25', score: 87 },  // String age!
  { _id: 'doc3', email: 'test@example.com' }  // Missing age
];

export const SPECIAL_CHARS_DOCS = [
  {
    path: 'C:\\Users\\test',        // Backslashes
    quote: 'Say "Hi"',               // Quotes
    multiline: 'Line 1\nLine 2',     // Newlines
    comma: 'Hello, World'            // Commas
  }
];

export const EDGE_CASES_DOCS = [
  {},                                // Empty doc
  { _id: null },                     // Null value
  { _id: undefined },                // Undefined value
  { tags: [] },                      // Empty array
  { nested: {} }                     // Empty object
];
```

### Test Suites

```typescript
// MongoExportFormats.spec.ts
describe('MongoExportFormats', () => {

  describe('EJSON Type Detection', () => {
    it('detects $oid pattern as ObjectID', () => {
      const value = { $oid: '507f1f77bcf86cd799439011' };
      expect(isObjectId(value)).toBe(true);
    });

    it('detects $date pattern as Date', () => {
      const value = { $date: '2024-01-15T10:30:00.000Z' };
      expect(isEJSONDate(value)).toBe(true);
    });

    it('detects instanceof Date as Date', () => {
      const value = new Date();
      expect(value instanceof Date).toBe(true);
    });

    it('prioritizes $oid over instanceof check', () => {
      // EJSON should be checked before instanceof
    });
  });

  describe('MONGO_IMPORT_NDJSON', () => {
    it('exports empty array as empty string', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: [],
        collectionName: 'test'
      });
      expect(result).toBe('');
    });

    it('exports single document with no trailing newline', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: SIMPLE_DOCS.slice(0, 1),
        collectionName: 'test'
      });
      expect(result).not.toMatch(/\n$/);
      expect(result.split('\n').length).toBe(1);
    });

    it('preserves EJSON types', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: EJSON_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('$oid');
      expect(result).toContain('$date');
    });
  });

  describe('MONGO_SHELL', () => {
    it('converts $oid to ObjectId(...)', () => {
      const result = MONGO_SHELL.formatter({
        documents: EJSON_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('ObjectId("507f1f77bcf86cd799439011")');
      expect(result).not.toContain('$oid');
    });

    it('escapes backslashes in strings', () => {
      const result = MONGO_SHELL.formatter({
        documents: SPECIAL_CHARS_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('C:\\\\Users\\\\test');
    });

    it('escapes quotes in strings', () => {
      const result = MONGO_SHELL.formatter({
        documents: SPECIAL_CHARS_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('Say \\"Hi\\"');
    });

    it('prevents shell injection in collection name', () => {
      const malicious = 'users; db.dropDatabase(); //';
      expect(() => {
        MONGO_SHELL.formatter({
          documents: SIMPLE_DOCS,
          collectionName: malicious
        });
      }).toThrow();
    });
  });

  describe('TYPESCRIPT_INTERFACE', () => {
    it('generates valid TypeScript for nested objects', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: NESTED_DOCS,
        collectionName: 'test'
      });

      // Should NOT contain dot notation
      expect(result).not.toContain('user.name');
      expect(result).not.toContain('user.profile');

      // Should contain nested structure
      expect(result).toContain('user: {');
      expect(result).toContain('  name: string;');
      expect(result).toContain('  profile: {');
    });

    it('marks optional fields with ?', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: MIXED_TYPES_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('email?: string');
    });

    it('generates union types for mixed types', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: MIXED_TYPES_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('age: string | number');
    });

    it('handles collection names starting with number', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: SIMPLE_DOCS,
        collectionName: '123invalid'
      });
      expect(result).toContain('export interface _123invalid');
    });
  });

  describe('MONGOOSE_SCHEMA', () => {
    it('generates valid Mongoose schema for nested objects', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: NESTED_DOCS,
        collectionName: 'test'
      });

      // Should NOT contain dot notation
      expect(result).not.toContain("'user.name'");

      // Should contain nested structure
      expect(result).toContain('user: {');
      expect(result).toContain('  name: { type: String');
    });

    it('uses Schema.Types.ObjectId for $oid', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: EJSON_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('mongoose.Schema.Types.ObjectId');
    });
  });

  describe('JSON_SCHEMA', () => {
    it('distinguishes integer from number', () => {
      const result = JSON_SCHEMA.formatter({
        documents: MIXED_TYPES_DOCS,
        collectionName: 'test'
      });
      const schema = JSON.parse(result);

      // age: 30 (integer) vs score: 95.5 (number)
      expect(schema.properties.score.type).toBe('number');
    });

    it('uses additionalProperties: false by default', () => {
      const result = JSON_SCHEMA.formatter({
        documents: SIMPLE_DOCS,
        collectionName: 'test'
      });
      const schema = JSON.parse(result);
      expect(schema.additionalProperties).toBe(false);
    });
  });

  describe('CSV', () => {
    it('flattens nested objects with dot notation', () => {
      const result = CSV.formatter({
        documents: NESTED_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('user.name');
      expect(result).toContain('user.profile.bio');
    });

    it('uses EJSON.stringify for nested objects', () => {
      const docs = [{
        metadata: {
          createdAt: { $date: '2024-01-15T10:30:00.000Z' }
        }
      }];
      const result = CSV.formatter({
        documents: docs,
        collectionName: 'test'
      });
      // Should preserve $date pattern in JSON string
      expect(result).toContain('$date');
    });

    it('escapes commas with quotes', () => {
      const result = CSV.formatter({
        documents: SPECIAL_CHARS_DOCS,
        collectionName: 'test'
      });
      expect(result).toContain('"Hello, World"');
    });
  });

  describe('getAllFields', () => {
    it('returns only leaf values for nested objects', () => {
      const obj = {
        user: {
          name: 'John',
          age: 30
        }
      };
      const fields = getAllFields(obj);

      // Should NOT include parent
      expect(fields['user']).toBeUndefined();

      // Should include only leaves
      expect(fields['user.name']).toBe('John');
      expect(fields['user.age']).toBe(30);
    });

    it('does not recurse into EJSON objects', () => {
      const obj = {
        id: { $oid: '507f1f77bcf86cd799439011' }
      };
      const fields = getAllFields(obj);

      // Should include $oid object as-is, not recurse into it
      expect(fields['id']).toEqual({ $oid: '507f1f77bcf86cd799439011' });
      expect(fields['id.$oid']).toBeUndefined();
    });
  });
});
```

---

## Performance Considerations

### Large Collection Handling

```typescript
// For exports >250MB, use streaming approach
interface StreamingExportOptions {
  chunkSize: number;        // Documents per chunk
  onProgress: (percent: number) => void;
  signal: AbortSignal;      // For cancellation
}

// Current ByteAssembler approach works for data formats
// Schema formats don't need streaming (they analyze structure, not data volume)
```

### Schema Inference Caching

```typescript
// If exporting multiple formats, cache schema analysis
class ExportService {
  private schemaCache = new Map<string, any>();

  async exportMultiple(
    formats: ExportFormat[],
    data: ExportData
  ): Promise<Map<string, string>> {
    // Analyze schema once
    const schema = this.analyzeSchema(data.documents);
    this.schemaCache.set(data.collectionName, schema);

    // Generate all formats using cached schema
    const results = new Map<string, string>();
    formats.forEach(format => {
      results.set(format.key, format.formatter(data, { schema }));
    });

    return results;
  }
}
```

---

## Implementation Checklist

### Phase 1: Fix Critical Bugs ✅ (~6 hours)

- [ ] **Fix getAllFields()** - Only return leaf values
- [ ] **Fix TypeScript interface generation** - Use nested structure
- [ ] **Fix Mongoose schema generation** - Use nested structure
- [ ] **Fix string escaping** - Add backslash handling
- [ ] **Fix CSV EJSON handling** - Use EJSON.stringify
- [ ] **Add input validation** - Prevent injection, validate types

### Phase 2: Add Tests ✅ (~6 hours)

- [ ] **Create test fixtures** - All edge cases covered
- [ ] **Test EJSON detection** - All 3 patterns
- [ ] **Test each format** - With all fixtures
- [ ] **Test string escaping** - Special characters
- [ ] **Test nested objects** - Verify correct structure
- [ ] **Test error handling** - Invalid inputs

### Phase 3: Documentation ✅ (~2 hours)

- [x] **This specification document**
- [ ] **API documentation** - JSDoc for all public functions
- [ ] **Usage examples** - For each format
- [ ] **Migration guide** - From old export to new

### Phase 4: Polish ⚠️ (~2 hours)

- [ ] **Add ExportFormat.category** - Avoid hardcoded checks
- [ ] **Improve size calculation** - Use actual bytes
- [ ] **Schema caching** - Avoid recomputation
- [ ] **Better error messages** - User-friendly

---

## Open Questions

1. **additionalProperties**: Should it be configurable or always false?
2. **Integer vs Float in Mongoose**: Should we add integer: true option?
3. **Collection name validation**: Strict validation or bracket notation?
4. **Streaming support**: Worth implementing for formatter signature?
5. **Enum detection**: Should we infer enums from limited value sets?

---

## References

- [MongoDB EJSON Spec](https://docs.mongodb.com/manual/reference/mongodb-extended-json/)
- [mongoimport Documentation](https://docs.mongodb.com/database-tools/mongoimport/)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema)
- [Mongoose Schema Types](https://mongoosejs.com/docs/schematypes.html)
- [RFC 4180 (CSV)](https://www.rfc-editor.org/rfc/rfc4180)
