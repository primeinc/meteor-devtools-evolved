/**
 * Code Quality Test: useMemo with MobX
 *
 * Validates that useMemo is not used with MobX observables, which breaks reactivity.
 * MobX observables are mutable objects, so React's shallow equality check in useMemo
 * doesn't detect changes, preventing component updates.
 *
 * See: https://mobx.js.org/react-integration.html
 * See: https://github.com/mobxjs/mobx/discussions/3348
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

test.describe('useMemo with MobX Validation', () => {
  test('useMemo should only be used in whitelisted cases', async () => {
    // Whitelist: Files and reasons where useMemo is allowed
    const ALLOWED_USEMEMO_USAGE = [
      {
        file: 'src/Pages/Panel/QueryLog/components/QueryLogWaterfall.tsx',
        reason: 'pixelsPerMs - depends only on local zoom state (not MobX)',
        pattern: /pixelsPerMs.*?useMemo.*?\[zoom\]/s,
      },
      {
        file: 'src/Pages/Panel/Minimongo/components/CopySplitButton.tsx',
        reason:
          'primaryLabel - depends only on local lastFormat state (not MobX)',
        pattern: /primaryLabel.*?useMemo.*?\[lastFormat\]/s,
      },
    ]

    // Find all TypeScript/TSX files in src/
    const srcDir = path.resolve(__dirname, '../src')
    const files = glob.sync('**/*.{ts,tsx}', {
      cwd: srcDir,
      ignore: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
    })

    const violations: Array<{
      file: string
      line: number
      snippet: string
    }> = []

    for (const file of files) {
      const filePath = path.join(srcDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      // Check if file uses useMemo
      const useMemoMatches = content.matchAll(/useMemo/g)
      const useMemoCount = Array.from(useMemoMatches).length

      if (useMemoCount === 0) continue

      // Check if this file is whitelisted
      const relativeFile = `src/${file.replace(/\\/g, '/')}`
      const whitelist = ALLOWED_USEMEMO_USAGE.find(w => w.file === relativeFile)

      if (whitelist) {
        // Verify whitelisted usage matches expected pattern
        if (!whitelist.pattern.test(content)) {
          violations.push({
            file: relativeFile,
            line: 0,
            snippet: `Whitelisted file has useMemo but doesn't match expected pattern: ${whitelist.reason}`,
          })
        }
        continue
      }

      // File uses useMemo but is NOT whitelisted - report violation
      // Find line numbers for each useMemo usage
      lines.forEach((line, index) => {
        if (line.includes('useMemo')) {
          violations.push({
            file: relativeFile,
            line: index + 1,
            snippet: line.trim().substring(0, 80),
          })
        }
      })
    }

    // Report violations
    if (violations.length > 0) {
      const report = violations
        .map(v => `  ${v.file}:${v.line}\n    ${v.snippet}`)
        .join('\n\n')

      throw new Error(
        `Found ${violations.length} invalid useMemo usage(s) with MobX:\n\n${report}\n\n` +
          `useMemo breaks MobX reactivity because observables are mutable objects.\n` +
          `Use direct calculations instead - MobX observer() handles optimization.\n\n` +
          `If this is intentional and safe (e.g., depends only on React state),\n` +
          `add it to ALLOWED_USEMEMO_USAGE whitelist in this test.`,
      )
    }

    expect(violations.length).toBe(0)
  })

  test('Whitelisted useMemo files should exist', async () => {
    const ALLOWED_USEMEMO_USAGE = [
      {
        file: 'src/Pages/Panel/QueryLog/components/QueryLogWaterfall.tsx',
        reason: 'pixelsPerMs - depends only on local zoom state (not MobX)',
        pattern: /pixelsPerMs.*?useMemo.*?\[zoom\]/s,
      },
      {
        file: 'src/Pages/Panel/Minimongo/components/CopySplitButton.tsx',
        reason:
          'primaryLabel - depends only on local lastFormat state (not MobX)',
        pattern: /primaryLabel.*?useMemo.*?\[lastFormat\]/s,
      },
    ]

    const repoRoot = path.resolve(__dirname, '..')

    for (const allowed of ALLOWED_USEMEMO_USAGE) {
      const filePath = path.join(repoRoot, allowed.file)
      const exists = fs.existsSync(filePath)

      if (!exists) {
        throw new Error(
          `Whitelisted file does not exist: ${allowed.file}\n` +
            `Remove this entry from ALLOWED_USEMEMO_USAGE whitelist.`,
        )
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      if (!content.includes('useMemo')) {
        throw new Error(
          `Whitelisted file no longer uses useMemo: ${allowed.file}\n` +
            `Remove this entry from ALLOWED_USEMEMO_USAGE whitelist.`,
        )
      }
    }
  })
})
