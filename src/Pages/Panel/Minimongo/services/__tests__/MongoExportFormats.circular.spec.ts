/**
 * MongoDB Export Formats - Circular Reference Protection Tests
 *
 * Tests that export formats handle circular references gracefully without crashing
 */

import { describe, it, expect } from '@jest/globals'
import { MONGO_SHELL } from '../MongoExportFormats'

describe('MongoExportFormats - Circular Reference Protection', () => {
  it('should handle circular references in MONGO_SHELL format', () => {
    const circular: any = { name: 'test' }
    circular.self = circular // Create circular reference

    const result = MONGO_SHELL.formatter({
      collectionName: 'test',
      documents: [circular],
    })

    // Should contain [Circular] placeholder instead of crashing
    expect(result).toContain('[Circular]')
    expect(result).toContain('name: "test"')
  })

  it('should handle nested circular references', () => {
    const obj1: any = { name: 'obj1' }
    const obj2: any = { name: 'obj2', ref: obj1 }
    obj1.ref = obj2 // Create circular reference

    const result = MONGO_SHELL.formatter({
      collectionName: 'test',
      documents: [obj1],
    })

    expect(result).toContain('[Circular]')
    // Should not throw error
    expect(() =>
      MONGO_SHELL.formatter({
        collectionName: 'test',
        documents: [obj1],
      }),
    ).not.toThrow()
  })

  it('should handle circular references in arrays', () => {
    const arr: any[] = [1, 2, 3]
    arr.push(arr) // Array references itself

    const result = MONGO_SHELL.formatter({
      collectionName: 'test',
      documents: [{ values: arr }],
    })

    expect(result).toContain('[Circular]')
  })

  it('should handle multiple documents with shared circular references', () => {
    const shared: any = { id: 'shared' }
    shared.self = shared

    const doc1 = { name: 'doc1', ref: shared }
    const doc2 = { name: 'doc2', ref: shared }

    const result = MONGO_SHELL.formatter({
      collectionName: 'test',
      documents: [doc1, doc2],
    })

    // Each document should detect the circular reference independently
    const circularCount = (result.match(/\[Circular\]/g) || []).length
    expect(circularCount).toBeGreaterThanOrEqual(2)
  })
})
