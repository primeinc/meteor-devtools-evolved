import browser from 'webextension-polyfill'
import { createLogger } from '@/Utils/Logger'

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
type Transfer = { filename: string; mime: string; expectedHash?: string; chunks: Uint8Array[] }
const transfers = new Map<string, Transfer>()
const downloadIdToFilename = new Map<number, string>()

const panelListener = () => {
  browser.runtime.onConnect.addListener(port => {
    logger.debug('runtime.onConnect', port)

    // Handle export relay connections
    if (port.name === 'export-relay') {
      // Cleanup all in-flight transfers when port disconnects
      port.onDisconnect.addListener(() => {
        exportLogger.info('Port disconnected, cleaning up all transfers')
        transfers.clear()
      })

      port.onMessage.addListener((msg) => {
        const { type, payload } = msg || {}
        const ack = (extra?: any) => port.postMessage({ type: 'EXPORT_ACK', payload: { id: payload.id, idx: payload.idx, ...extra } })

        if (type === 'EXPORT_DOWNLOAD_BEGIN') {
          exportLogger.info('BEGIN received:', payload.id, payload.filename, payload.expectedHash)
          transfers.set(payload.id, {
            filename: payload.filename,
            mime: payload.mime,
            expectedHash: payload.expectedHash,
            chunks: []
          })
          ack({ type: 'BEGIN' }); return
        }

        if (type === 'EXPORT_DOWNLOAD_CHUNK') {
          const t = transfers.get(payload.id)
          if (!t) {
            exportLogger.error('No transfer found for chunk:', payload.id)
            return
          }
          const chunkBytes = new Uint8Array(payload.bytes)
          exportLogger.debug(`Chunk ${payload.idx} received:`, chunkBytes.byteLength, 'bytes, first 4 bytes:', Array.from(chunkBytes.slice(0, 4)))
          t.chunks.push(chunkBytes)
          ack({ type: 'CHUNK', idx: payload.idx }); return
        }

        if (type === 'EXPORT_DOWNLOAD_END') {
          exportLogger.debug('EXPORT_DOWNLOAD_END received for ID:', payload.id)
          const t = transfers.get(payload.id)
          if (!t) {
            exportLogger.error('No transfer found for ID:', payload.id)
            return
          }
          exportLogger.debug('Transfer has', t.chunks.length, 'chunks')

          // Assemble Blob directly (no base64 string churn)
          const blob = new Blob(t.chunks, { type: t.mime || 'application/octet-stream' })
          const filename = t.filename || 'export.json'

          // Verify checksum if provided
          if (t.expectedHash) {
            const verifyHash = async () => {
              const buf = await blob.arrayBuffer()
              const digest = await crypto.subtle.digest('SHA-256', buf)
              const arr = new Uint8Array(digest)
              const actualHash = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
              exportLogger.debug('Hash verification:', { expected: t.expectedHash, actual: actualHash })

              if (actualHash !== t.expectedHash) {
                exportLogger.error('HASH_MISMATCH detected!')
                transfers.delete(payload.id)
                port.postMessage({ type: 'EXPORT_FAILED', payload: { id: payload.id, reason: 'HASH_MISMATCH' } })
                // DO NOT send ACK on error - let EXPORT_FAILED propagate
                return false
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

          function startDownload() {
            const done = (downloadId?: number) => {
              if (chrome.runtime.lastError) {
                exportLogger.error('Download failed:', chrome.runtime.lastError)
                transfers.delete(payload.id)
                port.postMessage({ type: 'EXPORT_DONE', payload: { id: payload.id, error: chrome.runtime.lastError.message } })
                return
              }
              exportLogger.info('Download started with ID:', downloadId)
              if (downloadId) downloadIdToFilename.set(downloadId, filename)
              transfers.delete(payload.id)
              port.postMessage({ type: 'EXPORT_DONE', payload: { id: payload.id, downloadId } })
            }

            const supportsObjectURL = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'

            if (supportsObjectURL) {
              const url = URL.createObjectURL(blob)
              chrome.downloads.download({ url, filename, saveAs: false }, (id) => {
                done(id)
                // revoke a bit later
                setTimeout(() => URL.revokeObjectURL(url), 10_000)
              })
            } else {
              // Fallback: data URL (slower, but SW-compatible if objectURL is missing)
              blob.arrayBuffer().then(buf => {
                const bytes = new Uint8Array(buf)
                let binary = ''
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
                const dataUrl = `data:${t.mime || 'application/octet-stream'};base64,${btoa(binary)}`
                chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, done)
              })
            }

            ack({ type: 'END' })
          }
          return
        }

        if (type === 'EXPORT_DOWNLOAD_ABORT') {
          transfers.delete(payload.id)
          ack({ type: 'ABORT' }); return
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
    .catch((err) => logger.error('Failed to create tab:', err))
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
        .catch((err) => logger.error('Failed to create tab:', err)),
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
  exportLogger.debug('onDeterminingFilename called for download ID:', downloadItem.id)

  // Check if we have a tracked filename for this download
  const trackedFilename = downloadIdToFilename.get(downloadItem.id)

  if (trackedFilename) {
    exportLogger.debug('Found tracked filename:', trackedFilename)
    suggest({ filename: trackedFilename })
    // Clean up after use
    downloadIdToFilename.delete(downloadItem.id)
  } else if (downloadItem.url.startsWith('data:application/json;base64,')) {
    // Fallback for data URL exports without tracked filename
    exportLogger.debug('Data URL export without tracked filename, using default')
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
