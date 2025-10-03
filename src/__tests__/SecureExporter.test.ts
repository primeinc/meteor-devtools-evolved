import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateExportToken, SecureExporter } from '../Utils/SecureExporter'

describe('SecureExporter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateExportToken', () => {
    it('should generate a random token', () => {
      const token1 = generateExportToken()
      const token2 = generateExportToken()

      expect(token1).toBeTruthy()
      expect(token2).toBeTruthy()
      expect(token1).not.toBe(token2)
      expect(token1).toHaveLength(64) // 32 bytes * 2 chars per byte
    })

    it('should generate tokens with valid hex characters', () => {
      const token = generateExportToken()
      expect(token).toMatch(/^[0-9a-f]+$/)
    })
  })

  describe('SecureExporter', () => {
    it('should create instance with unique token', () => {
      const exporter1 = new SecureExporter()
      const exporter2 = new SecureExporter()

      expect(exporter1.getToken()).toBeTruthy()
      expect(exporter2.getToken()).toBeTruthy()
      expect(exporter1.getToken()).not.toBe(exporter2.getToken())
    })

    it('should abort export', () => {
      const exporter = new SecureExporter()

      expect(exporter.isAborted()).toBe(false)

      exporter.abort()

      expect(exporter.isAborted()).toBe(true)
    })

    it('should send abort message when aborted', () => {
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
      const exporter = new SecureExporter()
      const token = exporter.getToken()

      exporter.abort()

      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'export-abort',
        token,
      })
    })

    it('should not send abort message multiple times', () => {
      const sendMessageSpy = vi.spyOn(chrome.runtime, 'sendMessage')
      const exporter = new SecureExporter()

      exporter.abort()
      exporter.abort()
      exporter.abort()

      // Should only be called once
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    it('should create offscreen document before export', async () => {
      const createDocumentSpy = vi
        .spyOn(chrome.offscreen, 'createDocument')
        .mockResolvedValue(undefined)
      const getContextsSpy = vi
        .spyOn(chrome.runtime, 'getContexts')
        .mockResolvedValue([])
      const sendMessageSpy = vi
        .spyOn(chrome.runtime, 'sendMessage')
        .mockResolvedValue(undefined)

      const exporter = new SecureExporter()
      const data = { test: 'data' }

      await exporter.export(data, 'test.json')

      expect(getContextsSpy).toHaveBeenCalled()
      expect(createDocumentSpy).toHaveBeenCalledWith({
        url: 'offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Export large datasets without blocking service worker',
      })
    })

    it('should send init message with correct parameters', async () => {
      vi.spyOn(chrome.runtime, 'getContexts').mockResolvedValue([])
      vi.spyOn(chrome.offscreen, 'createDocument').mockResolvedValue(undefined)
      const sendMessageSpy = vi
        .spyOn(chrome.runtime, 'sendMessage')
        .mockResolvedValue(undefined)

      const exporter = new SecureExporter()
      const data = { test: 'data' }
      const token = exporter.getToken()

      await exporter.export(data, 'test.json')

      const calls = sendMessageSpy.mock.calls
      const initCall = calls.find(call => call[0].type === 'export-init')

      expect(initCall).toBeTruthy()
      expect(initCall[0]).toMatchObject({
        type: 'export-init',
        token,
        filename: 'test.json',
        totalChunks: expect.any(Number),
      })
    })

    it('should send data in chunks', async () => {
      vi.spyOn(chrome.runtime, 'getContexts').mockResolvedValue([])
      vi.spyOn(chrome.offscreen, 'createDocument').mockResolvedValue(undefined)
      const sendMessageSpy = vi
        .spyOn(chrome.runtime, 'sendMessage')
        .mockResolvedValue(undefined)

      const exporter = new SecureExporter()
      // Create data larger than chunk size (100KB)
      const largeData = { items: new Array(10000).fill('test data string') }
      const token = exporter.getToken()

      await exporter.export(largeData, 'large.json')

      const calls = sendMessageSpy.mock.calls
      const chunkCalls = calls.filter(call => call[0].type === 'export-chunk')

      expect(chunkCalls.length).toBeGreaterThan(1)

      // Verify chunk structure
      chunkCalls.forEach((call, index) => {
        expect(call[0]).toMatchObject({
          type: 'export-chunk',
          token,
          chunkIndex: index,
          totalChunks: chunkCalls.length,
          data: expect.any(String),
          isLast: index === chunkCalls.length - 1,
        })
      })
    })

    it('should throw error when aborted before export', async () => {
      const exporter = new SecureExporter()
      exporter.abort()

      await expect(
        exporter.export({ test: 'data' }, 'test.json'),
      ).rejects.toThrow('Export was aborted')
    })

    it('should throw error when aborted during export', async () => {
      vi.spyOn(chrome.runtime, 'getContexts').mockResolvedValue([])
      vi.spyOn(chrome.offscreen, 'createDocument').mockResolvedValue(undefined)

      let callCount = 0
      vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation(async () => {
        callCount++
        // Abort after first chunk
        if (callCount > 2) {
          throw new Error('Export was aborted')
        }
      })

      const exporter = new SecureExporter()
      // Create large data to ensure multiple chunks
      const largeData = { items: new Array(10000).fill('test data string') }

      // Abort after a short delay
      setTimeout(() => exporter.abort(), 50)

      await expect(
        exporter.export(largeData, 'large.json'),
      ).rejects.toThrow()
    })

    it('should handle small data in single chunk', async () => {
      vi.spyOn(chrome.runtime, 'getContexts').mockResolvedValue([])
      vi.spyOn(chrome.offscreen, 'createDocument').mockResolvedValue(undefined)
      const sendMessageSpy = vi
        .spyOn(chrome.runtime, 'sendMessage')
        .mockResolvedValue(undefined)

      const exporter = new SecureExporter()
      const smallData = { test: 'data' }
      const token = exporter.getToken()

      await exporter.export(smallData, 'small.json')

      const calls = sendMessageSpy.mock.calls
      const chunkCalls = calls.filter(call => call[0].type === 'export-chunk')

      expect(chunkCalls.length).toBe(1)
      expect(chunkCalls[0][0]).toMatchObject({
        type: 'export-chunk',
        token,
        chunkIndex: 0,
        totalChunks: 1,
        isLast: true,
      })
    })

    it('should not reuse offscreen document if already exists', async () => {
      const getContextsSpy = vi
        .spyOn(chrome.runtime, 'getContexts')
        .mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }] as any)
      const createDocumentSpy = vi
        .spyOn(chrome.offscreen, 'createDocument')
        .mockResolvedValue(undefined)
      vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined)

      const exporter = new SecureExporter()
      await exporter.export({ test: 'data' }, 'test.json')

      expect(getContextsSpy).toHaveBeenCalled()
      expect(createDocumentSpy).not.toHaveBeenCalled()
    })
  })
})
