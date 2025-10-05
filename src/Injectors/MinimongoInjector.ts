import { createLogger } from '@/Utils/Logger'
import { Registry, sendMessage } from '@/Browser/Inject'
import throttle from 'lodash.throttle'

const logger = createLogger('MinimongoInjector')

/**
 * Serialize object using EJSON to preserve Dates and other MongoDB types
 *
 * EJSON converts:
 * - Date objects → {$date: timestamp}
 * - ObjectIds remain as strings (Meteor uses string IDs client-side)
 * - Binary → {$binary: base64}
 *
 * This preserves type information through the Chrome DevTools messaging protocol,
 * which would otherwise stringify Dates to ISO strings via JSON.parse/stringify.
 */
function cloneDeepWithEJSON(obj: any) {
  // Try to find EJSON in multiple locations (handles different Meteor versions)
  const EJSON = (window as any).EJSON || (window as any).Package?.ejson?.EJSON

  if (EJSON) {
    try {
      // Serialize with EJSON, then deserialize back to get cloned object with EJSON types
      const serialized = EJSON.stringify(obj)
      return EJSON.parse(serialized)
    } catch (e) {
      // Handle circular references or other EJSON serialization errors
      logger.warn('EJSON.stringify failed (circular reference?):', (e as Error).message, '- Falling back to JSON.')
      // Fall through to JSON fallback below
    }
  }

  // Fallback to regular JSON (will lose Date objects)
  // This should rarely happen, but can occur if injector runs before Meteor loads
  logger.warn(
    'EJSON not available - Date/ObjectId/Binary exports may lose type information.',
    'Try refreshing the page or waiting for Meteor to fully load.'
  )

  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e) {
    // Handle circular references or other JSON serialization errors
    logger.warn('Failed to clone object (circular reference or non-serializable data):', (e as Error).message)
    return {} // Return empty object instead of crashing
  }
}

function isArray(obj: any) {
  return Array.isArray(obj)
}

const cleanup = (object: any) => {
  if (typeof object !== 'object') return object

  const clonedObject = cloneDeepWithEJSON(object)

  if (!clonedObject) return clonedObject

  Object.keys(clonedObject).forEach((key: string) => {
    if (!clonedObject[key]) {
      return
    }

    if (typeof clonedObject[key] === 'object') {
      if (isArray(clonedObject[key])) {
        clonedObject[key] = clonedObject[key].map((item: any) => cleanup(item))
        return
      }

      // EJSON preserves Dates as {$date: ...}, so this check is for non-EJSON Dates
      if (clonedObject[key] instanceof Date) {
        // Convert to EJSON format
        clonedObject[key] = { $date: clonedObject[key].getTime() }
        return
      }

      // Handle other non-plain objects (excluding EJSON types)
      if (clonedObject[key].constructor.name !== 'Object' &&
          !clonedObject[key].$date &&
          !clonedObject[key].$binary) {
        if (typeof clonedObject[key].toString === 'function') {
          clonedObject[key] = `[Object::${
            clonedObject[key].constructor.name
          }] ${clonedObject[key].toString()}`
          return
        } else {
          clonedObject[key] = `[Object::${clonedObject[key].constructor.name}]`
          return
        }
      }

      clonedObject[key] = cleanup(clonedObject[key])
    }
  })

  return clonedObject
}

const getDocs = (collection: any) => {
  if (collection._docs._map instanceof Map) {
    return collection._docs._map?.values() || []
  } else {
    return Object.values(collection._docs._map || {})
  }
}

const getCollections = (requestPayload?: object) => {
  const collections = Meteor.connection._mongo_livedata_collections

  if (!collections) {
    logger.warn('Collections not initialized in the client yet. Possibly forgotten to be imported.')
    return
  }

  const collectionsData = Object.values(collections).reduce(
    (acc: Record<string, unknown>, collection: any) => ({
      ...acc,
      [collection.name]: Array.from(getDocs(collection)).map(cleanup),
    }),
    {} as Record<string, unknown>,
  )

  // Echo back any request metadata (e.g., requestId) for correlation
  const response = requestPayload
    ? Object.assign({}, requestPayload, collectionsData)
    : collectionsData

  sendMessage('minimongo-get-collections', response as any)
}

export const updateCollections = throttle(getCollections, 1000, {
  leading: true,
  trailing: true,
})

export const MinimongoInjector = () => {
  Registry.register('minimongo-get-collections', (message: Message<any>) => {
    getCollections(message.data)
  })
}
