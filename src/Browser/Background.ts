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
// NEW: Track blob URLs to filenames (for offscreen downloads where we can't predict download ID)
const downloadUrlToFilename = new Map<string, string>()

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

/**
 * Convert Uint8Array to base64 string
 *
 * CRITICAL: DO NOT modify this function or use TextDecoder('latin1')!
 *
 * WHY THIS IMPLEMENTATION:
 * - TextDecoder('latin1') FAILS with btoa() for certain byte values (0x80-0xFF range)
 * - Error: "The string to be encoded contains characters outside of the Latin1 range"
 * - This happens because TextDecoder maps bytes to Unicode, not to Latin1 characters
 *
 * CORRECT APPROACH (per MDN/web.dev):
 * - Convert each byte individually using String.fromCodePoint()
 * - Process in small chunks (8KB) to avoid blocking service worker
 * - Use native Uint8Array.toBase64() when available (Chrome 118+)
 *
 * @param bytes - Uint8Array to convert
 * @returns base64-encoded string
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/btoa#unicode_strings
 * @see https://web.dev/articles/base64-encoding
 */
/**
 * Type guard for Uint8Array with toBase64 method
 * PR REVIEW IMPLEMENTED: Improve type safety for toBase64 feature detection
 */
interface Uint8ArrayWithToBase64 extends Uint8Array {
  toBase64(): string
}

/**
 * Type guard to check if Uint8Array has native toBase64 method (Chrome 118+).
 *
 * @param arr - The Uint8Array to check
 * @returns True if the array has the toBase64 method
 */
function hasToBase64(arr: Uint8Array): arr is Uint8ArrayWithToBase64 {
  return (
    'toBase64' in Uint8Array.prototype &&
    typeof (arr as any).toBase64 === 'function'
  )
}

/**
 * Converts a Uint8Array to base64 string using native method or fallback.
 *
 * @param bytes - The bytes to convert
 * @returns Base64 encoded string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Use native toBase64 if available (Chrome 118+)
  if (hasToBase64(bytes)) {
    return bytes.toBase64()
  }

  // Fallback: Process in small chunks to avoid blocking service worker
  const CHUNK_SIZE = 8192 // 8KB chunks - tested to not block service worker
  let base64 = ''

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    // Convert each byte to a character code point for btoa
    // This ensures proper encoding for ALL byte values (0x00-0xFF)
    const binString = Array.from(chunk, byte =>
      String.fromCodePoint(byte),
    ).join('')
    base64 += btoa(binString)
  }

  return base64
}

/**
 * Mark transfer as failed and schedule cleanup.
 *
 * @param id - The transfer ID
 * @param reason - The failure reason
 * @param port - The runtime port to send failure message to
 */
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

/**
 * Log auth error and ignore (don't fail transfer).
 * This prevents DoS attacks where invalid tokens/senders could kill legitimate exports.
 *
 * @param id - The transfer ID
 * @param reason - The auth error reason
 * @param payload - The payload that failed auth
 */
function logAuthError(id: string, reason: string, payload: any) {
  exportLogger.warn(`Auth error for ${id}, ignoring:`, reason, {
    receivedToken: payload.token,
    receivedSender: payload.clientInstanceId,
  })
}

/**
 * Schedule/refresh TTL for a transfer.
 *
 * @param id - The transfer ID
 */
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

/**
 * Download via offscreen document (for MV3 service worker).
 *
 * @param blob - The blob to download
 * @param filename - The filename for the download
 * @param mime - The MIME type of the blob
 */
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
  // IMPORTANT: Use uint8ArrayToBase64() - do NOT use TextDecoder('latin1')!
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const base64 = uint8ArrayToBase64(bytes)

  return new Promise((resolve, reject) => {
    const listener = (msg: any) => {
      if (msg?.type === 'OFFSCREEN_DOWNLOAD_READY') {
        chrome.runtime.onMessage.removeListener(listener)
        // Offscreen doc created blob URL - now download it from background
        const { url, filename: fn } = msg.payload

        // CRITICAL BUG FIX: Chrome ignores `filename` param for blob: URLs
        // It fires onDeterminingFilename DURING chrome.downloads.download() call (synchronously!)
        // We must track URL->filename mapping BEFORE calling download()
        downloadUrlToFilename.set(url, fn)

        chrome.downloads.download({ url, filename: fn, saveAs: false }, id => {
          if (chrome.runtime.lastError) {
            downloadUrlToFilename.delete(url) // Cleanup on error
            reject(new Error(chrome.runtime.lastError.message))
          } else {
            // Download succeeded - map is cleaned up in onDeterminingFilename listener
            resolve()
          }
        })
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
          const chunkBytes = (
            bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
          ) as Uint8Array<ArrayBuffer>
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

          /**
           *
           */
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
                  setTimeout(
                    () => URL.revokeObjectURL(url),
                    URL_REVOKE_DELAY_MS,
                  )
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
                  // IMPORTANT: Use uint8ArrayToBase64() - do NOT use TextDecoder('latin1')!
                  const base64 = uint8ArrayToBase64(bytes)
                  const dataUrl = `data:${
                    t.mime || 'application/octet-stream'
                  };base64,${base64}`
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
   * @see https://stackoverflow.com/a/73836810/10567157
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

// Override download filenames for data URLs and blob URLs
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  exportLogger.debug(
    'onDeterminingFilename called for download ID:',
    downloadItem.id,
  )

  // PRIORITY 1: Check URL-based tracking (for offscreen blob URLs)
  // This is checked FIRST because it's set synchronously before download starts
  const urlTrackedFilename = downloadUrlToFilename.get(downloadItem.url)
  if (urlTrackedFilename) {
    exportLogger.debug('Found URL-tracked filename:', urlTrackedFilename)
    suggest({ filename: urlTrackedFilename })
    downloadUrlToFilename.delete(downloadItem.url) // Clean up
    return true
  }

  // PRIORITY 2: Check download ID tracking (legacy/fallback)
  const idTrackedFilename = downloadIdToFilename.get(downloadItem.id)
  if (idTrackedFilename) {
    exportLogger.debug('Found ID-tracked filename:', idTrackedFilename)
    suggest({ filename: idTrackedFilename })
    downloadIdToFilename.delete(downloadItem.id) // Clean up
    return true
  }

  // PRIORITY 3: Fallback for data URL exports without tracking
  if (downloadItem.url.startsWith('data:application/json;base64,')) {
    exportLogger.debug(
      'Data URL export without tracked filename, using default',
    )
    suggest({ filename: 'export.json' })
    return true
  }

  // Let other downloads proceed normally (no suggest override)
  suggest()
  return true
})

panelListener()
tabRemovalListener()
contentListener()
tabListener()
