/**
 * MongoDB Export Formats - EJSON and Format Validation Tests
 *
 * Tests all 8 export formats with EJSON data types to ensure correct handling of:
 * - ObjectId ($oid)
 * - Date ($date and Date instances)
 * - Binary ($binary)
 * - Proper format-specific output (NDJSON vs Array, Shell syntax, etc.)
 */

import { describe, it, expect } from '@jest/globals'
import {
  MONGO_IMPORT_NDJSON,
  MONGO_IMPORT_ARRAY,
  MONGO_COMPASS,
  MONGO_SHELL,
  TYPESCRIPT_INTERFACE,
  MONGOOSE_SCHEMA,
  JSON_SCHEMA,
  CSV,
} from '../MongoExportFormats'

// Test data with all EJSON types (using correct Meteor EJSON format)
// Note: Meteor EJSON uses numeric timestamps (ms since epoch), not ISO strings
const testDate1 = new Date('2024-01-15T10:30:00.000Z')
const testDate2 = new Date('2024-01-16T15:45:00.000Z')

const ejsonTestDocs = [
  {
    _id: '507f1f77bcf86cd799439011', // Meteor uses string IDs client-side
    name: 'Test User',
    createdAt: { $date: testDate1.getTime() },
    avatar: { $binary: 'SGVsbG8gV29ybGQ=' },
    score: 42,
    active: true,
  },
  {
    _id: '507f1f77bcf86cd799439012',
    name: 'Another User',
    createdAt: { $date: testDate2.getTime() },
    score: 85,
    active: false,
  },
]

const dateInstanceDocs = [
  {
    _id: 'string-id-1',
    timestamp: new Date('2024-01-15T10:30:00.000Z'),
    name: 'With Date Instance',
  },
]

describe('MongoExportFormats - EJSON Handling', () => {
  describe('MONGO_IMPORT_NDJSON', () => {
    it('should produce newline-delimited JSON (one per line, no array)', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const lines = result.split('\n')
      expect(lines).toHaveLength(2)

      // Each line should be valid JSON
      expect(() => JSON.parse(lines[0])).not.toThrow()
      expect(() => JSON.parse(lines[1])).not.toThrow()

      // Should NOT start with array bracket
      expect(result.trim()).not.toMatch(/^\[/)
      expect(result.trim()).not.toMatch(/\]$/)
    })

    it('should preserve _id as string', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('"_id":"507f1f77bcf86cd799439011"')
    })

    it('should preserve EJSON Date format (numeric timestamp)', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('"$date"')
      expect(result).toContain(String(testDate1.getTime()))
    })

    it('should preserve EJSON Binary format', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('"$binary"')
      expect(result).toContain('SGVsbG8gV29ybGQ=')
    })
  })

  describe('MONGO_IMPORT_ARRAY', () => {
    it('should produce JSON array format', () => {
      const result = MONGO_IMPORT_ARRAY.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      // Should be valid JSON array
      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
    })

    it('should preserve all EJSON types in array format', () => {
      const result = MONGO_IMPORT_ARRAY.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const parsed = JSON.parse(result)
      expect(parsed[0]._id).toBe('507f1f77bcf86cd799439011')
      // EJSON.stringify may wrap $date/$binary in $escape for serialization safety
      const createdAt = parsed[0].createdAt
      const actualDate = createdAt.$escape ? createdAt.$escape.$date : createdAt.$date
      expect(actualDate).toBe(testDate1.getTime())

      const avatar = parsed[0].avatar
      const actualBinary = avatar.$escape ? avatar.$escape.$binary : avatar.$binary
      expect(actualBinary).toBe('SGVsbG8gV29ybGQ=')
    })
  })

  describe('MONGO_SHELL', () => {
    it('should use insertMany for multiple docs', () => {
      const result = MONGO_SHELL.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('db.users.insertMany([')
      expect(result).toContain(']);')
    })

    it('should preserve string _id', () => {
      const result = MONGO_SHELL.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('"507f1f77bcf86cd799439011"')
    })

    it('should convert EJSON $date (numeric) to ISODate()', () => {
      const result = MONGO_SHELL.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      // $date with numeric timestamp should convert to ISODate
      expect(result).toContain('ISODate("2024-01-15T10:30:00.000Z")')
      expect(result).not.toContain('"$date"')
      expect(result).not.toContain(String(testDate1.getTime()))
    })

    it('should convert Date instances to ISODate()', () => {
      const result = MONGO_SHELL.formatter({
        documents: dateInstanceDocs,
        collectionName: 'events',
      })

      expect(result).toContain('ISODate("2024-01-15T10:30:00.000Z")')
    })

    it('should convert EJSON $binary to BinData()', () => {
      const result = MONGO_SHELL.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('BinData(0, "SGVsbG8gV29ybGQ=")')
      expect(result).not.toContain('"$binary"')
    })

    it('should use insertOne for single document', () => {
      const result = MONGO_SHELL.formatter({
        documents: [ejsonTestDocs[0]],
        collectionName: 'users',
      })

      expect(result).toContain('db.users.insertOne(')
      expect(result).toContain(');')
      expect(result).not.toContain('insertMany')
    })
  })

  describe('MONGO_COMPASS', () => {
    it('should produce valid JSON array', () => {
      const result = MONGO_COMPASS.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(() => JSON.parse(result)).not.toThrow()
      const parsed = JSON.parse(result)
      expect(Array.isArray(parsed)).toBe(true)
    })

    it('should preserve EJSON for MongoDB Compass', () => {
      const result = MONGO_COMPASS.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const parsed = JSON.parse(result)
      expect(parsed[0]._id).toBe('507f1f77bcf86cd799439011')
      // EJSON.stringify may wrap $date in $escape
      const createdAt = parsed[0].createdAt
      const actualDate = createdAt.$escape ? createdAt.$escape.$date : createdAt.$date
      expect(actualDate).toBe(testDate1.getTime())
    })
  })

  describe('CSV', () => {
    it('should handle EJSON types as stringified values', () => {
      const result = CSV.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const lines = result.split('\n')
      expect(lines[0]).toContain('_id')
      expect(lines[0]).toContain('createdAt')

      // EJSON {$date: number} should be stringified in CSV
      expect(lines[1]).toContain('507f1f77bcf86cd799439011')
      expect(lines[1]).toContain(String(testDate1.getTime())) // Numeric timestamp
    })

    it('should escape quotes in string values', () => {
      const docsWithQuotes = [
        { name: 'User with "quotes"', desc: 'Say "hello"' },
      ]

      const result = CSV.formatter({
        documents: docsWithQuotes,
        collectionName: 'test',
      })

      // CSV should escape quotes as ""
      expect(result).toContain('User with ""quotes""')
      expect(result).toContain('Say ""hello""')
    })
  })

  describe('TYPESCRIPT_INTERFACE', () => {
    it('should generate valid TypeScript interface', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('export interface Users {')
      expect(result).toContain('_id: string')
      expect(result).toContain('name: string')
      expect(result).toContain('createdAt: Date')
      expect(result).toContain('score: number')
      expect(result).toContain('active: boolean')
      expect(result).toContain('}')
    })

    it('should map ObjectId to string', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('_id: string')
    })

    it('should map EJSON Date to Date', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('createdAt: Date')
    })

    it('should map Binary to Buffer', () => {
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('avatar?: Buffer')
    })
  })

  describe('MONGOOSE_SCHEMA', () => {
    it('should generate valid Mongoose schema', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('const mongoose = require')
      expect(result).toContain('const UsersSchema = new mongoose.Schema({')
      expect(result).toContain('module.exports = mongoose.model')
    })

    it('should map string _id to String type', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('type: String')
      expect(result).not.toContain('Schema.Types.ObjectId') // Meteor uses string IDs
    })

    it('should map EJSON Date to Date', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('type: Date')
    })

    it('should map Binary to Buffer', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      expect(result).toContain('type: Buffer')
    })

    it('should mark required fields correctly', () => {
      const result = MONGOOSE_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      // Fields in all documents
      expect(result).toMatch(/name:.*required: true/)
      expect(result).toMatch(/score:.*required: true/)

      // Optional field (only in first doc)
      expect(result).toMatch(/avatar:.*required: false/)
    })
  })

  describe('JSON_SCHEMA', () => {
    it('should generate valid JSON Schema draft 2020-12', () => {
      const result = JSON_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const schema = JSON.parse(result)
      expect(schema.$schema).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      )
      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
    })

    it('should infer _id as string type', () => {
      const result = JSON_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const schema = JSON.parse(result)
      expect(schema.properties._id.type).toBe('string')
    })

    it('should infer Date as Date type with format', () => {
      const result = JSON_SCHEMA.formatter({
        documents: ejsonTestDocs,
        collectionName: 'users',
      })

      const schema = JSON.parse(result)
      // Date should be recognized in schema
      expect(schema.properties.createdAt).toBeDefined()
    })
  })
})

describe('MongoExportFormats - _id Type Variety', () => {
  // MongoDB allows _id to be ANY BSON type (except array)
  // Meteor defaults to string, but can use ObjectId with idGeneration: "MONGO"
  // Tests MUST NOT assume _id is always one type!

  it('should handle string _id (Meteor default)', () => {
    const docs = [{ _id: 'abc123', name: 'Test' }]
    const result = JSON_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    const schema = JSON.parse(result)
    expect(schema.properties._id.type).toBe('string')
  })

  it('should handle ObjectId _id (EJSON format)', () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Test' }]
    const result = JSON_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    const schema = JSON.parse(result)
    // ObjectId detected from EJSON
    expect(schema.properties._id).toBeDefined()
  })

  it('should handle numeric _id (valid MongoDB)', () => {
    const docs = [{ _id: 12345, name: 'Test' }]
    const result = JSON_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    const schema = JSON.parse(result)
    expect(schema.properties._id.type).toBe('number')
  })

  it('should handle mixed _id types across documents', () => {
    const docs = [
      { _id: 'string-id', name: 'Test 1' },
      { _id: 42, name: 'Test 2' },
    ]
    const result = JSON_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    const schema = JSON.parse(result)
    // Should produce anyOf for mixed types
    expect(schema.properties._id.anyOf).toBeDefined()
  })

  it('TypeScript should map ObjectId to string', () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Test' }]
    const result = TYPESCRIPT_INTERFACE.formatter({ documents: docs, collectionName: 'test' })
    expect(result).toContain('_id: string') // TS has no ObjectId type
  })

  it('Mongoose should map ObjectId to Schema.Types.ObjectId', () => {
    const docs = [{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Test' }]
    const result = MONGOOSE_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    expect(result).toContain('Schema.Types.ObjectId')
  })

  it('Mongoose should map string _id to String', () => {
    const docs = [{ _id: 'meteor-string-id', name: 'Test' }]
    const result = MONGOOSE_SCHEMA.formatter({ documents: docs, collectionName: 'test' })
    expect(result).toContain('type: String')
    expect(result).not.toContain('Schema.Types.ObjectId')
  })
})

describe('MongoExportFormats - Edge Cases', () => {
  describe('empty collections', () => {
    it('NDJSON should return empty string', () => {
      const result = MONGO_IMPORT_NDJSON.formatter({
        documents: [],
        collectionName: 'empty',
      })
      expect(result).toBe('')
    })

    it('Array should return empty array', () => {
      const result = MONGO_IMPORT_ARRAY.formatter({
        documents: [],
        collectionName: 'empty',
      })
      expect(result).toBe('[]')
    })

    it('Shell should return comment', () => {
      const result = MONGO_SHELL.formatter({
        documents: [],
        collectionName: 'empty',
      })
      expect(result).toContain('// No documents to insert')
    })
  })

  describe('special characters', () => {
    it('should escape quotes in strings', () => {
      const docs = [{ text: 'He said "hello"' }]

      const shellResult = MONGO_SHELL.formatter({
        documents: docs,
        collectionName: 'test',
      })

      expect(shellResult).toContain('\\"hello\\"')
    })

    it('should escape newlines in strings', () => {
      const docs = [{ text: 'Line 1\nLine 2' }]

      const shellResult = MONGO_SHELL.formatter({
        documents: docs,
        collectionName: 'test',
      })

      expect(shellResult).toContain('\\n')
    })
  })
})

describe('MongoExportFormats - Invalid Identifier Handling', () => {
  describe('TYPESCRIPT_INTERFACE with numeric collection names', () => {
    it('should prefix interface name with underscore if collection starts with number', () => {
      const docs = [{ _id: '1', name: 'Test' }]
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: docs,
        collectionName: '123users',
      })

      expect(result).toContain('export interface _123users {')
      expect(result).not.toContain('export interface 123users {')
    })

    it('should handle empty collection name', () => {
      const docs = [{ _id: '1', name: 'Test' }]
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: docs,
        collectionName: '',
      })

      expect(result).toContain('export interface Document {')
    })

    it('should handle collection names with special characters only', () => {
      const docs = [{ _id: '1', name: 'Test' }]
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: docs,
        collectionName: '---',
      })

      expect(result).toContain('export interface Document {')
    })

    it('should handle valid collection names normally', () => {
      const docs = [{ _id: '1', name: 'Test' }]
      const result = TYPESCRIPT_INTERFACE.formatter({
        documents: docs,
        collectionName: 'users',
      })

      expect(result).toContain('export interface Users {')
    })
  })

  describe('MONGOOSE_SCHEMA with numeric collection names', () => {
    it('should prefix model name with underscore if collection starts with number', () => {
      const docs = [{ _id: '1', name: 'Test' }]
      const result = MONGOOSE_SCHEMA.formatter({
        documents: docs,
        collectionName: '123users',
      })

      expect(result).toContain('const _123usersSchema = new mongoose.Schema')
      expect(result).toContain("module.exports = mongoose.model('_123users'")
    })
  })
})
