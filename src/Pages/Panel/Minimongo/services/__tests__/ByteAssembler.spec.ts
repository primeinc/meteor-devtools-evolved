import { ByteAssembler } from '../ByteAssembler'

describe('ByteAssembler', () => {
  describe('empty array', () => {
    it('should produce valid empty array JSON', async () => {
      const writer = new ByteAssembler()
      writer.beginArray()
      writer.endArray()

      const blob = writer.toBlob()
      const text = await blob.text()

      expect(text).toBe('[]')
      expect(JSON.parse(text)).toEqual([])
    })
  })

  describe('single item', () => {
    it('should produce valid single-item array', async () => {
      const writer = new ByteAssembler()
      const item = { _id: '1', name: 'test' }

      writer.beginArray()
      writer.item(JSON.stringify(item), true)
      writer.endArray()

      const blob = writer.toBlob()
      const text = await blob.text()
      const parsed = JSON.parse(text)

      expect(parsed).toEqual([item])
    })
  })

  describe('multiple items', () => {
    it('should produce valid array with comma separation', async () => {
      const writer = new ByteAssembler()
      const items = [
        { _id: '1', value: 'first' },
        { _id: '2', value: 'second' },
        { _id: '3', value: 'third' },
      ]

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const text = await blob.text()
      const parsed = JSON.parse(text)

      expect(parsed).toEqual(items)
    })
  })

  describe('boundary conditions', () => {
    it('should handle exactly chunk size items', async () => {
      const writer = new ByteAssembler()
      const chunkSize = 500
      const items = Array.from({ length: chunkSize }, (_, i) => ({
        _id: String(i),
        index: i,
      }))

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const text = await blob.text()
      const parsed = JSON.parse(text)

      expect(parsed).toHaveLength(chunkSize)
      expect(parsed[0]).toEqual(items[0])
      expect(parsed[chunkSize - 1]).toEqual(items[chunkSize - 1])
    })

    it('should handle chunk size + 1 items', async () => {
      const writer = new ByteAssembler()
      const count = 501
      const items = Array.from({ length: count }, (_, i) => ({ _id: String(i) }))

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const parsed = JSON.parse(await blob.text())

      expect(parsed).toHaveLength(count)
    })

    it('should handle chunk size - 1 items', async () => {
      const writer = new ByteAssembler()
      const count = 499
      const items = Array.from({ length: count }, (_, i) => ({ _id: String(i) }))

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const parsed = JSON.parse(await blob.text())

      expect(parsed).toHaveLength(count)
    })
  })

  describe('size cap enforcement', () => {
    it('should throw when exceeding hard cap', () => {
      const smallCap = 100 // 100 bytes
      const writer = new ByteAssembler(smallCap)

      writer.beginArray()

      // Try to add items that will exceed the cap
      expect(() => {
        for (let i = 0; i < 100; i++) {
          writer.item(JSON.stringify({ data: 'x'.repeat(50) }), false)
        }
      }).toThrow(/exceeds size limit/)
    })

    it('should track total bytes correctly', () => {
      const writer = new ByteAssembler()
      writer.beginArray()
      writer.item(JSON.stringify({ _id: '1' }), false)
      writer.item(JSON.stringify({ _id: '2' }), true)
      writer.endArray()

      const totalBytes = writer.getTotalBytes()
      expect(totalBytes).toBeGreaterThan(0)

      // Should match actual blob size
      const blobSize = writer.toBlob().size
      expect(totalBytes).toBe(blobSize)
    })
  })

  describe('special characters', () => {
    it('should handle unicode characters correctly', async () => {
      const writer = new ByteAssembler()
      const items = [
        { _id: '1', text: 'Hello 世界' },
        { _id: '2', emoji: '🚀💻' },
        { _id: '3', special: 'quotes"and\'stuff' },
      ]

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const parsed = JSON.parse(await blob.text())

      expect(parsed).toEqual(items)
    })
  })

  describe('large arrays', () => {
    it('should handle 10k items efficiently', async () => {
      const writer = new ByteAssembler()
      const count = 10000
      const items = Array.from({ length: count }, (_, i) => ({
        _id: String(i),
        timestamp: Date.now(),
        data: { value: i * 2 },
      }))

      writer.beginArray()
      items.forEach((item, idx) => {
        writer.item(JSON.stringify(item), idx === items.length - 1)
      })
      writer.endArray()

      const blob = writer.toBlob()
      const parsed = JSON.parse(await blob.text())

      expect(parsed).toHaveLength(count)
      expect(parsed[0]._id).toBe('0')
      expect(parsed[count - 1]._id).toBe(String(count - 1))
    })
  })
})
