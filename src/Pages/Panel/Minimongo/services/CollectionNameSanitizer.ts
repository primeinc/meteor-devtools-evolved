/**
 * Collection Name Sanitization Utilities
 *
 * SECURITY: Prevents MongoDB shell injection attacks via malicious collection names
 *
 * Used by:
 * - MongoExportFormats.ts (MONGO_SHELL formatter)
 * - CopyFormats.ts (mongoQuery, mongoInsert formats)
 */

/**
 * Sanitize collection name for safe MongoDB shell usage
 *
 * Valid MongoDB collection names:
 * - Cannot contain: $ null character, empty string
 * - Cannot start with: system.
 * - Recommended: [a-zA-Z_][a-zA-Z0-9_]*
 *
 * Strategy:
 * - If valid identifier: use db.collectionName (clean syntax)
 * - If invalid: use db.getCollection("name") with escaped quotes (safe)
 *
 * @param name - Collection name to sanitize
 * @returns Safe collection accessor string
 *
 * @example
 * ```typescript
 * safeCollectionAccessor("users")
 * // → "db.users"
 *
 * safeCollectionAccessor("users; db.dropDatabase(); //")
 * // → 'db.getCollection("users; db.dropDatabase(); //")'
 *
 * safeCollectionAccessor("my-collection")
 * // → 'db.getCollection("my-collection")'
 * ```
 */
export function safeCollectionAccessor(name: string): string {
  // Validate: Must be valid JavaScript identifier for clean syntax
  const isValidIdentifier = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)

  if (isValidIdentifier && !name.startsWith('system.')) {
    // Safe to use dot notation
    return `db.${name}`
  }

  // Use getCollection() with properly escaped string
  const escaped = escapeMongoShellString(name)

  return `db.getCollection("${escaped}")`
}

/**
 * Escape string for safe use in MongoDB shell strings
 *
 * SECURITY: Prevents injection via special characters
 *
 * Escapes:
 * - Backslashes (MUST be first!)
 * - Double quotes
 * - Newlines, carriage returns, tabs
 * - Null bytes (removed, MongoDB forbidden)
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in MongoDB shell
 *
 * @example
 * ```typescript
 * escapeMongoShellString('user"name')
 * // → 'user\\"name'
 *
 * escapeMongoShellString('C:\\path\\to\\file')
 * // → 'C:\\\\path\\\\to\\\\file'
 * ```
 */
export function escapeMongoShellString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')   // Backslashes MUST be first!
    .replace(/"/g, '\\"')      // Escape quotes
    .replace(/\n/g, '\\n')     // Escape newlines
    .replace(/\r/g, '\\r')     // Escape carriage returns
    .replace(/\t/g, '\\t')     // Escape tabs
    .replace(/\0/g, '')        // Remove null bytes (MongoDB forbidden)
}
