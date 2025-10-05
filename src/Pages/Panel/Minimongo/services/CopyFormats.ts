// src/Pages/Panel/Minimongo/services/CopyFormats.ts
import {
  safeCollectionAccessor,
  escapeMongoShellString,
} from './CollectionNameSanitizer'

type Doc = Record<string, any>

const CIRCULAR_TOKEN = '__METEOR_DEVTOOLS_CIRCULAR_REFERENCE__'

const EJSON_WARNING = `// WARNING: Potential EJSON types (e.g., Date, ObjectId, BinData) may be stringified here.
// Review and convert to shell literals (ISODate(...), ObjectId(...)) BEFORE running.`

/**
 * Check if a value contains EJSON types (Date, ObjectId, Binary)
 * @param v - Value to check for EJSON types
 * @returns True if value contains EJSON-like structures
 */
function hasEjsonLike(v: any): boolean {
  const stack: any[] = [v]
  const seen = new Set<any>()
  while (stack.length) {
    const cur = stack.pop()
    if (cur && typeof cur === 'object') {
      if (seen.has(cur)) continue
      seen.add(cur)
      if (cur instanceof Date) return true
      if (cur instanceof Uint8Array) return true
      if (cur?.constructor?.name === 'ObjectID') return true
      if (
        ('$date' in cur && typeof cur.$date !== 'undefined') ||
        ('$oid' in cur && typeof cur.$oid === 'string') ||
        ('$binary' in cur && typeof cur.$binary === 'string') ||
        ('$type' in cur && '$value' in cur)
      )
        return true
      if (Array.isArray(cur)) {
        for (const x of cur) stack.push(x)
      } else {
        for (const k of Object.keys(cur)) stack.push(cur[k])
      }
    }
  }
  return false
}

/**
 * Stringify object with sorted keys and pretty formatting
 * @param obj - Object to stringify
 * @returns Pretty-printed JSON string with sorted keys
 */
function stableStringifyPretty(obj: any): string {
  const seen = new WeakSet()
  return JSON.stringify(
    obj,
    (k, v) => {
      if (v && typeof v === 'object') {
        if (seen.has(v)) return CIRCULAR_TOKEN // valid JSON string token
        seen.add(v)
        // Preserve arrays as arrays, only sort object keys
        if (Array.isArray(v)) return v
        return Object.keys(v)
          .sort()
          .reduce((acc, key) => {
            acc[key] = (v as any)[key]
            return acc
          }, {} as Record<string, any>)
      }
      return v
    },
    2,
  )
}

/**
 * Stringify object with sorted keys in compact format
 * @param obj - Object to stringify
 * @returns Compact JSON string with sorted keys
 */
function stableStringifyCompact(obj: any): string {
  const seen = new WeakSet()
  return JSON.stringify(obj, (k, v) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return CIRCULAR_TOKEN // valid JSON string token
      seen.add(v)
      // Preserve arrays as arrays, only sort object keys
      if (Array.isArray(v)) return v
      return Object.keys(v)
        .sort()
        .reduce((acc, key) => {
          acc[key] = (v as any)[key]
          return acc
        }, {} as Record<string, any>)
    }
    return v
  })
}

/**
 * Convert MongoDB _id to literal string representation
 * @param id - MongoDB document _id (string or ObjectId)
 * @returns String literal representation of the _id
 */
function mongoIdLiteral(id: unknown): string {
  if (typeof id === 'string') return `"${id.replace(/"/g, '\\"')}"`
  return stableStringifyCompact(id)
}

/**
 * Convert document to raw JSON format with optional metadata header
 * @param doc - Document to convert
 * @param collectionName - Optional collection name to include in header
 * @returns Pretty-printed JSON string with optional header
 */
export function toRawJSON(doc: Doc, collectionName?: string): string {
  const json = stableStringifyPretty(doc)
  if (!collectionName) return json

  return `// Collection: ${collectionName}\n// Document: ${
    doc._id || '(no _id)'
  }\n${json}`
}
/**
 * Convert document to compact JSON format
 * @param doc - Document to convert
 * @returns Minified JSON string
 */
export function toCompactJSON(doc: Doc): string {
  return stableStringifyCompact(doc)
}

/**
 * Generate MongoDB findOne queries for document lookup
 * @param collectionName - Name of the collection
 * @param doc - Document to generate queries for
 * @returns MongoDB shell queries (by useful fields and _id)
 */
export function toMongoQuery(collectionName: string, doc: Doc): string {
  const queries: string[] = []

  // Find useful query fields (skip _id, internal fields, empty values)
  const usefulFields: Array<{ key: string; value: any; path: string }> = []

  const traverse = (obj: any, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_id') continue
      if (key.startsWith('_')) continue
      if (value === null || value === undefined) continue
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      )
        continue
      if (Array.isArray(value) && value.length === 0) continue

      const path = prefix ? `${prefix}.${key}` : key

      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        usefulFields.push({ key, value, path })
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        traverse(value, path)
      } else if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === 'string'
      ) {
        usefulFields.push({ key, value: value[0], path: `${path}.0` })
      }
    }
  }

  traverse(doc)

  // Sanitize collection name to prevent shell injection
  const safeCollection = safeCollectionAccessor(collectionName)

  // Generate queries for most useful fields (max 3)
  const selectedFields = usefulFields.slice(0, 3)

  for (const { path, value } of selectedFields) {
    const valueLit =
      typeof value === 'string'
        ? `"${value.replace(/"/g, '\\"')}"`
        : JSON.stringify(value)
    queries.push(`${safeCollection}.findOne({ "${path}": ${valueLit} })`)
  }

  // Always include _id query as fallback
  if (doc._id) {
    const idLit = mongoIdLiteral(doc._id)
    queries.push(`${safeCollection}.findOne({ _id: ${idLit} })`)
  }

  const body = queries.join('\n')
  return hasEjsonLike(doc) ? `${EJSON_WARNING}\n${body}` : body
}

/**
 * Convert EJSON value to MongoDB shell literal format
 * @param value - Value to convert (supports EJSON types)
 * @param indent - Current indentation level for formatting
 * @returns MongoDB shell-compatible literal string
 */
function convertEJSONValue(value: any, indent = ''): string {
  if (typeof value === 'string') {
    // ISO Date detection
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return `ISODate("${value}")`
    }
    return `"${value.replace(/"/g, '\\"')}"`
  }

  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(v => convertEJSONValue(v, indent + '  ')).join(', ')
    return `[${items}]`
  }

  if (typeof value === 'object') {
    // EJSON patterns
    if (value.$oid) return `ObjectId("${value.$oid}")`
    if (value.$date) return `ISODate("${new Date(value.$date).toISOString()}")`
    if (value.$binary) return `BinData(0, "${value.$binary}")`

    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'

    const nextIndent = indent + '  '
    const props = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([k, v]) => `${nextIndent}"${k}": ${convertEJSONValue(v, nextIndent)}`,
      )
      .join(',\n')

    return `{\n${props}\n${indent}}`
  }

  return JSON.stringify(value)
}

/**
 * Generate MongoDB insertOne statement for document
 * @param collectionName - Name of the collection
 * @param doc - Document to insert
 * @returns MongoDB shell insertOne command with EJSON warning if needed
 */
export function toMongoInsert(collectionName: string, doc: Doc): string {
  const converted = convertEJSONValue(doc, '  ')
  const hasEjson = hasEjsonLike(doc)

  // Sanitize collection name to prevent shell injection
  const safeCollection = safeCollectionAccessor(collectionName)
  const body = `${safeCollection}.insertOne(\n${converted}\n)`

  return hasEjson ? `${EJSON_WARNING}\n${body}` : body
}

export type CopyFormatKey = 'raw' | 'compact' | 'mongoQuery' | 'mongoInsert'

export const COPY_FORMATS: Array<{
  key: CopyFormatKey
  label: string
  description: string
}> = [
  { key: 'raw', label: 'Raw JSON', description: 'Pretty-printed JSON' },
  { key: 'compact', label: 'Compact JSON', description: 'Minified JSON' },
  { key: 'mongoQuery', label: 'Mongo Query', description: 'findOne by _id' },
  {
    key: 'mongoInsert',
    label: 'Mongo Insert',
    description: 'insertOne with document',
  },
]

/**
 * Generate formatted output by copy format key
 * @param key - Copy format key (raw, compact, mongoQuery, mongoInsert)
 * @param collectionName - Name of the collection
 * @param doc - Document to format
 * @returns Formatted string based on selected format
 */
export function generateByKey(
  key: CopyFormatKey,
  collectionName: string,
  doc: Doc,
): string {
  switch (key) {
    case 'raw':
      return toRawJSON(doc, collectionName)
    case 'compact':
      return toCompactJSON(doc)
    case 'mongoQuery':
      return toMongoQuery(collectionName, doc)
    case 'mongoInsert':
      return toMongoInsert(collectionName, doc)
    default:
      return toRawJSON(doc, collectionName)
  }
}
