import { createLogger } from '@/Utils/Logger'
import { Registry, sendMessage } from '@/Browser/Inject'
import throttle from 'lodash.throttle'

const logger = createLogger('MinimongoInjector')

/**
 * Get EJSON library from window (handles different Meteor versions)
 * PR REVIEW IMPLEMENTED: Extract to utility to avoid duplication
 *
 * @returns EJSON library or undefined if not found
 */
function getEJSON(): any | undefined {
  return (window as any).EJSON || (window as any).Package?.ejson?.EJSON
}

/**
 * Log serialization errors with consistent messaging
 * PR REVIEW IMPLEMENTED: Extract error handling to avoid double try-catch pattern
 */
function logSerializationError(e: any, context: 'EJSON' | 'JSON') {
  if (e && typeof e === 'object') {
    if (e.name === 'TypeError' && /circular/i.test(e.message)) {
      logger.warn(
        `${context}.stringify failed due to circular reference:`,
        e.message,
      )
    } else if (e.name === 'TypeError') {
      logger.warn(`${context}.stringify TypeError:`, e.message)
    } else {
      logger.warn(`${context}.stringify failed:`, e.name, e.message)
    }
  } else {
    logger.warn(`${context}.stringify failed with unknown error:`, e)
  }
}

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
 *
 * NOTE: This function is NOT exported.
 * - REASONING: It's an implementation detail, not public API
 * - TESTING: Test through public API (MinimongoInjector, updateCollections) instead
 * - REJECTED: PR review suggestion to export for testing (anti-pattern)
 */
function cloneDeepWithEJSON(obj: any) {
  const EJSON = getEJSON()

  if (EJSON) {
    // PR REVIEW IMPLEMENTED: Log which location EJSON was found for debugging
    logger.debug(
      'EJSON found at:',
      (window as any).EJSON ? 'window.EJSON' : 'window.Package.ejson.EJSON',
    )
    try {
      // Serialize with EJSON, then deserialize back to get cloned object with EJSON types
      const serialized = EJSON.stringify(obj)
      return EJSON.parse(serialized)
    } catch (e: any) {
      // Handle circular references or other EJSON serialization errors
      // PR REVIEW NOTE: Intentionally fall through to JSON.stringify instead of returning {} directly
      // REASONING: EJSON can fail for reasons OTHER than circular refs (type errors, etc.)
      //            JSON.stringify might succeed where EJSON fails (EJSON is stricter)
      //            Provides better debugging info by logging both failures
      //            Performance impact is negligible (only triggers on error path)
      logSerializationError(e, 'EJSON')
      logger.warn('- Falling back to JSON.')
      // Fall through to JSON fallback below
    }
  } else {
    // PR REVIEW IMPLEMENTED: Specify which locations were checked to help debugging
    logger.warn(
      'EJSON not available - Date/ObjectId/Binary exports may lose type information.',
      'Checked locations: window.EJSON and window.Package.ejson.EJSON.',
      'Try refreshing the page or waiting for Meteor to fully load.',
    )
  }

  // Fallback to regular JSON (will lose Date objects)
  // This should rarely happen, but can occur if injector runs before Meteor loads
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch (e: any) {
    // Handle circular references or other JSON serialization errors
    logSerializationError(e, 'JSON')
    return {} // Return empty object instead of crashing
  }
}

/**
 *
 */
function isArray(obj: any) {
  return Array.isArray(obj)
}

/**
 * Clean up objects for DevTools protocol transfer
 *
 * NOTE: This function is NOT exported.
 * - REASONING: It's an implementation detail, not public API
 * - TESTING: Test through public API (MinimongoInjector, updateCollections) instead
 * - REJECTED: PR review suggestion to export for testing (anti-pattern)
 */
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

      // cloneDeepWithEJSON returns native Date instances (from EJSON.parse)
      // Convert these back to EJSON wire format {$date: timestamp} for DevTools protocol
      if (clonedObject[key] instanceof Date) {
        clonedObject[key] = { $date: clonedObject[key].getTime() }
        return
      }

      // EJSON.parse converts {$binary: "..."} to Uint8Array instances
      // Convert these back to EJSON wire format {$binary: base64} for DevTools protocol
      if (clonedObject[key] instanceof Uint8Array) {
        const EJSON = getEJSON()
        if (EJSON) {
          // Use EJSON.toJSONValue to get proper {$binary: ...} format
          clonedObject[key] = EJSON.toJSONValue(clonedObject[key])
        } else {
          // Fallback: Manual base64 encoding (unlikely but safe)
          const bytes = clonedObject[key] as Uint8Array
          const base64 = btoa(String.fromCharCode(...bytes))
          clonedObject[key] = { $binary: base64 }
        }
        return
      }

      // Handle other non-plain objects (excluding EJSON types)
      if (
        clonedObject[key].constructor.name !== 'Object' &&
        !clonedObject[key].$date &&
        !clonedObject[key].$binary
      ) {
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
    logger.warn(
      'Collections not initialized in the client yet. Possibly forgotten to be imported.',
    )
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
