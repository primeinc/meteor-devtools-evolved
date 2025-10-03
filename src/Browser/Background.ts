import browser from 'webextension-polyfill'

type Connection = Map<number, any>

declare global {
  interface Window {
    connections: Connection
  }
}

// Type definitions for Chrome Offscreen API (not in @types/chrome yet)
declare namespace chrome {
  namespace offscreen {
    enum Reason {
      AUDIO_PLAYBACK = 'AUDIO_PLAYBACK',
      BLOBS = 'BLOBS',
      CLIPBOARD = 'CLIPBOARD',
      DOM_PARSER = 'DOM_PARSER',
      DOM_SCRAPING = 'DOM_SCRAPING',
      IFRAME_SCRIPTING = 'IFRAME_SCRIPTING',
      LOCAL_STORAGE = 'LOCAL_STORAGE',
      TESTING = 'TESTING',
      WORKERS = 'WORKERS',
    }

    interface CreateParameters {
      url: string
      reasons: Reason[]
      justification: string
    }

    function createDocument(parameters: CreateParameters): Promise<void>
    function closeDocument(): Promise<void>
  }
}

const Cache = new Map<number, string[]>()

const connections: Connection = new Map()

self.connections = connections

/**
 * Offscreen document management for Chrome MV3 downloads
 */
let offscreenDocumentCreating: Promise<void> | null = null

async function hasOffscreenDocument(): Promise<boolean> {
  try {
    // Use getContexts if available (Chrome 116+)
    // @ts-ignore - getContexts is a newer API not in all type definitions
    if ('getContexts' in chrome.runtime) {
      // @ts-ignore
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      })
      return contexts.length > 0
    }
  } catch (error) {
    // Chrome or chrome.runtime not available
    return false
  }
  return false
}

async function setupOffscreenDocument(): Promise<void> {
  try {
    // Check if we're in Chrome (MV3) environment with offscreen API
    // @ts-ignore - offscreen API is newer and not in all type definitions
    if (!(chrome as any).offscreen) {
      return
    }

    // Avoid creating offscreen document if it's already created or being created
    if (await hasOffscreenDocument()) {
      return
    }

    // Create offscreen document only once
    if (offscreenDocumentCreating) {
      return offscreenDocumentCreating
    }

    // @ts-ignore - offscreen API is newer and not in all type definitions
    offscreenDocumentCreating = chrome.offscreen
      .createDocument({
        url: 'export.html',
        // @ts-ignore - Reason enum typing issue
        reasons: ['BLOBS'],
        justification: 'Handle file downloads with proper filenames in MV3',
      })
      .then(() => {
        console.debug('Offscreen document created')
      })
      .catch((error: Error) => {
        console.error('Error creating offscreen document:', error)
      })
      .finally(() => {
        offscreenDocumentCreating = null
      })

    return offscreenDocumentCreating
  } catch (error) {
    // Chrome or offscreen API not available
    console.debug('Offscreen API not available:', error)
  }
}

const panelListener = () => {
  browser.runtime.onConnect.addListener(port => {
    console.debug('runtime.onConnect', port)

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

/**
 * Handle download requests by forwarding to offscreen document (Chrome MV3)
 * or handling directly (Firefox MV2)
 */
async function handleDownloadRequest(data: {
  content: string
  filename: string
  mimeType?: string
}): Promise<void> {
  try {
    // Check if we're in Chrome MV3 environment with offscreen API
    // @ts-ignore
    if (typeof chrome !== 'undefined' && chrome.offscreen) {
      // Chrome MV3: Use offscreen document
      await setupOffscreenDocument()
      // @ts-ignore - chrome.runtime is available in extension context
      return chrome.runtime.sendMessage({
        type: 'download',
        data,
      })
    } else {
      // Firefox MV2 or other: Handle download directly
      const { content, filename, mimeType = 'application/json' } = data
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)

      // Use browser.downloads API for Firefox
      await browser.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
      })

      // Clean up the blob URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } catch (error) {
    console.error('Error handling download request:', error)
    throw error
  }
}

const contentListener = () => {
  // @ts-ignore
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    setTimeout(() => {
      const tabId = sender?.tab?.id

      if (!tabId) return

      // Handle download requests
      if (request?.eventType === 'download') {
        handleDownloadRequest(request.data)
          .then(() => sendResponse({ success: true }))
          .catch(error => {
            console.error('Download failed:', error)
            sendResponse({ success: false, error: String(error) })
          })
        return
      }

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
  }
  /**
   * @issue https://stackoverflow.com/a/73836810/10567157
   */
  try {
    // @ts-ignore - chrome.runtime is available in extension context
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
  } catch (error) {
    console.debug('Chrome runtime not available for tabListener:', error)
  }
}

panelListener()
tabRemovalListener()
contentListener()
tabListener()

// Initialize offscreen document on startup for Chrome MV3
try {
  if ((chrome as any).offscreen) {
    setupOffscreenDocument().catch(console.error)
  }
} catch (error) {
  console.debug('Offscreen API not available on startup')
}
