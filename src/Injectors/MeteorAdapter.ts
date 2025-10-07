import { Registry, sendMessage } from '@/Browser/Inject'
import { getSubscriptions } from '@/Browser/MeteorLibrary'
import { JSONUtils } from '@/Utils/JSONUtils'

export const MeteorAdapter = () => {
  Registry.register('ddp-run-method', (message: Message<any>) => {
    const { method, params } = message.data

    Meteor.call(method, ...params)
  })

  Registry.register('sync-subscriptions', () => {
    sendMessage('sync-subscriptions', {
      subscriptions: getSubscriptions(),
    })
  })

  Registry.register('stats', () => {
    sendMessage('stats', {
      gitCommitHash: Meteor.gitCommitHash,
    })
  })

  Registry.register('cache:clear', () => {
    sendMessage('cache:clear', {})
  })

  const prototype = Mongo.Collection.prototype

  Object.entries(prototype).forEach(([key, val]) => {
    if (
      ['find', 'findOne', 'insert', 'update', 'upsert', 'remove'].includes(
        key,
      ) &&
      typeof val === 'function'
    ) {
      const original = prototype[key]

      prototype[key] = function (...args) {
        const startMs = Date.now()

        // Execute original FIRST - if it fails, our tracking doesn't matter
        const result = original.apply(this, args)
        const runtime = Date.now() - startMs

        // NOW try instrumentation - if this fails, app still works
        try {
          // Send performance data (existing functionality)
          sendMessage('meteor-data-performance', {
            collectionName: this._name,
            key,
            args: JSON.stringify(args, JSONUtils.getCircularReplacer()),
            runtime,
          })

          // Send detailed method log with optional stack trace (new functionality)
          // Stack traces are captured here in the inject context (where settings are unavailable)
          // but will be conditionally stripped in MinimongoStore based on user settings
          // to optimize performance when stack traces are not needed
          const stackTrace = (() => {
            try {
              const error = new Error()
              return error.stack || undefined
            } catch (e) {
              return undefined
            }
          })()

          sendMessage('minimongo-method', {
            collectionName: this._name,
            method: key,
            selector: args[0],
            modifier: args[1], // For update/upsert
            options: args[2], // For find (fields, sort, limit)
            runtime,
            stackTrace,
            timestamp: startMs,
          })
        } catch (instrumentationError) {
          // Instrumentation failed - app still works, just no tracking for this operation
          console.debug(
            `MeteorAdapter instrumentation failed for ${key}:`,
            instrumentationError,
          )
        }

        return result
      }
    }
  })

  // Patch Cursor methods (fetch, forEach, map, count) with EXTREME safety
  try {
    const CursorPrototype = Mongo.Collection.Cursor?.prototype
    if (!CursorPrototype) return

    const cursorMethods = ['fetch', 'forEach', 'map', 'count']

    cursorMethods.forEach(methodName => {
      const originalMethod = CursorPrototype[methodName]
      if (typeof originalMethod !== 'function') return

      CursorPrototype[methodName] = function (...args) {
        const startMs = Date.now()

        try {
          // Execute original FIRST - if it fails, our tracking doesn't matter
          const result = originalMethod.apply(this, args)
          const runtime = Date.now() - startMs

          // NOW try to extract metadata - if this fails, app still works
          try {
            const collectionName =
              this.collection?._name || this.collection?.name || 'unknown'

            // Try to get selector from multiple possible locations
            let selector
            try {
              selector =
                this.matcher?._selector ||
                this._cursorDescription?.selector ||
                this._selector ||
                {}
            } catch (e) {
              selector = {}
            }

            // Try to get options from multiple possible locations
            const options: any = {}
            try {
              if (this.sorter?._sortSpecParts)
                options.sort = this.sorter._sortSpecParts
              if (this.skip) options.skip = this.skip
              if (this.limit) options.limit = this.limit
              if (this.fields) options.fields = this.fields
            } catch (e) {
              // Options extraction failed, continue with empty options
            }

            sendMessage('meteor-data-performance', {
              collectionName,
              key: methodName,
              args: JSON.stringify(args, JSONUtils.getCircularReplacer()),
              runtime,
            })

            sendMessage('minimongo-method', {
              collectionName,
              method: methodName,
              selector,
              options,
              runtime,
              timestamp: startMs,
            })
          } catch (metadataError) {
            // Metadata extraction failed - app still works, just no tracking
            console.debug(
              `MeteorAdapter metadata extraction failed for ${methodName}:`,
              metadataError,
            )
          }

          return result
        } catch (executeError) {
          // Original method failed - pass through the error
          throw executeError
        }
      }
    })
  } catch (cursorPatchError) {
    // Cursor patching completely failed - app continues without cursor tracking
  }
}
