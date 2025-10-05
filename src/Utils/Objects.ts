export const isObject = (value: any) => typeof value === 'object'

/**
 * Creates a new object by omitting the specified keys from the input object.
 *
 * @param object - The source object
 * @param keys - An array of keys to omit from the object
 * @returns A new object without the specified keys
 */
export function omit(object, keys) {
  return Object.keys(object).reduce((result, key) => {
    if (!keys.includes(key)) {
      result[key] = object[key]
    }

    return result
  }, {})
}

/**
 * Creates a new object by mapping each value through a transformation function.
 *
 * @param object - The source object
 * @param fn - Function to transform each value
 * @returns A new object with transformed values
 */
export function mapValues(object, fn) {
  return Object.keys(object).reduce((result, key) => {
    result[key] = fn(object[key], key)

    return result
  }, {})
}

/**
 * Flattens an array of arrays into a single array.
 *
 * @param array - Array of arrays to flatten
 * @returns A single flattened array
 */
export function flatten(array) {
  return array.reduce((result, item) => result.concat(item), [])
}

/**
 * Removes falsy values from an array.
 *
 * @param array - Array to filter
 * @returns Array with falsy values removed
 */
export function compact(array) {
  return array.filter(Boolean)
}

export const isNil = value => value === null || value === undefined

export const isUndefined = value => value === undefined
