import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

test.describe('MobX + React Anti-patterns', () => {
  test('should not use entire Store objects in useCallback/useEffect/useMemo deps', () => {
    // Search for patterns like: useCallback(() => {...}, [someStore])
    // where someStore ends with "Store"

    const srcDir = path.join(process.cwd(), 'src')
    const violations: string[] = []

    /**
     *
     */
    function checkFile(filePath: string) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      // Pattern: useCallback/useEffect/useMemo with Store object in deps
      // Match: }, [panelStore]) or }, [minimongoStore, ...]) etc
      const hookPattern = /use(Callback|Effect|Memo|LayoutEffect)\s*\(/ // No 'g' flag

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (hookPattern.test(line)) {
          // Look ahead for the dependency array (usually within next 20 lines)
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            const depsLine = lines[j]

            // Match patterns:
            // 1. [someStore] or [someStore, ...] - store at beginning
            // 2. [..., someStore] or [..., someStore, ...] - store anywhere in array
            // 3. [nested.settingStore] - nested store property
            // But NOT [someStore.method] (that's OK)

            // Pattern 1: Store at beginning of array
            const badPattern1 =
              /\[\s*([a-zA-Z_$][a-zA-Z0-9_$.]*Store)(?:\s*,|\s*\])/
            // Pattern 2: Store anywhere in array (after comma)
            const badPattern2 =
              /,\s*([a-zA-Z_$][a-zA-Z0-9_$.]*Store)(?:\s*,|\s*\])/

            const match1 = depsLine.match(badPattern1)
            const match2 = depsLine.match(badPattern2)

            if (match1 || match2) {
              const matchedStore = match1 ? match1[1] : match2[1]

              // Check if there's an eslint-disable comment on the previous line
              const prevLine = j > 0 ? lines[j - 1] : ''
              const hasDisable = prevLine.includes('eslint-disable-next-line')

              // Allow if:
              // 1. Has eslint-disable AND
              // 2. Uses store.method pattern (e.g., settingStore.setFilter)
              // But NOT just store.property (e.g., panelStore.settingStore)
              const isStoreMethod = /\w+Store\.\w+/.test(depsLine)
              const isNestedStore = /\w+Store\.[\w.]*Store/.test(matchedStore)

              // Disallow: bare store OR nested store (even with eslint-disable)
              if (!hasDisable || !isStoreMethod || isNestedStore) {
                violations.push(
                  `${filePath}:${
                    j + 1
                  } - Found entire Store object in deps: ${depsLine.trim()}`,
                )
              }

              break // Found the deps array for this hook
            }

            // Stop if we find the pattern: }, [...]) or }, [])
            // This is more reliable than just looking for any )
            if (/},\s*\[[^\]]*\]\s*\)/.test(depsLine)) {
              break
            }
          }
        }
      }
    }

    /**
     *
     */
    function walkDir(dir: string) {
      const files = fs.readdirSync(dir)

      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
          walkDir(filePath)
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          checkFile(filePath)
        }
      }
    }

    walkDir(srcDir)

    if (violations.length > 0) {
      console.log('\n❌ MobX Anti-pattern violations found:\n')
      violations.forEach(v => console.log(`  ${v}`))
      console.log(
        '\nSee docs/MOBX_REACT_RULES.md for correct patterns.\n' +
          'Fix: Use [store.actionMethod] not [store]\n',
      )
    }

    expect(violations).toEqual([])
  })

  test('should not use observable properties in useCallback deps', () => {
    // Scan for observable arrays/objects in dependency arrays (cross-platform Node implementation)
    const violations: string[] = []

    /**
     *
     */
    function checkForObservableInDeps(filePath: string) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      // Pattern: }, [..., .collection, ...])
      // This catches observable array properties in deps
      const observablePattern = /},\s*\[[^\]]*\.\s*collection[^\]]*\]/

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (observablePattern.test(line)) {
          // Allow specific patterns
          if (line.includes('.collection.length')) continue
          if (line.includes('.collection.find')) continue
          if (line.includes('.collection.map')) continue

          violations.push(
            `${filePath}:${i + 1} - Observable array in deps: ${line.trim()}`,
          )
        }
      }
    }

    /**
     *
     */
    function walkDir(dir: string) {
      const files = fs.readdirSync(dir)

      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
          walkDir(filePath)
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          checkForObservableInDeps(filePath)
        }
      }
    }

    const srcDir = path.join(process.cwd(), 'src')
    walkDir(srcDir)

    if (violations.length > 0) {
      console.log('\n⚠️  Found observable arrays in deps:\n')
      violations.forEach(v => console.log(`  ${v}`))
      console.log('\nObservable arrays in deps cause infinite loops.')
    }

    expect(violations).toEqual([])
  })

  test('should have ESLint rule to catch Store objects in deps', () => {
    const eslintConfig = fs.readFileSync('.eslintrc.js', 'utf-8')

    // Check that we have the no-restricted-syntax rule
    expect(eslintConfig).toContain('no-restricted-syntax')

    // Check that it targets useCallback/useEffect/useMemo
    expect(eslintConfig).toMatch(/use(Callback|Effect|Memo)/)

    // Check that it mentions Store in the selector or message
    expect(eslintConfig).toMatch(/Store/)
  })

  test('detector should catch anti-pattern fixtures (proving it works)', () => {
    // This test proves the detector works by scanning the fixtures directory
    // and expecting to find violations in the intentional anti-pattern files
    const violations: string[] = []

    /**
     *
     */
    function checkFile(filePath: string) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')

      const hookPattern = /use(Callback|Effect|Memo|LayoutEffect)\s*\(/ // No 'g' flag - we test line by line
      const fileName = path.basename(filePath)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (hookPattern.test(line)) {
          console.log(
            `[${fileName}] Found hook on line ${i + 1}: ${line.trim()}`,
          )

          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            const depsLine = lines[j]

            const badPattern1 =
              /\[\s*([a-zA-Z_$][a-zA-Z0-9_$.]*Store)(?:\s*,|\s*\])/
            const badPattern2 =
              /,\s*([a-zA-Z_$][a-zA-Z0-9_$.]*Store)(?:\s*,|\s*\])/

            const match1 = depsLine.match(badPattern1)
            const match2 = depsLine.match(badPattern2)

            if (match1 || match2) {
              const matchedStore = match1 ? match1[1] : match2[1]
              const prevLine = j > 0 ? lines[j - 1] : ''
              const hasDisable = prevLine.includes('eslint-disable-next-line')
              const isStoreMethod = /\w+Store\.\w+/.test(depsLine)
              const isNestedStore = /\w+Store\.[\w.]*Store/.test(matchedStore)

              console.log(`[${fileName}] Line ${j + 1}: ${depsLine.trim()}`)
              console.log(`  matchedStore: ${matchedStore}`)
              console.log(
                `  hasDisable: ${hasDisable}, isStoreMethod: ${isStoreMethod}, isNestedStore: ${isNestedStore}`,
              )
              console.log(
                `  willAdd: ${!hasDisable || !isStoreMethod || isNestedStore}`,
              )

              if (!hasDisable || !isStoreMethod || isNestedStore) {
                violations.push(`${fileName}:${j + 1}`)
              }
              break
            }

            // Stop if we find the pattern: }, [...]) or }, [])
            // This is more reliable than just looking for any )
            if (/},\s*\[[^\]]*\]\s*\)/.test(depsLine)) {
              console.log(
                `[${fileName}] Stopped search at line ${
                  j + 1
                } (found deps array end)`,
              )
              break
            }
          }
        }
      }
    }

    const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures')

    // Only run if fixtures directory exists
    if (!fs.existsSync(fixturesDir)) {
      console.log('⚠️  Fixtures directory not found, skipping validation test')
      return
    }

    const files = fs.readdirSync(fixturesDir)
    const fixtureFiles: string[] = []
    for (const file of files) {
      if (file.endsWith('.tsx') && file.includes('AntiPattern')) {
        fixtureFiles.push(file)
        checkFile(path.join(fixturesDir, file))
      }
    }

    console.log(`\n📋 Scanned ${fixtureFiles.length} fixture files:`)
    fixtureFiles.forEach(f => console.log(`  - ${f}`))

    console.log(`\n🔍 Found ${violations.length} violations:`)
    violations.forEach(v => console.log(`  - ${v}`))

    // We expect EXACTLY 8 violations (one per file except AntiPattern5 has 2)
    // If this fails your code is shit fix it
    expect(violations.length).toBe(8)
  })
})
