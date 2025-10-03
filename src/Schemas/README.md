# JSON Schemas

This directory contains JSON Schema definitions for the meteor-devtools-evolved extension.

## Overview

All schemas follow the **JSON Schema Draft 2020-12** specification and are defined using the explicit `JSONSchema7` type from the `json-schema` package.

## Design Principles

1. **Required Properties at Top Level**: All `required` arrays are defined at the top level of each schema object, not nested within sub-schemas.
2. **Explicit Types**: All schemas use the explicit `JSONSchema7` type instead of `any` or implicit types.
3. **Validation Ready**: These schemas can be used with JSON schema validators for runtime validation of messages.

## Schemas

### MessageSchema
Defines the structure for basic messages exchanged between components.

**Required fields**: `eventType`, `data`

### MessagePayloadSchema
Extends Message with a `source` field for validation.

**Required fields**: `source`, `eventType`, `data`

### DDPLogSchema
Defines the structure for DDP (Distributed Data Protocol) log entries.

**Required fields**: `id`, `content`

### StackTraceSchema
Defines the structure for stack trace entries.

**Required fields**: `url`, `callee`

## Usage

```typescript
import { MessageSchema, DDPLogSchema } from '@/Schemas'

// Use for validation or documentation
const isValid = validator.validate(MessageSchema, messageData)
```

## Maintenance

When adding new schemas:
1. Use `JSONSchema7` type explicitly
2. Define `$schema` as `https://json-schema.org/draft/2020-12/schema`
3. Include a unique `$id` for the schema
4. List all required fields in the top-level `required` array
5. Export from `index.ts`
