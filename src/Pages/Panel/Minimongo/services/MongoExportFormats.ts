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
      code += `  ${key}${optional ? '?' : ''}: ${prop.type};\n`
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
  extension: 'schema.json',
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

/**
 * Infer TypeScript schema from documents using hierarchical schema tree
 *
 * Generates proper nested interfaces instead of flat dot notation.
 * Uses buildSchemaTree() for correct nested object handling.
 */
function inferTypeScriptSchema(docs: any[]): TypeScriptSchema {
  if (!docs || docs.length === 0) {
    return { properties: {}, required: [] }
  }

  const tree = buildSchemaTree(docs, docs.length)
  const properties: Record<string, TypeScriptProperty> = {}
  const required: string[] = []

  if (!tree.children) {
    return { properties, required }
  }

  // Convert each top-level field
  tree.children.forEach((node, key) => {
    properties[key] = schemaNodeToTypeScript(node, docs.length)

    // Mark as required if present in all documents
    if (node.count === docs.length) {
      required.push(key)
    }
  })

  return {
    properties: Object.fromEntries(
      Object.entries(properties).sort(([a], [b]) => a.localeCompare(b))
    ),
    required: required.sort()
  }
}

/**
 * Convert SchemaNode to TypeScript type string
 */
function schemaNodeToTypeScript(node: SchemaNode, totalDocs: number): TypeScriptProperty {
  const types = Array.from(node.types).filter(t => t !== 'null')

  // Handle null-only case
  if (types.length === 0) {
    return { type: 'null' }
  }

  // Single type
  if (types.length === 1) {
    const type = types[0]

    if (type === 'object' && node.children) {
      // Nested object - generate nested interface syntax
      const nestedFields: string[] = []
      const nestedRequired: string[] = []

      node.children.forEach((childNode, key) => {
        const childProp = schemaNodeToTypeScript(childNode, totalDocs)
        const isRequired = childNode.count === totalDocs
        if (isRequired) nestedRequired.push(key)

        const optional = !isRequired ? '?' : ''
        nestedFields.push(`${key}${optional}: ${childProp.type}`)
      })

      // Sort fields alphabetically
      nestedFields.sort()

      return { type: `{ ${nestedFields.join('; ')} }` }
    }

    if (type === 'array') {
      // Array type
      if (node.arrayItemTypes && node.arrayItemTypes.size > 0) {
        const itemTypes = Array.from(node.arrayItemTypes)

        // Nested array - collapse
        if (itemTypes.includes('array')) {
          return { type: 'any[]' }
        }

        // Object array with distinct shapes
        if (itemTypes.includes('object') && node.arrayItemShapes) {
          const shapes = Array.from(node.arrayItemShapes.values())

          // Collapse if > 5 shapes
          if (shapes.length > 5) {
            return { type: 'any[]' }
          }

          // Generate union of shapes
          const shapeTypes = shapes.map(shapeInfo => {
            const shapeProp = schemaNodeToTypeScript(shapeInfo.schema, node.arrayItemCount || 0)
            return shapeProp.type
          }).filter(t => t !== '{}')

          if (shapeTypes.length === 0) {
            return { type: 'any[]' }
          }

          if (shapeTypes.length === 1) {
            return { type: `${shapeTypes[0]}[]` }
          }

          return { type: `(${shapeTypes.join(' | ')})[]` }
        }

        // Primitive array
        if (itemTypes.length === 1) {
          const itemType = mapTypeScriptType(itemTypes[0])
          return { type: `${itemType}[]` }
        }

        // Mixed primitive array
        const unionTypes = itemTypes.map(mapTypeScriptType).join(' | ')
        return { type: `(${unionTypes})[]` }
      }

      return { type: 'any[]' }
    }

    // Primitive type
    return { type: mapTypeScriptType(type) }
  }

  // Multiple types - union
  const unionTypes = types.map(mapTypeScriptType).sort().join(' | ')
  return { type: unionTypes }
}

/**
 * Map semantic types to TypeScript types
 */
function mapTypeScriptType(semanticType: string): string {
  switch (semanticType) {
    case 'ObjectId': return 'string'
    case 'Date': return 'Date'
    case 'Buffer': return 'Buffer'
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'null': return 'null'
    case 'undefined': return 'undefined'
    case 'array': return 'any[]'
    case 'object': return 'Record<string, any>'
    default: return 'any'
  }
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

/**
 * Infer Mongoose schema from documents using hierarchical schema tree
 *
 * Generates proper nested schemas instead of flat dot notation.
 * Uses buildSchemaTree() for correct nested object handling.
 */
function inferMongooseSchema(docs: any[]): MongooseSchema {
  if (!docs || docs.length === 0) {
    return { properties: {}, required: [] }
  }

  const tree = buildSchemaTree(docs, docs.length)
  const properties: Record<string, MongooseProperty> = {}
  const required: string[] = []

  if (!tree.children) {
    return { properties, required }
  }

  // Convert each top-level field
  tree.children.forEach((node, key) => {
    properties[key] = schemaNodeToMongoose(node, docs.length)

    // Mark as required if present in all documents
    if (node.count === docs.length) {
      required.push(key)
    }
  })

  return {
    properties: Object.fromEntries(
      Object.entries(properties).sort(([a], [b]) => a.localeCompare(b))
    ),
    required: required.sort()
  }
}

/**
 * Convert SchemaNode to Mongoose schema type string
 */
function schemaNodeToMongoose(node: SchemaNode, totalDocs: number): MongooseProperty {
  const types = Array.from(node.types).filter(t => t !== 'null')

  // Handle null-only or mixed types
  if (types.length === 0 || types.length > 1) {
    return { type: 'Schema.Types.Mixed' }
  }

  // Single type
  const type = types[0]

  if (type === 'object' && node.children) {
    // Nested object - generate nested schema syntax
    const nestedFields: string[] = []

    node.children.forEach((childNode, key) => {
      const childProp = schemaNodeToMongoose(childNode, totalDocs)
      const isRequired = childNode.count === totalDocs

      nestedFields.push(`${key}: ${formatMongooseType(childProp, isRequired)}`)
    })

    // Sort fields alphabetically
    nestedFields.sort()

    return { type: `{ ${nestedFields.join(', ')} }` }
  }

  if (type === 'array') {
    // Array type
    if (node.arrayItemTypes && node.arrayItemTypes.size > 0) {
      const itemTypes = Array.from(node.arrayItemTypes)

      // Nested array or mixed - use Mixed
      if (itemTypes.includes('array') || itemTypes.length > 1) {
        return { type: 'Array' }
      }

      // Object array with distinct shapes
      if (itemTypes.includes('object') && node.arrayItemShapes) {
        const shapes = Array.from(node.arrayItemShapes.values())

        // Collapse if > 5 shapes
        if (shapes.length > 5) {
          return { type: 'Array' }
        }

        // For Mongoose, if multiple shapes, use Mixed
        if (shapes.length > 1) {
          return { type: 'Array' }
        }

        // Single shape - generate nested schema
        const shapeProp = schemaNodeToMongoose(shapes[0].schema, node.arrayItemCount || 0)
        return { type: `[${shapeProp.type}]` }
      }

      // Single primitive type
      const itemType = mapMongooseType(itemTypes[0])
      return { type: `[${itemType}]` }
    }

    return { type: 'Array' }
  }

  // Primitive type
  return { type: mapMongooseType(type) }
}

/**
 * Map semantic types to Mongoose types
 */
function mapMongooseType(semanticType: string): string {
  switch (semanticType) {
    case 'ObjectId': return 'Schema.Types.ObjectId'
    case 'Date': return 'Date'
    case 'Buffer': return 'Buffer'
    case 'string': return 'String'
    case 'number': return 'Number'
    case 'boolean': return 'Boolean'
    case 'array': return 'Array'
    case 'object': return 'Schema.Types.Mixed'
    default: return 'Schema.Types.Mixed'
  }
}

/**
 * Format Mongoose type with required flag
 */
function formatMongooseType(prop: MongooseProperty, required: boolean): string {
  const typeStr = prop.type

  // If type is already a nested object or array, return as-is
  if (typeStr.startsWith('{') || typeStr.startsWith('[')) {
    return typeStr
  }

  return `{ type: ${typeStr}, required: ${required} }`
}

// ============================================================================
// Schema Inference - JSON Schema
// ============================================================================

interface JSONSchema {
  properties: Record<string, any>
  required: string[]
}

/**
 * Infer JSON Schema from documents using hierarchical schema tree
 *
 * Uses buildSchemaTree() for proper nested object handling
 */
function inferJSONSchema(docs: any[]): JSONSchema {
  if (!docs || docs.length === 0) {
    return { properties: {}, required: [] }
  }

  const tree = buildSchemaTree(docs, docs.length)
  const properties: Record<string, any> = {}
  const required: string[] = []

  if (!tree.children) {
    return { properties, required }
  }

  // Convert each top-level field
  tree.children.forEach((node, key) => {
    properties[key] = schemaNodeToJSONSchema(node, docs.length, 1)

    // Mark as required if present in all documents
    if (node.count === docs.length) {
      required.push(key)
    }
  })

  // Sort keys for consistent output
  const sortedProperties: Record<string, any> = {}
  Object.keys(properties).sort().forEach(key => {
    sortedProperties[key] = properties[key]
  })

  return {
    properties: sortedProperties,
    required: required.sort()
  }
}

/**
 * Convert SchemaNode to JSON Schema format with depth limiting
 * @param depth - Current nesting depth (used to cap at 5 levels)
 */
function schemaNodeToJSONSchema(node: SchemaNode, totalDocs: number, depth: number = 1): any {
  const allTypes = Array.from(node.types)
  const types = allTypes.filter(t => t !== 'null')

  // Collapse if > 3 types (counting null)
  if (allTypes.length > 3) {
    return {}
  }

  // No types or only null
  if (types.length === 0) {
    return { type: 'null' }
  }

  // Single type
  if (types.length === 1) {
    const type = types[0]

    if (type === 'object' && node.children) {
      // Depth limiting: collapse at depth > 5 (allow up to l5)
      if (depth > 5) {
        return {}
      }

      // Nested object - recurse
      const properties: Record<string, any> = {}
      const required: string[] = []

      node.children.forEach((childNode, key) => {
        properties[key] = schemaNodeToJSONSchema(childNode, totalDocs, depth + 1)
        if (childNode.count === totalDocs) {
          required.push(key)
        }
      })

      // Sort keys
      const sortedProperties: Record<string, any> = {}
      Object.keys(properties).sort().forEach(key => {
        sortedProperties[key] = properties[key]
      })

      return {
        type: 'object',
        additionalProperties: true,
        properties: sortedProperties,
        required: required.sort()
      }
    }

    if (type === 'array') {
      // Array type
      const result: any = { type: 'array' }

      if (node.arrayItemTypes && node.arrayItemTypes.size > 0) {
        const itemTypes = Array.from(node.arrayItemTypes)

        // Collapse if nested array
        if (itemTypes.includes('array')) {
          return result // Just {type: 'array'} without items
        }

        // For object arrays, use distinct shapes
        if (itemTypes.includes('object') && node.arrayItemShapes) {
          const shapes = Array.from(node.arrayItemShapes.values())

          // Collapse if > 5 distinct shapes
          if (shapes.length > 5) {
            return result // Just {type: 'array'} without items
          }

          // Convert each shape to JSON Schema, using arrayItemCount for required fields
          const shapeSchemas = shapes.map(shapeInfo => {
            const schema = schemaNodeToJSONSchema(shapeInfo.schema, node.arrayItemCount || 0, depth + 1)

            // If collapsed (empty object), skip
            if (Object.keys(schema).length === 0) {
              return null
            }
            return schema
          }).filter(s => s !== null)

          if (shapeSchemas.length === 0) {
            return result
          }

          // Always use anyOf for objects (test convention)
          result.items = {
            anyOf: shapeSchemas
          }
          return result
        }

        if (itemTypes.length === 1) {
          // Single primitive type
          result.items = { type: itemTypes[0] }
        } else {
          // Mixed primitive types
          result.items = {
            anyOf: itemTypes.sort().map(t => ({ type: t }))
          }
        }
      }

      return result
    }

    // Primitive type
    return { type: type }
  }

  // Multiple types - use anyOf
  return {
    anyOf: types.sort().map(t => ({ type: t }))
  }
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

    // Check if nested object (not EJSON, not array, not Date)
    const isNested = value && typeof value === 'object' &&
                     !Array.isArray(value) &&
                     !(value instanceof Date) &&
                     !(value as any).$oid && !(value as any).$date && !(value as any).$binary

    if (isNested) {
      // Recurse into nested objects, DON'T add parent
      Object.assign(fields, getAllFields(value, path))
    } else {
      // Only add leaf values (primitives, arrays, EJSON, Date instances)
      fields[path] = value
    }
  })

  return fields
}

/**
 * Schema tree node representing inferred structure
 *
 * Based on research:
 * - Variety.js (MongoDB schema analyzer): https://github.com/variety/variety
 * - mongodb-schema (probabilistic inference): https://github.com/mongodb-js/mongodb-schema
 * - Academic: "Schema Inference for Massive JSON Datasets" (EDBT 2017)
 */
interface SchemaNode {
  /** Primary type(s) - can be union for mixed types */
  types: Set<string>

  /** Number of documents where this field appeared */
  count: number

  /** Nested object structure (for type 'object') */
  children?: Map<string, SchemaNode>

  /** Array item types (for type 'array') */
  arrayItemTypes?: Set<string>

  /** Distinct object shapes in array (shape signature -> schema + count) */
  arrayItemShapes?: Map<string, { schema: SchemaNode; count: number }>

  /** Total count of array items (for required field calculation) */
  arrayItemCount?: number
}

/**
 * Build hierarchical schema tree from documents
 *
 * Algorithm based on Map-Reduce pattern:
 * 1. Map: Traverse each document, detect types for each field
 * 2. Reduce: Merge field information across all documents
 * 3. Result: Tree structure with type probabilities and nesting
 *
 * This approach differs from getAllFields() which returns flat dot notation.
 * Schema tree preserves hierarchical structure needed for code generation.
 *
 * @param docs - Array of documents to analyze
 * @param totalDocs - Total document count (for required field calculation)
 * @returns Root schema node representing document structure
 *
 * @example
 * ```typescript
 * const docs = [
 *   { user: { name: 'John', age: 30 } },
 *   { user: { name: 'Jane' } }  // age is optional
 * ]
 *
 * const schema = buildSchemaTree(docs, docs.length)
 * // schema.children.get('user').children.get('name').count === 2 (required)
 * // schema.children.get('user').children.get('age').count === 1 (optional)
 * ```
 */
function buildSchemaTree(docs: any[], totalDocs: number): SchemaNode {
  const root: SchemaNode = {
    types: new Set(['object']),
    count: totalDocs,
    children: new Map()
  }

  // Map phase: Analyze each document
  docs.forEach(doc => {
    if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
      analyzeObject(doc, root.children!, totalDocs)
    }
  })

  return root
}

/**
 * Compute shape signature for an object (sorted keys)
 *
 * Used to identify distinct object shapes in arrays.
 * Two objects with same keys (regardless of values) have same signature.
 *
 * @example
 * getObjectSignature({id: 1, name: 'a'}) === 'id,name'
 * getObjectSignature({name: 'b', id: 2}) === 'id,name' // same shape
 */
function getObjectSignature(obj: any): string {
  if (!obj || typeof obj !== 'object') return ''
  return Object.keys(obj).sort().join(',')
}

/**
 * Recursively analyze object structure and update schema tree
 *
 * Handles:
 * - Nested objects (recursive traversal)
 * - Arrays (with item type detection and distinct shape tracking)
 * - EJSON patterns (Date, ObjectID, Binary)
 * - Union types (mixed type fields)
 * - Optional vs required fields (based on occurrence count)
 *
 * @param obj - Object to analyze
 * @param schema - Parent schema node's children map
 * @param totalDocs - Total document count for required calculation
 */
function analyzeObject(
  obj: any,
  schema: Map<string, SchemaNode>,
  totalDocs: number
): void {
  Object.entries(obj).forEach(([key, value]) => {
    // Get or create schema node for this field
    if (!schema.has(key)) {
      schema.set(key, {
        types: new Set(),
        count: 0,
        children: undefined,
        arrayItemTypes: undefined,
        arrayItemShapes: undefined,
        arrayItemCount: undefined
      })
    }

    const node = schema.get(key)!
    node.count++

    // Detect type and update node
    const detectedType = detectPrimitiveType(value)

    if (detectedType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      // Nested object - recurse
      node.types.add('object')
      if (!node.children) {
        node.children = new Map()
      }
      analyzeObject(value, node.children, totalDocs)

    } else if (detectedType === 'array' && Array.isArray(value)) {
      // Array - analyze item types and track distinct object shapes
      node.types.add('array')
      if (!node.arrayItemTypes) {
        node.arrayItemTypes = new Set()
        node.arrayItemShapes = new Map()
        node.arrayItemCount = 0
      }

      node.arrayItemCount! += value.length

      value.forEach(item => {
        const itemType = detectPrimitiveType(item)
        node.arrayItemTypes!.add(itemType)

        // If array of objects, track distinct shapes
        if (itemType === 'object' && item && typeof item === 'object') {
          const signature = getObjectSignature(item)

          if (!node.arrayItemShapes!.has(signature)) {
            node.arrayItemShapes!.set(signature, {
              schema: {
                types: new Set(['object']),
                count: 0,
                children: new Map()
              },
              count: 0
            })
          }

          const shapeInfo = node.arrayItemShapes!.get(signature)!
          shapeInfo.count++

          // Analyze this object's structure
          analyzeObject(item, shapeInfo.schema.children!, value.length)
        }
      })

    } else {
      // Primitive, EJSON, or Date instance
      node.types.add(detectedType)
    }
  })
}

/**
 * Detect primitive type of a value
 *
 * Priority order (MUST check in this order to avoid false positives):
 * 1. null/undefined
 * 2. EJSON patterns ($oid, $date, $binary)
 * 3. instanceof Date (before typeof object)
 * 4. Arrays (before typeof object)
 * 5. Primitives (string, number, boolean)
 * 6. Plain objects
 *
 * Returns semantic types for code generation:
 * - 'Date' for EJSON $date or Date instances
 * - 'ObjectId' for EJSON $oid
 * - 'Buffer' for EJSON $binary
 * - Standard primitives: 'string', 'number', 'boolean', 'null'
 * - Complex: 'array', 'object'
 */
function detectPrimitiveType(value: any): string {
  // 1. Null/undefined first
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  // 2. EJSON patterns (MongoDB Extended JSON)
  if (value && typeof value === 'object') {
    if (value.$oid && typeof value.$oid === 'string') return 'ObjectId'
    if ('$date' in value) return 'Date'
    if (value.$binary && typeof value.$binary === 'string') return 'Buffer'
  }

  // 3. Date instance (before typeof object check)
  if (value instanceof Date) return 'Date'

  // 4. Arrays (before typeof object check)
  if (Array.isArray(value)) return 'array'

  // 5. Primitives
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'

  // 6. Plain objects (last resort)
  if (typeof value === 'object') return 'object'

  return 'unknown'
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
// Public Schema Inference API
// ============================================================================

/**
 * Infer JSON Schema from documents with progress reporting and abort support
 *
 * Used by tests and external consumers. Returns full JSON Schema object.
 *
 * @param docs - Array of documents to analyze
 * @param onProgress - Progress callback (progress: number, message: string)
 * @param signal - AbortSignal for cancellation
 * @returns Full JSON Schema (draft 2020-12)
 */
export function inferSchema(
  docs: any[],
  onProgress: (progress: number, message: string) => void,
  signal: AbortSignal
): any {
  // Check abort
  if (signal?.aborted) {
    throw new DOMException('AbortError', 'AbortError')
  }

  // Handle empty collection
  if (!docs || docs.length === 0) {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: true,
      type: 'array',
      items: {}
    }
  }

  onProgress?.(0.1, 'Inferring schema from documents...')

  // Use internal inference
  const { properties, required } = inferJSONSchema(docs)

  onProgress?.(0.9, 'Finalizing schema...')

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: true,
    type: 'object',
    properties,
    required
  }
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
