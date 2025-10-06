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
        const result = original.apply(this, args)
        const runtime = Date.now() - startMs

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

        return result
      }
    }
  })
}
