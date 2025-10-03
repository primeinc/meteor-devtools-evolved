import browser from 'webextension-polyfill'

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
type Transfer = { filename: string; mime: string; chunks: Uint8Array[] }
const transfers = new Map<string, Transfer>()
const downloadIdToFilename = new Map<number, string>()

const panelListener = () => {
  browser.runtime.onConnect.addListener(port => {
    console.debug('runtime.onConnect', port)

    // Handle export relay connections
    if (port.name === 'export-relay') {
      port.onMessage.addListener((msg) => {
        const { type, payload } = msg || {}
        const ack = (extra?: any) => port.postMessage({ type: 'EXPORT_ACK', payload: { id: payload.id, idx: payload.idx, ...extra } })

        if (type === 'EXPORT_DOWNLOAD_BEGIN') {
          console.log('[Export] BEGIN received:', payload.id, payload.filename)
          transfers.set(payload.id, { filename: payload.filename, mime: payload.mime, chunks: [] })
          ack({ type: 'BEGIN' }); return
        }

        if (type === 'EXPORT_DOWNLOAD_CHUNK') {
          const t = transfers.get(payload.id)
          if (!t) {
            console.error('[Export] No transfer found for chunk:', payload.id)
            return
          }
          const chunkBytes = new Uint8Array(payload.bytes)
          console.log(`[Export] Chunk ${payload.idx} received:`, chunkBytes.byteLength, 'bytes')
          t.chunks.push(chunkBytes)
          ack({ type: 'CHUNK', idx: payload.idx }); return
        }

        if (type === 'EXPORT_DOWNLOAD_END') {
          console.log('[Export] EXPORT_DOWNLOAD_END received for ID:', payload.id)
          const t = transfers.get(payload.id)
          if (!t) {
            console.error('[Export] No transfer found for ID:', payload.id)
            return
          }
          console.log('[Export] Transfer has', t.chunks.length, 'chunks')

          // Concatenate all chunks into a single Uint8Array
          let totalLength = 0
          for (const chunk of t.chunks) {
            totalLength += chunk.length
          }
          console.log('[Export] Total byte length:', totalLength)

          const combined = new Uint8Array(totalLength)
          let offset = 0
          for (const chunk of t.chunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }

          // Convert to base64 (service workers don't have FileReader or URL.createObjectURL)
          let binary = ''
          const bytes = new Uint8Array(combined)
          const len = bytes.byteLength
          console.log('[Export] Converting', len, 'bytes to base64')
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)
          console.log('[Export] Base64 length:', base64.length)

          // Create data URL and download
          const dataUrl = `data:${t.mime || 'application/octet-stream'};base64,${base64}`

          // Ensure filename is properly formatted
          const downloadFilename = t.filename || 'export.json'
          console.log('[Export] Downloading with filename:', downloadFilename)
          console.log('[Export] Data URL length:', dataUrl.length)

          // Download the file
          chrome.downloads.download({
            url: dataUrl,
            filename: downloadFilename
          }, function(downloadId) {
            if (chrome.runtime.lastError) {
              console.error('[Export] Download failed:', chrome.runtime.lastError)
              transfers.delete(payload.id)
              port.postMessage({ type: 'EXPORT_DONE', payload: { id: payload.id, error: chrome.runtime.lastError.message } })
            } else {
              console.log('[Export] Download started with ID:', downloadId)
              // Track the filename for this download ID
              downloadIdToFilename.set(downloadId, downloadFilename)

              // Check the actual download item immediately
              setTimeout(() => {
                chrome.downloads.search({id: downloadId}, function(items) {
                  if (items && items[0]) {
                    const item = items[0]
                    console.log('[Export] Download details:')
                    console.log('  - ID:', item.id)
                    console.log('  - Filename:', item.filename || '(EMPTY)')
                    console.log('  - State:', item.state)
                    console.log('  - Exists:', item.exists)
                    console.log('  - Error:', item.error || 'none')
                    console.log('  - Danger:', item.danger)
                    console.log('  - Paused:', item.paused)
                    console.log('  - CanResume:', item.canResume)
                    console.log('  - BytesReceived:', item.bytesReceived)
                    console.log('  - TotalBytes:', item.totalBytes)
                    console.log('  - FileSize:', item.fileSize)
                    console.log('  - StartTime:', item.startTime)
                    console.log('  - URL substr:', item.url?.substring(0, 50))

                    if (item.state === 'interrupted') {
                      console.error('[Export] DOWNLOAD INTERRUPTED! Error:', item.error)
                      // Try to resume if possible
                      if (item.canResume) {
                        console.log('[Export] Attempting to resume download...')
                        chrome.downloads.resume(downloadId)
                      }
                    } else if (item.state === 'in_progress' && !item.filename) {
                      console.error('[Export] CRITICAL: Download in progress but no filename!')
                      console.error('[Export] This means Chrome cannot write the file to disk')
                    }
                  }
                })
              }, 1000) // Wait 1 second to check status

              transfers.delete(payload.id)
              port.postMessage({ type: 'EXPORT_DONE', payload: { id: payload.id, downloadId } })
            }
          })
          ack({ type: 'END' }); return
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
      // eslint-disable-next-line no-console
      console.debug('port.onMessage', request)

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
    console.debug('tabs.onRemoved', tabId)

    if (connections.has(tabId)) {
      connections.delete(tabId)
      Cache.delete(tabId)
    }
  })
}

// For cross-browser support
const action = browser.browserAction || browser.action

action.onClicked.addListener(e => {
  console.debug('action.onClicked', e)

  browser.tabs
    .create({
      url: 'http://cloud.meteor.com/?utm_source=chrome_extension&utm_medium=extension&utm_campaign=meteor_devtools_evolved',
    })
    // eslint-disable-next-line no-console
    .catch(console.error)
})

const handleConsole = (
  tabId: number,
  { data: { type, message } }: Message<{ type: ConsoleType; message: string }>,
) => {
  if (type in console) {
    // eslint-disable-next-line no-console
    console[type](`[${tabId}]`, message)
  } else {
    // eslint-disable-next-line no-console
    console.warn('Wrong console type.')
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
        // eslint-disable-next-line no-console
        console.debug('clear cache')
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
        .catch(console.error),
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
  console.log('[Export] onDeterminingFilename called for download ID:', downloadItem.id)

  // Check if we have a tracked filename for this download
  const trackedFilename = downloadIdToFilename.get(downloadItem.id)

  if (trackedFilename) {
    console.log('[Export] Found tracked filename:', trackedFilename)
    suggest({ filename: trackedFilename })
    // Clean up after use
    downloadIdToFilename.delete(downloadItem.id)
  } else if (downloadItem.url.startsWith('data:application/json;base64,')) {
    // Fallback for data URL exports without tracked filename
    console.log('[Export] Data URL export without tracked filename, using default')
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
