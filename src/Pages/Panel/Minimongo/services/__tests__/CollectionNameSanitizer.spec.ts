/**
 * Collection Name Sanitizer - Security Tests
 *
 * CRITICAL: Tests shell injection prevention for MongoDB shell formatters
 *
 * Attack Vectors Tested:
 * - Command injection (semicolon attacks)
 * - Command substitution (backticks, $())
 * - Special characters (quotes, backslashes, newlines)
 * - MongoDB forbidden characters (null bytes, system prefix)
 */

import { describe, it, expect } from '@jest/globals'
import {
  safeCollectionAccessor,
  escapeMongoShellString,
} from '../CollectionNameSanitizer'

describe('CollectionNameSanitizer - Security Tests', () => {
  describe('safeCollectionAccessor()', () => {
    describe('safe collection names (dot notation)', () => {
      it('should use db.name for simple valid identifiers', () => {
        expect(safeCollectionAccessor('users')).toBe('db.users')
        expect(safeCollectionAccessor('products')).toBe('db.products')
        expect(safeCollectionAccessor('myCollection')).toBe('db.myCollection')
        expect(safeCollectionAccessor('_privateData')).toBe('db._privateData')
        expect(safeCollectionAccessor('users123')).toBe('db.users123')
      })

      it('should use db.name for collections with underscores', () => {
        expect(safeCollectionAccessor('user_profiles')).toBe('db.user_profiles')
        expect(
          safeCollectionAccessor('meteor_accounts_loginServiceConfiguration'),
        ).toBe('db.meteor_accounts_loginServiceConfiguration')
      })
    })

    describe('unsafe collection names (getCollection with escaping)', () => {
      it('should prevent semicolon command injection', () => {
        const malicious = 'users; db.dropDatabase(); //'
        const result = safeCollectionAccessor(malicious)

        expect(result).toBe('db.getCollection("users; db.dropDatabase(); //")')
        expect(result).not.toContain('db.users;')
        expect(result).toContain('getCollection')
      })

      it('should prevent backtick command substitution', () => {
        const malicious = 'users`whoami`'
        const result = safeCollectionAccessor(malicious)

        expect(result).toBe('db.getCollection("users`whoami`")')
        expect(result).toContain('getCollection')
      })

      it('should prevent $() command substitution', () => {
        const malicious = 'users$(rm -rf /)'
        const result = safeCollectionAccessor(malicious)

        expect(result).toBe('db.getCollection("users$(rm -rf /)")')
        expect(result).toContain('getCollection')
      })

      it('should handle collections with hyphens', () => {
        expect(safeCollectionAccessor('my-collection')).toBe(
          'db.getCollection("my-collection")',
        )
      })

      it('should handle collections with dots', () => {
        expect(safeCollectionAccessor('my.collection')).toBe(
          'db.getCollection("my.collection")',
        )
      })

      it('should handle collections with spaces', () => {
        expect(safeCollectionAccessor('user data')).toBe(
          'db.getCollection("user data")',
        )
      })

      it('should handle collections starting with numbers', () => {
        expect(safeCollectionAccessor('123users')).toBe(
          'db.getCollection("123users")',
        )
      })

      it('should prevent system prefix exploitation', () => {
        expect(safeCollectionAccessor('system.users')).toBe(
          'db.getCollection("system.users")',
        )
        expect(safeCollectionAccessor('systemUsers')).toBe('db.systemUsers') // OK - just startsWith check
      })
    })

    describe('embedded quotes and escaping', () => {
      it('should escape double quotes in collection name', () => {
        const malicious = 'users"); db.dropDatabase(); //'
        const result = safeCollectionAccessor(malicious)

        // Should escape the quote
        expect(result).toBe(
          'db.getCollection("users\\"); db.dropDatabase(); //")',
        )
        expect(result).not.toContain('users");')
      })

      it('should escape backslashes to prevent escape sequence injection', () => {
        const malicious = 'users\\")'
        const result = safeCollectionAccessor(malicious)

        // Backslash should be escaped
        expect(result).toContain('\\\\')
      })

      it('should escape newlines', () => {
        const malicious = 'users\ndb.dropDatabase()'
        const result = safeCollectionAccessor(malicious)

        expect(result).toContain('\\n')
        expect(result).not.toContain('\n')
      })
    })
  })

  describe('escapeMongoShellString()', () => {
    describe('quote escaping', () => {
      it('should escape double quotes', () => {
        expect(escapeMongoShellString('Say "hello"')).toBe('Say \\"hello\\"')
      })

      it('should escape multiple quotes', () => {
        expect(escapeMongoShellString('"foo" and "bar"')).toBe(
          '\\"foo\\" and \\"bar\\"',
        )
      })
    })

    describe('backslash escaping (CRITICAL ORDER)', () => {
      it('should escape backslashes BEFORE quotes', () => {
        // Input: users\"
        // Step 1: \\ -> \\\\   = users\\\\"
        // Step 2: \" -> \\\"   = users\\\\\\"
        expect(escapeMongoShellString('users\\"')).toBe('users\\\\\\"')
      })

      it('should escape single backslash', () => {
        expect(escapeMongoShellString('C:\\path')).toBe('C:\\\\path')
      })

      it('should escape multiple backslashes', () => {
        expect(escapeMongoShellString('C:\\\\path\\\\to\\\\file')).toBe(
          'C:\\\\\\\\path\\\\\\\\to\\\\\\\\file',
        )
      })
    })

    describe('newline and control character escaping', () => {
      it('should escape newlines (\\n)', () => {
        expect(escapeMongoShellString('Line 1\nLine 2')).toBe('Line 1\\nLine 2')
      })

      it('should escape carriage returns (\\r)', () => {
        expect(escapeMongoShellString('Line 1\rLine 2')).toBe('Line 1\\rLine 2')
      })

      it('should escape tabs (\\t)', () => {
        expect(escapeMongoShellString('Col1\tCol2')).toBe('Col1\\tCol2')
      })

      it('should remove null bytes (\\0)', () => {
        expect(escapeMongoShellString('text\0here')).toBe('texthere')
      })
    })

    describe('combined attack vectors', () => {
      it('should handle quotes + backslashes + newlines', () => {
        const input = 'user\\"name\nwith\\ttabs'
        const result = escapeMongoShellString(input)

        // Backslashes first: \\ -> \\\\
        // Then quotes: \" -> \\\"
        // Then newlines: \n -> \\n
        // Then tabs: \t -> \\t
        expect(result).toBe('user\\\\\\"name\\nwith\\\\ttabs')
      })

      it('should handle malicious injection attempt with all special chars', () => {
        const malicious = '"); db.dropDatabase(); //\n\r\t\0'
        const result = escapeMongoShellString(malicious)

        expect(result).toBe('\\"); db.dropDatabase(); //\\n\\r\\t')
        expect(result).not.toContain('\n')
        expect(result).not.toContain('\r')
        expect(result).not.toContain('\t')
        expect(result).not.toContain('\0')
      })
    })

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(escapeMongoShellString('')).toBe('')
      })

      it('should handle string with only special characters', () => {
        expect(escapeMongoShellString('\n\r\t')).toBe('\\n\\r\\t')
      })

      it('should preserve safe characters', () => {
        expect(escapeMongoShellString('abc123_-')).toBe('abc123_-')
      })
    })
  })

  describe('Integration - Full injection attack scenarios', () => {
    it('should prevent dropDatabase() injection', () => {
      const malicious = 'users; db.dropDatabase(); //'
      const result = safeCollectionAccessor(malicious)

      // Should be safely wrapped in getCollection with escaped string
      expect(result).toBe('db.getCollection("users; db.dropDatabase(); //")')

      // When used in shell script:
      const shellScript = `${result}.insertOne({ name: "test" })`
      expect(shellScript).toBe(
        'db.getCollection("users; db.dropDatabase(); //").insertOne({ name: "test" })',
      )
      expect(shellScript).not.toContain('db.users;')
    })

    it('should prevent quote-escaping injection', () => {
      const malicious = 'users"); db.dropDatabase(); //'
      const result = safeCollectionAccessor(malicious)

      // Quote should be escaped
      expect(result).toBe(
        'db.getCollection("users\\"); db.dropDatabase(); //")',
      )

      // When used in shell script, the escaped quote prevents breaking out
      const shellScript = `${result}.insertOne({ name: "test" })`
      expect(shellScript).not.toContain('users");')
    })

    it('should prevent backslash+quote injection', () => {
      const malicious = 'users\\"); db.dropDatabase(); //'
      const result = safeCollectionAccessor(malicious)

      // Both backslash and quote should be escaped
      expect(result).toContain('\\\\')
      expect(result).toContain('\\"')
    })

    it('should handle real-world collection names safely', () => {
      const realNames = [
        'users',
        'meteor_accounts_loginServiceConfiguration',
        'my-collection',
        'my.collection',
        'user_profiles',
        '_privateData',
      ]

      for (const name of realNames) {
        const result = safeCollectionAccessor(name)
        expect(result).toBeTruthy()
        expect(result.startsWith('db.')).toBe(true)
      }
    })
  })
})
