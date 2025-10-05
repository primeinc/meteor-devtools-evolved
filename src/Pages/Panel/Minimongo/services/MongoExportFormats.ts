/**
 * MongoDB Export Formats
 *
 * Provides production-ready export formats for Minimongo data:
 * - Direct mongoimport compatibility (NDJSON + Extended JSON)
 * - MongoDB Compass import
 * - Shell scripts (insertOne/insertMany)
 * - TypeScript interfaces
 * - Mongoose schemas
 * - JSON Schema (draft 2020-12)
 * - CSV (flattened)
 *
 * Key Features:
 * - Proper EJSON type detection (Date, ObjectID, Binary)
 * - Zero manual fixes needed for mongoimport
 * - Type-safe schema generation
 */

import EJSON from 'ejson'

// ============================================================================
// Type Definitions
// ============================================================================

export interface ExportFormat {
  key: string
  name: string
  description: string
  extension: string
  mimeType: string
  supportsMultipleCollections: boolean
  formatter: (data: ExportData, options?: ExportOptions) => string
}

export interface ExportData {
  documents: any[]
  collectionName: string
  allCollections?: Record<string, any[]> // For "export all" mode
}

export interface ExportOptions {
  pretty?: boolean
  includeMetadata?: boolean
}

// ============================================================================
// Format Definitions
// ============================================================================

/**
 * MongoDB Extended JSON (NDJSON) - mongoimport compatible
 *
 * Format: Line-delimited Extended JSON
 * Usage: mongoimport --file data.json --jsonArray=false
 *
 * Critical: Uses EJSON.stringify to preserve MongoDB types
 */
export const MONGO_IMPORT_NDJSON: ExportFormat = {
  key: 'mongo-import-ndjson',
  name: 'MongoDB Import (NDJSON)',
  description: 'Line-delimited Extended JSON for mongoimport',
  extension: 'json',
  mimeType: 'application/x-ndjson',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []
    if (docs.length === 0) return ''

    // Each document on separate line (NDJSON format)
    // EJSON.stringify preserves Date, ObjectID, Binary
    return docs.map(doc => EJSON.stringify(doc)).join('\n')
  }
}

/**
 * MongoDB Extended JSON (Array) - mongoimport --jsonArray
 *
 * Format: JSON array with Extended JSON
 * Usage: mongoimport --file data.json --jsonArray
 */
export const MONGO_IMPORT_ARRAY: ExportFormat = {
  key: 'mongo-import-array',
  name: 'MongoDB Import (JSON Array)',
  description: 'Extended JSON array for mongoimport --jsonArray',
  extension: 'json',
  mimeType: 'application/json',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []

    // EJSON.stringify with indent for readability
    return EJSON.stringify(docs, { indent: options.pretty ? 2 : 0 })
  }
}

/**
 * MongoDB Compass - Standard JSON array
 *
 * Format: Pretty-printed JSON for visual import
 * Usage: Copy/paste into MongoDB Compass
 */
export const MONGO_COMPASS: ExportFormat = {
  key: 'mongo-compass',
  name: 'MongoDB Compass',
  description: 'JSON array for MongoDB Compass import',
  extension: 'json',
  mimeType: 'application/json',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []

    // Standard JSON.stringify (Compass handles EJSON patterns)
    return JSON.stringify(docs, null, 2)
  }
}

/**
 * MongoDB Shell - insertOne/insertMany script
 *
 * Format: JavaScript for mongo shell
 * Usage: mongo < script.js
 */
export const MONGO_SHELL: ExportFormat = {
  key: 'mongo-shell',
  name: 'MongoDB Shell Script',
  description: 'JavaScript for MongoDB shell (insertMany)',
  extension: 'js',
  mimeType: 'application/javascript',
  supportsMultipleCollections: true,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []
    const collectionName = data.collectionName || 'collection'

    if (docs.length === 0) {
      return `// No documents to insert\n`
    }

    let script = `// MongoDB Shell Script\n`
    script += `// Collection: ${collectionName}\n`
    script += `// Documents: ${docs.length}\n`
    script += `// Generated: ${new Date().toISOString()}\n\n`

    if (docs.length === 1) {
      script += `db.${collectionName}.insertOne(\n`
      script += convertToMongoShellLiteral(docs[0], 1)
      script += `\n);\n`
    } else {
      script += `db.${collectionName}.insertMany([\n`
      docs.forEach((doc, i) => {
        script += convertToMongoShellLiteral(doc, 1)
        if (i < docs.length - 1) script += ','
        script += '\n'
      })
      script += `]);\n`
    }

    // Add verification query
    script += `\n// Verify\n`
    script += `db.${collectionName}.countDocuments(); // Should be ${docs.length}\n`

    return script
  }
}

/**
 * TypeScript Interface - Auto-generated types
 *
 * Format: TypeScript interface definition
 * Usage: Copy into your .ts files
 */
export const TYPESCRIPT_INTERFACE: ExportFormat = {
  key: 'typescript',
  name: 'TypeScript Interface',
  description: 'Auto-generated TypeScript interface',
  extension: 'ts',
  mimeType: 'text/typescript',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []
    const interfaceName = pascalCase(data.collectionName || 'Document')

    if (docs.length === 0) {
      return `export interface ${interfaceName} {}\n`
    }

    const schema = inferTypeScriptSchema(docs)

    let code = `/**\n`
    code += ` * Auto-generated from ${docs.length} document(s)\n`
    code += ` * Collection: ${data.collectionName}\n`
    code += ` * Generated: ${new Date().toISOString()}\n`
    code += ` */\n`
    code += `export interface ${interfaceName} {\n`

    Object.entries(schema.properties).forEach(([key, prop]) => {
      const optional = !schema.required.includes(key)
      const typeStr = formatTypeScriptType(prop)
      code += `  ${key}${optional ? '?' : ''}: ${typeStr};\n`
    })

    code += `}\n`

    return code
  }
}

/**
 * Mongoose Schema - Auto-generated Mongoose model
 *
 * Format: Mongoose schema definition
 * Usage: Copy into your models
 */
export const MONGOOSE_SCHEMA: ExportFormat = {
  key: 'mongoose',
  name: 'Mongoose Schema',
  description: 'Auto-generated Mongoose schema',
  extension: 'js',
  mimeType: 'application/javascript',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []
    const modelName = pascalCase(data.collectionName || 'Model')
    const collectionName = data.collectionName || 'collection'

    if (docs.length === 0) {
      return `const mongoose = require('mongoose');\n\nconst ${modelName}Schema = new mongoose.Schema({});\n\nmodule.exports = mongoose.model('${modelName}', ${modelName}Schema);\n`
    }

    const schema = inferMongooseSchema(docs)

    let code = `const mongoose = require('mongoose');\n\n`
    code += `/**\n`
    code += ` * Auto-generated from ${docs.length} document(s)\n`
    code += ` * Collection: ${collectionName}\n`
    code += ` * Generated: ${new Date().toISOString()}\n`
    code += ` */\n`
    code += `const ${modelName}Schema = new mongoose.Schema({\n`

    Object.entries(schema.properties).forEach(([key, prop]) => {
      const required = schema.required.includes(key)
      code += `  ${key}: ${formatMongooseType(prop, required)},\n`
    })

    code += `}, {\n`
    code += `  timestamps: true,\n`
    code += `  collection: '${collectionName}'\n`
    code += `});\n\n`
    code += `module.exports = mongoose.model('${modelName}', ${modelName}Schema);\n`

    return code
  }
}

/**
 * JSON Schema - Draft 2020-12
 *
 * Format: Standard JSON Schema
 * Usage: Validation, documentation, code generation
 */
export const JSON_SCHEMA: ExportFormat = {
  key: 'json-schema',
  name: 'JSON Schema',
  description: 'JSON Schema (draft 2020-12)',
  extension: 'json',
  mimeType: 'application/schema+json',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []
    const schema = inferJSONSchema(docs)

    const output = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `https://example.com/${data.collectionName || 'document'}.schema.json`,
      title: pascalCase(data.collectionName || 'Document'),
      description: `Auto-generated from ${docs.length} document(s)`,
      type: 'object',
      additionalProperties: true,
      properties: schema.properties,
      required: schema.required
    }

    return JSON.stringify(output, null, options.pretty !== false ? 2 : 0)
  }
}

/**
 * CSV - Flattened export (LOSSY)
 *
 * Format: Comma-separated values
 * Usage: Excel, data analysis
 * Warning: Nested objects are JSON-stringified (lossy)
 */
export const CSV: ExportFormat = {
  key: 'csv',
  name: 'CSV (Flattened)',
  description: 'CSV export (nested objects are lossy)',
  extension: 'csv',
  mimeType: 'text/csv',
  supportsMultipleCollections: false,
  formatter: (data: ExportData, options = {}) => {
    const docs = data.documents || []

    if (docs.length === 0) return ''

    // Collect all unique keys
    const keys = new Set<string>()
    docs.forEach(doc => {
      Object.keys(flattenObject(doc)).forEach(key => keys.add(key))
    })

    const headers = Array.from(keys).sort()

    // CSV header
    let csv = headers.map(escapeCSV).join(',') + '\n'

    // CSV rows
    docs.forEach(doc => {
      const flattened = flattenObject(doc)
      const row = headers.map(header => {
        const value = flattened[header]
        return escapeCSV(formatValueForCSV(value))
      }).join(',')
      csv += row + '\n'
    })

    return csv
  }
}

// ============================================================================
// All Formats Registry
// ============================================================================

export const ALL_FORMATS: ExportFormat[] = [
  MONGO_IMPORT_NDJSON,
  MONGO_IMPORT_ARRAY,
  MONGO_COMPASS,
  MONGO_SHELL,
  TYPESCRIPT_INTERFACE,
  MONGOOSE_SCHEMA,
  JSON_SCHEMA,
  CSV,
]

// ============================================================================
// Schema Inference - TypeScript
// ============================================================================

interface TypeScriptSchema {
  properties: Record<string, TypeScriptProperty>
  required: string[]
}

interface TypeScriptProperty {
  type: string
  isArray?: boolean
  isOptional?: boolean
  possibleTypes?: string[] // For union types
}

function inferTypeScriptSchema(docs: any[]): TypeScriptSchema {
  const fieldInfo = new Map<string, Set<string>>()
  const fieldPresence = new Map<string, number>()

  docs.forEach(doc => {
    const fields = getAllFields(doc)

    Object.entries(fields).forEach(([path, value]) => {
      if (!fieldInfo.has(path)) {
        fieldInfo.set(path, new Set())
      }
      fieldInfo.get(path)!.add(detectTypeScriptType(value))
      fieldPresence.set(path, (fieldPresence.get(path) || 0) + 1)
    })
  })

  const properties: Record<string, TypeScriptProperty> = {}
  const required: string[] = []

  fieldInfo.forEach((types, path) => {
    const typeArray = Array.from(types)
    const isRequired = fieldPresence.get(path) === docs.length

    if (isRequired) {
      required.push(path)
    }

    if (typeArray.length === 1) {
      properties[path] = { type: typeArray[0] }
    } else {
      // Union type
      properties[path] = {
        type: typeArray.join(' | '),
        possibleTypes: typeArray
      }
    }
  })

  return { properties, required }
}

function detectTypeScriptType(value: any): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  // EJSON types
  if (value instanceof Date) return 'Date'
  if (value?.$date) return 'Date'
  if (value?.$oid) return 'string' // ObjectID is string in TS
  if (value?.$binary) return 'Buffer'

  // Primitive types
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'

    const itemTypes = new Set(value.map(detectTypeScriptType))
    if (itemTypes.size === 1) {
      return `${Array.from(itemTypes)[0]}[]`
    }
    return 'any[]' // Mixed array
  }

  // Objects
  if (typeof value === 'object') return 'Record<string, any>'

  return 'any'
}

function formatTypeScriptType(prop: TypeScriptProperty): string {
  return prop.type
}

// ============================================================================
// Schema Inference - Mongoose
// ============================================================================

interface MongooseSchema {
  properties: Record<string, MongooseProperty>
  required: string[]
}

interface MongooseProperty {
  type: string
  isArray?: boolean
  ref?: string
}

function inferMongooseSchema(docs: any[]): MongooseSchema {
  const fieldInfo = new Map<string, Set<string>>()
  const fieldPresence = new Map<string, number>()

  docs.forEach(doc => {
    const fields = getAllFields(doc)

    Object.entries(fields).forEach(([path, value]) => {
      if (!fieldInfo.has(path)) {
        fieldInfo.set(path, new Set())
      }
      fieldInfo.get(path)!.add(detectMongooseType(value))
      fieldPresence.set(path, (fieldPresence.get(path) || 0) + 1)
    })
  })

  const properties: Record<string, MongooseProperty> = {}
  const required: string[] = []

  fieldInfo.forEach((types, path) => {
    const typeArray = Array.from(types)
    const isRequired = fieldPresence.get(path) === docs.length

    if (isRequired) {
      required.push(path)
    }

    if (typeArray.length === 1) {
      properties[path] = { type: typeArray[0] }
    } else {
      // Mixed type
      properties[path] = { type: 'Schema.Types.Mixed' }
    }
  })

  return { properties, required }
}

function detectMongooseType(value: any): string {
  if (value === null || value === undefined) return 'Schema.Types.Mixed'

  // EJSON types
  if (value instanceof Date) return 'Date'
  if (value?.$date) return 'Date'
  if (value?.$oid) return 'Schema.Types.ObjectId'
  if (value?.$binary) return 'Buffer'

  // Primitive types
  if (typeof value === 'string') return 'String'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Number' : 'Number'
  }
  if (typeof value === 'boolean') return 'Boolean'

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return 'Array'
    const itemTypes = new Set(value.map(detectMongooseType))
    if (itemTypes.size === 1) {
      return `[${Array.from(itemTypes)[0]}]`
    }
    return 'Array'
  }

  // Objects
  if (typeof value === 'object') return 'Schema.Types.Mixed'

  return 'Schema.Types.Mixed'
}

function formatMongooseType(prop: MongooseProperty, required: boolean): string {
  const typeStr = prop.type.startsWith('[')
    ? prop.type // Already array format
    : prop.type

  if (!required) {
    return `{ type: ${typeStr}, required: false }`
  }

  return `{ type: ${typeStr}, required: true }`
}

// ============================================================================
// Schema Inference - JSON Schema
// ============================================================================

interface JSONSchema {
  properties: Record<string, any>
  required: string[]
}

function inferJSONSchema(docs: any[]): JSONSchema {
  const fieldInfo = new Map<string, Set<string>>()
  const fieldPresence = new Map<string, number>()

  docs.forEach(doc => {
    const fields = getAllFields(doc)

    Object.entries(fields).forEach(([path, value]) => {
      if (!fieldInfo.has(path)) {
        fieldInfo.set(path, new Set())
      }
      fieldInfo.get(path)!.add(detectJSONSchemaType(value))
      fieldPresence.set(path, (fieldPresence.get(path) || 0) + 1)
    })
  })

  const properties: Record<string, any> = {}
  const required: string[] = []

  fieldInfo.forEach((types, path) => {
    const typeArray = Array.from(types).filter(t => t !== 'null')
    const isRequired = fieldPresence.get(path) === docs.length

    if (isRequired && typeArray.length > 0) {
      required.push(path)
    }

    if (typeArray.length === 0) {
      properties[path] = { type: 'null' }
    } else if (typeArray.length === 1) {
      const type = typeArray[0]
      properties[path] = { type }

      // Add format hints
      if (type === 'string') {
        // Check if it's a date string
        const sample = docs.find(d => getAllFields(d)[path])
        const value = getAllFields(sample)[path]
        if (value instanceof Date || value?.$date) {
          properties[path].format = 'date-time'
        }
      }
    } else {
      // Multiple types
      properties[path] = {
        anyOf: typeArray.map(t => ({ type: t }))
      }
    }
  })

  return { properties, required }
}

function detectJSONSchemaType(value: any): string {
  if (value === null) return 'null'

  // EJSON types
  if (value instanceof Date) return 'string' // ISO date string
  if (value?.$date) return 'string'
  if (value?.$oid) return 'string'
  if (value?.$binary) return 'string'

  // Primitive types
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if (typeof value === 'boolean') return 'boolean'

  // Arrays
  if (Array.isArray(value)) return 'array'

  // Objects
  if (typeof value === 'object') return 'object'

  return 'string'
}

// ============================================================================
// MongoDB Shell Literal Conversion
// ============================================================================

function convertToMongoShellLiteral(value: any, indent: number): string {
  const spaces = '  '.repeat(indent)

  if (value === null || value === undefined) {
    return 'null'
  }

  // EJSON patterns
  if (value?.$oid) {
    return `ObjectId("${value.$oid}")`
  }

  if (value?.$date) {
    const date = new Date(value.$date)
    return `ISODate("${date.toISOString()}")`
  }

  if (value instanceof Date) {
    return `ISODate("${value.toISOString()}")`
  }

  if (value?.$binary) {
    return `BinData(0, "${value.$binary}")`
  }

  // Primitives
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    let result = '[\n'
    value.forEach((item, i) => {
      result += spaces + '  ' + convertToMongoShellLiteral(item, indent + 1)
      if (i < value.length - 1) result += ','
      result += '\n'
    })
    result += spaces + ']'
    return result
  }

  // Objects
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b))

    if (entries.length === 0) return '{}'

    let result = '{\n'
    entries.forEach(([key, val], i) => {
      result += spaces + '  ' + `"${key}": ` + convertToMongoShellLiteral(val, indent + 1)
      if (i < entries.length - 1) result += ','
      result += '\n'
    })
    result += spaces + '}'
    return result
  }

  return 'null'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all fields from a document (including nested)
 */
function getAllFields(obj: any, prefix = ''): Record<string, any> {
  const fields: Record<string, any> = {}

  if (!obj || typeof obj !== 'object') return fields

  Object.entries(obj).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    fields[path] = value

    // Don't recurse into EJSON objects or arrays
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value as any).$oid && !(value as any).$date && !(value as any).$binary) {
      Object.assign(fields, getAllFields(value, path))
    }
  })

  return fields
}

/**
 * Flatten object to dot notation
 */
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const flattened: Record<string, any> = {}

  if (!obj || typeof obj !== 'object') {
    return { [prefix || 'value']: obj }
  }

  Object.entries(obj).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(flattened, flattenObject(value, newKey))
    } else {
      flattened[newKey] = value
    }
  })

  return flattened
}

/**
 * Convert string to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^(.)/, (_, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Escape CSV value
 */
function escapeCSV(value: string): string {
  if (typeof value !== 'string') {
    value = String(value)
  }

  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

/**
 * Format value for CSV
 */
function formatValueForCSV(value: any): string {
  if (value === null || value === undefined) return ''

  if (value instanceof Date) return value.toISOString()
  if (value?.$date) return new Date(value.$date).toISOString()
  if (value?.$oid) return value.$oid

  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

// ============================================================================
// Exports
// ============================================================================

export default {
  ALL_FORMATS,
  MONGO_IMPORT_NDJSON,
  MONGO_IMPORT_ARRAY,
  MONGO_COMPASS,
  MONGO_SHELL,
  TYPESCRIPT_INTERFACE,
  MONGOOSE_SCHEMA,
  JSON_SCHEMA,
  CSV,
}
