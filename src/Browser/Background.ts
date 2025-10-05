import browser from 'webextension-polyfill'
import { createLogger } from '@/Utils/Logger'
import { generateAuthToken } from '@/Utils/SecureId'

const logger = createLogger('Background')
const exportLogger = createLogger('Export')

type Connection = Map<number, any>

declare global {
  interface Window {
    connections: Connection
  }
}

const Cache = new Map<number, string[]>()

const connections: Connection = new Map()

self.connections = connections

// Port-based relay for exports (works around blob context issues)
type TransferState = 'INIT' | 'IN_PROGRESS' | 'ABORTED' | 'FAILED' | 'COMPLETED'
type Transfer = {
  filename: string
  mime: string
  expectedHash?: string
  chunks: Uint8Array<ArrayBuffer>[]
  token: string
  senderId: string
  state: TransferState
  createdAt: number
  lastSeen: number
  expiry?: NodeJS.Timeout
  failureReason?: string
  inflight: number
}
const transfers = new Map<string, Transfer>()
const downloadIdToFilename = new Map<number, string>()

// Transfer lifecycle constants
const TTL_MS = 120_000 // 2 minutes
const FAILED_TRANSFER_CLEANUP_MS = 30_000 // 30 seconds
const TIMEOUT_TRANSFER_CLEANUP_MS = 10_000 // 10 seconds

// Flow control constants
const MAX_INFLIGHT = 8
const INFLIGHT_DECREMENT_DELAY_MS = 10

// Download fallback constants
const MAX_DATA_URL_SIZE = 4 * 1024 * 1024 // 4MB
const URL_REVOKE_DELAY_MS = 10_000 // 10 seconds
const OFFSCREEN_DOWNLOAD_TIMEOUT_MS = 30_000 // 30 seconds timeout for offscreen download

// Helper: convert Uint8Array to binary string for btoa()
function bytesToBinaryString(bytes: Uint8Array): string {
  // Using TextDecoder is more modern and performant for converting Uint8Array to a binary string.
  // The 'latin1' encoding ensures a 1:1 mapping of byte values to character codes, which is what btoa expects.
  return new TextDecoder('latin1').decode(bytes)
}

// Helper: mark transfer as failed and schedule cleanup
function markFailed(id: string, reason: string, port: RuntimePort) {
  const t = transfers.get(id)
  if (!t) {
    port.postMessage({ type: 'EXPORT_FAILED', payload: { id, reason } })
    return
  }
  if (t.state === 'FAILED' || t.state === 'COMPLETED') return // Already handled
  t.state = 'FAILED'
  t.failureReason = reason
  t.chunks = [] // Free memory
  if (t.expiry) clearTimeout(t.expiry)
  port.postMessage({ type: 'EXPORT_FAILED', payload: { id, reason } })
  // Schedule cleanup for forensics
  t.expiry = setTimeout(() => {
    transfers.delete(id)
    exportLogger.debug('Cleaned up failed transfer:', id)
  }, FAILED_TRANSFER_CLEANUP_MS)
}

// Helper: log auth error and ignore (don't fail transfer)
// This prevents DoS attacks where invalid tokens/senders could kill legitimate exports
function logAuthError(id: string, reason: string, payload: any) {
  exportLogger.warn(`Auth error for ${id}, ignoring:`, reason, {
    receivedToken: payload.token,
    receivedSender: payload.clientInstanceId,
  })
}

// Helper: schedule/refresh TTL for a transfer
function scheduleTTL(id: string) {
  const t = transfers.get(id)
  if (!t) return
  if (t.expiry) clearTimeout(t.expiry)
  t.expiry = setTimeout(() => {
    if (t.state === 'IN_PROGRESS' || t.state === 'INIT') {
      exportLogger.warn('Transfer timeout:', id)
      t.state = 'FAILED'
      t.failureReason = 'TIMEOUT'
      t.chunks = []
      setTimeout(() => transfers.delete(id), TIMEOUT_TRANSFER_CLEANUP_MS)
    }
  }, TTL_MS)
}

// Helper: Download via offscreen document (for MV3 service worker)
async function downloadViaOffscreen(
  blob: Blob,
  filename: string,
  mime: string,
): Promise<void> {
  // Check if offscreen API is available (Chrome MV3)
  if (!chrome.offscreen) {
    throw new Error('Offscreen API not available')
  }

  // Ensure offscreen document exists
  const hasDoc = await chrome.offscreen.hasDocument?.()
  if (!hasDoc) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS' as chrome.offscreen.Reason],
      justification: 'Create blob URLs for downloads in service worker context',
    })
  }

  // Convert blob to base64 for message passing
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const binary = bytesToBinaryString(bytes)
  const base64 = btoa(binary)

  return new Promise((resolve, reject) => {
    const listener = (msg: any) => {
      if (msg?.type === 'OFFSCREEN_DOWNLOAD_DONE') {
        chrome.runtime.onMessage.removeListener(listener)
        resolve()
      } else if (msg?.type === 'OFFSCREEN_DOWNLOAD_ERROR') {
        chrome.runtime.onMessage.removeListener(listener)
        reject(new Error(msg.payload?.message || 'Offscreen download failed'))
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_DOWNLOAD',
      payload: { filename, mime, base64 },
    })
    // Timeout after 30s
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener)
      reject(new Error('Offscreen download timeout'))
    }, OFFSCREEN_DOWNLOAD_TIMEOUT_MS)
  })
}

const panelListener = () => {
  browser.runtime.onConnect.addListener(port => {
    logger.debug('runtime.onConnect', port)

    // Handle export relay connections
    if (port.name === 'export-relay') {
      const senderId = port.sender?.id || `unknown-${Date.now()}`

      // Cleanup all in-flight transfers for this sender when port disconnects
      port.onDisconnect.addListener(() => {
        exportLogger.info('Port disconnected for sender:', senderId)
        for (const [id, t] of transfers.entries()) {
          if (t.senderId === senderId) {
            if (t.expiry) clearTimeout(t.expiry)
            transfers.delete(id)
          }
        }
      })

      port.onMessage.addListener(msg => {
        const { type, payload } = msg || {}
        const ack = (extra?: any) =>
          port.postMessage({
            type: 'EXPORT_ACK',
            payload: { id: payload.id, idx: payload.idx, ...extra },
          })

        if (type === 'EXPORT_DOWNLOAD_BEGIN') {
          const token = payload.token || generateAuthToken()
          const clientId = payload.clientInstanceId || senderId
          exportLogger.info(
            'BEGIN received:',
            payload.id,
            payload.filename,
            'token:',
            token,
            'clientId:',
            clientId,
          )

          transfers.set(payload.id, {
            filename: payload.filename,
            mime: payload.mime,
            expectedHash: payload.expectedHash,
            chunks: [],
            token,
            senderId: clientId,
            state: 'INIT',
            createdAt: Date.now(),
            lastSeen: Date.now(),
            inflight: 0,
          })
          scheduleTTL(payload.id)
          ack({ type: 'BEGIN', token })
          return
        }

        if (type === 'EXPORT_DOWNLOAD_CHUNK') {
          const t = transfers.get(payload.id)
          if (!t) {
            exportLogger.error('No transfer found for chunk:', payload.id)
            return
          }
          // Ignore invalid tokens/senders instead of failing (prevents DoS)
          if (t.token !== payload.token) {
            logAuthError(payload.id, 'INVALID_TOKEN', payload)
            return
          }
          if (
            t.senderId !== senderId &&
            t.senderId !== payload.clientInstanceId
          ) {
            logAuthError(payload.id, 'INVALID_SENDER', payload)
            return
          }
          if (
            t.state === 'ABORTED' ||
            t.state === 'FAILED' ||
            t.state === 'COMPLETED'
          )
            return
          if (t.state === 'INIT') t.state = 'IN_PROGRESS'
          if (t.state !== 'IN_PROGRESS')
            return markFailed(payload.id, `BAD_STATE_${t.state}`, port)

          // Check inflight limit
          if (t.inflight >= MAX_INFLIGHT) {
            exportLogger.debug(
              `Backpressure triggered for transfer ${payload.id}: inflight=${t.inflight}, max=${MAX_INFLIGHT}, chunk=${payload.idx}`,
            )
            port.postMessage({
              type: 'EXPORT_BACKPRESSURE',
              payload: { id: payload.id, idx: payload.idx },
            })
            return
          }

          const bytes = payload.bytes as number[] | Uint8Array
          const chunkBytes = (bytes instanceof Uint8Array
            ? bytes
            : new Uint8Array(bytes)) as Uint8Array<ArrayBuffer>
          t.chunks.push(chunkBytes)
          t.lastSeen = Date.now()
          t.inflight++
          scheduleTTL(payload.id)
          ack({ type: 'CHUNK', idx: payload.idx })
          // Decrement inflight after short delay to simulate processing
          setTimeout(() => {
            if (transfers.has(payload.id))
              t.inflight = Math.max(0, t.inflight - 1)
          }, INFLIGHT_DECREMENT_DELAY_MS)
          return
        }

        if (type === 'EXPORT_DOWNLOAD_END') {
          const t = transfers.get(payload.id)
          if (!t) {
            exportLogger.error('No transfer found for END:', payload.id)
            return markFailed(payload.id, 'TRANSFER_NOT_FOUND', port)
          }
          // Ignore invalid tokens/senders instead of failing (prevents DoS)
          if (t.token !== payload.token) {
            logAuthError(payload.id, 'INVALID_TOKEN', payload)
            return
          }
          if (
            t.senderId !== senderId &&
            t.senderId !== payload.clientInstanceId
          ) {
            logAuthError(payload.id, 'INVALID_SENDER', payload)
            return
          }
          if (t.state !== 'IN_PROGRESS' && t.state !== 'INIT')
            return markFailed(payload.id, `BAD_STATE_${t.state}`, port)

          const blob = new Blob(t.chunks, {
            type: t.mime || 'application/octet-stream',
          })
          const filename = t.filename || 'export.json'

          // Verify checksum if provided
          if (t.expectedHash) {
            const verifyHash = async () => {
              try {
                const buf = await blob.arrayBuffer()
                const digest = await crypto.subtle.digest('SHA-256', buf)
                const arr = new Uint8Array(digest)
                const actualHash = Array.from(arr)
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('')
                exportLogger.debug('Hash verification:', {
                  expected: t.expectedHash,
                  actual: actualHash,
                })

                if (actualHash !== t.expectedHash) {
                  exportLogger.error('HASH_MISMATCH detected!')
                  markFailed(payload.id, 'HASH_MISMATCH', port)
                  // DO NOT send ACK on error - let EXPORT_FAILED propagate
                  return false
                }
              } catch (e) {
                exportLogger.warn('Hash verification failed:', e)
              }
              return true
            }

            // Wait for hash verification before downloading
            verifyHash().then(valid => {
              if (!valid) return
              startDownload()
            })
            return
          }

          // No hash verification, proceed immediately
          startDownload()

          async function startDownload() {
            const done = (downloadId?: number) => {
              t.state = 'COMPLETED'
              if (t.expiry) clearTimeout(t.expiry)
              scheduleTTL(payload.id)
              ack({ type: 'END' })
              if (downloadId) downloadIdToFilename.set(downloadId, filename)
              return true
            }

            if (
              typeof URL !== 'undefined' &&
              typeof URL.createObjectURL === 'function'
            ) {
              const url = URL.createObjectURL(blob)
              chrome.downloads.download(
                { url, filename, saveAs: false },
                id => {
                  // Revoke URL after delay to allow download to complete
                  setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS)
                  // Check for download errors
                  if (chrome.runtime.lastError) {
                    exportLogger.error(
                      'Download failed:',
                      chrome.runtime.lastError,
                    )
                    markFailed(payload.id, 'DOWNLOAD_ERROR', port)
                    return
                  }
                  done(id)
                },
              )
            } else {
              // Prefer offscreen doc for Blob/URL work in MV3
              try {
                await downloadViaOffscreen(
                  blob,
                  filename,
                  t.mime || 'application/octet-stream',
                )
                done()
              } catch (err) {
                exportLogger.error(
                  'Offscreen download failed, trying data URL:',
                  err,
                )
                // Only use data URL for small files
                if (blob.size < MAX_DATA_URL_SIZE) {
                  const bytes = new Uint8Array(await blob.arrayBuffer())
                  const binary = bytesToBinaryString(bytes)
                  const dataUrl = `data:${
                    t.mime || 'application/octet-stream'
                  };base64,${btoa(binary)}`
                  chrome.downloads.download(
                    { url: dataUrl, filename, saveAs: false },
                    id => {
                      // Check for download errors
                      if (chrome.runtime.lastError) {
                        exportLogger.error(
                          'Data URL download failed:',
                          chrome.runtime.lastError,
                        )
                        markFailed(payload.id, 'DOWNLOAD_ERROR', port)
                        return
                      }
                      done(id)
                    },
                  )
                } else {
                  markFailed(payload.id, 'FILE_TOO_LARGE_FOR_DATAURL', port)
                }
              }
            }
          }
          return
        }

        if (type === 'EXPORT_DOWNLOAD_ABORT') {
          const t = transfers.get(payload.id)
          if (!t) {
            ack({ type: 'ABORT' })
            return
          }
          // Ignore invalid abort requests (prevents DoS)
          if (t.token !== payload.token) {
            logAuthError(payload.id, 'INVALID_ABORT_TOKEN', payload)
            return
          }
          if (
            t.senderId !== senderId &&
            t.senderId !== payload.clientInstanceId
          ) {
            logAuthError(payload.id, 'INVALID_ABORT_SENDER', payload)
            return
          }
          exportLogger.info('ABORT received for transfer:', payload.id)
          t.state = 'ABORTED'
          t.chunks = []
          if (t.expiry) clearTimeout(t.expiry)
          scheduleTTL(payload.id)
          ack({ type: 'ABORT' })
          return
        }
      })
      return
    }

    // Handle normal panel connections
    port.onMessage.addListener(request => {
      logger.debug('port.onMessage', request)

      if (request.name === 'init') {
        connections.set(request.tabId, port)

        // Pick things from cache and send it to the panel.
        if (Cache.has(request.tabId)) {
          Cache.get(request.tabId).forEach(message => {
            port.postMessage(message)
          })
        }

        port.onDisconnect.addListener(() => {
          connections.delete(request.tabId)
        })
      }
    })
  })
}

const tabRemovalListener = () => {
  browser.tabs.onRemoved.addListener(tabId => {
    logger.debug('tabs.onRemoved', tabId)

    if (connections.has(tabId)) {
      connections.delete(tabId)
      Cache.delete(tabId)
    }
  })
}

// For cross-browser support
const action = browser.browserAction || browser.action

action.onClicked.addListener(e => {
  logger.debug('action.onClicked', e)

  browser.tabs
    .create({
      url: 'http://cloud.meteor.com/?utm_source=chrome_extension&utm_medium=extension&utm_campaign=meteor_devtools_evolved',
    })
    .catch(err => logger.error('Failed to create tab:', err))
})

const handleConsole = (
  tabId: number,
  { data: { type, message } }: Message<{ type: ConsoleType; message: string }>,
) => {
  if (type in console) {
    console[type](`[Tab ${tabId}]`, message)
  } else {
    logger.warn('Wrong console type:', type)
  }
}

const contentListener = () => {
  // @ts-ignore
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    setTimeout(() => {
      const tabId = sender?.tab?.id

      if (!tabId) return

      // The message event has to from the panel to the content and then through here.
      if (request?.eventType === 'cache:clear') {
        logger.debug('clear cache for tab:', tabId)
        Cache.delete(tabId)
        return
      }

      if (request?.eventType === 'console') {
        handleConsole(tabId, request)
        return
      }

      if (Cache.has(tabId)) {
        const entry = Cache.get(tabId)

        if (entry.length >= 10000) {
          entry.shift()
        }

        entry.push(request)
      } else {
        Cache.set(tabId, [request])
      }

      if (connections.has(tabId)) {
        connections.get(tabId).postMessage(request)
      }
    }, 0)

    sendResponse()
  })
}

const tabListener = () => {
  const tabEvent = {
    'create-tab': request =>
      browser.tabs
        .create({
          url: request.data.url,
        })
        .catch(err => logger.error('Failed to create tab:', err)),
    // Remove old download-blob handler - we use port-based relay now
  }
  /**
   * @issue https://stackoverflow.com/a/73836810/10567157
   */
  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse,
  ) {
    sendResponse({ foo: true })

    if (request.source !== 'meteor-devtools-evolved') return true

    tabEvent[request.eventType]?.(request)

    return true
  })
}

// Override download filenames for data URLs
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  exportLogger.debug(
    'onDeterminingFilename called for download ID:',
    downloadItem.id,
  )

  // Check if we have a tracked filename for this download
  const trackedFilename = downloadIdToFilename.get(downloadItem.id)

  if (trackedFilename) {
    exportLogger.debug('Found tracked filename:', trackedFilename)
    suggest({ filename: trackedFilename })
    // Clean up after use
    downloadIdToFilename.delete(downloadItem.id)
  } else if (downloadItem.url.startsWith('data:application/json;base64,')) {
    // Fallback for data URL exports without tracked filename
    exportLogger.debug(
      'Data URL export without tracked filename, using default',
    )
    suggest({ filename: 'export.json' })
  } else {
    // Let other downloads proceed normally
    suggest()
  }

  return true // Will call suggest asynchronously
})

panelListener()
tabRemovalListener()
contentListener()
tabListener()
