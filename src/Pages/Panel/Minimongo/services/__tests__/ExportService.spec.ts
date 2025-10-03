import { ExportService, inferSchema } from '../ExportService'

// Force anchor+blob path under tests (relay needs chrome.runtime)
jest.mock('@/Config/flags', () => ({
  flags: { export: { useBackgroundRelay: false } },
}))

// Mock document.createElement for anchor download
const mockAnchor = {
  href: '',
  download: '',
  click: jest.fn(),
  remove: jest.fn(),
}

global.document = {
  createElement: jest.fn().mockImplementation(tag => {
    if (tag === 'a') return mockAnchor
    return {}
  }),
  body: {
    appendChild: jest.fn(),
  },
} as any

global.URL = {
  createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
  revokeObjectURL: jest.fn(),
} as any

describe('ExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('exportData', () => {
    it('should export empty collection', async () => {
      const onProgress = jest.fn()
      const signal = new AbortController().signal

      await ExportService.exportData('test', [], onProgress, signal)

      expect(onProgress).toHaveBeenCalled()
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should call progress callback during export', async () => {
      const docs = Array.from({ length: 100 }, (_, i) => ({ _id: String(i) }))
      const onProgress = jest.fn()
      const signal = new AbortController().signal

      await ExportService.exportData('test', docs, onProgress, signal)

      expect(onProgress.mock.calls.length).toBeGreaterThan(2)
      const progressValues = onProgress.mock.calls.map(call => call[0])
      expect(progressValues[0]).toBeLessThan(1)
      expect(progressValues[progressValues.length - 1]).toBeCloseTo(0.98)
    })

    it('should respect abort signal', async () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({ _id: String(i) }))
      const onProgress = jest.fn()
      const controller = new AbortController()

      // Abort after first progress update
      onProgress.mockImplementationOnce(() => controller.abort())

      await expect(
        ExportService.exportData('test', docs, onProgress, controller.signal),
      ).rejects.toThrow('AbortError')
    })

    it('should sanitize collection name in filename', async () => {
      const onProgress = jest.fn()
      const signal = new AbortController().signal

      await ExportService.exportData(
        'bad/name:with*chars',
        [{ _id: '1' }],
        onProgress,
        signal,
      )

      expect(mockAnchor.download).toMatch(/^bad_name_with_chars_/)
      expect(mockAnchor.download).toMatch(/\.json$/)
    })
  })

  describe('exportSchema', () => {
    it('should export schema with proper header', async () => {
      const docs = [{ _id: '1', name: 'test' }]
      const onProgress = jest.fn()
      const signal = new AbortController().signal

      await ExportService.exportSchema('test', docs, onProgress, signal)

      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toMatch(/\.schema\.json$/)
    })
  })
})

describe('inferSchema', () => {
  const noop = () => {}
  const signal = new AbortController().signal

  describe('empty collection', () => {
    it('should return minimal schema for empty array', () => {
      const schema = inferSchema([], noop, signal)

      expect(schema).toEqual({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        additionalProperties: true,
        type: 'array',
        items: {},
      })
    })
  })

  describe('primitive types', () => {
    it('should infer string type', () => {
      const docs = [{ name: 'Alice' }, { name: 'Bob' }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.name).toEqual({ type: 'string' })
    })

    it('should infer number type', () => {
      const docs = [{ age: 25 }, { age: 30 }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.age).toEqual({ type: 'number' })
    })

    it('should infer boolean type', () => {
      const docs = [{ active: true }, { active: false }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.active).toEqual({ type: 'boolean' })
    })

    it('should distinguish null from undefined', () => {
      const docs = [{ value: null }, { other: 123 }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.value).toEqual({ type: 'null' })
      expect(schema.properties.other).toEqual({ type: 'number' })
    })
  })

  describe('mixed types', () => {
    it('should create anyOf for 2 types', () => {
      const docs = [{ value: 'text' }, { value: 42 }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.value).toEqual({
        anyOf: [{ type: 'number' }, { type: 'string' }],
      })
    })

    it('should create anyOf for 3 types', () => {
      const docs = [{ value: 'text' }, { value: 42 }, { value: true }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.value.anyOf).toHaveLength(3)
      expect(schema.properties.value.anyOf).toContainEqual({ type: 'boolean' })
      expect(schema.properties.value.anyOf).toContainEqual({ type: 'number' })
      expect(schema.properties.value.anyOf).toContainEqual({ type: 'string' })
    })

    it('should collapse when more than 3 types', () => {
      const docs = [
        { value: 'text' },
        { value: 42 },
        { value: true },
        { value: null },
      ]
      const schema = inferSchema(docs, noop, signal)

      // Should collapse to empty object when > 3 types
      expect(schema.properties.value).toEqual({})
    })
  })

  describe('required fields', () => {
    it('should mark field required if present in all documents', () => {
      const docs = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.required).toContain('_id')
      expect(schema.required).toContain('name')
    })

    it('should not mark field required if missing from any document', () => {
      const docs = [{ _id: '1', name: 'Alice' }, { _id: '2' }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.required).toContain('_id')
      expect(schema.required).not.toContain('name')
    })

    it('should have sorted required array', () => {
      const docs = [{ zebra: 1, apple: 2, middle: 3 }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.required).toEqual(['apple', 'middle', 'zebra'])
    })
  })

  describe('nested objects', () => {
    it('should infer nested object schema', () => {
      const docs = [
        { user: { name: 'Alice', age: 25 } },
        { user: { name: 'Bob', age: 30 } },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.user).toEqual({
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['age', 'name'],
      })
    })

    it('should merge nested objects with different keys', () => {
      const docs = [
        { user: { name: 'Alice' } },
        { user: { age: 30 } },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.user.properties).toHaveProperty('name')
      expect(schema.properties.user.properties).toHaveProperty('age')
      expect(schema.properties.user.required).toEqual([])
    })

    it('should cap depth at 5 levels', () => {
      const deepDoc = {
        l1: {
          l2: {
            l3: {
              l4: {
                l5: {
                  l6: { value: 'too deep' },
                },
              },
            },
          },
        },
      }
      const schema = inferSchema([deepDoc], noop, signal)

      // Navigate to l5
      let current = schema.properties.l1
      for (let i = 2; i <= 5; i++) {
        expect(current).toHaveProperty('properties')
        current = current.properties[`l${i}`]
      }

      // l5 should have properties, but l6 should be collapsed
      expect(current.properties.l6).toEqual({})
    })
  })

  describe('arrays', () => {
    it('should infer array of primitives', () => {
      const docs = [{ tags: ['a', 'b', 'c'] }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.tags).toEqual({
        type: 'array',
        items: { type: 'string' },
      })
    })

    it('should infer array of objects with single shape', () => {
      const docs = [
        {
          items: [
            { id: 1, name: 'first' },
            { id: 2, name: 'second' },
          ],
        },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.items.type).toBe('array')
      expect(schema.properties.items.items.anyOf).toHaveLength(1)
      expect(schema.properties.items.items.anyOf[0]).toEqual({
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      })
    })

    it('should handle array with multiple object shapes', () => {
      const docs = [
        {
          items: [
            { type: 'A', value: 1 },
            { type: 'B', text: 'hello' },
          ],
        },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.items.type).toBe('array')
      expect(schema.properties.items.items.anyOf).toHaveLength(2)
    })

    it('should collapse array with more than 5 object shapes', () => {
      const docs = [
        {
          items: [
            { a: 1 },
            { b: 2 },
            { c: 3 },
            { d: 4 },
            { e: 5 },
            { f: 6 }, // 6th shape should trigger collapse
          ],
        },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.items).toEqual({ type: 'array' })
    })

    it('should collapse nested arrays', () => {
      const docs = [{ matrix: [[1, 2], [3, 4]] }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.matrix).toEqual({ type: 'array' })
    })

    it('should handle mixed primitive types in array', () => {
      const docs = [{ values: [1, 'two', 3] }]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.properties.values.type).toBe('array')
      expect(schema.properties.values.items.anyOf).toContainEqual({ type: 'number' })
      expect(schema.properties.values.items.anyOf).toContainEqual({ type: 'string' })
    })
  })

  describe('key sorting', () => {
    it('should have sorted property keys', () => {
      const docs = [{ zebra: 1, apple: 2, middle: 3 }]
      const schema = inferSchema(docs, noop, signal)

      const keys = Object.keys(schema.properties)
      expect(keys).toEqual(['apple', 'middle', 'zebra'])
    })
  })

  describe('abort handling', () => {
    it('should respect abort signal during inference', () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({ _id: String(i) }))
      const controller = new AbortController()

      // Abort immediately
      controller.abort()

      expect(() => {
        inferSchema(docs, noop, controller.signal)
      }).toThrow('AbortError')
    })
  })

  describe('progress reporting', () => {
    it('should call progress callback during inference', () => {
      const docs = Array.from({ length: 500 }, (_, i) => ({
        _id: String(i),
        value: i,
      }))
      const onProgress = jest.fn()
      const signal = new AbortController().signal

      inferSchema(docs, onProgress, signal)

      expect(onProgress.mock.calls.length).toBeGreaterThan(0)
      const messages = onProgress.mock.calls.map(call => call[1])
      expect(messages.some(m => m.includes('Inferring'))).toBe(true)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle typical MongoDB document', () => {
      const docs = [
        {
          _id: '507f1f77bcf86cd799439011',
          createdAt: '2023-01-01T00:00:00Z',
          user: {
            name: 'Alice',
            email: 'alice@example.com',
            age: 25,
          },
          tags: ['tag1', 'tag2'],
          active: true,
        },
      ]
      const schema = inferSchema(docs, noop, signal)

      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(schema.type).toBe('object')
      expect(schema.properties._id.type).toBe('string')
      expect(schema.properties.user.type).toBe('object')
      expect(schema.properties.tags.type).toBe('array')
      expect(schema.properties.active.type).toBe('boolean')
    })
  })
})
