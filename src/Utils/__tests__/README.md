# Unit Tests

This directory contains unit tests for the utility functions.

## Current Status

Currently, this project does not have a test runner configured. The test files in this directory serve as documentation and examples for future test implementation.

## Setting Up Tests

To enable testing, you'll need to:

1. Install a test framework (recommended: Jest or Vitest)
2. Configure TypeScript support
3. Add test scripts to package.json

### Example Jest Setup

```bash
yarn add --dev jest @types/jest ts-jest
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/src/$1"
    }
  }
}
```

### Example Vitest Setup (Alternative)

```bash
yarn add --dev vitest @vitest/ui
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

## Running Tests

Once configured, run tests with:

```bash
yarn test
```

## Test Coverage

The current test files cover:

1. **StringUtils.validateFilename**
   - Trimming behavior before validation
   - Reserved Windows filename detection
   - Invalid character detection
   - Edge cases and error handling

2. **StringUtils.sanitizeText**
   - Safe text rendering
   - XSS prevention
   - Type coercion

3. **Searchable loading state cap**
   - Deterministic loading behavior
   - Progress cap for tests

4. **Inject retry mechanism**
   - Retry attempts and timing
   - Timeout handling

## Contributing

When adding new utility functions, please:

1. Add corresponding tests
2. Ensure tests cover edge cases
3. Document expected behavior
4. Keep tests simple and readable
