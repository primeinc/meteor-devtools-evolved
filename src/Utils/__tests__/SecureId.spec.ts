import {
  generateSecureRandomString,
  generateSecureUUID,
  generateTransferId,
  generateAuthToken,
  generateClientInstanceId,
} from '../SecureId'

describe('SecureId', () => {
  describe('generateSecureRandomString', () => {
    it('should generate a hex string of correct length', () => {
      const result = generateSecureRandomString(16)
      expect(result).toMatch(/^[0-9a-f]{32}$/) // 16 bytes = 32 hex chars
    })

    it('should generate different values on each call', () => {
      const id1 = generateSecureRandomString()
      const id2 = generateSecureRandomString()
      expect(id1).not.toBe(id2)
    })

    it('should support custom length', () => {
      const result = generateSecureRandomString(8)
      expect(result).toMatch(/^[0-9a-f]{16}$/) // 8 bytes = 16 hex chars
    })
  })

  describe('generateSecureUUID', () => {
    it('should generate UUID format', () => {
      const uuid = generateSecureUUID()
      // UUID format: 8-4-4-4-12 hex digits
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })

    it('should generate unique values', () => {
      const uuid1 = generateSecureUUID()
      const uuid2 = generateSecureUUID()
      expect(uuid1).not.toBe(uuid2)
    })
  })

  describe('generateTransferId', () => {
    it('should generate transfer ID with dl- prefix', () => {
      const id = generateTransferId()
      expect(id).toMatch(/^dl-[0-9a-f]{32}$/)
    })

    it('should be unique', () => {
      const id1 = generateTransferId()
      const id2 = generateTransferId()
      expect(id1).not.toBe(id2)
    })
  })

  describe('generateAuthToken', () => {
    it('should generate token with tok- prefix', () => {
      const token = generateAuthToken()
      expect(token).toMatch(/^tok-[0-9a-f]{32}$/)
    })

    it('should be unique', () => {
      const token1 = generateAuthToken()
      const token2 = generateAuthToken()
      expect(token1).not.toBe(token2)
    })
  })

  describe('generateClientInstanceId', () => {
    it('should generate client ID with client- prefix', () => {
      const id = generateClientInstanceId()
      expect(id).toMatch(/^client-[0-9a-f]{32}$/)
    })

    it('should be unique', () => {
      const id1 = generateClientInstanceId()
      const id2 = generateClientInstanceId()
      expect(id1).not.toBe(id2)
    })
  })
})
