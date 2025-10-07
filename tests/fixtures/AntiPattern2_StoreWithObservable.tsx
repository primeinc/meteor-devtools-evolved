/**
 * ANTI-PATTERN TEST FIXTURE - DO NOT USE IN PRODUCTION
 * This represents the bug from QueryLog.tsx (commit d285789)
 */
import { useCallback } from 'react'

export const AntiPattern2 = ({ minimongoStore }: any) => {
  // ❌ BAD: Store object in deps, accessing observable property inside
  const toggleFilter = useCallback(
    (method: string) => {
      minimongoStore.setQueryLogFilter(
        method,
        !minimongoStore.queryLogFilters[method],
      )
    },
    [minimongoStore], // <-- THIS SHOULD BE DETECTED
  )

  return <button onClick={() => toggleFilter('find')} />
}
