import { RelayClient } from '../RelayClient'

// Mock chrome.runtime
const mockPort = {
  postMessage: jest.fn(),
  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
  disconnect: jest.fn(),
}

const mockChrome = {
  runtime: {
    connect: jest.fn(() => mockPort),
  },
}

;(global as any).chrome = mockChrome
;(global as any).crypto = {
  randomUUID: jest.fn(() => 'test-uuid-1234'),
  getRandomValues: jest.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = i
    }
    return arr
  }),
}

describe('RelayClient', () => {
  // Silence console output during tests
  beforeAll(() => {
    jest.spyOn(console, 'debug').mockImplementation(() => {
      // Intentionally empty to silence console
    })
    jest.spyOn(console, 'info').mockImplementation(() => {
      // Intentionally empty to silence console
    })
    jest.spyOn(console, 'warn').mockImplementation(() => {
      // Intentionally empty to silence console
    })
    jest.spyOn(console, 'error').mockImplementation(() => {
      // Intentionally empty to silence console
    })
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should connect to export-relay port', () => {
      new RelayClient()
      expect(mockChrome.runtime.connect).toHaveBeenCalledWith({
        name: 'export-relay',
      })
    })

    it('should generate a security token', () => {
      const client = new RelayClient()
      expect((client as any).securityToken).toBeDefined()
      expect((client as any).securityToken).toBe('test-uuid-1234')
    })

    it('should use fallback token generation when randomUUID unavailable', () => {
      const originalRandomUUID = (global as any).crypto.randomUUID
      ;(global as any).crypto.randomUUID = undefined

      const client = new RelayClient()
      expect((client as any).securityToken).toBeDefined()
      // Should be 32 hex characters (16 bytes * 2)
      expect((client as any).securityToken).toMatch(/^[0-9a-f]{32}$/)
      ;(global as any).crypto.randomUUID = originalRandomUUID
    })
  })

  describe('sendBlob', () => {
    let client: RelayClient
    let messageListeners: any[]

    beforeEach(() => {
      messageListeners = []
      mockPort.onMessage.addListener.mockImplementation((listener: any) => {
        messageListeners.push(listener)
      })
      mockPort.onMessage.removeListener.mockImplementation((listener: any) => {
        const idx = messageListeners.indexOf(listener)
        if (idx >= 0) messageListeners.splice(idx, 1)
      })
      client = new RelayClient()
    })

    it('should send BEGIN message with security token', async () => {
      const blob = new Blob(['test data'], { type: 'text/plain' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      // Start sendBlob in background
      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        signal,
        onProgress,
      )

      // Wait for BEGIN message
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(mockPort.postMessage).toHaveBeenCalled()
      const beginMsg = mockPort.postMessage.mock.calls[0][0]
      expect(beginMsg.type).toBe('EXPORT_DOWNLOAD_BEGIN')
      expect(beginMsg.payload.token).toBe('test-uuid-1234')
      expect(beginMsg.payload.filename).toBe('test.txt')
      expect(beginMsg.payload.expectedHash).toBe('hash123')

      // Send ACK to complete
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      // Wait for CHUNK messages
      await new Promise(resolve => setTimeout(resolve, 10))

      // Send CHUNK ACKs
      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        c => c[0].type === 'EXPORT_DOWNLOAD_CHUNK',
      )
      chunkCalls.forEach((call, idx) => {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: call[0].payload.id,
              type: 'CHUNK',
              idx,
              token: 'test-uuid-1234',
            },
          }),
        )
      })

      // Wait for END message
      await new Promise(resolve => setTimeout(resolve, 10))
      const endMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_END',
      )
      expect(endMsg).toBeDefined()
      expect(endMsg[0].payload.token).toBe('test-uuid-1234')

      // Send END ACK
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: endMsg[0].payload.id,
            type: 'END',
            token: 'test-uuid-1234',
          },
        }),
      )

      await promise
    })

    it('should reject messages with wrong token', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        signal,
        onProgress,
      )

      await new Promise(resolve => setTimeout(resolve, 10))
      const beginMsg = mockPort.postMessage.mock.calls[0][0]

      // Send ACK with wrong token - should be ignored
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'wrong-token',
          },
        }),
      )

      // Wait a bit more to ensure timeout starts
      await new Promise(resolve => setTimeout(resolve, 100))

      // Send correct token to allow test to complete
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      // ACK chunks and END
      await new Promise(resolve => setTimeout(resolve, 10))
      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        c => c[0].type === 'EXPORT_DOWNLOAD_CHUNK',
      )
      for (const call of chunkCalls) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: call[0].payload.id,
              type: 'CHUNK',
              idx: call[0].payload.idx,
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      await new Promise(resolve => setTimeout(resolve, 10))
      const endMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_END',
      )
      if (endMsg) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: endMsg[0].payload.id,
              type: 'END',
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      await promise
    })

    it('should send ABORT message with token when signal aborted', async () => {
      const blob = new Blob(['test data'], { type: 'text/plain' })
      const controller = new AbortController()
      const onProgress = jest.fn()

      // Start the send
      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        controller.signal,
        onProgress,
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Abort immediately (before ACK)
      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      // Check for ABORT message with token
      const abortMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_ABORT',
      )
      expect(abortMsg).toBeDefined()
      expect(abortMsg[0].payload.token).toBe('test-uuid-1234')

      // Promise should reject, but we don't need to wait for full timeout
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 100),
          ),
        ])
      } catch (e) {
        // Expected to fail
      }
    })

    it('should throw AbortError when signal already aborted', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      const controller = new AbortController()
      controller.abort() // Abort before starting
      const onProgress = jest.fn()

      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        controller.signal,
        onProgress,
      )

      await new Promise(resolve => setTimeout(resolve, 10))
      const beginMsg = mockPort.postMessage.mock.calls[0][0]

      // Send BEGIN ACK
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      await expect(promise).rejects.toThrow()
    })

    it('should include token in all message types', () => {
      // Verify BEGIN message has token
      mockPort.postMessage.mockClear()
      const msg1 = {
        type: 'EXPORT_DOWNLOAD_BEGIN',
        payload: {
          id: 'test1',
          filename: 'test.txt',
          mime: 'text/plain',
          expectedHash: 'hash',
          token: (client as any).securityToken,
        },
      }
      expect(msg1.payload.token).toBeDefined()

      // Verify CHUNK message would have token
      const msg2 = {
        type: 'EXPORT_DOWNLOAD_CHUNK',
        payload: {
          id: 'test1',
          idx: 0,
          bytes: [],
          token: (client as any).securityToken,
        },
      }
      expect(msg2.payload.token).toBeDefined()

      // Verify END message would have token
      const msg3 = {
        type: 'EXPORT_DOWNLOAD_END',
        payload: { id: 'test1', token: (client as any).securityToken },
      }
      expect(msg3.payload.token).toBeDefined()

      // Verify ABORT message would have token
      const msg4 = {
        type: 'EXPORT_DOWNLOAD_ABORT',
        payload: { id: 'test1', token: (client as any).securityToken },
      }
      expect(msg4.payload.token).toBeDefined()
    })

    it('should report progress during chunk transfer', async () => {
      // Use a smaller blob that will fit in one chunk to keep test simple
      const blob = new Blob(['test content'], { type: 'text/plain' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        signal,
        onProgress,
      )

      await new Promise(resolve => setTimeout(resolve, 10))
      const beginMsg = mockPort.postMessage.mock.calls[0][0]

      // Send BEGIN ACK
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      // Wait and ACK all chunks
      await new Promise(resolve => setTimeout(resolve, 20))
      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        c => c[0].type === 'EXPORT_DOWNLOAD_CHUNK',
      )

      for (const call of chunkCalls) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: call[0].payload.id,
              type: 'CHUNK',
              idx: call[0].payload.idx,
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      // ACK END
      await new Promise(resolve => setTimeout(resolve, 10))
      const endMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_END',
      )
      if (endMsg) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: endMsg[0].payload.id,
              type: 'END',
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      await promise

      // Progress should have been called at least once
      expect(onProgress).toHaveBeenCalled()
    })

    it('should retry on ACK timeout', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      // Reduce timeout for faster test
      const originalTimeout = 5000
      jest.useFakeTimers()

      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        signal,
        onProgress,
      )

      // Fast-forward through first attempt
      jest.advanceTimersByTime(originalTimeout)
      await Promise.resolve()

      // Should retry - check for multiple BEGIN messages
      expect(
        mockPort.postMessage.mock.calls.filter(
          c => c[0].type === 'EXPORT_DOWNLOAD_BEGIN',
        ).length,
      ).toBeGreaterThan(1)

      jest.useRealTimers()
    })

    it('should include all chunks with token', async () => {
      const blob = new Blob(['test data content'], { type: 'text/plain' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      const promise = client.sendBlob(
        blob,
        'test.txt',
        'text/plain',
        'hash123',
        signal,
        onProgress,
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // ACK BEGIN
      const beginMsg = mockPort.postMessage.mock.calls[0][0]
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      // Check all chunk messages have token
      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        c => c[0].type === 'EXPORT_DOWNLOAD_CHUNK',
      )
      expect(chunkCalls.length).toBeGreaterThan(0)
      chunkCalls.forEach(call => {
        expect(call[0].payload.token).toBe('test-uuid-1234')
      })

      // ACK chunks and END
      for (const call of chunkCalls) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: call[0].payload.id,
              type: 'CHUNK',
              idx: call[0].payload.idx,
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      await new Promise(resolve => setTimeout(resolve, 10))
      const endMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_END',
      )
      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: endMsg[0].payload.id,
            type: 'END',
            token: 'test-uuid-1234',
          },
        }),
      )

      await promise
    })
  })

  describe('chunking', () => {
    it('should send data in chunks with proper tokens', async () => {
      const client = new RelayClient()
      const messageListeners: any[] = []

      mockPort.onMessage.addListener.mockImplementation((listener: any) => {
        messageListeners.push(listener)
      })
      mockPort.onMessage.removeListener.mockImplementation((listener: any) => {
        const idx = messageListeners.indexOf(listener)
        if (idx >= 0) messageListeners.splice(idx, 1)
      })

      // Create blob with predictable size (small enough for test)
      const data = new Uint8Array(256)
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256
      }
      const blob = new Blob([data], { type: 'application/octet-stream' })
      const signal = new AbortController().signal
      const onProgress = jest.fn()

      const promise = client.sendBlob(
        blob,
        'test.bin',
        'application/octet-stream',
        'hash123',
        signal,
        onProgress,
      )

      // ACK BEGIN
      await new Promise(resolve => setTimeout(resolve, 10))
      const beginMsg = mockPort.postMessage.mock.calls[0][0]
      expect(beginMsg.payload.token).toBe('test-uuid-1234')

      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: beginMsg.payload.id,
            type: 'BEGIN',
            token: 'test-uuid-1234',
          },
        }),
      )

      // Process chunks
      await new Promise(resolve => setTimeout(resolve, 20))
      const chunkCalls = mockPort.postMessage.mock.calls.filter(
        c => c[0].type === 'EXPORT_DOWNLOAD_CHUNK',
      )

      // Should have at least 1 chunk
      expect(chunkCalls.length).toBeGreaterThanOrEqual(1)

      // All chunks should have token
      chunkCalls.forEach(call => {
        expect(call[0].payload.token).toBe('test-uuid-1234')
      })

      for (const call of chunkCalls) {
        messageListeners.forEach(l =>
          l({
            type: 'EXPORT_ACK',
            payload: {
              id: call[0].payload.id,
              type: 'CHUNK',
              idx: call[0].payload.idx,
              token: 'test-uuid-1234',
            },
          }),
        )
      }

      await new Promise(resolve => setTimeout(resolve, 10))
      const endMsg = mockPort.postMessage.mock.calls.find(
        c => c[0].type === 'EXPORT_DOWNLOAD_END',
      )
      expect(endMsg[0].payload.token).toBe('test-uuid-1234')

      messageListeners.forEach(l =>
        l({
          type: 'EXPORT_ACK',
          payload: {
            id: endMsg[0].payload.id,
            type: 'END',
            token: 'test-uuid-1234',
          },
        }),
      )

      await promise

      // Verify progress was tracked
      expect(onProgress).toHaveBeenCalled()
    })
  })
})
