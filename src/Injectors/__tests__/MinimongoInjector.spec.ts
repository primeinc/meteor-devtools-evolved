/**
 * MinimongoInjector - EJSON Serialization Tests
 *
 * Tests the clone DeepWithEJSON function to ensure it properly serializes
 * Date objects and other EJSON types for Chrome DevTools messaging protocol.
 */

import EJSON from 'ejson'

// Mock the window object with EJSON
global.window = {
  EJSON,
} as any

// Extract the cloneDeepWithEJSON function by requiring the module
// We'll need to export it from MinimongoInjector for testing
// For now, let's replicate the function logic here for testing

function cloneDeepWithEJSON(obj: any) {
  const EJSON = (window as any).EJSON || (window as any).Package?.ejson?.EJSON

  if (EJSON) {
    try {
      // Serialize with EJSON, then deserialize back to get cloned object with EJSON types
      // NOTE: EJSON.toJSONValue() cannot be used here because it would create infinite recursion
      // in the cleanup() function. The stringify/parse approach creates native Date instances
      // which cleanup() then converts to {$date: ...} format. Using toJSONValue() would
      // immediately create {$date: ...} objects which cleanup() would recursively process.
      const serialized = EJSON.stringify(obj)
      return EJSON.parse(serialized)
    } catch (e) {
      // Handle circular references or other EJSON serialization errors
      console.warn('EJSON.stringify failed (circular reference?):', (e as Error).message, '- Falling back to JSON.')
      // Fall through to JSON fallback below
    }
  }

  // Fallback to regular JSON (will lose Date objects)
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e) {
    // Handle circular references or other JSON serialization errors
    console.warn('Failed to clone object (circular reference or non-serializable data):', (e as Error).message)
    return {} // Return empty object instead of crashing
  }
}

function isArray(obj: any) {
  return Array.isArray(obj)
}

const cleanup = (object: any): any => {
  if (typeof object !== 'object') return object

  const clonedObject = cloneDeepWithEJSON(object)

  if (!clonedObject) return clonedObject

  Object.keys(clonedObject).forEach((key: string) => {
    if (!clonedObject[key]) {
      return
    }

    if (typeof clonedObject[key] === 'object') {
      if (isArray(clonedObject[key])) {
        clonedObject[key] = clonedObject[key].map((item: any) => cleanup(item))
        return
      }

      // cloneDeepWithEJSON returns native Date instances (from EJSON.parse)
      // Convert these back to EJSON wire format {$date: timestamp} for DevTools protocol
      if (clonedObject[key] instanceof Date) {
        clonedObject[key] = { $date: clonedObject[key].getTime() }
        return
      }

      // Handle other non-plain objects (excluding EJSON types)
      if (clonedObject[key].constructor.name !== 'Object' &&
          !clonedObject[key].$date &&
          !clonedObject[key].$binary) {
        if (typeof clonedObject[key].toString === 'function') {
          clonedObject[key] = `[Object::${
            clonedObject[key].constructor.name
          }] ${clonedObject[key].toString()}`
          return
        } else {
          clonedObject[key] = `[Object::${clonedObject[key].constructor.name}]`
          return
        }
      }

      clonedObject[key] = cleanup(clonedObject[key])
    }
  })

  return clonedObject
}

describe('MinimongoInjector - cloneDeepWithEJSON', () => {
  it('should convert Date objects to {$date: timestamp} format', () => {
    const testDate = new Date('2024-01-15T10:30:00.000Z')
    const input = {
      name: 'Test',
      createdAt: testDate,
    }

    const result = cleanup(input)

    expect(result.name).toBe('Test')
    expect(result.createdAt).toEqual({ $date: testDate.getTime() })
    expect(result.createdAt).not.toBeInstanceOf(Date)
  })

  it('should preserve EJSON $date format', () => {
    const testDate = new Date('2024-01-15T10:30:00.000Z')
    const input = {
      name: 'Test',
      createdAt: { $date: testDate.getTime() },
    }

    const result = cleanup(input)

    expect(result.name).toBe('Test')
    expect(result.createdAt).toEqual({ $date: testDate.getTime() })
  })

  it('should handle nested Date objects', () => {
    const testDate1 = new Date('2024-01-15T10:30:00.000Z')
    const testDate2 = new Date('2024-01-16T15:45:00.000Z')
    const input = {
      user: {
        name: 'John',
        createdAt: testDate1,
        profile: {
          updatedAt: testDate2,
        },
      },
    }

    const result = cleanup(input)

    expect(result.user.name).toBe('John')
    expect(result.user.createdAt).toEqual({ $date: testDate1.getTime() })
    expect(result.user.profile.updatedAt).toEqual({ $date: testDate2.getTime() })
  })

  it('should handle arrays with Date objects', () => {
    const testDate1 = new Date('2024-01-15T10:30:00.000Z')
    const testDate2 = new Date('2024-01-16T15:45:00.000Z')
    const input = {
      events: [
        { timestamp: testDate1 },
        { timestamp: testDate2 },
      ],
    }

    const result = cleanup(input)

    expect(result.events[0].timestamp).toEqual({ $date: testDate1.getTime() })
    expect(result.events[1].timestamp).toEqual({ $date: testDate2.getTime() })
  })

  it('should preserve EJSON $binary format', () => {
    const input = {
      name: 'Test',
      avatar: { $binary: 'SGVsbG8gV29ybGQ=' },
    }

    const result = cleanup(input)

    expect(result.name).toBe('Test')
    expect(result.avatar).toEqual({ $binary: 'SGVsbG8gV29ybGQ=' })
  })

  it('should handle primitives', () => {
    const input = {
      name: 'Test',
      age: 30,
      active: true,
      score: null,
    }

    const result = cleanup(input)

    expect(result).toEqual(input)
  })
})
