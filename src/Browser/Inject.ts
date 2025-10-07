// Immediate logging to verify inject script loads
console.log(
  '[Meteor DevTools] Inject.ts loaded at',
  location.href,
  'Meteor exists:',
  typeof window.Meteor,
)

import { DDPInjector } from '@/Injectors/DDPInjector'
import {
  MinimongoInjector,
  updateCollections,
} from '@/Injectors/MinimongoInjector'
import { MeteorAdapter } from '@/Injectors/MeteorAdapter'

const isFrame = (function () {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
})()

// Meteor detection timing constants
const METEOR_DETECTION_POLL_INTERVAL_MS = 10 // Poll every 10ms during page load
const METEOR_DETECTION_RETRY_DELAY_MS = 2000 // Retry after 2 seconds for slow-loading apps

const PARENTHESIS_REGEX = /(\S*) \(([^)]+)\)/

export const sendMessage = (eventType: EventType, data: object) => {
  window.postMessage(
    {
      eventType,
      data,
      source: 'meteor-devtools-evolved',
    } as Message<object>,
    '*',
  )
}

const warning = (message: string) => {
  sendMessage('console', {
    type: 'info',
    message,
  } as { type: ConsoleType; message: string })
}

/**
 * Captures raw stack trace string for later parsing in the extension.
 * This is much faster than parsing with regex in the inject context.
 */
const getRawStackTrace = (stackTraceLimit: number): string | null => {
  const originalStackTraceLimit = Error.stackTraceLimit

  try {
    Error.stackTraceLimit = stackTraceLimit
    const error = new Error()
    return error.stack || null
  } finally {
    Error.stackTraceLimit = originalStackTraceLimit
  }
}

export const sendLogMessage = (message: DDPLog) => {
  const rawStack = getRawStackTrace(15)

  sendMessage('ddp-event', {
    ...message,
    rawStackTrace: rawStack,
    host: location.host,
  })

  // DO NOT call updateCollections() here!
  // DDP messages are just Meteor syncing data - we don't need to serialize
  // and send all collections on every DDP message.
  // Collections are updated automatically when user views Minimongo tab
  // or when Minimongo operations are performed (tracked in MeteorAdapter)
}

type MessageHandler = (message: Message<any>) => void
type Registration = {
  eventType: EventType
  handler: MessageHandler
}

interface IRegistry {
  subscriptions: Registration[]

  register(eventType: EventType, handler: MessageHandler): void

  run(message: Message<any>): void
}

export const Registry: IRegistry = {
  subscriptions: [],

  register(eventType: EventType, handler: MessageHandler) {
    this.subscriptions.push({
      eventType,
      handler,
    })
  },

  run(message: IMessagePayload<any>) {
    this.subscriptions.forEach(
      ({ eventType, handler }) =>
        message.source === 'meteor-devtools-evolved' &&
        eventType === message.eventType &&
        handler(message),
    )
  },
}

/**
 * Injects all DevTools components into the Meteor application.
 * Polls for Meteor object and initializes DDP/Minimongo injectors when found.
 */
export function injectAll() {
  if (!window.__meteor_devtools_evolved) {
    if (isFrame) return false

    warning(
      isFrame
        ? `Initializing from iframe "${location.href}"...`
        : 'Initializing on the main page...',
    )

    let attempts = 500 // Increased from 100 to 500 (5 seconds total)
    let interval = null

    /**
     * Attempts to inject DevTools components if Meteor is available.
     */
    function inject() {
      --attempts

      if (typeof Meteor === 'object' && !window.__meteor_devtools_evolved) {
        window.__meteor_devtools_evolved = true

        DDPInjector()
        MinimongoInjector()
        MeteorAdapter()

        window.__meteor_devtools_evolved_receiveMessage =
          Registry.run.bind(Registry)

        warning(`Initialized. Attempts: ${500 - attempts}.`)
        clearInterval(interval) // Stop immediately after success
        return
      }

      if (attempts === 0) {
        clearInterval(interval)

        // Try again after 2 seconds in case of slow-loading apps
        setTimeout(() => {
          if (typeof Meteor === 'object' && !window.__meteor_devtools_evolved) {
            window.__meteor_devtools_evolved = true
            DDPInjector()
            MinimongoInjector()
            MeteorAdapter()
            window.__meteor_devtools_evolved_receiveMessage =
              Registry.run.bind(Registry)
            warning(`Initialized (delayed retry).`)
          } else if (!window.Meteor) {
            warning(
              isFrame
                ? `Unable to find Meteor on iframe "${location.href}"`
                : 'Unable to find Meteor on the main page.',
            )
          }
        }, METEOR_DETECTION_RETRY_DELAY_MS)
      }
    }

    inject()

    interval = window.setInterval(inject, METEOR_DETECTION_POLL_INTERVAL_MS)
  }
}

injectAll()
