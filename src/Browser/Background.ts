import browser from 'webextension-polyfill'
import { debug } from '@/Utils/Debug'

type Connection = Map<number, any>

// Security token for validating messages
const SECURITY_TOKEN =
  Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15)

declare global {
  interface Window {
    connections: Connection
  }
}

const Cache = new Map<number, string[]>()

const connections: Connection = new Map()

self.connections = connections

const panelListener = () => {
  browser.runtime.onConnect.addListener(port => {
    debug.debug('runtime.onConnect', port)

    // Validate port sender
    if (!port.sender || !port.sender.tab) {
      debug.warn('Invalid port sender - no tab information')
      port.disconnect()
      return
    }

    port.onMessage.addListener(request => {
      debug.debug('port.onMessage', request)

      // Validate request has required fields
      if (!request || typeof request !== 'object') {
        debug.warn('Invalid request format')
        return
      }

      if (request.name === 'init') {
        // Validate tab ID
        if (typeof request.tabId !== 'number') {
          debug.warn('Invalid tabId in init request')
          return
        }

        // Validate token if provided (for enhanced security)
        if (request.token && request.token !== SECURITY_TOKEN) {
          debug.warn('Invalid security token')
          return
        }

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
    debug.debug('tabs.onRemoved', tabId)

    if (connections.has(tabId)) {
      connections.delete(tabId)
      Cache.delete(tabId)
    }
  })
}

// For cross-browser support
const action = browser.browserAction || browser.action

action.onClicked.addListener(e => {
  debug.debug('action.onClicked', e)

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
    debug.warn('Wrong console type.')
  }
}

const contentListener = () => {
  // @ts-ignore
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    setTimeout(() => {
      const tabId = sender?.tab?.id

      if (!tabId) return

      // Validate sender origin
      if (!sender.tab || !sender.url) {
        debug.warn('Invalid sender - missing tab or url')
        return
      }

      // The message event has to from the panel to the content and then through here.
      if (request?.eventType === 'cache:clear') {
        debug.debug('clear cache')
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

panelListener()
tabRemovalListener()
contentListener()
tabListener()
