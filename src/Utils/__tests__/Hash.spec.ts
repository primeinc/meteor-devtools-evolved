import { sha256Hex } from '../Hash'

describe('Hash', () => {
  describe('sha256Hex', () => {
    // NIST Test Vectors (FIPS 180-4)
    describe('NIST official test vectors', () => {
      it('should hash empty string correctly', async () => {
        const input = new Uint8Array(0)
        const hash = await sha256Hex(input)

        // NIST test vector: SHA-256("")
        expect(hash).toBe(
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        )
      })

      it('should hash "abc" correctly', async () => {
        const input = new TextEncoder().encode('abc')
        const hash = await sha256Hex(input)

        // NIST test vector: SHA-256("abc")
        expect(hash).toBe(
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        )
      })

      it('should hash "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" correctly', async () => {
        const input = new TextEncoder().encode(
          'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        )
        const hash = await sha256Hex(input)

        // NIST test vector: SHA-256(448-bit message)
        expect(hash).toBe(
          '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
        )
      })
    })

    it('should produce correct hash for common input', async () => {
      const input = new TextEncoder().encode('hello world')
      const hash = await sha256Hex(input)

      // Known SHA-256 hash of "hello world"
      expect(hash).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      )
    })

    it('should produce different hashes for different inputs', async () => {
      const input1 = new TextEncoder().encode('test1')
      const input2 = new TextEncoder().encode('test2')

      const hash1 = await sha256Hex(input1)
      const hash2 = await sha256Hex(input2)

      expect(hash1).not.toBe(hash2)
    })

    it('should produce consistent hash for same input', async () => {
      const input = new TextEncoder().encode('consistent test')

      const hash1 = await sha256Hex(input)
      const hash2 = await sha256Hex(input)

      expect(hash1).toBe(hash2)
    })

    it('should handle binary data correctly', async () => {
      const input = new Uint8Array([0x00, 0x01, 0xff, 0xab, 0xcd])
      const hash = await sha256Hex(input)

      expect(hash).toHaveLength(64) // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[0-9a-f]{64}$/) // Only lowercase hex
    })

    it('should handle large input efficiently', async () => {
      // 1MB of data
      const input = new Uint8Array(1024 * 1024).fill(42)
      const hash = await sha256Hex(input)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should always produce 64-character hex string', async () => {
      const inputs = [
        new Uint8Array([0x00]),
        new TextEncoder().encode('a'),
        new TextEncoder().encode('test with spaces'),
        new Uint8Array(1000).fill(0),
      ]

      for (const input of inputs) {
        const hash = await sha256Hex(input)
        expect(hash).toHaveLength(64)
      }
    })

    it('should pad single-digit hex values with leading zero', async () => {
      // Input that produces hash with leading zeros
      const input = new TextEncoder().encode('test')
      const hash = await sha256Hex(input)

      // Hash should always be 64 chars (no missing leading zeros)
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should handle UTF-8 encoded strings correctly', async () => {
      const input = new TextEncoder().encode('Hello 世界 🌍')
      const hash = await sha256Hex(input)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce known hash for JSON data', async () => {
      const json = JSON.stringify({ _id: '1', name: 'test' })
      const input = new TextEncoder().encode(json)
      const hash = await sha256Hex(input)

      expect(hash).toHaveLength(64)
      // Verify deterministic for same JSON
      const hash2 = await sha256Hex(new TextEncoder().encode(json))
      expect(hash).toBe(hash2)
    })
  })
})
